import type { HuePosition } from "@/types/hue";

/**
 * Shared placement helpers.
 *
 * Hue entertainment coordinates (all axes -1..1):
 * - x: left (-1) → right (+1), seen from the seat facing the screen
 * - y: front of the room / behind the viewer (-1) → screen wall (+1)
 * - z: floor (-1) → ceiling (+1)
 */

export const clampAxis = (value: number) =>
  Math.max(-1, Math.min(1, Math.round(value * 100) / 100));

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
