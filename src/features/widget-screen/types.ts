// Shapes for the per-widget "controls" config. These mirror the camelCase
// payloads the Rust `widget` commands serialize (`StoredWidgetControl` et al.),
// so the two stores agree on the wire format.

export type ControlTargetKind = "room" | "zone" | "light";

/** The Hue resource a control controls. */
export interface ControlTarget {
  kind: ControlTargetKind;
  /** v2 resource UUID. */
  id: string;
}

export type ControlHotkeyAction = "toggle" | "scene";

/** An optional global hotkey bound to a control (wired in a later phase). */
export interface ControlHotkey {
  /** Tauri global-control accelerator, e.g. "CommandOrControl+Alt+1". */
  accelerator: string;
  action: ControlHotkeyAction;
  /** Scene to recall when `action` is "scene". */
  sceneId?: string | null;
}

/** One configured control on a widget. */
export interface WidgetControl {
  id: string;
  target: ControlTarget;
  /** Custom name; the card falls back to the resource's own name when absent. */
  label?: string | null;
  /** Whether to show a brightness slider for this control. */
  showBrightness: boolean;
  /** Ordered scene ids shown as quick buttons (room/zone targets only). */
  sceneIds: string[];
  /**
   * Toggle-only display: hides the brightness slider and scene pills, leaving
   * just the name + power toggle. Defaults to false (full) when absent.
   */
  compact?: boolean;
  hotkey?: ControlHotkey | null;
}

export type WidgetThemeMode = "light" | "dark" | "system";
export type WidgetSizeMode = "small" | "default" | "large";

export interface WidgetState {
  widgetId: string;
  title: string | null;
  enabled: boolean;
  pinned: boolean;
  /** Keeps the widget window floating above others (pinning also forces this). */
  alwaysOnTop: boolean;
  userSized: boolean;
  themeMode: WidgetThemeMode;
  sizeMode: WidgetSizeMode;
  controls: WidgetControl[];
}

/** A short, collision-resistant id for a freshly created control. */
export const newControlId = (): string =>
  `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** One physical display, in the virtual-desktop coordinate space window
 * positions are reported in. Mirrors the Rust `MonitorInfo`. */
export interface MonitorInfo {
  name: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
  isPrimary: boolean;
}

/** A widget window's physical position and size. Mirrors `StoredWidgetBounds`. */
export interface WidgetBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The monitor layout plus the widget's current bounds, for the position
 * picker. Mirrors the Rust `WidgetPlacement`. */
export interface WidgetPlacement {
  monitors: MonitorInfo[];
  bounds: WidgetBounds | null;
}
