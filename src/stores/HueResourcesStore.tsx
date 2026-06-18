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
  loadAll: () => Promise<void>;
  applyHueEvents: (updates: HueEventUpdate[]) => void;
  setRoomZoneState: (
    roomZone: HueRoomZone,
    nextOn: boolean,
    brightnessPct: number | null,
  ) => void;
  setLightState: (
    light: HueLight,
    nextOn: boolean,
    brightnessPct: number | null,
  ) => void;
  setLightColor: (light: HueLight, change: LightColorChange) => void;
  activateScene: (scene: HueScene) => Promise<void>;
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
    set((state) => ({
      roomZones: state.roomZones.map((roomZone) => {
        const change = updates.find(
          (u) => u.type === "grouped_light" && u.id === roomZone.groupedLightId,
        );
        if (!change) return roomZone;
        return {
          ...roomZone,
          anyOn: change.on ?? roomZone.anyOn,
          brightness: change.brightness ?? roomZone.brightness,
        };
      }),
      lights: state.lights.map((light) => {
        const change = updates.find(
          (u) => u.type === "light" && u.id === light.id,
        );
        if (!change) return light;
        return {
          ...light,
          isOn: change.on ?? light.isOn,
          brightness: change.brightness ?? light.brightness,
          xy: change.xy ?? light.xy,
          ct: change.mirek ?? light.ct,
          colorMode: change.xy
            ? "xy"
            : change.mirek != null
              ? "ct"
              : light.colorMode,
        };
      }),
    }));
  },

  setRoomZoneState: (roomZone, nextOn, brightnessPct) => {
    if (!roomZone.groupedLightId) return;
    const bri = brightnessPct !== null && nextOn ? brightnessPct : null;
    const optimisticBrightness = bri ?? roomZone.brightness;
    const memberIds = new Set(roomZone.lightIds);

    set((state) => ({
      roomZones: state.roomZones.map((g) =>
        g.id === roomZone.id
          ? {
              ...g,
              anyOn: nextOn,
              allOn: nextOn ? g.allOn : false,
              brightness: optimisticBrightness ?? g.brightness,
            }
          : g,
      ),
      lights: state.lights.map((light) =>
        memberIds.has(light.id)
          ? {
              ...light,
              isOn: nextOn,
              brightness: optimisticBrightness ?? light.brightness,
            }
          : light,
      ),
    }));

    void invoke("set-grouped-light-state", {
      id: roomZone.groupedLightId,
      on: nextOn,
      brightness: bri,
    }).catch((e) => {
      set({ error: String(e) || "Unable to update room or zone." });
      void get().loadAll();
    });
  },

  setLightState: (light, nextOn, brightnessPct) => {
    const bri = brightnessPct !== null && nextOn ? brightnessPct : null;
    set((state) => ({
      lights: state.lights.map((l) =>
        l.id === light.id
          ? { ...l, isOn: nextOn, brightness: bri ?? l.brightness }
          : l,
      ),
    }));

    void invoke("set-light-state", {
      id: light.id,
      on: nextOn,
      brightness: bri,
    }).catch((e) => {
      set({ error: String(e) || "Unable to update light." });
      void get().loadLights();
    });
  },

  setLightColor: (light, change) => {
    set((state) => ({
      lights: state.lights.map((l) =>
        l.id === light.id
          ? {
              ...l,
              isOn: true,
              xy: change.xy ?? l.xy,
              ct: change.ct ?? l.ct,
              effect: change.effect ?? l.effect,
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
    }).catch((e) => {
      set({ error: String(e) || "Unable to update color." });
      void get().loadLights();
    });
  },

  activateScene: async (scene) => {
    try {
      await invoke("activate-scene", { sceneId: scene.id });
      // A scene touches many lights at once, so refresh their real states.
      await get().loadLights();
    } catch (e) {
      set({ error: String(e) || "Unable to activate scene." });
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
