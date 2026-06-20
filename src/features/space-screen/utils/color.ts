// Color-space helpers for the inspector. The Hue bridge speaks CIE xy
// chromaticity and mired color temperature; the UI works in RGB/HSV. These are
// the standard Philips conversions plus a Kelvin approximation for gradients.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const gammaCorrect = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

const inverseGamma = (c: number): number =>
  c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;

/** A light's color gamut as its red, green, and blue CIE xy corner points. */
export type Gamut = [[number, number], [number, number], [number, number]];

type Point = [number, number];

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const cross = (a: Point, b: Point): number => a[0] * b[1] - a[1] * b[0];

/** Closest point to `p` on segment `a`→`b` (clamped to the segment ends). */
const closestOnSegment = (a: Point, b: Point, p: Point): Point => {
  const ab = sub(b, a);
  const len2 = ab[0] * ab[0] + ab[1] * ab[1];
  if (len2 === 0) return a;
  const ap = sub(p, a);
  const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1]) / len2));
  return [a[0] + ab[0] * t, a[1] + ab[1] * t];
};

const dist2 = (a: Point, p: Point): number => {
  const d = sub(a, p);
  return d[0] * d[0] + d[1] * d[1];
};

/** True when `p` lies inside (or on) the triangle r/g/b. */
const inTriangle = (p: Point, [r, g, b]: Gamut): boolean => {
  const v1 = sub(g, r);
  const v2 = sub(b, r);
  const q = sub(p, r);
  const denom = cross(v1, v2);
  if (denom === 0) return false;
  const s = cross(q, v2) / denom;
  const t = cross(v1, q) / denom;
  return s >= 0 && t >= 0 && s + t <= 1;
};

/**
 * Clamp a CIE xy coordinate into a light's color gamut triangle, snapping any
 * out-of-gamut point to the closest point on the triangle's edges. This is the
 * routine the Hue docs prescribe so we only ever send/show colors the bulb can
 * actually reproduce. Returns `xy` unchanged when no gamut is known or it's
 * already inside. See docs/HUE/color-conversion-formulas-rgb-to-xy-and-back.md.
 */
export const clampXyToGamut = (
  xy: [number, number],
  gamut?: Gamut | null,
): [number, number] => {
  if (!gamut) return xy;
  const [r, g, b] = gamut;
  if (inTriangle(xy, gamut)) return xy;

  const candidates: Point[] = [
    closestOnSegment(r, g, xy),
    closestOnSegment(g, b, xy),
    closestOnSegment(b, r, xy),
  ];
  let best = candidates[0];
  let bestDist = dist2(best, xy);
  for (let i = 1; i < candidates.length; i++) {
    const d = dist2(candidates[i], xy);
    if (d < bestDist) {
      best = candidates[i];
      bestDist = d;
    }
  }
  return best;
};

/** Convert a CIE xy coordinate (+ brightness 0–1) to a displayable sRGB color. */
export const xyBriToRgb = (x: number, y: number, bri = 1): Rgb => {
  if (y <= 0) return { r: 0, g: 0, b: 0 };
  const z = 1 - x - y;
  const Y = bri;
  const X = (Y / y) * x;
  const Z = (Y / y) * z;

  let r = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
  let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
  let b = X * 0.051713 - Y * 0.121364 + Z * 1.01153;

  // Bring any out-of-gamut component back into range by scaling all channels.
  const max = Math.max(r, g, b);
  if (max > 1) {
    r /= max;
    g /= max;
    b /= max;
  }

  r = Math.max(0, gammaCorrect(r));
  g = Math.max(0, gammaCorrect(g));
  b = Math.max(0, gammaCorrect(b));

  const peak = Math.max(r, g, b);
  if (peak > 1) {
    r /= peak;
    g /= peak;
    b /= peak;
  }

  return {
    r: Math.round(clamp01(r) * 255),
    g: Math.round(clamp01(g) * 255),
    b: Math.round(clamp01(b) * 255),
  };
};

/**
 * Convert an sRGB color to a CIE xy chromaticity coordinate for the bridge. When
 * a light's `gamut` is supplied the result is clamped into it, so we only ever
 * send a color the bulb can reproduce (and the on-screen pin matches what the
 * bulb actually shows instead of drifting after the bridge snaps it).
 */
