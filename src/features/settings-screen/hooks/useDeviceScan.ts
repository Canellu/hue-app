import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { HueSettingsDevice, HueSettingsSummary } from "@/types/hue";

export type ScanStatus = "idle" | "scanning" | "done";
export type ScanMode = "generic" | "qr" | "serial";

export interface FoundDevice {
  /** v2 device rid. */
  id: string;
  name: string;
  eyebrow: string;
  /** Whether the device exposes a light, i.e. can be placed in a zone. */
  hasLight: boolean;
  productName: string | null;
  modelId: string | null;
  productArchetype: string | null;
  swVersion: string | null;
  reachable: boolean;
  uniqueId: string | null;
  serviceTypes: string[];
}

/**
 * How long we keep the "scanning" indicator running and poll for new devices.
 * This is our UI window — the bridge runs its own asynchronous scan whose exact
 * duration we don't control — so it's deliberately generous.
 */
const SCAN_WINDOW_MS = 60_000;
const POLL_INTERVAL_MS = 4_000;

const toFoundDevice = (device: HueSettingsDevice): FoundDevice => ({
  id: device.id,
  name: device.name,
  eyebrow: device.productName ?? device.productArchetype ?? "Hue device",
  hasLight: device.serviceTypes.includes("light"),
  productName: device.productName,
  modelId: device.modelId,
  productArchetype: device.productArchetype,
  swVersion: device.swVersion,
  reachable: device.reachable,
  uniqueId: device.uniqueId,
  serviceTypes: device.serviceTypes,
});

/**
 * Drives a "scan for new devices" session. Both bridge generations only *start*
 * an asynchronous scan, so we snapshot the current device set, kick off the
 * scan, then poll the full device list for the duration of `SCAN_WINDOW_MS`,
 * surfacing any device id that wasn't in the snapshot. Modeled on
 * `usePairingPoll` — refs drive the loop so re-renders don't restart it.
 */
export const useDeviceScan = () => {
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [found, setFound] = useState<FoundDevice[]>([]);
  const [error, setError] = useState<string | null>(null);

  const baselineRef = useRef<Set<string>>(new Set());
  const activeRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    if (deadlineRef.current) {
      clearTimeout(deadlineRef.current);
      deadlineRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    clearTimers();
    setStatus((current) => (current === "scanning" ? "done" : current));
  }, [clearTimers]);

  const poll = useCallback(async () => {
    if (!activeRef.current) return;
    try {
      const summary = await invoke<HueSettingsSummary>(
        "get-hue-settings-summary",
      );
      if (!activeRef.current) return;
      const newlyFound = summary.devices
        .filter((device) => !baselineRef.current.has(device.id))
        .map(toFoundDevice);
      setFound((current) => {
        const byId = new Map(current.map((device) => [device.id, device]));
        for (const device of newlyFound) byId.set(device.id, device);
        return [...byId.values()];
      });
    } catch {
      // Transient poll failures (bridge busy mid-scan) are expected; keep going.
    } finally {
      if (activeRef.current) {
        pollRef.current = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      }
    }
  }, []);

  const start = useCallback(async (mode: ScanMode = "generic", value?: string) => {
    clearTimers();
    setError(null);
    setStatus("scanning");
    activeRef.current = true;

    try {
      const summary = await invoke<HueSettingsSummary>(
        "get-hue-settings-summary",
      );
      baselineRef.current = new Set(summary.devices.map((device) => device.id));
      if (mode === "qr") {
        await invoke("start-hue-qr-device-discovery", { qrText: value ?? "" });
      } else if (mode === "serial") {
        await invoke("start-hue-serial-light-discovery", { serial: value ?? "" });
      } else {
        await invoke("start-hue-device-discovery");
      }
    } catch (startError) {
      activeRef.current = false;
      setStatus("idle");
      setError(String(startError) || "Unable to start the scan.");
      return;
    }

    deadlineRef.current = setTimeout(stop, SCAN_WINDOW_MS);
    pollRef.current = setTimeout(() => void poll(), POLL_INTERVAL_MS);
  }, [clearTimers, poll, stop]);

  const reset = useCallback(() => {
    activeRef.current = false;
    clearTimers();
    setStatus("idle");
    setFound([]);
    setError(null);
  }, [clearTimers]);

  // Stop polling if the consumer unmounts.
  useEffect(
    () => () => {
      activeRef.current = false;
      clearTimers();
    },
    [clearTimers],
  );

  return { status, found, error, start, stop, reset };
};
