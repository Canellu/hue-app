import type { HostSyncDisplay } from "@/types/host-sync";
import type { HuePosition } from "@/types/hue";

/** Must match the capture engine's `TILE_FRACTION`. */
const TILE_FRACTION = 0.18;

export interface DisplayBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface DisplaySampleRegion {
  displayId: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const displayBounds = (
  displays: HostSyncDisplay[],
): DisplayBounds | null => {
  if (displays.length === 0) return null;
  const minX = Math.min(...displays.map((display) => display.x));
  const minY = Math.min(...displays.map((display) => display.y));
  const maxX = Math.max(
    ...displays.map((display) => display.x + display.width),
  );
  const maxY = Math.max(
    ...displays.map((display) => display.y + display.height),
  );
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  };
};

const contains = (display: HostSyncDisplay, x: number, y: number) =>
  x >= display.x &&
  x < display.x + display.width &&
  y >= display.y &&
  y < display.y + display.height;

const distanceToDisplay = (display: HostSyncDisplay, x: number, y: number) => {
  const centerX = display.x + display.width / 2;
  const centerY = display.y + display.height / 2;
  return (centerX - x) ** 2 + (centerY - y) ** 2;
};

export const nearestDisplay = (
  displays: HostSyncDisplay[],
  x: number,
  y: number,
) =>
  displays.reduce((nearest, display) =>
    distanceToDisplay(display, x, y) < distanceToDisplay(nearest, x, y)
      ? display
      : nearest,
  );

export const positionToDisplayPoint = (
  position: HuePosition,
  bounds: DisplayBounds,
) => ({
  x: bounds.minX + ((position.x + 1) / 2) * bounds.width,
  y: bounds.minY + ((1 - position.z) / 2) * bounds.height,
});

export const displayPointToPosition = (
  x: number,
  y: number,
  bounds: DisplayBounds,
) => ({
  x: Math.max(-1, Math.min(1, ((x - bounds.minX) / bounds.width) * 2 - 1)),
  z: Math.max(-1, Math.min(1, 1 - ((y - bounds.minY) / bounds.height) * 2)),
});

/** Mirrors `analysis::map_channels_to_tiles` for placement previews. */
export const sampleRegionForPosition = (
  position: HuePosition,
  displays: HostSyncDisplay[],
  bounds: DisplayBounds,
): DisplaySampleRegion => {
  const point = positionToDisplayPoint(position, bounds);
  const display =
    displays.find((candidate) => contains(candidate, point.x, point.y)) ??
    nearestDisplay(displays, point.x, point.y);
  const halfWidth = (bounds.width * TILE_FRACTION) / 2;
  const halfHeight = (bounds.height * TILE_FRACTION) / 2;
  const minWidth = Math.max(display.width * 0.05, 2);
  const minHeight = Math.max(display.height * 0.05, 2);

  let left = Math.max(point.x - halfWidth, display.x);
  let right = Math.min(point.x + halfWidth, display.x + display.width);
  if (right - left < minWidth) {
    if (left <= display.x) {
      right = Math.min(left + minWidth, display.x + display.width);
    } else {
      left = Math.max(right - minWidth, display.x);
    }
  }

  let top = Math.max(point.y - halfHeight, display.y);
  let bottom = Math.min(point.y + halfHeight, display.y + display.height);
  if (bottom - top < minHeight) {
    if (top <= display.y) {
      bottom = Math.min(top + minHeight, display.y + display.height);
    } else {
      top = Math.max(bottom - minHeight, display.y);
    }
  }

  return {
    displayId: display.id,
    left,
    top,
    right,
    bottom,
  };
};
