import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  newLayoutSectionId,
  useHomeLayout,
} from "@/features/home-screen/hooks/useHomeLayout";
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

interface HueResourcesContextValue {
  roomZones: HueRoomZone[];
  lights: HueLight[];
  scenes: HueScene[];
  isLoading: boolean;
  error: string | null;

  // Home layout editing. Layout sections are local app state, not Hue resources.
  layout: HomeLayout;
  displayLayout: HomeLayout;
  groupingMode: HomeGroupingMode;
  setGroupingMode: (mode: HomeGroupingMode) => void;
  draftLayout: HomeLayout;
  isEditLayoutMode: boolean;
  setDraftLayout: (next: HomeLayout) => void;
  enterEditLayout: () => void;
  cancelEditLayout: () => void;
  saveEditLayout: () => void;

  // Layout section creation (dialog driven from the header while editing).
  isCreatingSection: boolean;
  openCreateSection: () => void;
  closeCreateSection: () => void;
  createLayoutSection: (name: string) => void;
  renameLayoutSection: (sectionId: string, name: string) => void;

  // Optimistic control handlers.
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

const HueResourcesContext = createContext<HueResourcesContextValue | undefined>(
  undefined,
);

/**
 * Owns Hue room/zone, light, and scene data, the real-time event stream, and
 * the optimistic control handlers, exposing them to every route via context.
 * Mounted once inside the router root so the data layer persists across
 * Home → Space → Settings navigation.
 */
export const HueResourcesProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [roomZones, setRoomZones] = useState<HueRoomZone[]>([]);
  const [lights, setLights] = useState<HueLight[]>([]);
  const [scenes, setScenes] = useState<HueScene[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Explicit, state-driven layout editing. `draftLayout` is a working copy
  // cloned on entry; it replaces the committed layout only on Save.
  const [isEditLayoutMode, setIsEditLayoutMode] = useState(false);
  const [draftLayout, setDraftLayout] = useState<HomeLayout>([]);
  const [isCreatingSection, setIsCreatingSection] = useState(false);

  const {
    layout,
    displayLayout,
    groupingMode,
    setGroupingMode: setStoredGroupingMode,
    saveLayout,
  } = useHomeLayout(roomZones);

  const loadLights = useCallback(async () => {
    const result = await invoke<HueLight[]>("get-hue-lights");
    setLights(result);
  }, []);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [rooms, zones, sceneResult] = await Promise.all([
        invoke<HueRoom[]>("get-hue-rooms"),
        invoke<HueZone[]>("get-hue-zones").catch(() => [] as HueZone[]),
        invoke<HueScene[]>("get-hue-scenes").catch(() => [] as HueScene[]),
        loadLights(),
      ]);
      const sorted = [...rooms, ...zones].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      setRoomZones(sorted);
      setScenes(sceneResult);
    } catch (loadError) {
      setError(String(loadError) || "Failed to load your Hue setup.");
    } finally {
      setIsLoading(false);
    }
  }, [loadLights]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Real-time sync from the bridge event stream, matched by v2 resource id.
  useEffect(() => {
    void invoke("start-hue-events").catch(() => {
      // Non-fatal: controls still work, they just won't passively update.
    });

    const unlisten = listen<HueEventUpdate[]>("hue-event", (event) => {
      const updates = event.payload;

      setRoomZones((prev) =>
        prev.map((roomZone) => {
          const change = updates.find(
            (u) =>
              u.type === "grouped_light" && u.id === roomZone.groupedLightId,
          );
          if (!change) return roomZone;
          return {
            ...roomZone,
            anyOn: change.on ?? roomZone.anyOn,
            brightness: change.brightness ?? roomZone.brightness,
          };
        }),
      );

      setLights((prev) =>
        prev.map((light) => {
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
      );
    });

    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, []);

  // Room/zone on/off + brightness via the grouped_light resource.
  const setRoomZoneState = useCallback(
    (roomZone: HueRoomZone, nextOn: boolean, brightnessPct: number | null) => {
      if (!roomZone.groupedLightId) return;
      const bri = brightnessPct !== null && nextOn ? brightnessPct : null;
      setRoomZones((prev) =>
        prev.map((g) =>
          g.id === roomZone.id
            ? {
                ...g,
                anyOn: nextOn,
                allOn: nextOn ? g.allOn : false,
                brightness: bri ?? g.brightness,
              }
            : g,
        ),
      );
      const memberIds = new Set(roomZone.lightIds);
      setLights((prev) =>
        prev.map((light) =>
          memberIds.has(light.id) ? { ...light, isOn: nextOn } : light,
        ),
      );
      void invoke("set-grouped-light-state", {
        id: roomZone.groupedLightId,
        on: nextOn,
        brightness: bri,
      }).catch((e) => {
        setError(String(e) || "Unable to update room or zone.");
        void loadAll();
      });
    },
    [loadAll],
  );

  const setLightState = useCallback(
    (light: HueLight, nextOn: boolean, brightnessPct: number | null) => {
      const bri = brightnessPct !== null && nextOn ? brightnessPct : null;
      setLights((prev) =>
        prev.map((l) =>
          l.id === light.id
            ? { ...l, isOn: nextOn, brightness: bri ?? l.brightness }
            : l,
        ),
      );
      void invoke("set-light-state", {
        id: light.id,
        on: nextOn,
        brightness: bri,
      }).catch((e) => {
        setError(String(e) || "Unable to update light.");
        void loadLights();
      });
    },
    [loadLights],
  );

  const setLightColor = useCallback(
    (light: HueLight, change: LightColorChange) => {
      setLights((prev) =>
        prev.map((l) =>
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
      );
      void invoke("set-light-color", {
        id: light.id,
        xy: change.xy ?? null,
        ct: change.ct ?? null,
        effect: change.effect ?? null,
      }).catch((e) => {
        setError(String(e) || "Unable to update color.");
        void loadLights();
      });
    },
    [loadLights],
  );

  const activateScene = useCallback(
    async (scene: HueScene) => {
      try {
        await invoke("activate-scene", { sceneId: scene.id });
        // A scene touches many lights at once — refresh their real states.
        await loadLights();
      } catch (e) {
        setError(String(e) || "Unable to activate scene.");
      }
    },
    [loadLights],
  );

  const enterEditLayout = useCallback(() => {
    if (groupingMode !== "custom") setStoredGroupingMode("custom");
    // Deep-clone so drag edits never mutate the committed layout.
    setDraftLayout(
      layout.map((section) => ({
        ...section,
        spaceIds: [...section.spaceIds],
      })),
    );
    setIsEditLayoutMode(true);
  }, [groupingMode, layout, setStoredGroupingMode]);

  const cancelEditLayout = useCallback(() => {
    setIsEditLayoutMode(false);
    setDraftLayout([]);
  }, []);

  const saveEditLayout = useCallback(() => {
    saveLayout(draftLayout);
    setIsEditLayoutMode(false);
    setDraftLayout([]);
  }, [draftLayout, saveLayout]);

  const setGroupingMode = useCallback(
    (mode: HomeGroupingMode) => {
      setStoredGroupingMode(mode);
      if (mode !== "custom") {
        setIsEditLayoutMode(false);
        setDraftLayout([]);
        setIsCreatingSection(false);
      }
    },
    [setStoredGroupingMode],
  );

  const openCreateSection = useCallback(() => setIsCreatingSection(true), []);
  const closeCreateSection = useCallback(() => setIsCreatingSection(false), []);

  const createLayoutSection = useCallback((name: string) => {
    setDraftLayout((prev) => [
      ...prev,
      { id: newLayoutSectionId(), name, spaceIds: [] },
    ]);
    setIsCreatingSection(false);
  }, []);

  const renameLayoutSection = useCallback((sectionId: string, name: string) => {
    setDraftLayout((prev) =>
      prev.map((section) =>
        section.id === sectionId ? { ...section, name } : section,
      ),
    );
  }, []);

  const value = useMemo<HueResourcesContextValue>(
    () => ({
      roomZones,
      lights,
      scenes,
      isLoading,
      error,
      layout,
      displayLayout,
      groupingMode,
      setGroupingMode,
      draftLayout,
      isEditLayoutMode,
      setDraftLayout,
      enterEditLayout,
      cancelEditLayout,
      saveEditLayout,
      isCreatingSection,
      openCreateSection,
      closeCreateSection,
      createLayoutSection,
      renameLayoutSection,
      setRoomZoneState,
      setLightState,
      setLightColor,
      activateScene,
    }),
    [
      roomZones,
      lights,
      scenes,
      isLoading,
      error,
      layout,
      displayLayout,
      groupingMode,
      setGroupingMode,
      draftLayout,
      isEditLayoutMode,
      enterEditLayout,
      cancelEditLayout,
      saveEditLayout,
      isCreatingSection,
      openCreateSection,
      closeCreateSection,
      createLayoutSection,
      renameLayoutSection,
      setRoomZoneState,
      setLightState,
      setLightColor,
      activateScene,
    ],
  );

  return (
    <HueResourcesContext.Provider value={value}>
      {children}
    </HueResourcesContext.Provider>
  );
};

export const useHueResources = (): HueResourcesContextValue => {
  const context = useContext(HueResourcesContext);
  if (!context) {
    throw new Error("useHueResources must be used within a HueResourcesProvider");
  }
  return context;
};
