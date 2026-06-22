// Single source of truth for the colors the temperature and color wheels paint.
// Both wheel components render from these, and `color-state.ts` reuses them so a
// light cards, scene swatches, and room/zone tile gradients show the *same*
// color the picker shows for that Hue state.

import {
  hsvToRgb,
  type Oklch,
  oklchToRgb,
  type Rgb,
  rgbToHsv,
  xyBriToRgb,
} from "./color";

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

// --- Temperature wheel ------------------------------------------------------
// A stylized OKLCH gradient (warm amber at the top → near-white → cool blue at
// the bottom). `y` is the normalized vertical position: 0 = warmest (ctMax),
// 1 = coolest (ctMin).

const temperatureStops: Array<[number, Oklch]> = [
  [0, { L: 0.76, C: 0.145, h: 68 }],
  [0.12, { L: 0.8, C: 0.145, h: 80 }],
  [0.26, { L: 0.88, C: 0.11, h: 88 }],
  [0.44, { L: 0.95, C: 0.06, h: 94 }],
  [0.62, { L: 0.98, C: 0.032, h: 98 }],
  [0.82, { L: 0.995, C: 0.006, h: 96 }],
  [0.92, { L: 0.98, C: 0.012, h: 204 }],
  [0.97, { L: 0.96, C: 0.026, h: 208 }],
  [1, { L: 0.94, C: 0.04, h: 208 }],
];

const mixOklch = (from: Oklch, to: Oklch, amount: number): Oklch => ({
  L: from.L + (to.L - from.L) * amount,
  C: from.C + (to.C - from.C) * amount,
  h: from.h + (to.h - from.h) * amount,
});

/** Wheel color for a normalized vertical position (0 = warm top, 1 = cool bottom). */
export const temperatureWheelColor = (y: number): Rgb => {
  let from = temperatureStops[0];
  let to = temperatureStops[temperatureStops.length - 1];

  for (let i = 1; i < temperatureStops.length; i++) {
    if (y <= temperatureStops[i][0]) {
      from = temperatureStops[i - 1];
      to = temperatureStops[i];
      break;
    }
  }

  const span = to[0] - from[0] || 1;
  const color = mixOklch(from[1], to[1], clamp01((y - from[0]) / span));
  return oklchToRgb(color.L, color.C, color.h);
};

/** Normalized wheel Y for a mirek value within a light's [min, max] ct range. */
export const tempWheelY = (value: number, min: number, max: number): number =>
  max === min ? 0.5 : clamp01((max - value) / (max - min));

/** The wheel's color (rgb) for a color-temperature mirek value. */
export const temperatureColorForCt = (
  value: number,
  min: number,
  max: number,
): Rgb => temperatureWheelColor(tempWheelY(value, min, max));

// --- Color (HSV) wheel ------------------------------------------------------
// A standard HSV wheel: hue is the angle (red at 12 o'clock, clockwise),
// saturation is the radius, value fixed at full. White at the center, vivid
// colors at the rim.

const DEG = 180 / Math.PI;
const normalizeHue = (hue: number): number => ((hue % 360) + 360) % 360;

/** Screen angle (radians, y-down) for an HSV hue. */
export const hueToScreenAngle = (hue: number): number =>
  (normalizeHue(hue) - 90) / DEG;

/** A pin position (0–1 within the disk) -> (hue°, saturation 0–1). */
export const pinToHueSaturation = (
  px: number,
  py: number,
): [number, number] => {
  const dx = px - 0.5;
  const dy = py - 0.5;
  const saturation = clamp01(Math.hypot(dx, dy) * 2);
  const hue = normalizeHue(Math.atan2(dy, dx) * DEG + 90);
  return [hue, saturation];
};

/** A light's CIE xy -> pin position (0–1 within the disk). */
export const xyToPin = (xy: [number, number]): { x: number; y: number } => {
  const { r, g, b } = xyBriToRgb(xy[0], xy[1], 1);
  const [hue, saturation] = rgbToHsv(r, g, b);
  const angle = hueToScreenAngle(hue);
  return {
    x: 0.5 + (Math.cos(angle) * saturation) / 2,
    y: 0.5 + (Math.sin(angle) * saturation) / 2,
  };
};

/**
 * The color wheel's color (rgb) for a light's CIE xy — the exact color its pin
 * shows when settled on that xy (full value HSV at the pin's hue/saturation).
 */
export const colorWheelColor = (xy: [number, number]): Rgb => {
  const pin = xyToPin(xy);
  const [hue, saturation] = pinToHueSaturation(pin.x, pin.y);
  return hsvToRgb(hue, saturation, 1);
};
