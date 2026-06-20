// Live-state coloring: derives renderable CSS palettes from the current state of
// lights, rooms/zones, and scene presets. Builds on the centralized converters
// in `color.ts` (CIE xy / mirek → hex) and the palette/gradient helpers there.

import { convertHueColorToCss, distinctHexes, paletteToCss } from "./color";
import type { HueLight, HueScene } from "@/types/hue";

/** Current display color of a single light as a hex string, or null if none. */
export const lightColorHex = (light: HueLight): string | null => {
  // Honor the bridge's reported mode so white/ct fixtures don't read as color.
  if (light.colorMode === "ct" && light.ct != null) {
    return convertHueColorToCss({ mirek: light.ct });
  }
  if (light.xy) {
    return convertHueColorToCss({ xy: light.xy, gamut: light.gamut });
  }
  if (light.ct != null) {
    return convertHueColorToCss({ mirek: light.ct });
  }
  return null;
};

/** Distinct preset hex palette for a scene, parsed from its action colors. */
export const sceneHexes = (scene: HueScene): string[] =>
  distinctHexes(
    scene.colors
      .map((color) =>
        convertHueColorToCss({ xy: color.xy, mirek: color.mirek }),
      )
      .filter((hex): hex is string => hex !== null),
  );

/** CSS background for a scene preview bubble (solid, gradient, or null). */
export const sceneBubbleCss = (scene: HueScene): string | null =>
  paletteToCss(sceneHexes(scene));

/**
 * The scene's overall brightness (0–100): the brightest of its per-light
 * actions, since that's what reads as the scene's intensity. Falls back to 100
 * when no action carries a brightness.
 */
export const sceneBrightness = (scene: HueScene): number => {
  const max = scene.actions.reduce(
    (acc, action) => Math.max(acc, action.brightness ?? 0),
    0,
  );
  return Math.round(max > 0 ? max : 100);
};

/**
 * Visual state for a Room/Zone tile, derived from the live color of its
 * currently-on lights.
 *
 * - `active: false`        → no lights on; render the muted inactive tile.
 * - `background` (single)  → all active lights share a color; solid tint.
 * - `background` (gradient)→ active lights differ; 135° gradient + glow.
 */
export interface SpaceTileColor {
  active: boolean;
  /** CSS background for the tile accent layer, or null when inactive. */
  background: string | null;
  /** Dominant glow color for the box-shadow underneath the card. */
  glow: string | null;
}

export const roomZoneTileColor = (lights: HueLight[]): SpaceTileColor => {
  const hexes = distinctHexes(
    lights
      .filter((light) => light.isOn)
      .map(lightColorHex)
      .filter((hex): hex is string => hex !== null),
  );

  if (hexes.length === 0) {
    return { active: false, background: null, glow: null };
  }

  return {
    active: true,
    background: paletteToCss(hexes),
    glow: hexes[0],
  };
};
