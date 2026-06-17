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
  newGroupId,
  useDashboardLayout,
  type DashboardLayout,
} from "./useDashboardLayout";
import type {
  HueEventUpdate,
  HueGroup,
  HueGroups,
  HueLight,
  HueScene,
} from "./types";

/** Color attributes that can be pushed to an individual light. */
export interface LightColorChange {
  xy?: [number, number];
  ct?: number;
  effect?: string;
}

interface DashboardContextValue {
  groups: HueGroup[];
  lights: HueLight[];
  scenes: HueScene[];
  isLoading: boolean;
  error: string | null;

  // Dashboard layout editing (Home screen).
  layout: DashboardLayout;
  draftLayout: DashboardLayout;
  isEditLayoutMode: boolean;
  setDraftLayout: (next: DashboardLayout) => void;
  enterEditLayout: () => void;
  cancelEditLayout: () => void;
  saveEditLayout: () => void;

  // Group creation (dialog driven from the header while editing).
  isCreatingGroup: boolean;
  openCreateGroup: () => void;
  closeCreateGroup: () => void;
  createGroup: (name: string) => void;
  renameGroup: (groupId: string, name: string) => void;

  // Optimistic control handlers.
  setGroupState: (
    group: HueGroup,
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

const DashboardContext = createContext<DashboardContextValue | undefined>(
  undefined,
);

/**
 * Owns all bridge data (groups/lights/scenes), the real-time event stream, and
 * the optimistic control handlers, exposing them to every route via context.
 * Mounted once inside the router root so the data layer persists across
 * Home → Room → Settings navigation.
 */
export const DashboardProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [groups, setGroups] = useState<HueGroup[]>([]);
  const [lights, setLights] = useState<HueLight[]>([]);
  const [scenes, setScenes] = useState<HueScene[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Explicit, state-driven layout editing. `draftLayout` is a working copy
  // cloned on entry; it replaces the committed layout only on Save.
  const [isEditLayoutMode, setIsEditLayoutMode] = useState(false);
  const [draftLayout, setDraftLayout] = useState<DashboardLayout>([]);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  const { layout, saveLayout } = useDashboardLayout(groups);

  const loadLights = useCallback(async () => {
    const result = await invoke<HueLight[]>("get-hue-lights");
    setLights(result);
  }, []);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [groupResult, sceneResult] = await Promise.all([
        invoke<HueGroups>("get-hue-groups"),
        invoke<HueScene[]>("get-hue-scenes").catch(() => [] as HueScene[]),
        loadLights(),
      ]);
      const sorted = [...groupResult.groups].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      setGroups(sorted);
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

      setGroups((prev) =>
        prev.map((group) => {
          const change = updates.find(
            (u) => u.type === "grouped_light" && u.id === group.groupedLightId,
          );
          if (!change) return group;
          return {
            ...group,
            anyOn: change.on ?? group.anyOn,
            brightness: change.brightness ?? group.brightness,
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
  const setGroupState = useCallback(
    (group: HueGroup, nextOn: boolean, brightnessPct: number | null) => {
      if (!group.groupedLightId) return;
      const bri = brightnessPct !== null && nextOn ? brightnessPct : null;
      setGroups((prev) =>
        prev.map((g) =>
          g.id === group.id
            ? {
                ...g,
                anyOn: nextOn,
                allOn: nextOn ? g.allOn : false,
                brightness: bri ?? g.brightness,
              }
            : g,
        ),
      );
      const memberIds = new Set(group.lightIds);
      setLights((prev) =>
        prev.map((light) =>
          memberIds.has(light.id) ? { ...light, isOn: nextOn } : light,
        ),
      );
      void invoke("set-room-state", {
        id: group.groupedLightId,
        on: nextOn,
        brightness: bri,
      }).catch((e) => {
        setError(String(e) || "Unable to update room.");
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
    // Deep-clone so drag edits never mutate the committed layout.
    setDraftLayout(
      layout.map((group) => ({ ...group, roomIds: [...group.roomIds] })),
    );
    setIsEditLayoutMode(true);
  }, [layout]);

  const cancelEditLayout = useCallback(() => {
    setIsEditLayoutMode(false);
    setDraftLayout([]);
  }, []);

  const saveEditLayout = useCallback(() => {
    saveLayout(draftLayout);
    setIsEditLayoutMode(false);
    setDraftLayout([]);
  }, [draftLayout, saveLayout]);

  const openCreateGroup = useCallback(() => setIsCreatingGroup(true), []);
  const closeCreateGroup = useCallback(() => setIsCreatingGroup(false), []);

  const createGroup = useCallback((name: string) => {
    setDraftLayout((prev) => [...prev, { id: newGroupId(), name, roomIds: [] }]);
    setIsCreatingGroup(false);
  }, []);

  const renameGroup = useCallback((groupId: string, name: string) => {
    setDraftLayout((prev) =>
      prev.map((group) =>
        group.id === groupId ? { ...group, name } : group,
      ),
    );
  }, []);

  const value = useMemo<DashboardContextValue>(
    () => ({
      groups,
      lights,
      scenes,
      isLoading,
      error,
      layout,
      draftLayout,
      isEditLayoutMode,
      setDraftLayout,
      enterEditLayout,
      cancelEditLayout,
      saveEditLayout,
      isCreatingGroup,
      openCreateGroup,
      closeCreateGroup,
      createGroup,
      renameGroup,
      setGroupState,
      setLightState,
      setLightColor,
      activateScene,
    }),
    [
      groups,
      lights,
      scenes,
      isLoading,
      error,
      layout,
      draftLayout,
      isEditLayoutMode,
      enterEditLayout,
      cancelEditLayout,
      saveEditLayout,
      isCreatingGroup,
      openCreateGroup,
      closeCreateGroup,
      createGroup,
      renameGroup,
      setGroupState,
      setLightState,
      setLightColor,
      activateScene,
    ],
  );

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = (): DashboardContextValue => {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return context;
};
