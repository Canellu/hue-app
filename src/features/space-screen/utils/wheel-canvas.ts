// Shared canvas painters for the color and temperature wheels. The single-light
// pickers (ColorWheel/TemperatureWheel) and their multi-thumb group counterparts
// (MultiColorWheel/MultiTemperatureWheel) all paint the same disk, so the pixel
// loop lives here once. Colors come from `wheel-color.ts`, so every wheel matches
// the live colors light cards and tile gradients show.

import { hsvToRgb } from "./color";
import { pinToHueSaturation, temperatureWheelColor } from "./wheel-color";

export const WHEEL_CANVAS_SIZE = 360;
const RADIUS = WHEEL_CANVAS_SIZE / 2;

/** Paints the HSV hue/saturation disk: hue from angle, saturation from radius. */
export const paintColorWheel = (ctx: CanvasRenderingContext2D): void => {
  const image = ctx.createImageData(WHEEL_CANVAS_SIZE, WHEEL_CANVAS_SIZE);
  const data = image.data;
  for (let y = 0; y < WHEEL_CANVAS_SIZE; y++) {
    for (let x = 0; x < WHEEL_CANVAS_SIZE; x++) {
      const dx = x - RADIUS;
      const dy = y - RADIUS;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * WHEEL_CANVAS_SIZE + x) * 4;
      if (dist > RADIUS) {
        data[idx + 3] = 0;
        continue;
      }
      const [hue, saturation] = pinToHueSaturation(
        x / WHEEL_CANVAS_SIZE,
        y / WHEEL_CANVAS_SIZE,
      );
      const { r, g, b } = hsvToRgb(hue, saturation, 1);
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      // Soft 1px antialiased edge.
      data[idx + 3] =
        dist > RADIUS - 1 ? Math.round((RADIUS - dist) * 255) : 255;
    }
  }
  ctx.putImageData(image, 0, 0);
};

/** Paints the white-temperature disk: warm at the top, cool at the bottom. */
export const paintTemperatureWheel = (ctx: CanvasRenderingContext2D): void => {
  const image = ctx.createImageData(WHEEL_CANVAS_SIZE, WHEEL_CANVAS_SIZE);
  const data = image.data;
  for (let y = 0; y < WHEEL_CANVAS_SIZE; y++) {
    for (let x = 0; x < WHEEL_CANVAS_SIZE; x++) {
      const dx = x - RADIUS;
      const dy = y - RADIUS;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * WHEEL_CANVAS_SIZE + x) * 4;
      if (dist > RADIUS) {
        data[idx + 3] = 0;
        continue;
      }
      const { r, g, b } = temperatureWheelColor(y / (WHEEL_CANVAS_SIZE - 1));
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] =
        dist > RADIUS - 1 ? Math.round((RADIUS - dist) * 255) : 255;
    }
  }
  ctx.putImageData(image, 0, 0);
};
