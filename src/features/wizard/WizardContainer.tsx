import { invoke } from "@tauri-apps/api/core";
import { CheckCircle2, Loader2 } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { type HueSession, useHue } from "../../context/HueContext";

type SetupState =
  | { type: "welcome" }
  | { type: "discovering" }
  | { type: "pairing"; bridgeIp: string; countdown: number }
  | { type: "success" }
  | { type: "error"; message: string };

export const WizardContainer: React.FC = () => {
  const { applySession } = useHue();
  const [state, setState] = useState<SetupState>({ type: "welcome" });
  const [isBusy, setIsBusy] = useState(false);
  const countdownIntervalRef = useRef<number | null>(null);
  const shouldPollRef = useRef(false);

  const clearCountdown = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  };

  const startDiscovery = async () => {
    if (isBusy) return;

    setIsBusy(true);
    setState({ type: "discovering" });

    try {
      const bridges =
        await invoke<{ bridgeId: string; bridgeIp: string }[]>(
          "discover-bridges",
        );
      if (bridges.length > 0) {
        const firstBridge = bridges[0];
        startPairing(firstBridge.bridgeIp);
      } else {
        setState({
          type: "error",
          message: "No Hue Bridges found on your network.",
        });
      }
    } catch (error) {
      setState({
        type: "error",
        message: String(error) || "Failed to discover bridges.",
      });
    } finally {
      setIsBusy(false);
    }
  };

  const startPairing = async (ip: string) => {
    setState({ type: "pairing", bridgeIp: ip, countdown: 60 });
    shouldPollRef.current = true;

    let countdown = 60;
    countdownIntervalRef.current = setInterval(() => {
      countdown--;
      setState((prev) =>
        prev.type === "pairing" ? { ...prev, countdown } : prev,
      );

      if (countdown <= 0) {
        clearCountdown();
        shouldPollRef.current = false;
        setState({
          type: "error",
          message: "Pairing timed out. Please try again.",
        });
      }
    }, 1000);

    const poll = async () => {
      try {
        const session = await invoke<HueSession>("pair-bridge", { ip });
        clearCountdown();
        shouldPollRef.current = false;
        applySession(session);
        setState({ type: "success" });
      } catch (error) {
        if (!shouldPollRef.current) return;

        const message = String(error) || "Error pairing";

        if (message.toLowerCase().includes("link button")) {
          setTimeout(() => void poll(), 2000);
          return;
        }

        clearCountdown();
        shouldPollRef.current = false;
        setState({ type: "error", message });
      }
    };

    await poll();
  };

  const reset = () => {
    clearCountdown();
    shouldPollRef.current = false;
    setState({ type: "welcome" });
  };

  useEffect(() => {
    return () => {
      clearCountdown();
      shouldPollRef.current = false;
    };
  }, []);

  return (
    <div className="w-full max-w-md mx-auto text-center">
      {state.type === "welcome" && (
        <div className="flex flex-col items-center transition-all duration-500">
          <h1 className="mb-4 text-4xl font-bold">Welcome!</h1>
          <p className="text-secondary mb-8 text-lg">
            Let's connect to your hue system!
          </p>
          <button
            type="button"
            onClick={() => startDiscovery()}
            disabled={isBusy}
            className="accent-button"
          >
            {isBusy ? "Connecting..." : "Connect"}
          </button>
        </div>
      )}

      {state.type === "discovering" && (
        <div className="flex flex-col items-center transition-all duration-500">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full">
            <Loader2
              className="h-12 w-12 animate-spin"
              style={{ color: "var(--accent)" }}
            />
          </div>
          <h1 className="mb-4 text-3xl font-bold">
            Looking for Hue Bridges...
          </h1>
        </div>
      )}

      {state.type === "pairing" && (
        <div className="flex flex-col items-center transition-all duration-500">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full">
            <div className="relative">
              <div
                className="w-16 h-16 rounded-full border-4 animate-pulse"
                style={{ borderColor: "var(--accent)" }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className="w-8 h-8 rounded-full"
                  style={{
                    backgroundColor: "var(--accent)",
                    boxShadow: "0 0 20px var(--accent)",
                  }}
                />
              </div>
            </div>
          </div>
          <h1 className="mb-4 text-3xl font-bold">Press the middle button</h1>
          <p className="text-secondary mb-2">
            Go press the middle button on your Hue Bridge
          </p>
          <p className="text-muted text-lg">
            Time remaining:{" "}
            <span className="font-bold">{state.countdown}s</span>
          </p>
        </div>
      )}

      {state.type === "success" && (
        <div className="flex flex-col items-center transition-all duration-500">
          <div
            className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full"
            style={{
              background: "var(--success-soft)",
              border: "1px solid var(--success-border)",
            }}
          >
            <CheckCircle2
              className="h-12 w-12"
              style={{ color: "var(--success-text)" }}
            />
          </div>
          <h1 className="mb-4 text-4xl font-bold">Connected!</h1>
          <p className="text-secondary mb-8 text-lg">Your bridge is ready</p>
        </div>
      )}

      {state.type === "error" && (
        <div className="flex flex-col items-center transition-all duration-500">
          <h1 className="mb-4 text-3xl font-bold">Oops!</h1>
          <p className="text-secondary mb-8 text-lg">{state.message}</p>
          <button
            type="button"
            onClick={() => reset()}
            className="accent-button"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
};
