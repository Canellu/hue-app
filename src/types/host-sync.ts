/** Serializable shapes shared with the Rust PC-sync engine (`host_sync.rs`). */

export type HostSyncMode = "video" | "game" | "music";

export type HostSyncIntensity = "subtle" | "moderate" | "high" | "extreme";

export type MusicPalette = "spectrum" | "vibrant" | "warm" | "cool";

/** A built-in palette string, or a palette derived from a Hue scene's colors. */
export type MusicPaletteChoice =
  | MusicPalette
  | { sceneId: string; sceneName?: string | null };

export type MusicChannelCount = "matchArea" | "one" | "three" | "five";

/** What happens to the member lights after a normal stop. */
export type HostSyncStopBehavior = "restore" | "keep" | "turnOff";

export type HostSyncLifecycle =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "error";

export interface HostSyncStatus {
  state: HostSyncLifecycle;
  areaId: string | null;
  error: string | null;
  /** Non-fatal degradation while running, e.g. audio enhancement lost. */
  warning: string | null;
}

export interface HostSyncDisplay {
  /** Stable GDI device name (e.g. `\\.\DISPLAY1`); the persisted id. */
  id: string;
  name: string;
  adapter: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  isPrimary: boolean;
  refreshRate: number | null;
  hdrEnabled: boolean;
}

export interface HostSyncAudioOutput {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface HostSyncCredentialStatus {
  /** True when a DTLS clientkey is stored and streaming can be attempted. */
  hasClientKey: boolean;
  /** True when streaming uses a credential separate from the main pairing. */
  hasDedicatedApplicationKey: boolean;
}

export interface HostSyncPreferences {
  automaticDisplay: boolean;
  displayIds: string[];
  /** `null` follows the Windows default output device. */
  audioDeviceId: string | null;
  mode: HostSyncMode;
  intensity: HostSyncIntensity;
  /** Effect brightness, 0-100. */
  brightness: number;
  /** Audio-driven brightness emphasis for Video mode. */
  videoAudioReactive: boolean;
  musicPalette: MusicPaletteChoice;
  musicChannelCount: MusicChannelCount;
  stopBehavior: HostSyncStopBehavior;
}

export interface HostSyncEntertainmentChannel {
  channelId: number;
  x: number;
  y: number;
  z: number;
}

export interface HostSyncEntertainmentArea {
  id: string;
  name: string;
  configurationType: string | null;
  /** "active" while an application streams to this area. */
  status: string;
  activeStreamerId: string | null;
  channels: HostSyncEntertainmentChannel[];
  lightIds: string[];
}

export interface HostSyncOverview {
  bridgeConfigured: boolean;
  credentials: HostSyncCredentialStatus;
  /** Display/audio capture is Windows-only for now. */
  captureSupported: boolean;
  displays: HostSyncDisplay[];
  audioOutputs: HostSyncAudioOutput[];
  preferences: HostSyncPreferences;
  areas: HostSyncEntertainmentArea[];
  /** Set when the bridge is paired but the area list could not be fetched. */
  areasError: string | null;
  status: HostSyncStatus;
}

export interface StartHostSyncRequest {
  areaId: string;
  mode?: HostSyncMode;
  intensity?: HostSyncIntensity;
  brightness?: number;
  audioReactive?: boolean;
  confirmTakeover?: boolean;
}

export interface UpdateHostSyncRequest {
  brightness?: number;
  intensity?: HostSyncIntensity;
}

/** Per-channel color override for the placement color test. */
export interface ColorTestChannelColor {
  channelId: number;
  rgb: [number, number, number];
}

export interface StartColorTestRequest {
  areaId: string;
  /** Fallback color for channels without an override. */
  rgb: [number, number, number];
  channelColors?: ColorTestChannelColor[];
  confirmTakeover?: boolean;
}
