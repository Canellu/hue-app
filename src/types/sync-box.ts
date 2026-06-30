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
