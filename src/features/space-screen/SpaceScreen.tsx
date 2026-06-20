import { Radar, ToggleLeft } from "lucide-react";

import type {
  HueAccessoryService,
  HueLight,
  HueRoomZone,
  HueScene,
} from "@/types/hue";
import { isSceneDynamicActive } from "@/features/space-screen/utils/scene-status";
import type { HueGalleryScenePreset } from "./data/hueSceneGallery";
import { AccessorySection } from "./components/AccessorySection";
import { GroupControls } from "./components/GroupControls";
import { LightsSection } from "./components/LightsSection";
import { ScenesSection } from "./components/ScenesSection";

type ControlCommitPhase = "live" | "final";

interface SpaceScreenProps {
  roomZone: HueRoomZone;
  lights: HueLight[];
  scenes: HueScene[];
  /** Live accessory readings keyed by owning device id. */
  readingsByDevice: Map<string, HueAccessoryService[]>;
  activeSceneId: string | null;
  selectedLightId: string | null;
  error: string | null;
  hueEventRevision: number;
  onRoomZoneToggle: (roomZone: HueRoomZone, nextOn: boolean) => void;
  onRoomZoneBrightness: (
    roomZone: HueRoomZone,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
  onLightToggle: (light: HueLight, nextOn: boolean) => void;
  onLightBrightness: (
    light: HueLight,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
  onSelectLight: (id: string) => void;
  /** Tapping a scene card: apply its stored colors to the room's lights. */
  onSceneApply: (scene: HueScene) => void;
  /** Open the side pane on a scene without applying it (the card's triple-dot button). */
  onSceneInspect: (scene: HueScene) => void;
  /** The card's play/stop button: start or stop the dynamic palette. */
  onSceneTogglePlay: (scene: HueScene) => void;
  /** Transient speed change for the scene that is currently playing. */
  onDynamicSpeedLive: (scene: HueScene, step: number) => void;
  onGallerySceneCreate: (preset: HueGalleryScenePreset) => Promise<void>;
  /** Apply a gallery preset to the room's lights once, without saving a scene. */
  onGallerySceneApplyOnce: (preset: HueGalleryScenePreset) => void;
  /** Live-preview a gallery preset on the room's real lights (no save). */
  onGalleryScenePreview: (preset: HueGalleryScenePreset) => void;
  /** Revert the live preview when the gallery is dismissed without adding. */
  onGalleryScenePreviewEnd: () => void;
}

export const SpaceScreen: React.FC<SpaceScreenProps> = ({
  roomZone,
  lights,
  scenes,
  readingsByDevice,
  activeSceneId,
  selectedLightId,
  error,
  hueEventRevision,
  onRoomZoneToggle,
  onRoomZoneBrightness,
  onLightToggle,
  onLightBrightness,
  onSelectLight,
  onSceneApply,
  onSceneInspect,
  onSceneTogglePlay,
  onDynamicSpeedLive,
  onGallerySceneCreate,
  onGallerySceneApplyOnce,
  onGalleryScenePreview,
  onGalleryScenePreviewEnd,
}) => {
  const switches = roomZone.accessories.filter((a) => a.kind === "switch");
  const sensors = roomZone.accessories.filter((a) => a.kind === "sensor");

  // The dynamic scene currently animating in this space, if any. Its live speed
  // slider lives inside the group controls' expandable panel.
  const playingScene = scenes.find(isSceneDynamicActive) ?? null;

  const showScenes = scenes.length > 0 || lights.length > 0;

  return (
    <section className="mx-auto flex w-full min-w-0 flex-col gap-6">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {/* Keyed on the space so the expanded/collapsed state resets when the
          user enters or leaves a room/zone. */}
      <GroupControls
        key={roomZone.id}
        roomZone={roomZone}
        lights={lights}
        playingScene={playingScene}
        hueEventRevision={hueEventRevision}
        onToggle={onRoomZoneToggle}
        onBrightness={onRoomZoneBrightness}
        onDynamicSpeedLive={onDynamicSpeedLive}
      />
      {showScenes && (
        <ScenesSection
          roomZoneName={roomZone.name}
          scenes={scenes}
          activeSceneId={activeSceneId}
          onSceneApply={onSceneApply}
          onSceneInspect={onSceneInspect}
          onSceneTogglePlay={onSceneTogglePlay}
          onGallerySceneCreate={onGallerySceneCreate}
          onGallerySceneApplyOnce={onGallerySceneApplyOnce}
          onGalleryScenePreview={onGalleryScenePreview}
          onGalleryScenePreviewEnd={onGalleryScenePreviewEnd}
        />
      )}
      <LightsSection
        lights={lights}
        selectedLightId={selectedLightId}
        hueEventRevision={hueEventRevision}
        onSelectLight={onSelectLight}
        onLightToggle={onLightToggle}
        onLightBrightness={onLightBrightness}
      />
      <AccessorySection
        title="Switches"
        icon={ToggleLeft}
        accessories={switches}
        readingsByDevice={readingsByDevice}
      />
      <AccessorySection
        title="Sensors"
        icon={Radar}
        accessories={sensors}
        readingsByDevice={readingsByDevice}
      />
    </section>
  );
};
