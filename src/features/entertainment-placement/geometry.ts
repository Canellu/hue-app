import type { HuePosition } from "@/types/hue";

/**
 * Shared math for the entertainment placement room.
 *
 * Hue entertainment coordinates (all axes -1..1):
 * - x: left (-1) → right (+1), seen from the seat facing the screen
 * - y: front of the room / behind the viewer (-1) → screen wall (+1)
 * - z: floor (-1) → ceiling (+1)
 *
 * Two views project onto a normalized (u, v) canvas space in [0, 1]:
 * - "flat": front elevation facing the screen wall — u ← x, v ← z.
 * - "room": one-point perspective looking into the room toward the screen
 *   wall, so depth (y) becomes visible. The camera sits slightly above
 *   screen center behind the front wall, and can orbit the room: yaw spins
 *   the scene around the vertical axis, while tilt pitches it up or down.
 */

export type RoomView = "flat" | "room";

export interface RoomCamera {
  /** Rotation around the vertical axis, radians; 0 faces the screen wall. */
  yaw: number;
  /** Vertical pitch in radians; positive values look down into the room. */
  tilt: number;
}

/** Canvas aspect the projections are tuned for (keep container in sync). */
export const CANVAS_ASPECT = "aspect-[16/10]";

const FLAT_X = 0.42;
const FLAT_Z = 0.38;

/** Distance from the camera to the front wall, in room units. */
const NEAR = 1.4;
/** Radius of the camera's vertical orbit around the room center. */
const ORBIT_RADIUS = NEAR + 1;
/** Extra focal length at the overhead angle, keeping the floor in frame. */
const OVERHEAD_ZOOM = 1.8;
const ROOM_X = 0.46;
const ROOM_Z = 0.36;
/** Fixed camera height: slightly above screen center so the floor shows. */
const CAM_Z = 0.35;
const ROOM_VC = 0.46;

export const DEFAULT_CAMERA: RoomCamera = { yaw: 0, tilt: 0 };
/** Orbit limits: past side-on either way, and slightly upward to a plan view. */
export const CAMERA_YAW_LIMIT = 2;
export const CAMERA_TILT_RANGE: [number, number] = [-0.2, Math.PI / 2];

const cameraFocalLength = (tilt: number) =>
  NEAR + OVERHEAD_ZOOM * Math.max(0, Math.sin(tilt));

/** Perspective scale after orbiting the camera vertically around the room. */
export const roomScale = (
  y: number,
  z = 0,
  camera: RoomCamera = DEFAULT_CAMERA,
) =>
  cameraFocalLength(camera.tilt) /
  (ORBIT_RADIUS +
    y * Math.cos(camera.tilt) +
    (CAM_Z - z) * Math.sin(camera.tilt));

/** Spins a point around the room's vertical axis. */
export const rotateXY = (x: number, y: number, yaw: number) => {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
};

export interface CanvasPoint {
  u: number;
  v: number;
  /** Perspective scale at the point's depth (1 in the flat view). */
  s: number;
}

export const projectPoint = (
  view: RoomView,
  x: number,
  y: number,
  z: number,
  camera: RoomCamera = DEFAULT_CAMERA,
): CanvasPoint => {
  if (view === "flat") {
    return { u: 0.5 + x * FLAT_X, v: 0.5 - z * FLAT_Z, s: 1 };
  }
  const rotated = rotateXY(x, y, camera.yaw);
  const s = roomScale(rotated.y, z, camera);
  const tiltCos = Math.cos(camera.tilt);
  const tiltSin = Math.sin(camera.tilt);
  return {
    u: 0.5 + rotated.x * ROOM_X * s,
    v: ROOM_VC + ((CAM_Z - z) * tiltCos - rotated.y * tiltSin) * ROOM_Z * s,
    s,
  };
};

export const clampAxis = (value: number) =>
  Math.max(-1, Math.min(1, Math.round(value * 100) / 100));

/** Flat-view drag: canvas point → x (left/right) and z (height). */
export const flatPointToPosition = (u: number, v: number) => ({
  x: clampAxis((u - 0.5) / FLAT_X),
  z: clampAxis((0.5 - v) / FLAT_Z),
});

/**
 * Room-view drag: canvas point → x/y on the floor plane. The pointer is
 * treated as the light's floor marker (z = -1), which keeps depth dragging
 * unambiguous regardless of the light's height.
 */
