// Pins a tile to the light-theme palette (mirrors the `:root` tokens in App.css)
// so it renders identically in light and dark mode. Defining these custom
// properties on a card overrides the inherited `.dark` values for the whole
// subtree, including the Switch/Slider/Card child components. Shared by the Home
// room/zone tiles and the per-light cards on the Space screen so they match.
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
