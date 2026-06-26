// Pins a tile to the light-theme palette (mirrors the `:root` tokens in App.css)
// so a *lit*, color-tinted card renders its child controls consistently
// regardless of the app's light/dark mode. Defining these custom properties on a
// card overrides the inherited `.dark` values for the whole subtree, including
// the Switch/Slider/Card child components. Only applied to active tiles (see
// `activeTileTheme`); inactive tiles intentionally inherit the app theme so they
// get a real light/dark variant.
export const LIGHT_THEME = {
  "--background": "oklch(0.99 0 0)",
  "--foreground": "oklch(0.145 0 0)",
  "--card": "oklch(1 0 0)",
  "--card-foreground": "oklch(0.145 0 0)",
  "--muted": "oklch(0.97 0 0)",
  "--muted-foreground": "oklch(0.556 0 0)",
  "--accent": "oklch(0.97 0 0)",
  "--accent-foreground": "oklch(0.205 0 0)",
  "--border": "oklch(0.922 0 0)",
  "--input": "oklch(0.922 0 0)",
  "--ring": "oklch(0.708 0 0)",
} as React.CSSProperties;

// Shared styling for a brightness slider sitting on a tinted tile (the Home
// room/zone tiles, the Lights cards, and the in-space Group controls). Keeps
// the thumb/track/fill identical across all three so they read as one control:
// a wide thumb, a translucent track that lets the card's color show through,
// and a white fill that fades from soft to bright across the filled portion.
export const TILE_BRIGHTNESS_SLIDER_CLASS =
  "tile-brightness-slider w-full [--paced-slider-thumb-size-override:var(--tile-slider-thumb-size,1.25rem)] [--paced-slider-track-size-override:var(--tile-slider-track-size,0.75rem)]";

export const TILE_POWER_SWITCH_CLASS =
  "data-unchecked:bg-foreground/10 dark:data-checked:bg-foreground/35 dark:data-unchecked:bg-foreground/10 dark:**:data-[slot=switch-thumb]:data-unchecked:bg-background";

export const SCENE_TILE_SURFACE_CLASS = "tile-surface-scene";

// Background + text color ease over the bridge fade (`--tile-ease`) so a lit
// tile re-tints in step with the bulb it mirrors.
export const TILE_INTERACTION_TRANSITION_CLASS =
  "ease-out [transition-property:background,color] [transition-duration:var(--tile-ease),var(--tile-ease)]";

// Hue's mobile cards are taller, so their bottom shade has more vertical room.
// Our wider desktop cards need brightness to darken faster and climb higher up
// the surface, otherwise a 1% card still reads almost full-bright.
const MIN_SHADE_ALPHA = 0.3;
const MAX_SHADE_ALPHA = 0.64;
const SHADE_CURVE_EXPONENT = 0.8;
const SHADE_MID_RATIO = 0.64;
const SHADE_MID_STOP_MIN = 38;
const SHADE_MID_STOP_MAX = 62;
const SHADE_CLEAR_STOP_MIN = 74;
const SHADE_CLEAR_STOP_MAX = 98;
const SHADE_STOP_CURVE_EXPONENT = 0.9;
const HIGHLIGHT_MIN_ALPHA = 0.005;
const HIGHLIGHT_MAX_ALPHA = 0.105;
const HIGHLIGHT_CURVE_EXPONENT = 1.15;
const HIGHLIGHT_PEAK_END = 16;
const HIGHLIGHT_FADE_END = 34;

/**
 * Layers a Hue-style lit-tile treatment over `background`: a top highlight plus
 * a brightness-driven dark gradient. The lower the brightness, the more the
 * dark layer climbs toward the top; even at 100% brightness the bottom still
 * stays slightly darker so the card never goes flat.
 */
