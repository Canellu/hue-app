import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SettingsScreen } from "../settings/SettingsScreen";
import { AppHeader } from "./AppHeader";
import { HomeScreen } from "./HomeScreen";
import { LightDrawer } from "./LightDrawer";
import { RoomScreen } from "./RoomScreen";
import {
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

type ThemeMode = "light" | "dark";

interface DesktopShellProps {
  themeMode: ThemeMode;
  onToggleTheme: () => void;
}

/** Color attributes that can be pushed to an individual light. */
export interface LightColorChange {
  xy?: [number, number];
  ct?: number;
  effect?: string;
}

export const DesktopShell: React.FC<DesktopShellProps> = ({
  themeMode,
  onToggleTheme,
}) => {
  const [groups, setGroups] = useState<HueGroup[]>([]);
  const [lights, setLights] = useState<HueLight[]>([]);
  const [scenes, setScenes] = useState<HueScene[]>([]);
  // null = Home screen; otherwise the open room/zone id.
  const [openRoomId, setOpenRoomId] = useState<string | null>(null);
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  // Explicit, state-driven layout editing. `draftLayout` is a working copy
  // cloned on entry; it replaces the committed layout only on Save.
  const [isEditLayoutMode, setIsEditLayoutMode] = useState(false);
  const [draftLayout, setDraftLayout] = useState<DashboardLayout>([]);

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
      // If the open room vanished after a refresh, fall back to Home.
      setOpenRoomId((current) =>
        current && sorted.some((group) => group.id === current) ? current : null,
      );
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

  const openRoom = useMemo(
    () => groups.find((group) => group.id === openRoomId) ?? null,
    [groups, openRoomId],
  );

  const roomLights = useMemo(() => {
    if (!openRoom) return [];
    const ids = new Set(openRoom.lightIds);
    return lights
      .filter((light) => ids.has(light.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [lights, openRoom]);

  const roomScenes = useMemo(() => {
    if (!openRoom) return [];
    return scenes
      .filter((scene) => scene.group === openRoom.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [scenes, openRoom]);

  const selectedLight = useMemo(
    () => lights.find((light) => light.id === selectedLightId) ?? null,
    [lights, selectedLightId],
  );

  // Room/zone on/off + brightness via the grouped_light resource.
  const setGroupState = useCallback(
    async (group: HueGroup, nextOn: boolean, brightnessPct: number | null) => {
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
      try {
        await invoke("set-room-state", {
          id: group.groupedLightId,
          on: nextOn,
          brightness: bri,
        });
      } catch (e) {
        setError(String(e) || "Unable to update room.");
        void loadAll();
      }
    },
    [loadAll],
  );

  const setLightState = useCallback(
    async (light: HueLight, nextOn: boolean, brightnessPct: number | null) => {
      const bri = brightnessPct !== null && nextOn ? brightnessPct : null;
      setLights((prev) =>
        prev.map((l) =>
          l.id === light.id
            ? { ...l, isOn: nextOn, brightness: bri ?? l.brightness }
            : l,
        ),
      );
      try {
        await invoke("set-light-state", {
          id: light.id,
          on: nextOn,
          brightness: bri,
        });
      } catch (e) {
        setError(String(e) || "Unable to update light.");
        void loadLights();
      }
    },
    [loadLights],
  );

  const setLightColor = useCallback(
    async (light: HueLight, change: LightColorChange) => {
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
      try {
        await invoke("set-light-color", {
          id: light.id,
          xy: change.xy ?? null,
          ct: change.ct ?? null,
          effect: change.effect ?? null,
        });
      } catch (e) {
        setError(String(e) || "Unable to update color.");
        void loadLights();
      }
    },
    [loadLights],
  );

  const activateScene = useCallback(
    async (scene: HueScene) => {
      setActiveSceneId(scene.id);
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

  const handleOpenRoom = useCallback((id: string) => {
    setOpenRoomId(id);
    setSelectedLightId(null);
    setActiveSceneId(null);
  }, []);

  const handleBack = useCallback(() => {
    setOpenRoomId(null);
    setSelectedLightId(null);
  }, []);

  const enterEditLayout = useCallback(() => {
    // Deep-clone so drag edits never mutate the committed layout.
    setDraftLayout(layout.map((group) => ({ ...group, roomIds: [...group.roomIds] })));
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

  const connected = error === null;

  return (
    <div className="flex h-full flex-col">
      <AppHeader
        connected={connected}
        onOpenSettings={() => setShowSettings(true)}
        showEditLayout={openRoom === null}
        isEditLayoutMode={isEditLayoutMode}
        onEditLayout={enterEditLayout}
        onCancelEditLayout={cancelEditLayout}
        onSaveEditLayout={saveEditLayout}
      />

      <div className="flex-1 overflow-y-auto p-6">
        {openRoom ? (
          <RoomScreen
            group={openRoom}
            lights={roomLights}
            scenes={roomScenes}
            activeSceneId={activeSceneId}
            selectedLightId={selectedLightId}
            error={error}
            onBack={handleBack}
            onGroupToggle={(group, on) => void setGroupState(group, on, null)}
            onGroupBrightness={(group, pct) =>
              void setGroupState(group, pct > 0, pct)
            }
            onLightToggle={(light, on) => void setLightState(light, on, null)}
            onLightBrightness={(light, pct) =>
              void setLightState(light, pct > 0, pct)
            }
            onSelectLight={(id) => setSelectedLightId(id)}
            onSceneActivate={(scene) => void activateScene(scene)}
          />
        ) : (
          <HomeScreen
            groups={groups}
            lights={lights}
            isLoading={isLoading}
            error={error}
            layout={isEditLayoutMode ? draftLayout : layout}
            editing={isEditLayoutMode}
            onLayoutChange={setDraftLayout}
            onOpenRoom={handleOpenRoom}
            onGroupToggle={(group, on) => void setGroupState(group, on, null)}
            onGroupBrightness={(group, pct) =>
              void setGroupState(group, pct > 0, pct)
            }
          />
        )}
      </div>

      {selectedLight && (
        <LightDrawer
          light={selectedLight}
          onClose={() => setSelectedLightId(null)}
          onLightToggle={(light, on) => void setLightState(light, on, null)}
          onLightBrightness={(light, pct) =>
            void setLightState(light, pct > 0, pct)
          }
          onLightColor={(light, change) => void setLightColor(light, change)}
        />
      )}

      <Sheet open={showSettings} onOpenChange={setShowSettings}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Settings</SheetTitle>
            <SheetDescription>Bridge &amp; app preferences</SheetDescription>
          </SheetHeader>
          <div className="p-6 pt-0">
            <SettingsScreen themeMode={themeMode} onToggleTheme={onToggleTheme} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
