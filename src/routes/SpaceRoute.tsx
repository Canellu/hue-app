import { invoke } from "@tauri-apps/api/core";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { SpaceScreen } from "@/features/space-screen/SpaceScreen";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueAccessoryService } from "@/types/hue";

const isSceneStatusActive = (status: string | null | undefined): boolean =>
  status != null &&
  status.trim() !== "" &&
  status.trim().toLowerCase() !== "inactive";

export const SpaceRoute: React.FC = () => {
  const { spaceId } = useParams({ from: "/space/$spaceId" });
  const navigate = useNavigate();
  const {
    roomZones,
    lights,
    scenes,
    error,
    hueEventRevision,
    selectedLightId,
    setSelectedLightId,
    setSelectedSceneId,
    setInspectorPaneOpen,
    toggleLightInspector,
    toggleSceneInspector,
    toggleGroupInspector,
    setRoomZoneState,
    setLightState,
    createGalleryScene,
    setGallerySceneOnce,
    previewGalleryScene,
    endGalleryPreview,
    activateScene,
    loadAll,
  } = useHueResourcesStore(
    useShallow((state) => ({
      roomZones: state.roomZones,
      lights: state.lights,
      scenes: state.scenes,
      error: state.error,
      hueEventRevision: state.hueEventRevision,
      selectedLightId: state.selectedLightId,
      setSelectedLightId: state.setSelectedLightId,
      setSelectedSceneId: state.setSelectedSceneId,
      setInspectorPaneOpen: state.setInspectorPaneOpen,
      toggleLightInspector: state.toggleLightInspector,
      toggleSceneInspector: state.toggleSceneInspector,
      toggleGroupInspector: state.toggleGroupInspector,
      setRoomZoneState: state.setRoomZoneState,
      setLightState: state.setLightState,
      createGalleryScene: state.createGalleryScene,
      setGallerySceneOnce: state.setGallerySceneOnce,
      previewGalleryScene: state.previewGalleryScene,
      endGalleryPreview: state.endGalleryPreview,
      activateScene: state.activateScene,
      loadAll: state.loadAll,
    })),
  );

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

  const activeSceneId = useMemo(
    () =>
      spaceScenes.find((scene) => isSceneStatusActive(scene.status))?.id ??
      null,
    [spaceScenes],
  );

  // A missing room/zone (stale URL, or it vanished after a refresh) falls back Home.
  useEffect(() => {
    if (roomZones.length > 0 && !roomZone) void navigate({ to: "/" });
  }, [roomZones.length, roomZone, navigate]);

  // The inspector panel belongs to this space; collapse it when leaving so it
  // doesn't linger open over Home or another room. (Clearing the light id also
  // clears any selected scene — they're mutually exclusive in the store.)
  useEffect(() => {
    return () => {
      setInspectorPaneOpen(false);
      setSelectedLightId(null);
    };
  }, [spaceId, setInspectorPaneOpen, setSelectedLightId]);

  if (!roomZone) return null;

  return (
    <SpaceScreen
      roomZone={roomZone}
      roomZones={roomZones}
      allLights={lights}
      allScenes={scenes}
      lights={spaceLights}
      scenes={spaceScenes}
      readingsByDevice={readingsByDevice}
      activeSceneId={activeSceneId}
      selectedLightId={selectedLightId}
      error={error}
      hueEventRevision={hueEventRevision}
      onRoomZoneToggle={(g, on) => setRoomZoneState(g, on, null)}
      onRoomZoneBrightness={(g, pct, phase) =>
        setRoomZoneState(g, pct > 0, pct, phase)
      }
      onLightToggle={(light, on) => setLightState(light, on, null)}
      onLightBrightness={(light, pct, phase) =>
        setLightState(light, pct > 0, pct, phase)
      }
      onOpenGroup={(group) => toggleGroupInspector(group.id)}
      onSelectLight={(id) => toggleLightInspector(id)}
      onSceneApply={(scene) => {
        setSelectedSceneId(scene.id);
        void activateScene(scene, "apply");
      }}
      onSceneInspect={(scene) => toggleSceneInspector(scene.id)}
      onSceneTogglePlay={(scene) => void activateScene(scene, "dynamic")}
      onGallerySceneCreate={(preset) => createGalleryScene(roomZone, preset)}
      onGallerySceneApplyOnce={(preset) =>
        setGallerySceneOnce(roomZone, preset)
      }
      onGalleryScenePreview={(preset) => previewGalleryScene(roomZone, preset)}
      onGalleryScenePreviewEnd={() => endGalleryPreview()}
      onRefresh={loadAll}
    />
  );
};