function brightnessShade(background: string, brightness: number): string {
  const clampedBrightness = Math.min(100, Math.max(0, brightness));
  const intensity = 1 - clampedBrightness / 100;
  const weightedIntensity = Math.pow(intensity, SHADE_CURVE_EXPONENT);
  const shadeReach = Math.pow(intensity, SHADE_STOP_CURVE_EXPONENT);
  const brightnessLift = Math.pow(
    clampedBrightness / 100,
    HIGHLIGHT_CURVE_EXPONENT,
  );
  const alpha = +(
    MIN_SHADE_ALPHA +
    (MAX_SHADE_ALPHA - MIN_SHADE_ALPHA) * weightedIntensity
  ).toFixed(3);
  const midAlpha = +(alpha * SHADE_MID_RATIO).toFixed(3);
  const midStop = +(
    SHADE_MID_STOP_MIN +
    (SHADE_MID_STOP_MAX - SHADE_MID_STOP_MIN) * shadeReach
  ).toFixed(1);
  const clearStop = +(
    SHADE_CLEAR_STOP_MIN +
    (SHADE_CLEAR_STOP_MAX - SHADE_CLEAR_STOP_MIN) * shadeReach
  ).toFixed(3);
  const highlightAlpha = +(
    HIGHLIGHT_MIN_ALPHA +
    (HIGHLIGHT_MAX_ALPHA - HIGHLIGHT_MIN_ALPHA) * brightnessLift
  ).toFixed(3);
  const highlightMidAlpha = +(highlightAlpha * 0.7).toFixed(3);
  return `linear-gradient(to bottom, rgb(255 255 255 / calc(${highlightAlpha} * var(--tile-highlight-strength))) 0%, rgb(255 255 255 / calc(${highlightMidAlpha} * var(--tile-highlight-strength))) ${HIGHLIGHT_PEAK_END}%, rgb(255 255 255 / 0) ${HIGHLIGHT_FADE_END}%), linear-gradient(to top, rgb(0 0 0 / calc(${alpha} * var(--tile-shade-strength))) 0%, rgb(0 0 0 / calc(${midAlpha} * var(--tile-shade-mid-strength))) ${midStop}%, rgb(0 0 0 / 0) ${clearStop}%, rgb(0 0 0 / 0) 100%), ${background}`;
}

export const supportsContrastColor = (): boolean =>
  typeof CSS !== "undefined" &&
  CSS.supports?.("color", "contrast-color(red)") === true;

const parseSolidColor = (
  color: string,
): { r: number; g: number; b: number } | null => {
  const value = color.trim();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const expanded =
      hex.length === 3
        ? hex
            .split("")
            .map((part) => part + part)
            .join("")
        : hex;
    const int = Number.parseInt(expanded, 16);
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
  }

  const rgb = value.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i,
  );
  if (!rgb) return null;
  return {
    r: Math.min(255, Math.max(0, Number(rgb[1]))),
    g: Math.min(255, Math.max(0, Number(rgb[2]))),
    b: Math.min(255, Math.max(0, Number(rgb[3]))),
  };
};

const relativeLuminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrastForeground = (color: string): string => {
  const rgb = parseSolidColor(color);
  if (!rgb) return "oklch(0.145 0 0)";
  return relativeLuminance(rgb) > 0.45 ? "oklch(0.145 0 0)" : "oklch(0.985 0 0)";
};

/**
 * Inline style for an *active* (lit) tile. Paints the card with the light's live
 * color and derives a legible ink color from the dominant solid `tint`, so text
 * and icons flip to black or white depending on how light or dark the tint is.
 * The `background` may be a gradient (multi-color palettes), so contrast is
 * resolved against `tint` — the palette's dominant solid color.
 *
 * When `brightness` (0–100) is passed, a bottom-up dark gradient is layered over
 * the color so a dim tile looks dim — strongest at low brightness, easing to a
 * faint base shade (never fully gone) at 100%. Contrast is still resolved against
 * `tint` (the lit color), so the ink color stays stable as the tile dims.
 *
 * Builds on `LIGHT_THEME` so the Switch/Slider keep their colored-card styling,
 * then overrides the foreground tokens. Every card surface that reads text color
 * from a token picks this up automatically: `text-foreground` and `text-card-
 * foreground` (the Card's default), plus their `/80` etc. opacity variants.
 */
export function activeTileTheme(
  background: string,
  tint: string,
  brightness?: number,
): React.CSSProperties {
  const fallbackForeground = contrastForeground(tint);
  const foreground = supportsContrastColor()
    ? `contrast-color(var(--tile-tint))`
    : fallbackForeground;
  return {
    ...LIGHT_THEME,
    background:
      brightness == null ? background : brightnessShade(background, brightness),
    "--tile-tint": tint,
    "--tile-contrast-fallback": fallbackForeground,
    "--foreground": foreground,
    "--card-foreground": foreground,
    // A solid neutral edge that tracks the app theme: gray in light mode, a
    // dark step in dark mode (`--tile-border-lit` is left out of `LIGHT_THEME`
    // on purpose, so it inherits the real `:root`/`.dark` value rather than the
    // pinned-light one). Must stay solid — a translucent border lets the
    // saturated fill bleed through and reads as the fill's complement
    // (simultaneous contrast), so a whitish edge looks green over orange.
    "--tile-border": "var(--tile-border-lit)",
  } as React.CSSProperties;
}
