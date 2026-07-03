import type { HostSyncDisplay } from "@/types/host-sync";
import type { HuePosition } from "@/types/hue";

/** Must match the capture engine's depth-dependent tile fractions. */
const SCREEN_TILE_FRACTION = 0.18;
const BACK_TILE_FRACTION = 0.72;

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

export interface RoomDisplayFrame {
  id: string;
  name: string;
  x: number;
  z: number;
  width: number;
  height: number;
}

export interface RoomFrameOptions {
  maxWidth: number;
  maxHeight: number;
  bottomZ: number;
}

/**
 * The screen wall's footprint in room coordinates: the rectangle the 3D room
 * draws the displays inside, and the window that positions project through
 * onto the screen. A light outside it samples the nearest screen edge.
 * Mirrored by the capture engine (`analysis.rs`) — keep the three in sync.
 */
export interface RoomFrame {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

/** Where the screen sits in the room, per configuration type. */
export const roomFrameOptionsFor = (
  configurationType: string | null,
): RoomFrameOptions => ({
  maxWidth: 1.1,
  maxHeight: 0.64,
  // A TV hangs at seated eye level; a desk monitor sits lower.
  bottomZ: configurationType === "screen" ? 0 : -0.14,
});

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

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** The combined display arrangement fitted into the room's screen frame. */
export const combinedRoomFrame = (
  bounds: DisplayBounds,
  { maxWidth, maxHeight, bottomZ }: RoomFrameOptions,
): RoomFrame => {
  const scale = Math.min(maxWidth / bounds.width, maxHeight / bounds.height);
  const width = bounds.width * scale;
  const height = bounds.height * scale;
  return {
    left: -width / 2,
    right: width / 2,
    bottom: bottomZ,
    top: bottomZ + height,
  };
};

/**
 * Projects a room position through the screen frame onto the displays.
 * Positions outside the frame clamp to the nearest screen edge, so a lamp
 * beside the monitor follows that edge of the picture.
 */
export const positionToDisplayPoint = (
  position: HuePosition,
  bounds: DisplayBounds,
  frame: RoomFrame,
) => ({
  x:
    bounds.minX +
    clamp01((position.x - frame.left) / (frame.right - frame.left)) *
      bounds.width,
  y:
    bounds.minY +
    clamp01((frame.top - position.z) / (frame.top - frame.bottom)) *
      bounds.height,
});

/** Inverse of `positionToDisplayPoint`; results land inside the frame. */
export const displayPointToPosition = (
  x: number,
  y: number,
  bounds: DisplayBounds,
  frame: RoomFrame,
) => ({
  x:
    frame.left +
    clamp01((x - bounds.minX) / bounds.width) * (frame.right - frame.left),
  z:
    frame.top -
    clamp01((y - bounds.minY) / bounds.height) * (frame.top - frame.bottom),
});

/**
 * Fits the selected Windows display arrangement into the room's screen frame.
 * Desktop Y grows downward; room Z grows upward.
 */
export const roomDisplayFrames = (
  displays: HostSyncDisplay[],
  { maxWidth, maxHeight, bottomZ }: RoomFrameOptions,
): RoomDisplayFrame[] => {
  const bounds = displayBounds(displays);
  if (!bounds) return [];

  const scale = Math.min(maxWidth / bounds.width, maxHeight / bounds.height);
  const centerX = bounds.minX + bounds.width / 2;

  return displays.map((display) => {
    const width = display.width * scale;
    const height = display.height * scale;
    return {
      id: display.id,
      name: display.name,
      x: (display.x + display.width / 2 - centerX) * scale,
      z:
        bottomZ +
        (bounds.maxY - display.y - display.height) * scale +
        height / 2,
      width,
      height,
    };
  });
};

/** Mirrors `analysis::map_channels_to_tiles` for placement previews. */
export const sampleRegionForPosition = (
  position: HuePosition,
  displays: HostSyncDisplay[],
  bounds: DisplayBounds,
  frame: RoomFrame,
): DisplaySampleRegion => {
  const point = positionToDisplayPoint(position, bounds, frame);
  const display =
    displays.find((candidate) => contains(candidate, point.x, point.y)) ??
    nearestDisplay(displays, point.x, point.y);
  const depth = Math.max(0, Math.min(1, (1 - position.y) / 2));
  const tileFraction =
    SCREEN_TILE_FRACTION + (BACK_TILE_FRACTION - SCREEN_TILE_FRACTION) * depth;
  const halfWidth = (bounds.width * tileFraction) / 2;
  const halfHeight = (bounds.height * tileFraction) / 2;
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
