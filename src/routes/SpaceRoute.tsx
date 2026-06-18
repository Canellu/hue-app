import { invoke } from "@tauri-apps/api/core";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { SpaceScreen } from "@/features/space-screen/SpaceScreen";
import { LightDrawer } from "@/features/space-screen/components/LightDrawer";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueAccessoryService } from "@/types/hue";

export const SpaceRoute: React.FC = () => {
  const { spaceId } = useParams({ from: "/space/$spaceId" });
  const navigate = useNavigate();
  const {
    roomZones,
    lights,
    scenes,
    error,
    setRoomZoneState,
    setLightState,
    setLightColor,
    activateScene,
  } = useHueResourcesStore(
    useShallow((state) => ({
      roomZones: state.roomZones,
      lights: state.lights,
      scenes: state.scenes,
      error: state.error,
      setRoomZoneState: state.setRoomZoneState,
      setLightState: state.setLightState,
      setLightColor: state.setLightColor,
      activateScene: state.activateScene,
    })),
  );

  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [accessoryServices, setAccessoryServices] = useState<
    HueAccessoryService[]
  >([]);

  // Live sensor/switch readings (motion, temperature, battery, button events)
  // aren't part of the room payload, so fetch them once per visit and key them
  // by their owning device to enrich the accessory tiles below.
  useEffect(() => {
    let active = true;
    void invoke<HueAccessoryService[]>("get-hue-accessory-services")
      .then((services) => {
        if (active) setAccessoryServices(services);
      })
      .catch(() => {
        if (active) setAccessoryServices([]);
      });
    return () => {
      active = false;
    };
  }, [spaceId]);

  const readingsByDevice = useMemo(() => {
    const map = new Map<string, HueAccessoryService[]>();
    for (const service of accessoryServices) {
      if (!service.deviceId || !service.value) continue;
      const current = map.get(service.deviceId) ?? [];
      current.push(service);
      map.set(service.deviceId, current);
    }
    return map;
  }, [accessoryServices]);

  const roomZone = useMemo(
    () => roomZones.find((g) => g.id === spaceId) ?? null,
    [roomZones, spaceId],
  );

  const spaceLights = useMemo(() => {
    if (!roomZone) return [];
    const ids = new Set(roomZone.lightIds);
    return lights
      .filter((light) => ids.has(light.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [lights, roomZone]);

  const spaceScenes = useMemo(() => {
    if (!roomZone) return [];
    return scenes
      .filter((scene) => scene.group === roomZone.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [scenes, roomZone]);

  const selectedLight = useMemo(
    () => lights.find((light) => light.id === selectedLightId) ?? null,
    [lights, selectedLightId],
  );

  // A missing room/zone (stale URL, or it vanished after a refresh) falls back Home.
  useEffect(() => {
    if (roomZones.length > 0 && !roomZone) void navigate({ to: "/" });
  }, [roomZones.length, roomZone, navigate]);

  if (!roomZone) return null;

  return (
    <>
      <SpaceScreen
        roomZone={roomZone}
        lights={spaceLights}
        scenes={spaceScenes}
        readingsByDevice={readingsByDevice}
        activeSceneId={activeSceneId}
        selectedLightId={selectedLightId}
        error={error}
        onRoomZoneToggle={(g, on) => setRoomZoneState(g, on, null)}
        onRoomZoneBrightness={(g, pct) => setRoomZoneState(g, pct > 0, pct)}
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
