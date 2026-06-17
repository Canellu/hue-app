import { invoke } from "@tauri-apps/api/core";
import { CheckCircle2, Loader2 } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
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
    <Card className="mx-auto w-full max-w-md">
      <CardContent className="flex flex-col items-center gap-6 py-6 text-center">
        {state.type === "welcome" && (
          <>
            <h1 className="font-heading text-3xl font-semibold">Welcome!</h1>
            <p className="text-muted-foreground">
              Let's connect to your Hue system!
            </p>
            <Button
              size="lg"
              onClick={() => startDiscovery()}
              disabled={isBusy}
            >
              {isBusy ? "Connecting..." : "Connect"}
            </Button>
          </>
        )}

        {state.type === "discovering" && (
          <>
            <Loader2 className="size-12 animate-spin text-primary" />
            <h1 className="font-heading text-2xl font-semibold">
              Looking for Hue Bridges...
            </h1>
          </>
        )}

        {state.type === "pairing" && (
          <>
            <div className="relative flex size-20 items-center justify-center">
              <span className="absolute inline-flex size-16 animate-ping rounded-full bg-primary/40" />
              <span className="relative inline-flex size-8 rounded-full bg-primary" />
            </div>
            <h1 className="font-heading text-2xl font-semibold">
              Press the middle button
            </h1>
            <p className="text-muted-foreground">
              Go press the middle button on your Hue Bridge
            </p>
            <p className="text-muted-foreground">
              Time remaining:{" "}
              <span className="font-semibold text-foreground">
                {state.countdown}s
              </span>
            </p>
          </>
        )}

        {state.type === "success" && (
          <>
            <CheckCircle2 className="size-12 text-green-500" />
            <h1 className="font-heading text-3xl font-semibold">Connected!</h1>
            <p className="text-muted-foreground">Your bridge is ready</p>
          </>
        )}

        {state.type === "error" && (
          <>
            <h1 className="font-heading text-2xl font-semibold">Oops!</h1>
            <p className="text-muted-foreground">{state.message}</p>
            <Button variant="outline" onClick={() => reset()}>
              Try Again
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
