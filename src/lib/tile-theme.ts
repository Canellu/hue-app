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
  "w-full **:data-[slot=slider-thumb]:size-5 **:data-[slot=slider-track]:bg-foreground/20 **:data-[slot=slider-range]:bg-transparent **:data-[slot=slider-range]:bg-linear-to-r **:data-[slot=slider-range]:from-white/35 **:data-[slot=slider-range]:to-white/75";

// Each tile runs two transitions on deliberately different clocks:
//   • background + text color ease over the bridge fade (`--tile-ease`) so a lit
//     tile re-tints in step with the bulb it mirrors.
//   • the hover lift (transform/translate/scale) is a fixed, snappy 150ms so the
//     tile springs up responsively under the cursor instead of crawling over the
//     much longer bridge window.
// These must share one `transition` declaration (two `transition-*` utilities on
// the same element would clobber each other's `transition-property`), so the
// per-property durations are spelled out inline.
export const TILE_INTERACTION_TRANSITION_CLASS =
  "ease-out [transition-property:background,color,transform,translate,scale] [transition-duration:var(--tile-ease),var(--tile-ease),150ms,150ms,150ms]";

export const TILE_HOVER_LIFT_CLASS =
  "hover:-translate-y-0.5 hover:scale-[1.01]";

// How dark the bottom of a tile gets. The shade is a dark gradient layered over
// the lit color, scaled by how far the tile is from full brightness. It ramps
// between a floor and a ceiling so a dim light reads as visibly darker while a
// full-brightness light keeps a faint base shade rather than going flat.
const MIN_SHADE_ALPHA = 0.12;
const MAX_SHADE_ALPHA = 0.4;

/**
 * Layers a bottom-up dark gradient over `background` proportional to how dim the
 * tile is. Even at 100% brightness a faint shade (`MIN_SHADE_ALPHA`) remains so
 * the tile keeps its grounded base; the lower the brightness the stronger the
 * dark band rising from the tile's base, up to `MAX_SHADE_ALPHA`. `background`
 * may be a solid color or a gradient — the shade is just an extra top layer, so
 * either composites correctly.
 */
function brightnessShade(background: string, brightness: number): string {
  const intensity = 1 - Math.min(100, Math.max(0, brightness)) / 100;
  const alpha = +(
    MIN_SHADE_ALPHA +
    (MAX_SHADE_ALPHA - MIN_SHADE_ALPHA) * intensity
  ).toFixed(3);
  return `linear-gradient(to top, rgba(0,0,0,${alpha}) 0%, rgba(0,0,0,0) 92%), ${background}`;
}

/**
 * Inline style for an *active* (lit) tile. Paints the card with the light's live
 * color and derives a legible ink color from it via CSS `contrast-color()`, so
 * text and icons flip to black or white depending on how light or dark the tint
 * is. The `background` may be a gradient (multi-color palettes), which
 * `contrast-color()` cannot evaluate, so contrast is resolved against `tint` —
 * the palette's dominant solid color.
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
  return {
    ...LIGHT_THEME,
    background:
      brightness == null ? background : brightnessShade(background, brightness),
    "--tile-tint": tint,
    "--foreground": "contrast-color(var(--tile-tint))",
    "--card-foreground": "contrast-color(var(--tile-tint))",
  } as React.CSSProperties;
}
