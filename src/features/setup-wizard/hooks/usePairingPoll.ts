import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import type { HueSession } from "@/context/HueContext";
import type { DiscoveredBridge } from "@/types/setup-wizard";
import { PAIRING_TIMEOUT_SECONDS } from "../constants";

interface PairingPollHandlers {
  onSuccess: (session: HueSession) => void;
  onError: (message: string, bridge: DiscoveredBridge) => void;
  onTimeout: (bridge: DiscoveredBridge) => void;
}

const LINK_BUTTON_RETRY_MS = 2000;

/**
 * Drives the Hue link-button pairing handshake for a single bridge. The bridge
 * only issues an application key after the user physically presses its button,
 * so we poll `pair-bridge`, retrying while it returns the "link button" error,
 * backstopped by an overall timeout. Polling stops on success, a fatal error,
 * timeout, an explicit `stop()`, or unmount — after which no handler fires.
 */
export const usePairingPoll = (handlers: PairingPollHandlers) => {
  // Keep handlers current without restarting an in-flight poll loop.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const activeRef = useRef(false);
  const deadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = () => {
    activeRef.current = false;
    if (deadlineRef.current) {
      clearTimeout(deadlineRef.current);
      deadlineRef.current = null;
    }
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
  };

  const start = (bridge: DiscoveredBridge) => {
    stop();
    activeRef.current = true;

    deadlineRef.current = setTimeout(() => {
      stop();
      handlersRef.current.onTimeout(bridge);
    }, PAIRING_TIMEOUT_SECONDS * 1000);

    const poll = async () => {
      try {
        const session = await invoke<HueSession>("pair-bridge", {
          ip: bridge.bridgeIp,
        });
        if (!activeRef.current) return;
        stop();
        handlersRef.current.onSuccess(session);
      } catch (error) {
        if (!activeRef.current) return;

        const message = String(error) || "Error pairing";
        if (message.toLowerCase().includes("link button")) {
          retryRef.current = setTimeout(
            () => void poll(),
            LINK_BUTTON_RETRY_MS,
          );
          return;
        }

        stop();
        handlersRef.current.onError(message, bridge);
      }
    };

    void poll();
  };

  // Stop polling when the wizard unmounts.
  useEffect(() => stop, []);

  return { start, stop };
};
