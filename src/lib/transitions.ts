// Single source of truth for transition timings. These same numbers are sent to
// the bridge as the v2 `dynamics.duration` (how long the bulb fades) AND drive
// the CSS easing of the matching on-screen surface, so what you see eases over
// the same window the light actually takes. See docs/HUE/watch-that-transition-time.md.

/** Brightness fade time, shared by the live drag frames and the final commit. */
const BRIGHTNESS_MS = 700;

/** Durations (ms) sent to the bridge as the fade time for each kind of write. */
export const TRANSITION_MS = {
  /** Whole-room/zone (grouped_light) power toggle. */
  groupToggle: 1000,
  /** Single light turning on — a gentle ramp up. */
  lightToggleOn: 500,
  /** Single light turning off — a slightly longer, softer fade. */
  lightToggleOff: 1000,
  /** Brightness changes (final commit on release). */
  brightness: BRIGHTNESS_MS,
  /** Color (xy / ct / effect) changes. */
  color: 700,
  /** Scene recall. */
  scene: 1000,
  /**
   * Live slider frames mid-drag and track clicks. Fades over the same window as
   * the final commit so the bulb eases to each value instead of snapping — the
   * on-screen thumb still tracks the pointer instantly (PacedSlider local state).
   */
  liveSlider: BRIGHTNESS_MS,
} as const;

/**
 * CSS easing durations (ms) for the on-screen surfaces, chosen to mirror the
 * bridge write that drives each one so the visual change finishes alongside the
 * bulb's fade rather than snapping early.
 */
export const UI_EASE_MS = {
  /** Brightness slider fill/thumb easing to a programmatic value. */
  sliderFill: TRANSITION_MS.brightness,
  /** Room/zone tile background + glow. */
  tileBackground: TRANSITION_MS.color,
  /** Per-light swatch color. */
  swatch: TRANSITION_MS.color,
} as const;
