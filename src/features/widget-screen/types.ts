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

export type WidgetStylePreset = "windows11" | "macos" | "borderless";
export type WidgetThemeMode = "light" | "dark" | "system";
export type WidgetDensity = "compact" | "expanded";

/** Which edge the hover title bar sits on. Top/bottom lay the window controls
 * out horizontally; left/right lay them out vertically. */
export type WidgetTitleBarPosition = "top" | "bottom" | "left" | "right";

/** Where the window-control buttons sit along the title bar's axis. Reads as
 * left/center/right on a top/bottom bar, or top/center/bottom on a side bar. */
export type WidgetButtonAlignment = "start" | "center" | "end";

export interface WidgetState {
  widgetId: string;
  title: string | null;
  enabled: boolean;
  pinned: boolean;
  /** Keeps the widget window floating above others (pinning also forces this). */
  alwaysOnTop: boolean;
  userSized: boolean;
  stylePreset: WidgetStylePreset;
  themeMode: WidgetThemeMode;
  density: WidgetDensity;
  titleBarPosition: WidgetTitleBarPosition;
  buttonAlignment: WidgetButtonAlignment;
  controls: WidgetControl[];
}

/** Mirrors `MAX_CONTROL_SCENES` in the Rust widget module. */
export const MAX_CONTROL_SCENES = 6;

/** A short, collision-resistant id for a freshly created control. */
export const newControlId = (): string =>
  `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
