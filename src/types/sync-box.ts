export interface DiscoveredSyncBox {
  name: string;
  deviceType: string;
  uniqueId: string;
  ipAddress: string;
  port: number;
  apiLevel: number;
  firmwareVersion: string;
  supported: boolean;
}

export interface StoredSyncBoxInfo {
  name: string;
  deviceType: string;
  uniqueId: string;
  ipAddress: string;
  port: number;
  apiLevel: number;
  firmwareVersion: string;
}

export interface SyncBoxSession {
  configured: boolean;
  connected: boolean;
  syncBox: StoredSyncBoxInfo | null;
  error: string | null;
}

export type SyncBoxMode = "video" | "game" | "music";
export type SyncBoxIntensity = "subtle" | "moderate" | "high" | "intense";
export type SyncBoxHdmiSource = "input1" | "input2" | "input3" | "input4";

export interface SyncBoxState {
  device: {
    name: string;
    overheating: boolean;
    undervolt: boolean;
  };
  hue: {
    connectionState: string;
    groups: Record<
      string,
      { name: string; numLights: number; active: boolean }
    >;
  };
  execution: {
    mode: string;
    syncActive: boolean;
    hdmiActive: boolean;
    hdmiSource: string;
    hueTarget: string | null;
    brightness: number;
    lastSyncMode: string | null;
    video: { intensity: string | null } | null;
    game: { intensity: string | null } | null;
    music: { intensity: string | null } | null;
  };
  hdmi: Record<SyncBoxHdmiSource, SyncBoxHdmiInput> & {
    contentSpecs: string | null;
    videoSyncSupported: boolean;
    audioSyncSupported: boolean;
  };
}

export interface SyncBoxHdmiInput {
  name: string;
  status: string | null;
  type: string | null;
}

export type SyncBoxExecutionUpdate =
  | { syncActive: boolean }
  | { hdmiActive: boolean }
  | { mode: SyncBoxMode }
  | { hdmiSource: SyncBoxHdmiSource }
  | { hueTarget: string }
  | { brightness: number }
  | { intensity: SyncBoxIntensity };

export type SyncBoxOnboardingState =
  | { type: "welcome" }
  | { type: "discovering" }
  | {
      type: "select";
      syncBoxes: DiscoveredSyncBox[];
      selectedUniqueId: string;
    }
  | { type: "pairing"; syncBox: DiscoveredSyncBox }
  | { type: "success"; session: SyncBoxSession }
  | {
      type: "error";
      reason: "discovery" | "not-found" | "unsupported" | "pairing" | "timeout";
      message: string;
      syncBox?: DiscoveredSyncBox;
    };