export const rgbToXy = (
  r: number,
  g: number,
  b: number,
  gamut?: Gamut | null,
): [number, number] => {
  const red = inverseGamma(r / 255);
  const green = inverseGamma(g / 255);
  const blue = inverseGamma(b / 255);

  const X = red * 0.664511 + green * 0.154324 + blue * 0.162028;
  const Y = red * 0.283881 + green * 0.668433 + blue * 0.047685;
  const Z = red * 0.000088 + green * 0.07231 + blue * 0.986039;

  const sum = X + Y + Z;
  if (sum === 0) return [0.3127, 0.329]; // D65 white
  const [cx, cy] = clampXyToGamut([X / sum, Y / sum], gamut);
  return [round4(cx), round4(cy)];
};

/** HSV (h 0–360, s/v 0–1) to RGB (0–255). */
export const hsvToRgb = (h: number, s: number, v: number): Rgb => {
  const c = v * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r: number;
  let g: number;
  let b: number;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = v - c;
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
};

/** RGB (0–255) to HSV (h 0–360, s/v 0–1). */
export const rgbToHsv = (
  r: number,
  g: number,
  b: number,
): [number, number, number] => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
};

// --- OKLCH ⇄ sRGB -----------------------------------------------------------
// The shadcn theme is authored entirely in OKLCH, so the color wheel renders
// and the picker reasons in the same perceptual space. The bridge still speaks
// CIE xy, so a pick round-trips OKLCH → sRGB → xy.

/** An OKLCH color: L (0–1 lightness), C (chroma), h (hue in degrees). */
export interface Oklch {
  L: number;
  C: number;
  h: number;
}

interface LinearRgb {
  r: number;
  g: number;
  b: number;
}

const oklchToLinearRgb = (L: number, C: number, h: number): LinearRgb => {
  const hr = (h * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
};

const inSrgbGamut = ({ r, g, b }: LinearRgb): boolean =>
  r >= -1e-4 &&
  g >= -1e-4 &&
  b >= -1e-4 &&
  r <= 1.0001 &&
  g <= 1.0001 &&
  b <= 1.0001;

/**
 * OKLCH → displayable sRGB (0–255). When the requested chroma falls outside the
 * sRGB gamut the chroma is reduced (binary search) until it fits, preserving
 * hue and lightness — the standard OKLCH gamut-mapping approach.
 */
export const oklchToRgb = (L: number, C: number, h: number): Rgb => {
  let lin = oklchToLinearRgb(L, C, h);
  if (!inSrgbGamut(lin)) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (inSrgbGamut(oklchToLinearRgb(L, mid, h))) lo = mid;
      else hi = mid;
    }
    lin = oklchToLinearRgb(L, lo, h);
  }
  return {
    r: Math.round(clamp01(gammaCorrect(Math.max(0, lin.r))) * 255),
    g: Math.round(clamp01(gammaCorrect(Math.max(0, lin.g))) * 255),
    b: Math.round(clamp01(gammaCorrect(Math.max(0, lin.b))) * 255),
  };
};

/** sRGB (0–255) → OKLCH. */
export const rgbToOklch = (r: number, g: number, b: number): Oklch => {
  const lr = inverseGamma(r / 255);
  const lg = inverseGamma(g / 255);
  const lb = inverseGamma(b / 255);

  const l = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
  );
  const m = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
  );
  const s = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
  );

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const C = Math.sqrt(a * a + bb * bb);
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h };
};

/** OKLCH as a CSS `oklch()` string. */
export const oklchToCss = (L: number, C: number, h: number): string =>
  `oklch(${round4(L)} ${round4(C)} ${round4(h)})`;

/**
 * Convert a color temperature in mireds to its CIE 1931 xy chromaticity on the
 * Planckian (blackbody) locus, using the Kim et al. cubic-spline approximation
 * (valid ~1667K–25000K, which covers every Hue bulb's 153–500 mirek range).
 *
 * This is the principled inverse of the bridge's own ct→xy mapping: a color
 * temperature *is* a point on the blackbody curve, so we recover that point and
 * then feed it through the same gamut-corrected `xyBriToRgb` pipeline used for
 * real colors, rather than approximating sRGB directly. See
 * docs/HUE/color-conversion-formulas-rgb-to-xy-and-back.md.
 */
