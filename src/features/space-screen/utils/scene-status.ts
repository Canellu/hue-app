import {
  HUE_SCENE_GALLERY_SECTIONS,
  type HueGalleryScenePreset,
} from "@/features/space-screen/data/hueSceneGallery";
import { distinctHexes } from "@/features/space-screen/utils/color";
import {
  sceneBrightness,
  sceneHexes,
} from "@/features/space-screen/utils/color-state";
import { hueDynamicSpeedValueToStep } from "@/lib/hue-speed";
import type { HueScene } from "@/types/hue";

export const normalizeSceneStatus = (
  status: string | null | undefined,
): string => status?.trim().toLowerCase().replace(/_/g, " ") ?? "";

/** A dynamic scene that is currently animating its palette in the space. */
export const isSceneDynamicActive = (scene: HueScene): boolean =>
  scene.dynamic && normalizeSceneStatus(scene.status) === "dynamic palette";

// Gallery presets keyed by their exact name. Gallery scenes are created on the
// bridge using the preset name verbatim, so the name is our handle back to the
// preset — the bridge stores no gallery identifier of its own. The key is the
// raw name (case- and whitespace-sensitive) because any name edit makes a scene
// custom (see `findGalleryPresetForScene`).
const galleryPresetByName = new Map<string, HueGalleryScenePreset>(
  HUE_SCENE_GALLERY_SECTIONS.flatMap((section) =>
    section.scenes.map((preset) => [preset.name, preset]),
  ),
);

/** Order-insensitive equality of two distinct-hex palettes. */
const palettesEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((hex, index) => hex === sortedB[index]);
};

/**
 * Match a saved bridge scene back to the gallery preset it was created from, or
 * `null` for a custom (user-authored) scene. The bridge keeps no gallery marker,
 * so a scene only counts as a gallery scene when it is an *exact* match of a
 * preset: same name (case-sensitive), brightness, palette, dynamic flag, and
 * (for dynamic presets) speed. Editing any of these makes it custom.
 *
 * Reading an edited gallery scene as custom is intentional: the UI uses this to
 * pick its wording, and erring toward the cautious "Delete" (rather than
 * implying a scene is re-addable from the gallery when its settings have
 * diverged) is the safer miss.
 */
export const findGalleryPresetForScene = (
  scene: HueScene,
): HueGalleryScenePreset | null => {
  const preset = galleryPresetByName.get(scene.name);
  if (!preset) return null;
  if (scene.dynamic !== preset.dynamic) return null;
  if (Math.round(sceneBrightness(scene)) !== preset.brightness) return null;
  if (
    preset.dynamic &&
    hueDynamicSpeedValueToStep(scene.speed) !==
      hueDynamicSpeedValueToStep(preset.speed)
  ) {
    return null;
  }
  const presetHexes = distinctHexes(preset.colors.map((color) => color.hex));
  return palettesEqual(sceneHexes(scene), presetHexes) ? preset : null;
};

/** A scene is "custom" when it doesn't match any built-in gallery preset. */
export const isCustomScene = (scene: HueScene): boolean =>
  findGalleryPresetForScene(scene) === null;
