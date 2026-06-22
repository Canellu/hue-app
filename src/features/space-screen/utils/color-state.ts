// Live-state coloring: derives renderable CSS palettes from the current state of
// lights, rooms/zones, and scene presets. Builds on the centralized converters
// in `color.ts` (CIE xy / mirek → hex) and the palette/gradient helpers there.

import {
  distinctHexes,
  paletteToCss,
  rgbToHex,
} from "./color";
import { colorWheelColor, temperatureColorForCt } from "./wheel-color";
import type { HueLight, HueScene } from "@/types/hue";

// Default mirek range when a fixture doesn't report its own ct bounds, matching
// the TemperatureWheel's fallback (153 mirek ≈ 6500K … 500 mirek ≈ 2000K).
const DEFAULT_CT_MIN = 153;
const DEFAULT_CT_MAX = 500;

const ctWheelHex = (light: HueLight, ct: number): string =>
  rgbToHex(
    temperatureColorForCt(
      ct,
      light.ctMin ?? DEFAULT_CT_MIN,
      light.ctMax ?? DEFAULT_CT_MAX,
    ),
  );

/**
 * UI display color for a Hue color. This intentionally mirrors the picker
 * wheels: xy colors use the HSV wheel projection, and mirek whites use the
 * stylized temperature wheel instead of the physically adapted white converter.
 */
export const hueDisplayColorHex = (color: {
  xy?: [number, number] | null;
  mirek?: number | null;
  ctMin?: number | null;
  ctMax?: number | null;
}): string | null => {
  if (color.xy) return rgbToHex(colorWheelColor(color.xy));
  if (color.mirek != null) {
    return rgbToHex(
      temperatureColorForCt(
        color.mirek,
        color.ctMin ?? DEFAULT_CT_MIN,
        color.ctMax ?? DEFAULT_CT_MAX,
      ),
    );
  }
  return null;
};

// --- Vivid-pick overrides ---------------------------------------------------
// A color the user picks on the wheel is gamut-clamped before being sent to the
// bridge (the bulb can't reproduce every sRGB color), so `colorWheelColor` reads
// a duller, reachable color back out of `light.xy` than the wheel's thumb shows.
// To keep cards, tiles, and the side-pane icon showing the *same* vivid color as
// the thumb, the color wheel records its pre-clamp color here on each commit,
// keyed by light id. The override stays valid only while the light still holds
// the (clamped) xy we sent — an external change, a scene, or a switch to
// color-temperature mode lets `colorWheelColor(light.xy)` take over again.
interface PickedColor {
  /** The gamut-clamped xy we actually sent the bridge for this pick. */
  clampedXy: [number, number];
  /** The vivid color the wheel's thumb showed, as a hex string. */
  hex: string;
}

const pickedColors = new Map<string, PickedColor>();

// Loose enough to absorb the bridge echoing its own rounding of the xy we sent,
// tight enough that a genuinely different pick (hues sit >0.01 apart) misses.
const PICKED_XY_TOLERANCE = 0.004;

const sameXy = (
  a: [number, number],
  b: [number, number],
): boolean =>
  Math.abs(a[0] - b[0]) < PICKED_XY_TOLERANCE &&
  Math.abs(a[1] - b[1]) < PICKED_XY_TOLERANCE;

/**
 * Records the vivid color the color wheel painted for a pick, alongside the
 * gamut-clamped xy that was sent to the bridge, so the rest of the UI can show
 * the same color the thumb shows rather than the duller reachable readback.
 */
export const recordPickedColor = (
  lightId: string,
  clampedXy: [number, number],
  hex: string,
): void => {
  pickedColors.set(lightId, { clampedXy, hex });
};

/** The recorded vivid pick for a light, or null once it's gone stale. */
const pickedColorHex = (light: HueLight): string | null => {
  const entry = pickedColors.get(light.id);
  if (!entry) return null;
  if (
    light.colorMode === "ct" ||
    !light.xy ||
    !sameXy(light.xy, entry.clampedXy)
  ) {
    pickedColors.delete(light.id);
    return null;
  }
  return entry.hex;
};

/**
 * Current display color of a single light as a hex string, or null if none.
 * Mirrors the picker wheels exactly: a ct/white light gets the temperature
 * wheel's color for its mirek, a color light gets the HSV wheel's color for its
 * xy — and a freshly-picked color reuses the wheel's vivid pre-clamp color so
 * cards and tile gradients match the thumb instead of the duller readback.
 */
export const lightColorHex = (light: HueLight): string | null => {
  // Honor the bridge's reported mode so white/ct fixtures don't read as color.
  if (light.colorMode === "ct" && light.ct != null) {
    return ctWheelHex(light, light.ct);
  }
  if (light.xy) {
    return pickedColorHex(light) ?? rgbToHex(colorWheelColor(light.xy));
  }
  if (light.ct != null) {
    return ctWheelHex(light, light.ct);
  }
  return null;
};

/** Distinct preset hex palette for a scene, parsed from its action colors. */
export const sceneHexes = (scene: HueScene): string[] =>
  distinctHexes(
    scene.colors
      .map((color) => hueDisplayColorHex({ xy: color.xy, mirek: color.mirek }))
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