export const mirekToXy = (mireds: number): [number, number] => {
  const t = 1_000_000 / mireds; // kelvin
  const x =
    t <= 4000
      ? -0.2661239e9 / t ** 3 - 0.2343589e6 / t ** 2 + 0.8776956e3 / t + 0.17991
      : -3.0258469e9 / t ** 3 +
        2.1070379e6 / t ** 2 +
        0.2226347e3 / t +
        0.24039;
  const y =
    t <= 2222
      ? -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683
      : t <= 4000
        ? -0.9549476 * x ** 3 -
          1.37418593 * x ** 2 +
          2.09137015 * x -
          0.16748867
        : 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;
  return [x, y];
};

/** CIE xy of the D65 reference white — the neutral point whites adapt toward. */
const D65: [number, number] = [0.3127, 0.329];

/**
 * How far a color-temperature white is pulled toward D65 in chromaticity space
 * (0 = the raw blackbody point, 1 = neutral white). A tunable-white bulb reads
 * as a soft *tinted white* rather than a saturated amber because the eye
 * chromatically adapts to it; blending toward the neutral point is a simple
 * von-Kries-style model of that adaptation. Doing it in xy (not sRGB) keeps the
 * hue stable — mixing toward white in sRGB drags warm tones toward pink/salmon.
 * Tuned so "Read" (~346 mirek) lands on a clean cream (~#FFE9C1).
 */
const WHITE_ADAPTATION = 0.5;

/** Blend a chromaticity toward D65 to model perceived white adaptation. */
const adaptWhiteXy = ([x, y]: [number, number]): [number, number] => [
  x + (D65[0] - x) * WHITE_ADAPTATION,
  y + (D65[1] - y) * WHITE_ADAPTATION,
];

export const rgbToCss = ({ r, g, b }: Rgb): string => `rgb(${r}, ${g}, ${b})`;

const toHexByte = (n: number): string =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, "0");

/** sRGB (0–255) to a `#rrggbb` hex string. */
export const rgbToHex = ({ r, g, b }: Rgb): string =>
  `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;

/** A Hue color expressed as either CIE xy or a color-temperature mirek value. */
export interface HueColor {
  xy?: [number, number] | null;
  /** Color temperature in mireds. */
  mirek?: number | null;
  /** Optional brightness 0–1 used only for xy → sRGB luminance. */
  brightness?: number;
  /** The light's gamut; when present, xy is clamped into it before display. */
  gamut?: Gamut | null;
}

/**
 * Centralized translation from a bridge color (CIE xy or mirek) to a
 * browser-renderable hex string. xy is clamped into the light's gamut (when
 * known) then converted via the standard Philips matrix. mirek is resolved to
 * its blackbody xy (`mirekToXy`), nudged toward neutral white (`adaptWhiteXy`)
 * to model how a tunable-white bulb is actually perceived, then run through the
 * same xy pipeline — so warm-white scenes read as soft creams instead of
 * saturated amber. Returns `null` when no color is present.
 */
export const convertHueColorToCss = (color: HueColor): string | null => {
  if (color.xy) {
    const [x, y] = clampXyToGamut(color.xy, color.gamut);
    return rgbToHex(xyBriToRgb(x, y, color.brightness ?? 1));
  }
  if (color.mirek != null) {
    const [x, y] = adaptWhiteXy(mirekToXy(color.mirek));
    return rgbToHex(xyBriToRgb(x, y));
  }
  return null;
};

/**
 * Maps a palette of hex colors to a CSS background. Empty → null; a single
 * color → that solid color; multiple → a 135° linear gradient across them.
 */
export const paletteToCss = (hexes: string[]): string | null => {
  if (hexes.length === 0) return null;
  if (hexes.length === 1) return hexes[0];
  return `linear-gradient(135deg, ${hexes.join(", ")})`;
};

/** De-duplicates hex colors, preserving first-seen order (case-insensitive). */
export const distinctHexes = (hexes: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const hex of hexes) {
    const key = hex.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(hex);
    }
  }
  return result;
};

export const miredToKelvin = (mireds: number): number =>
  Math.round(1_000_000 / mireds / 50) * 50;

const clamp01 = (c: number): number => Math.max(0, Math.min(1, c));
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
