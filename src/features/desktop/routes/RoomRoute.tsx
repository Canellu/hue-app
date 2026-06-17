import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useDashboard } from "../DashboardProvider";
import { LightDrawer } from "../LightDrawer";
import { RoomScreen } from "../RoomScreen";

export const RoomRoute: React.FC = () => {
  const { roomId } = useParams({ from: "/room/$roomId" });
  const navigate = useNavigate();
  const {
    groups,
    lights,
    scenes,
    error,
    setGroupState,
    setLightState,
    setLightColor,
    activateScene,
  } = useDashboard();

  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);

  const group = useMemo(
    () => groups.find((g) => g.id === roomId) ?? null,
    [groups, roomId],
  );

  const roomLights = useMemo(() => {
    if (!group) return [];
    const ids = new Set(group.lightIds);
    return lights
      .filter((light) => ids.has(light.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [lights, group]);

  const roomScenes = useMemo(() => {
    if (!group) return [];
    return scenes
      .filter((scene) => scene.group === group.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [scenes, group]);

  const selectedLight = useMemo(
    () => lights.find((light) => light.id === selectedLightId) ?? null,
    [lights, selectedLightId],
  );

  // A missing room (stale URL, or it vanished after a refresh) falls back Home.
  useEffect(() => {
    if (groups.length > 0 && !group) void navigate({ to: "/" });
  }, [groups.length, group, navigate]);

  if (!group) return null;

  return (
    <>
      <RoomScreen
        group={group}
        lights={roomLights}
        scenes={roomScenes}
        activeSceneId={activeSceneId}
        selectedLightId={selectedLightId}
        error={error}
        onGroupToggle={(g, on) => setGroupState(g, on, null)}
        onGroupBrightness={(g, pct) => setGroupState(g, pct > 0, pct)}
        onLightToggle={(light, on) => setLightState(light, on, null)}
        onLightBrightness={(light, pct) => setLightState(light, pct > 0, pct)}
        onSelectLight={(id) => setSelectedLightId(id)}
        onSceneActivate={(scene) => {
          setActiveSceneId(scene.id);
          void activateScene(scene);
        }}
      />

      {selectedLight && (
        <LightDrawer
          light={selectedLight}
          onClose={() => setSelectedLightId(null)}
          onLightToggle={(light, on) => setLightState(light, on, null)}
          onLightBrightness={(light, pct) => setLightState(light, pct > 0, pct)}
          onLightColor={(light, change) => setLightColor(light, change)}
        />
      )}
    </>
  );
};
