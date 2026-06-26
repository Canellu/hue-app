import type { CSSProperties } from "react";
import type { WidgetStylePreset, WidgetThemeMode } from "./types";

interface WidgetPresetDefinition {
  radius: number;
  tint: string;
  foreground: string;
  tintStrength: number;
  cardBackground: string;
  cardBorder: string;
  cardShadow: string;
  borderMix: number;
  spacing: string;
  cardRadius: string;
  controlHeight: string;
}

export const WIDGET_PRESET_LABELS: Record<WidgetStylePreset, string> = {
  windows11: "Windows 11",
  macos: "macOS",
  borderless: "Borderless",
};

export const WIDGET_PRESETS: Record<WidgetStylePreset, WidgetPresetDefinition> =
  {
    windows11: {
      radius: 18,
      tint: "#1e1e28",
      foreground: "oklch(0.985 0 0)",
      tintStrength: 35,
      cardBackground: "rgb(35 43 48 / 82%)",
      cardBorder: "rgb(255 255 255 / 18%)",
      cardShadow: "0 12px 32px rgb(0 0 0 / 22%)",
      borderMix: 16,
      spacing: "0.75rem",
      cardRadius: "0.875rem",
      controlHeight: "2.625rem",
    },
    macos: {
      radius: 22,
      tint: "#20232a",
      foreground: "oklch(0.985 0 0)",
      tintStrength: 38,
      cardBackground: "rgb(32 35 42 / 84%)",
      cardBorder: "rgb(255 255 255 / 14%)",
      cardShadow: "0 16px 38px rgb(0 0 0 / 28%)",
      borderMix: 13,
      spacing: "0.875rem",
      cardRadius: "1.125rem",
      controlHeight: "2.875rem",
    },
    borderless: {
      radius: 10,
      tint: "#101113",
      foreground: "oklch(0.985 0 0)",
      tintStrength: 24,
      cardBackground: "rgb(12 14 16 / 88%)",
      cardBorder: "rgb(255 255 255 / 10%)",
      cardShadow: "none",
      borderMix: 9,
      spacing: "0.5rem",
      cardRadius: "0.375rem",
      controlHeight: "2.25rem",
    },
  };

export const widgetCornerRadius = (preset: WidgetStylePreset): number =>
  WIDGET_PRESETS[preset].radius;

/** RGBA bytes for the native Acrylic tint. */
export const acrylicColorBytes = (
  preset: WidgetStylePreset,
): [number, number, number, number] => {
  const definition = WIDGET_PRESETS[preset];
  const int = parseInt(definition.tint.slice(1), 16);
  const alpha = Math.round((definition.tintStrength / 100) * 255);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255, alpha];
};

export const resolveWidgetTheme = (
  themeMode: WidgetThemeMode,
  systemDark: boolean,
): "light" | "dark" => {
  if (themeMode === "system") return systemDark ? "dark" : "light";
  return themeMode;
};

const themedDefinition = (
  preset: WidgetStylePreset,
  theme: "light" | "dark",
): WidgetPresetDefinition => {
  const definition = WIDGET_PRESETS[preset];
  if (theme === "dark") return definition;

  return {
    ...definition,
    tint: "#f6f7f2",
    foreground: "oklch(0.22 0.02 240)",
    tintStrength: preset === "borderless" ? 78 : 62,
    cardBackground:
      preset === "borderless"
        ? "rgb(255 255 255 / 88%)"
        : "rgb(255 255 255 / 76%)",
    cardBorder: "rgb(10 20 30 / 12%)",
    cardShadow:
      preset === "borderless" ? "none" : "0 14px 32px rgb(20 30 40 / 16%)",
    borderMix: 18,
  };
};

/**
 * Inline styles for the live widget shell. The visible blur is painted by the
 * native compositor, so the CSS background stays transparent.
 */
export const widgetShellStyle = (
  preset: WidgetStylePreset,
  theme: "light" | "dark" = "dark",
): CSSProperties => {
  const definition = themedDefinition(preset, theme);
  return {
    borderRadius: definition.radius,
    backgroundColor: `color-mix(in srgb, ${definition.tint} ${definition.tintStrength}%, transparent)`,
    "--widget-tint": definition.tint,
    "--foreground": definition.foreground,
    "--card-foreground": definition.foreground,
    "--card": definition.cardBackground,
    "--widget-card-bg": definition.cardBackground,
    "--widget-card-border": definition.cardBorder,
    "--widget-card-shadow": definition.cardShadow,
    "--muted-foreground": `color-mix(in srgb, ${definition.foreground} 65%, transparent)`,
    "--border": `color-mix(in srgb, ${definition.foreground} ${definition.borderMix}%, transparent)`,
    "--widget-spacing": definition.spacing,
    "--widget-card-radius": definition.cardRadius,
    "--widget-control-height": definition.controlHeight,
  } as CSSProperties;
};

/** Shell style while a config/onboarding panel is open: the plain app surface so
 * its controls always read against the application's default background. */
export const widgetSettingsShellStyle = (
  preset: WidgetStylePreset,
): CSSProperties => ({
  borderRadius: widgetCornerRadius(preset),
  backgroundColor: "var(--background)",
});