export const roomFloorPointToPosition = (
  u: number,
  v: number,
  camera: RoomCamera = DEFAULT_CAMERA,
) => {
  const tiltCos = Math.cos(camera.tilt);
  const tiltSin = Math.sin(camera.tilt);
  const focalLength = cameraFocalLength(camera.tilt);
  const floorHeight = CAM_Z + 1;
  const q = (v - ROOM_VC) / ROOM_Z;
  const numerator =
    focalLength * floorHeight * tiltCos -
    q * (ORBIT_RADIUS + floorHeight * tiltSin);
  const denominator = q * tiltCos + focalLength * tiltSin;
  const solvedY =
    Math.abs(denominator) < 0.001
      ? Math.sign(numerator || 1) * 1.5
      : numerator / denominator;
  // Rotated room corners sit up to √2 deep, so allow the camera-space point
  // past ±1 and clamp only the real room coordinates after unrotating.
  const rotatedY = Math.min(1.5, Math.max(-1.5, solvedY));
  const s = roomScale(rotatedY, -1, camera);
  const rotatedX = (u - 0.5) / (ROOM_X * s);
  const { x, y } = rotateXY(rotatedX, rotatedY, -camera.yaw);
  return { x: clampAxis(x), y: clampAxis(y) };
};

/** Distinct, vivid colors for the position check — one per light. */
export const TEST_COLORS: { hex: string; rgb: [number, number, number] }[] = [
  { hex: "#ff3b30", rgb: [255, 59, 48] }, // red
  { hex: "#34c759", rgb: [52, 199, 89] }, // green
  { hex: "#0a84ff", rgb: [10, 132, 255] }, // blue
  { hex: "#ffcc00", rgb: [255, 204, 0] }, // yellow
  { hex: "#ff2d92", rgb: [255, 45, 146] }, // pink
  { hex: "#00c7be", rgb: [0, 199, 190] }, // teal
  { hex: "#ff9500", rgb: [255, 149, 0] }, // orange
  { hex: "#af52de", rgb: [175, 82, 222] }, // purple
];

export const testColor = (index: number) =>
  TEST_COLORS[index % TEST_COLORS.length];

type ConfigurationType = "screen" | "monitor" | "music" | "3dspace" | "other";

/** Around-the-screen slots, most useful positions first. */
const SCREEN_SLOTS: HuePosition[] = [
  { x: -0.85, y: 0.8, z: 0 },
  { x: 0.85, y: 0.8, z: 0 },
  { x: -0.7, y: -0.8, z: 0.4 },
  { x: 0.7, y: -0.8, z: 0.4 },
  { x: 0, y: 0.9, z: 0.6 },
  { x: 0, y: -0.9, z: 0.4 },
  { x: -1, y: 0, z: 0 },
  { x: 1, y: 0, z: 0 },
];

const MUSIC_SLOTS: HuePosition[] = [
  { x: -0.85, y: 0.8, z: 0 },
  { x: 0.85, y: 0.8, z: 0 },
  { x: -0.85, y: -0.8, z: 0 },
  { x: 0.85, y: -0.8, z: 0 },
  { x: 0, y: 0.9, z: 0.5 },
  { x: 0, y: -0.9, z: 0.5 },
  { x: -1, y: 0, z: 0 },
  { x: 1, y: 0, z: 0 },
];

const ring = (count: number, radius: number, z: (index: number) => number) =>
  Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return {
      x: clampAxis(Math.sin(angle) * radius),
      y: clampAxis(Math.cos(angle) * radius),
      z: z(index),
    };
  });

/** Sensible starting positions for `count` lights, per configuration type. */
export const autoArrangePositions = (
  type: ConfigurationType | string | null,
  count: number,
): HuePosition[] => {
  const slots =
    type === "music"
      ? MUSIC_SLOTS
      : type === "screen" || type === "monitor"
        ? SCREEN_SLOTS
        : null;
  if (slots) {
    if (count <= slots.length) return slots.slice(0, count);
    return [...slots, ...ring(count - slots.length, 0.6, () => -0.4)];
  }
  if (type === "3dspace") {
    return ring(count, 0.85, (index) => (index % 2 === 0 ? -0.5 : 0.5));
  }
  return ring(count, 0.8, () => 0);
};
