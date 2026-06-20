import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { create } from "zustand";
import {
  deriveGroupedLayout,
  newLayoutSectionId,
  readStoredGroupingMode,
  readStoredHomeLayout,
  reconcileLayout,
  writeStoredGroupingMode,
  writeStoredHomeLayout,
} from "@/features/home-screen/utils/homeLayout";
import type { HueGalleryScenePreset } from "@/features/space-screen/data/hueSceneGallery";
import { TRANSITION_MS } from "@/lib/transitions";
import type { HomeGroupingMode, HomeLayout } from "@/types/app-layout";
import type {
  HueEventUpdate,
  HueLight,
  HueRoom,
  HueRoomZone,
  HueScene,
  HueZone,
} from "@/types/hue";

/** Color attributes that can be pushed to an individual light. */
export interface LightColorChange {
  xy?: [number, number];
  ct?: number;
  effect?: string;
}

type ControlCommitPhase = "live" | "final";

interface LayoutState {
  storedLayout: HomeLayout | null;
  layout: HomeLayout;
  displayLayout: HomeLayout;
  groupingMode: HomeGroupingMode;
}

export interface HueResourcesState extends LayoutState {
  roomZones: HueRoomZone[];
  lights: HueLight[];
  scenes: HueScene[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;

  // The light whose inspector panel is open beside the content, or null when
  // the panel is collapsed. Lives here (not route-local) so the app shell can
  // render the panel as a layout sibling that pushes the content aside.
  selectedLightId: string | null;
  setSelectedLightId: (id: string | null) => void;

  // The scene whose inspector panel is open, or null. Mutually exclusive with
  // `selectedLightId` — the shell renders one inspector at a time.
  selectedSceneId: string | null;
  setSelectedSceneId: (id: string | null) => void;

  // Home layout editing. Layout sections are local app state, not Hue resources.
  draftLayout: HomeLayout;
  isEditLayoutMode: boolean;
  setDraftLayout: (next: HomeLayout) => void;
  setGroupingMode: (mode: HomeGroupingMode) => void;
  enterEditLayout: () => void;
  cancelEditLayout: () => void;
  saveEditLayout: () => void;

  // Layout section creation (dialog driven from the header while editing).
  isCreatingSection: boolean;
  openCreateSection: () => void;
  closeCreateSection: () => void;
  createLayoutSection: (name: string) => void;
  renameLayoutSection: (sectionId: string, name: string) => void;

  // Data lifecycle and optimistic control handlers.
  loadLights: () => Promise<void>;
  loadScenes: () => Promise<void>;
  loadAll: () => Promise<void>;
  applyHueEvents: (updates: HueEventUpdate[]) => void;
  setRoomZoneState: (
    roomZone: HueRoomZone,
    nextOn: boolean,
    brightnessPct: number | null,
    phase?: ControlCommitPhase,
  ) => void;
  setLightState: (
    light: HueLight,
    nextOn: boolean,
    brightnessPct: number | null,
    phase?: ControlCommitPhase,
  ) => void;
  setLightColor: (light: HueLight, change: LightColorChange) => void;
  createGalleryScene: (
    roomZone: HueRoomZone,
    preset: HueGalleryScenePreset,
  ) => Promise<void>;
  activateScene: (scene: HueScene, intent?: SceneIntent) => Promise<void>;
  /**
   * Transiently changes the speed of a currently-playing dynamic scene by
   * re-recalling its palette with a new duration. Does not persist onto the
   * scene — it only reflects the current playback.
   */
  setDynamicSpeedLive: (scene: HueScene, step: number) => void;
  renameScene: (scene: HueScene, name: string) => Promise<void>;
  setSceneBrightness: (
    scene: HueScene,
    pct: number,
    phase?: ControlCommitPhase,
  ) => void;
  setSceneSpeed: (scene: HueScene, speed: number) => Promise<void>;
  setSceneAutoplay: (scene: HueScene, autoDynamic: boolean) => Promise<void>;
  deleteScene: (scene: HueScene) => Promise<void>;
}

const buildLayoutState = (
  roomZones: HueRoomZone[],
  storedLayout: HomeLayout | null,
  groupingMode: HomeGroupingMode,
): LayoutState => {
  const liveSpaceIds = roomZones.map((roomZone) => roomZone.id);
  const layout = reconcileLayout(storedLayout, liveSpaceIds);
  return {
    storedLayout,
    layout,
    displayLayout:
      groupingMode === "custom"
        ? layout
        : deriveGroupedLayout(roomZones, groupingMode),
    groupingMode,
  };
};

const refreshLayoutState = (
  roomZones: HueRoomZone[],
  storedLayout: HomeLayout | null,
  groupingMode: HomeGroupingMode,
): LayoutState => {
  const next = buildLayoutState(roomZones, storedLayout, groupingMode);
  if (roomZones.length > 0) writeStoredHomeLayout(next.layout);
  return next;
};

const initialGroupingMode = readStoredGroupingMode();
const initialStoredLayout = readStoredHomeLayout();

// Short transitions keep on/off and dimming feeling immediate. The bridge resets
// transitiontime to 400ms unless set every write, and longer fades emit a stream
// of intermediate state events that fight optimistic UI — see
// docs/HUE/watch-that-transition-time.md. These live in one shared module so the
// CSS easing of each surface matches the fade we actually send the bulb.
const GROUP_TOGGLE_TRANSITION_MS = TRANSITION_MS.groupToggle;
const LIGHT_TOGGLE_ON_TRANSITION_MS = TRANSITION_MS.lightToggleOn;
const LIGHT_TOGGLE_OFF_TRANSITION_MS = TRANSITION_MS.lightToggleOff;
const BRIGHTNESS_TRANSITION_MS = TRANSITION_MS.brightness;
const COLOR_TRANSITION_MS = TRANSITION_MS.color;
const SCENE_TRANSITION_MS = TRANSITION_MS.scene;
const LIVE_SLIDER_TRANSITION_MS = TRANSITION_MS.liveSlider;
// Group writes are broadcast commands, and Hue batches SSE containers roughly
// once per second. Keep plain group toggles stable through delayed aggregate
// echoes instead of releasing on the first matching event.
const GROUP_TOGGLE_SETTLE_MS = GROUP_TOGGLE_TRANSITION_MS + 4000;
const SCENE_SETTLE_MS = SCENE_TRANSITION_MS + 3000;
const SCENE_EVENT_REFRESH_DELAY_MS = 500;
let sceneEventRefreshTimer: ReturnType<typeof setTimeout> | null = null;

const scheduleSceneEventRefresh = (loadScenes: () => Promise<void>): void => {
  if (sceneEventRefreshTimer != null) return;
  sceneEventRefreshTimer = setTimeout(() => {
    sceneEventRefreshTimer = null;
    void loadScenes();
  }, SCENE_EVENT_REFRESH_DELAY_MS);
};

// When a light/room is off the bridge often reports a non-useful dimming level.
// Switch-on writes restore the last real brightness, or this default when none
// is known, instead of echoing an off-state value back to the bridge.
const DEFAULT_RESTORE_BRIGHTNESS = 100;
const restoreBrightness = (last: number | null | undefined): number =>
  last != null && last > 0 ? last : DEFAULT_RESTORE_BRIGHTNESS;

/**
 * After we issue a write, the bridge emits a short flurry of events: ones queued
 * *before* it processed our write (carrying the old value) plus intermediate
 * frames mid-transition. Applying those blindly makes a freshly-toggled switch
 * flicker back off or a dimmed tile bounce. While a lock is live we keep our
 * optimistic value for any field an event contradicts, and drop the lock as soon
 * as an event confirms it (or it expires). Keyed by the resource id we control
 * (grouped_light id, or light id).
 */
interface OptimisticLock {
  on?: boolean;
  brightness?: number;
  colorMode?: "xy" | "ct";
  xy?: [number, number];
  mirek?: number;
  effect?: string;
  effectV2?: string;
  until: number;
  releaseOnConfirm?: boolean;
}
const OPTIMISTIC_LOCK_MS = 1500;
const optimisticLocks = new Map<string, OptimisticLock>();

const lockResource = (
  id: string,
  patch: {
    on?: boolean;
    brightness?: number;
    colorMode?: "xy" | "ct";
    xy?: [number, number];
    mirek?: number;
    effect?: string;
    effectV2?: string;
  },
  options: { durationMs?: number; releaseOnConfirm?: boolean } = {},
): void => {
  optimisticLocks.set(id, {
    ...patch,
    until: Date.now() + (options.durationMs ?? OPTIMISTIC_LOCK_MS),
    releaseOnConfirm: options.releaseOnConfirm,
  });
};

const clearResourceLocks = (ids: Iterable<string | null | undefined>): void => {
  for (const id of ids) {
    if (id) optimisticLocks.delete(id);
  }
};

const clearGroupLocksForLight = (
  lightId: string,
  roomZones: HueRoomZone[],
): void => {
  clearResourceLocks(
    roomZones
      .filter((roomZone) => roomZone.lightIds.includes(lightId))
      .map((roomZone) => roomZone.groupedLightId),
  );
};

const nextBrightness = (
  current: number | null,
  incoming: number | null | undefined,
  isOn: boolean,
): number | null => (isOn && incoming != null ? incoming : current);

const sameXy = (
  a: [number, number] | null | undefined,
  b: [number, number] | null | undefined,
): boolean =>
  a != null &&
  b != null &&
  Math.abs(a[0] - b[0]) < 0.0001 &&
  Math.abs(a[1] - b[1]) < 0.0001;

const normalizeSceneStatus = (status: string | null | undefined): string =>
  status?.trim().toLowerCase().replace(/_/g, " ") ?? "";

const isSceneActive = (scene: HueScene): boolean => {
  const status = normalizeSceneStatus(scene.status);
  return status !== "" && status !== "inactive";
};

const isSceneDynamicActive = (scene: HueScene): boolean =>
  normalizeSceneStatus(scene.status) === "dynamic palette";

// Two distinct intents now drive a regular scene:
//   "apply"   – recall the scene's stored colors statically (tapping the card).
//   "dynamic" – start/stop the dynamic palette animation (the card's play button).
// Smart scenes have no static/dynamic split, so they always toggle active.
type SceneIntent = "apply" | "dynamic";

const nextSceneStatus = (scene: HueScene, intent: SceneIntent): string =>
  scene.resourceType === "smart_scene"
    ? isSceneActive(scene)
      ? "Inactive"
      : "Active"
    : intent === "dynamic"
      ? isSceneDynamicActive(scene)
        ? "Static"
        : "Dynamic Palette"
      : "Static";

const sceneInvokeCommand = (scene: HueScene, intent: SceneIntent): string =>
  scene.resourceType === "smart_scene"
    ? isSceneActive(scene)
      ? "deactivate-smart-scene"
      : "activate-smart-scene"
    : intent === "dynamic"
      ? isSceneDynamicActive(scene)
        ? "stop-dynamic-scene"
        : "start-dynamic-scene"
      : "activate-scene";

// Live dynamic-palette speed. The bridge animates the palette over the recall
// `duration`, so a faster step maps to a shorter transition. This is a transient
// playback tweak (re-recall with a new duration); it never edits the saved scene.
const DYNAMIC_LIVE_SPEED_MIN_STEP = 1;
const DYNAMIC_LIVE_SPEED_MAX_STEP = 12;
const DYNAMIC_LIVE_SPEED_SLOW_MS = 8000;
const DYNAMIC_LIVE_SPEED_FAST_MS = 600;

const dynamicLiveSpeedDurationMs = (step: number): number => {
  const clamped = Math.min(
    DYNAMIC_LIVE_SPEED_MAX_STEP,
    Math.max(DYNAMIC_LIVE_SPEED_MIN_STEP, Math.round(step)),
  );
  const t =
    (clamped - DYNAMIC_LIVE_SPEED_MIN_STEP) /
    (DYNAMIC_LIVE_SPEED_MAX_STEP - DYNAMIC_LIVE_SPEED_MIN_STEP);
  return Math.round(
    DYNAMIC_LIVE_SPEED_SLOW_MS +
      (DYNAMIC_LIVE_SPEED_FAST_MS - DYNAMIC_LIVE_SPEED_SLOW_MS) * t,
  );
};

const sceneActionHasColor = (action: HueScene["actions"][number]): boolean =>
  action.xy != null || action.mirek != null;

/** Optimistically patches a single scene's editable fields in the store. */
const patchSceneLocal = (
  set: (fn: (state: HueResourcesState) => Partial<HueResourcesState>) => void,
  scene: HueScene,
  patch: { name?: string; speed?: number; autoDynamic?: boolean },
): void => {
  set((state) => ({
    scenes: state.scenes.map((candidate) =>
      candidate.id === scene.id &&
      candidate.resourceType === scene.resourceType
        ? {
            ...candidate,
            ...(patch.name != null ? { name: patch.name } : {}),
            ...(patch.speed != null ? { speed: patch.speed } : {}),
            ...(patch.autoDynamic != null
              ? { autoDynamic: patch.autoDynamic }
              : {}),
          }
        : candidate,
    ),
  }));
};

/**
 * Reconciles an inbound event's on/brightness against any pending optimistic
 * lock for `id`. Returns the values the store should display: our locked value
 * for fields the event still contradicts, the event's value otherwise.
 * Confirmed locks clear early unless they are intentionally held for the full
 * settle window.
 */
const reconcileLock = (
  id: string | null | undefined,
  incoming: {
    on?: boolean | null;
    brightness?: number | null;
    colorMode?: string | null;
    xy?: [number, number] | null;
    mirek?: number | null;
    effect?: string | null;
    effectV2?: string | null;
  },
): {
  on?: boolean | null;
  brightness?: number | null;
  colorMode?: string | null;
  xy?: [number, number] | null;
  mirek?: number | null;
  effect?: string | null;
  effectV2?: string | null;
} => {
  if (!id) return incoming;
  const lock = optimisticLocks.get(id);
  if (!lock) return incoming;
  if (Date.now() >= lock.until) {
    optimisticLocks.delete(id);
    return incoming;
  }

  const result = { ...incoming };
  let confirmed = true;
  if (lock.on !== undefined) {
    if (incoming.on == null) confirmed = false;
    else if (incoming.on !== lock.on) {
      result.on = lock.on;
      confirmed = false;
    }
  }
  if (lock.brightness !== undefined) {
    if (incoming.brightness == null) confirmed = false;
    else if (Math.round(incoming.brightness) !== Math.round(lock.brightness)) {
      result.brightness = lock.brightness;
      confirmed = false;
    }
  }
  if (lock.colorMode !== undefined) {
    if (incoming.colorMode == null) confirmed = false;
    else if (incoming.colorMode !== lock.colorMode) {
      result.colorMode = lock.colorMode;
      confirmed = false;
    }
  }
  if (lock.xy !== undefined) {
    if (incoming.xy == null) confirmed = false;
    else if (!sameXy(incoming.xy, lock.xy)) {
      result.xy = lock.xy;
      confirmed = false;
    }
  }
  if (lock.mirek !== undefined) {
    if (incoming.mirek == null) confirmed = false;
    else if (incoming.mirek !== lock.mirek) {
      result.mirek = lock.mirek;
      confirmed = false;
    }
  }
  if (lock.effect !== undefined) {
    if (incoming.effect == null) confirmed = false;
    else if (incoming.effect !== lock.effect) {
      result.effect = lock.effect;
      confirmed = false;
    }
  }
  if (lock.effectV2 !== undefined) {
    if (incoming.effectV2 == null) confirmed = false;
    else if (incoming.effectV2 !== lock.effectV2) {
      result.effectV2 = lock.effectV2;
      confirmed = false;
    }
  }
  if (confirmed && lock.releaseOnConfirm !== false) optimisticLocks.delete(id);
  return result;
};

const coalesceHueEvents = (updates: HueEventUpdate[]): HueEventUpdate[] => {
  const byResource = new Map<string, HueEventUpdate>();

  for (const update of updates) {
    const key = `${update.type}:${update.id ?? ""}`;
    const previous = byResource.get(key);
    if (!previous) {
      byResource.set(key, update);
      continue;
    }

    byResource.set(key, {
      eventType: update.eventType ?? previous.eventType,
      type: update.type,
      id: update.id,
      on: update.on ?? previous.on,
      brightness: update.brightness ?? previous.brightness,
      xy: update.xy ?? previous.xy,
      mirek: update.mirek ?? previous.mirek,
      colorMode: update.colorMode ?? previous.colorMode,
      effect: update.effect ?? previous.effect,
      effectV2: update.effectV2 ?? previous.effectV2,
      value: update.value ?? previous.value,
    });
  }

  return [...byResource.values()];
};

export const useHueResourcesStore = create<HueResourcesState>((set, get) => ({
  roomZones: [],
  lights: [],
  scenes: [],
  isLoading: true,
  hasLoaded: false,
  error: null,
  ...buildLayoutState([], initialStoredLayout, initialGroupingMode),
  draftLayout: [],
  isEditLayoutMode: false,
  isCreatingSection: false,
  selectedLightId: null,
  selectedSceneId: null,

  setSelectedLightId: (id) =>
    set({ selectedLightId: id, selectedSceneId: null }),
  setSelectedSceneId: (id) =>
    set({ selectedSceneId: id, selectedLightId: null }),

  setDraftLayout: (next) => set({ draftLayout: next }),

  setGroupingMode: (mode) => {
    writeStoredGroupingMode(mode);
    set((state) => ({
      ...refreshLayoutState(state.roomZones, state.storedLayout, mode),
      ...(mode !== "custom"
        ? {
            isEditLayoutMode: false,
            draftLayout: [],
            isCreatingSection: false,
          }
        : null),
    }));
  },

  enterEditLayout: () => {
    const state = get();
    if (state.groupingMode !== "custom") writeStoredGroupingMode("custom");
    set({
      ...refreshLayoutState(state.roomZones, state.storedLayout, "custom"),
      draftLayout: state.layout.map((section) => ({
        ...section,
        spaceIds: [...section.spaceIds],
      })),
      isEditLayoutMode: true,
    });
  },

  cancelEditLayout: () => set({ isEditLayoutMode: false, draftLayout: [] }),

  saveEditLayout: () => {
    const state = get();
    const draftLayout = state.draftLayout;
    writeStoredHomeLayout(draftLayout);
    set({
      ...refreshLayoutState(state.roomZones, draftLayout, state.groupingMode),
      isEditLayoutMode: false,
      draftLayout: [],
    });
  },

  openCreateSection: () => set({ isCreatingSection: true }),
  closeCreateSection: () => set({ isCreatingSection: false }),

  createLayoutSection: (name) =>
    set((state) => ({
      draftLayout: [
        ...state.draftLayout,
        { id: newLayoutSectionId(), name, spaceIds: [] },
      ],
      isCreatingSection: false,
    })),

  renameLayoutSection: (sectionId, name) =>
    set((state) => ({
      draftLayout: state.draftLayout.map((section) =>
        section.id === sectionId ? { ...section, name } : section,
      ),
    })),

  loadLights: async () => {
    const result = await invoke<HueLight[]>("get-hue-lights");
    set({ lights: result });
  },

  loadScenes: async () => {
    try {
      const result = await invoke<HueScene[]>("get-hue-scenes");
      set({ scenes: result });
    } catch (error) {
      set({ error: String(error) || "Failed to load scenes." });
    }
  },

  loadAll: async () => {
    set({ isLoading: true, error: null });
    try {
      // Each resource degrades independently: a failure in any one (zones,
      // scenes, rooms, lights) leaves the others usable rather than blanking
      // the whole Home. Rooms failing surfaces a banner but Home still renders.
      const [rooms, zones, sceneResult] = await Promise.all([
        invoke<HueRoom[]>("get-hue-rooms").catch((roomsError) => {
          set({
            error: String(roomsError) || "Failed to load your Hue setup.",
          });
          return [] as HueRoom[];
        }),
        invoke<HueZone[]>("get-hue-zones").catch(() => [] as HueZone[]),
        invoke<HueScene[]>("get-hue-scenes").catch(() => [] as HueScene[]),
        get().loadLights(),
      ]);
      const roomZones = [...rooms, ...zones].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      set((state) => ({
        roomZones,
        scenes: sceneResult,
        ...refreshLayoutState(
          roomZones,
          state.storedLayout,
          state.groupingMode,
        ),
      }));
    } catch (loadError) {
      // Reached only if loadLights rejects (it has no per-call fallback).
      set({ error: String(loadError) || "Failed to load your Hue setup." });
    } finally {
      set({ isLoading: false, hasLoaded: true });
    }
  },

  applyHueEvents: (updates) => {
    const changes = coalesceHueEvents(updates);
    const sceneChanges = changes.filter(
      (change) =>
        (change.type === "scene" || change.type === "smart_scene") &&
        change.id != null,
    );
    const knownSceneKeys = new Set(
      get().scenes.map((scene) => `${scene.resourceType}:${scene.id}`),
    );
    const shouldRefreshScenes = sceneChanges.length > 0 && sceneChanges.some((change) => {
      const known = knownSceneKeys.has(`${change.type}:${change.id ?? ""}`);
      return (
        change.eventType === "update" ||
        change.eventType === "add" ||
        change.eventType === "delete" ||
        !known ||
        change.value == null
      );
    });

    set((state) => {
      const lights = state.lights.map((light) => {
        const change = changes.find(
          (u) => u.type === "light" && u.id === light.id,
        );
        if (!change) return light;
        const { on, brightness, colorMode, xy, mirek, effect, effectV2 } =
          reconcileLock(light.id, {
            on: change.on,
            brightness: change.brightness,
            colorMode: change.colorMode,
            xy: change.xy,
            mirek: change.mirek,
            effect: change.effect,
            effectV2: change.effectV2,
          });
        const nextIsOn = on ?? light.isOn;
        return {
          ...light,
          isOn: nextIsOn,
          brightness: nextBrightness(light.brightness, brightness, nextIsOn),
          xy: xy ?? light.xy,
          ct: mirek ?? light.ct,
          effect: effectV2 ?? effect ?? light.effect,
          effectV2: effectV2 ?? light.effectV2,
          colorMode: colorMode ?? light.colorMode,
        };
      });

      // The bridge sends a grouped_light event for room/zone-level changes, but
      // an external single-light change may only emit `light` events. Fall back
      // to deriving the tile's aggregate from its members so it still tracks.
      const lightById = new Map(lights.map((light) => [light.id, light]));
      const roomZones = state.roomZones.map((roomZone) => {
        const change = changes.find(
          (u) => u.type === "grouped_light" && u.id === roomZone.groupedLightId,
        );
        if (change) {
          const { on, brightness } = reconcileLock(roomZone.groupedLightId, {
            on: change.on,
            brightness: change.brightness,
          });
          const nextAnyOn = on ?? roomZone.anyOn;
          return {
            ...roomZone,
            anyOn: nextAnyOn,
            allOn: nextAnyOn ? roomZone.allOn : false,
            brightness: nextBrightness(
              roomZone.brightness,
              brightness,
              nextAnyOn,
            ),
          };
        }

        // No authoritative grouped event: derive from members, but never while
        // an optimistic command for this group is still settling.
        const lock = roomZone.groupedLightId
          ? optimisticLocks.get(roomZone.groupedLightId)
          : undefined;
        if (lock && Date.now() < lock.until) return roomZone;
        const memberChanged = roomZone.lightIds.some((id) =>
          changes.some((u) => u.type === "light" && u.id === id),
        );
        if (!memberChanged) return roomZone;
        const members = roomZone.lightIds
          .map((id) => lightById.get(id))
          .filter((light): light is HueLight => light !== undefined);
        // Members not yet in state: leave the tile as-is rather than guess it off.
        if (members.length === 0) return roomZone;
        const onMembers = members.filter((light) => light.isOn);
        return {
          ...roomZone,
          anyOn: onMembers.length > 0,
          allOn: members.length > 0 && onMembers.length === members.length,
          brightness: onMembers.length
            ? onMembers.reduce(
                (sum, light) => sum + (light.brightness ?? 0),
                0,
              ) / onMembers.length
            : roomZone.brightness,
        };
      });

      const scenes =
        sceneChanges.length === 0
          ? state.scenes
          : state.scenes.map((scene) => {
              const change = sceneChanges.find(
                (candidate) =>
                  candidate.id === scene.id &&
                  candidate.type === scene.resourceType,
              );
              return change?.value ? { ...scene, status: change.value } : scene;
            });

      return { lights, roomZones, scenes };
    });

    if (shouldRefreshScenes) {
      scheduleSceneEventRefresh(() => get().loadScenes());
    }
  },

  setRoomZoneState: (roomZone, nextOn, brightnessPct, phase = "final") => {
    if (!roomZone.groupedLightId) return;
    const isToggle = brightnessPct === null;
    // Turning on sends a concrete brightness as well as `on`; some grouped
    // light states accept `on: true` but do not physically wake the members
    // until dimming is written. Turning off still sends only `on: false`.
    const sendBrightness = nextOn
      ? brightnessPct === null
        ? restoreBrightness(roomZone.brightness)
        : Math.max(1, brightnessPct)
      : null;
    const memberIds = new Set(roomZone.lightIds);
    const transitionMs =
      phase === "live"
        ? LIVE_SLIDER_TRANSITION_MS
        : isToggle
          ? GROUP_TOGGLE_TRANSITION_MS
          : BRIGHTNESS_TRANSITION_MS;
    // Only send `on` when it's actually changing: a brightness drag on an
    // already-on group should carry dimming alone (fewer ZigBee messages, and
    // it won't re-trigger an on-transition mid-drag).
    const sendOn = !isToggle && roomZone.anyOn === nextOn ? null : nextOn;

    // Optimistic brightness shown right away: on/drag uses the value we send;
    // off leaves the last useful level in place for the next restore.
    const groupOptimisticBri = sendBrightness;
    const groupToggleLock = isToggle
      ? {
          durationMs: GROUP_TOGGLE_SETTLE_MS,
          releaseOnConfirm: false,
        }
      : undefined;

    // Guard the optimistic state from the echo flurry our own write triggers.
    // Switch-on carries brightness intentionally; switch-off only locks power.
    lockResource(
      roomZone.groupedLightId,
      {
        on: nextOn,
        ...(sendBrightness !== null ? { brightness: sendBrightness } : {}),
      },
      groupToggleLock,
    );
    for (const memberId of memberIds) {
      lockResource(
        memberId,
        {
          on: nextOn,
          ...(sendBrightness !== null ? { brightness: sendBrightness } : {}),
        },
        groupToggleLock,
      );
    }

    set((state) => ({
      roomZones: state.roomZones.map((g) =>
        g.id === roomZone.id
          ? {
              ...g,
              anyOn: nextOn,
              allOn: nextOn ? g.allOn : false,
              brightness: groupOptimisticBri ?? g.brightness,
            }
          : g,
      ),
      lights: state.lights.map((light) =>
        memberIds.has(light.id)
          ? {
              ...light,
              isOn: nextOn,
              brightness:
                sendBrightness ??
                (nextOn ? restoreBrightness(light.brightness) : null) ??
                light.brightness,
            }
          : light,
      ),
    }));

    void invoke("set-grouped-light-state", {
      id: roomZone.groupedLightId,
      on: sendOn,
      brightness: sendBrightness,
      transitionMs,
    }).catch((e) => {
      clearResourceLocks([roomZone.groupedLightId, ...memberIds]);
      set({ error: String(e) || "Unable to update room or zone." });
      void get().loadAll();
    });
  },

  setLightState: (light, nextOn, brightnessPct, phase = "final") => {
    const isToggle = brightnessPct === null;
    // Turning on sends brightness too. That makes switch-on behave like the
    // slider path, which reliably wakes lights even after a grouped off command.
    // Turning off still sends only `on: false`.
    const sendBrightness = nextOn
      ? brightnessPct === null
        ? restoreBrightness(light.brightness)
        : Math.max(1, brightnessPct)
      : null;
    const transitionMs =
      phase === "live"
        ? LIVE_SLIDER_TRANSITION_MS
        : isToggle
          ? nextOn
            ? LIGHT_TOGGLE_ON_TRANSITION_MS
            : LIGHT_TOGGLE_OFF_TRANSITION_MS
          : BRIGHTNESS_TRANSITION_MS;
    // Omit `on` for a brightness drag on an already-on light (see grouped case).
    const sendOn = !isToggle && light.isOn === nextOn ? null : nextOn;
    // A direct light command supersedes any still-settling room/zone optimistic
    // command that contains this light.
    clearGroupLocksForLight(light.id, get().roomZones);

    // Show immediately: on/drag uses the value we send; off leaves the last
    // useful level in place for the next restore.
    const optimisticBri = sendBrightness;
    lockResource(light.id, {
      on: nextOn,
      ...(sendBrightness !== null ? { brightness: sendBrightness } : {}),
    });
    set((state) => ({
      lights: state.lights.map((l) =>
        l.id === light.id
          ? { ...l, isOn: nextOn, brightness: optimisticBri ?? l.brightness }
          : l,
      ),
    }));

    void invoke("set-light-state", {
      id: light.id,
      on: sendOn,
      brightness: sendBrightness,
      transitionMs,
    }).catch((e) => {
      clearResourceLocks([light.id]);
      set({ error: String(e) || "Unable to update light." });
      void get().loadLights();
    });
  },

  setLightColor: (light, change) => {
    // Setting a color also turns the light on; lock so an in-flight off-echo
    // can't immediately flip it back.
    lockResource(light.id, {
      on: true,
      ...(change.xy ? { colorMode: "xy" as const } : {}),
      ...(change.ct ? { colorMode: "ct" as const } : {}),
    });
    clearGroupLocksForLight(light.id, get().roomZones);
    set((state) => ({
      lights: state.lights.map((l) =>
        l.id === light.id
          ? {
              ...l,
              isOn: true,
              xy: change.xy ?? l.xy,
              ct: change.ct ?? l.ct,
              effect: change.effect ?? l.effect,
              effectV2: change.effect ?? l.effectV2,
              colorMode: change.xy ? "xy" : change.ct ? "ct" : l.colorMode,
            }
          : l,
      ),
    }));

    void invoke("set-light-color", {
      id: light.id,
      xy: change.xy ?? null,
      ct: change.ct ?? null,
      effect: change.effect ?? null,
      transitionMs: COLOR_TRANSITION_MS,
    }).catch((e) => {
      set({ error: String(e) || "Unable to update color." });
      void get().loadLights();
    });
  },

  createGalleryScene: async (roomZone, preset) => {
    try {
      const scene = await invoke<HueScene>("create-hue-gallery-scene", {
        name: preset.name,
        groupId: roomZone.id,
        groupType: roomZone.resourceType,
        brightness: preset.brightness,
        colors: preset.colors.map(({ xy, mirek }) => ({ xy, mirek })),
      });

      set((state) => ({
        scenes: [
          ...state.scenes.filter(
            (candidate) =>
              candidate.id !== scene.id ||
              candidate.resourceType !== scene.resourceType,
          ),
          scene,
        ],
        error: null,
      }));

      await get().activateScene(scene);
      await get().loadScenes();
    } catch (e) {
      const message = String(e) || "Unable to add gallery scene.";
      set({ error: message });
      throw new Error(message);
    }
  },

  activateScene: async (scene, intent = "apply") => {
    const actionByLightId = new Map(
      scene.actions.map((action) => [action.targetId, action]),
    );
    const targetIds = [...actionByLightId.keys()];
    const lockOptions = {
      durationMs: SCENE_SETTLE_MS,
      releaseOnConfirm: false,
    };

    for (const [lightId, action] of actionByLightId) {
      clearGroupLocksForLight(lightId, get().roomZones);
      const impliesOn =
        action.brightness != null ||
        sceneActionHasColor(action) ||
        action.effect != null ||
        action.effectV2 != null;
      lockResource(
        lightId,
        {
          ...(action.on != null || impliesOn ? { on: action.on ?? true } : {}),
          ...(action.brightness != null
            ? { brightness: action.brightness }
            : {}),
          ...(action.xy ? { colorMode: "xy" as const, xy: action.xy } : {}),
          ...(action.mirek != null
            ? { colorMode: "ct" as const, mirek: action.mirek }
            : {}),
          ...(action.effect ? { effect: action.effect } : {}),
          ...(action.effectV2 ? { effectV2: action.effectV2 } : {}),
        },
        lockOptions,
      );
    }

    set((state) => {
      const lights = state.lights.map((light) => {
        const action = actionByLightId.get(light.id);
        if (!action) return light;
        const impliesOn =
          action.brightness != null ||
          sceneActionHasColor(action) ||
          action.effect != null ||
          action.effectV2 != null;
        const nextIsOn = action.on ?? (impliesOn ? true : light.isOn);

        return {
          ...light,
          isOn: nextIsOn,
          brightness: nextBrightness(
            light.brightness,
            action.brightness,
            nextIsOn,
          ),
          xy: action.xy ?? light.xy,
          ct: action.mirek ?? light.ct,
          effect: action.effectV2 ?? action.effect ?? light.effect,
          effectV2: action.effectV2 ?? light.effectV2,
          colorMode: action.xy ? "xy" : action.mirek ? "ct" : light.colorMode,
        };
      });

      const lightById = new Map(lights.map((light) => [light.id, light]));
      const roomZones = state.roomZones.map((roomZone) => {
        const affected =
          scene.group != null
            ? roomZone.id === scene.group
            : roomZone.lightIds.some((id) => actionByLightId.has(id));
        if (!affected) return roomZone;

        const members = roomZone.lightIds
          .map((id) => lightById.get(id))
          .filter((light): light is HueLight => light !== undefined);
        if (members.length === 0) return roomZone;
        const onMembers = members.filter((light) => light.isOn);
        return {
          ...roomZone,
          anyOn: onMembers.length > 0,
          allOn: onMembers.length === members.length,
          brightness: onMembers.length
            ? onMembers.reduce(
                (sum, light) => sum + (light.brightness ?? 0),
                0,
              ) / onMembers.length
            : roomZone.brightness,
        };
      });

      const scenes = state.scenes.map((candidate) =>
        candidate.group === scene.group
          ? {
              ...candidate,
              status:
                candidate.id === scene.id
                  ? nextSceneStatus(candidate, intent)
                  : "Inactive",
            }
          : candidate,
      );

      return { error: null, lights, roomZones, scenes };
    });

    const groupedLightIds =
      targetIds.length === 0
        ? []
        : get()
            .roomZones.filter((roomZone) =>
              scene.group != null
                ? roomZone.id === scene.group
                : roomZone.lightIds.some((id) => actionByLightId.has(id)),
            )
            .map((roomZone) => roomZone.groupedLightId)
            .filter((id): id is string => id != null);

    for (const roomZone of get().roomZones) {
      if (
        !roomZone.groupedLightId ||
        !groupedLightIds.includes(roomZone.groupedLightId)
      ) {
        continue;
      }
      lockResource(
        roomZone.groupedLightId,
        {
          on: roomZone.anyOn,
          ...(roomZone.brightness != null
            ? { brightness: roomZone.brightness }
            : {}),
        },
        lockOptions,
      );
    }

    try {
      const command = sceneInvokeCommand(scene, intent);
      await invoke(
        command,
        command === "deactivate-smart-scene"
          ? { sceneId: scene.id }
          : { sceneId: scene.id, transitionMs: SCENE_TRANSITION_MS },
      );
    } catch (e) {
      clearResourceLocks([...targetIds, ...groupedLightIds]);
      set({ error: String(e) || "Unable to activate scene." });
      void get().loadAll();
    }
  },

  setDynamicSpeedLive: (scene, step) => {
    void invoke("start-dynamic-scene", {
      sceneId: scene.id,
      transitionMs: dynamicLiveSpeedDurationMs(step),
    }).catch((e) => {
      set({ error: String(e) || "Unable to change dynamic speed." });
    });
  },

  renameScene: async (scene, name) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === scene.name) return;
    patchSceneLocal(set, scene, { name: trimmed });
    try {
      await invoke("update-hue-resource", {
        resourceType: scene.resourceType,
        id: scene.id,
        body: { metadata: { name: trimmed } },
      });
    } catch (e) {
      set({ error: String(e) || "Unable to rename scene." });
      void get().loadScenes();
    }
  },

  setSceneBrightness: (scene, pct, phase = "final") => {
    if (phase !== "final") return;
    invoke("set-scene-brightness", {
      sceneId: scene.id,
      brightness: Math.max(1, Math.round(pct)),
    }).catch((e) => {
      set({ error: String(e) || "Unable to set scene brightness." });
    });
  },

  setSceneSpeed: async (scene, speed) => {
    const clamped = Math.min(1, Math.max(0, speed));
    patchSceneLocal(set, scene, { speed: clamped });
    try {
      await invoke("update-hue-resource", {
        resourceType: scene.resourceType,
        id: scene.id,
        body: { speed: clamped },
      });
    } catch (e) {
      set({ error: String(e) || "Unable to set scene speed." });
      void get().loadScenes();
      throw e;
    }
  },

  setSceneAutoplay: async (scene, autoDynamic) => {
    patchSceneLocal(set, scene, { autoDynamic });
    try {
      await invoke("update-hue-resource", {
        resourceType: scene.resourceType,
        id: scene.id,
        body: { auto_dynamic: autoDynamic },
      });
    } catch (e) {
      set({ error: String(e) || "Unable to update autoplay." });
      void get().loadScenes();
      throw e;
    }
  },

  deleteScene: async (scene) => {
    const { selectedSceneId } = get();
    set((state) => ({
      scenes: state.scenes.filter(
        (candidate) =>
          candidate.id !== scene.id ||
          candidate.resourceType !== scene.resourceType,
      ),
      selectedSceneId:
        selectedSceneId === scene.id ? null : selectedSceneId,
      error: null,
    }));
    try {
      await invoke("delete-hue-resource", {
        resourceType: scene.resourceType,
        id: scene.id,
      });
    } catch (e) {
      set({ error: String(e) || "Unable to delete scene." });
      void get().loadScenes();
    }
  },
}));

/**
 * Lifecycle effects for the Hue resources store. Mounted once inside the
 * router root so the data layer persists across Home -> Space -> Settings
 * navigation without using a React context provider.
 */
export const HueResourcesStoreEffects: React.FC = () => {
  useEffect(() => {
    // The setup wizard prefetches resources before entering Home so the reveal
    // lands on a ready screen; skip the duplicate load when that already ran.
    if (!useHueResourcesStore.getState().hasLoaded) {
      void useHueResourcesStore.getState().loadAll();
    }
  }, []);

  useEffect(() => {
    void invoke("start-hue-events").catch(() => {
      // Non-fatal: controls still work, they just won't passively update.
    });

    const unlisten = listen<HueEventUpdate[]>("hue-event", (event) => {
      useHueResourcesStore.getState().applyHueEvents(event.payload);
    });

    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, []);

  return null;
};
