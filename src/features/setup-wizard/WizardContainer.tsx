import {
  HueBridgeBody,
  HueBridgeIllustration,
} from "@/components/HueBridgeIllustration";
import {
  HueBridgeProBody,
  HueBridgeProIllustration,
} from "@/components/HueBridgeProIllustration";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import {
  CheckCircle2,
  WifiHigh,
  WifiLow,
  WifiZero,
  XCircle,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { type HueSession, useHue } from "../../context/HueContext";

type DiscoveredBridge = {
  bridgeId: string;
  bridgeIp: string;
  modelId?: string | null;
};

type BridgeKind = "original" | "pro";

type ErrorReason = "no-bridges" | "timeout" | "discovery" | "pairing";

type SetupState =
  | { type: "welcome" }
  | { type: "discovering" }
  | {
      type: "selectBridge";
      bridges: DiscoveredBridge[];
      selectedBridgeIp: string;
    }
  | { type: "pairing"; bridge: DiscoveredBridge }
  | { type: "success" }
  | {
      type: "error";
      reason: ErrorReason;
      message: string;
      bridge?: DiscoveredBridge;
    };

interface WizardContainerProps {
  devMode?: boolean;
}

// Silent backstop so the pairing poll loop can't run forever if the user walks
// away or closes the lid mid-pairing. There's no visible countdown — the Cancel
// button is the user-facing exit; this just stops the polling eventually.
const PAIRING_TIMEOUT_SECONDS = 180;

// BSB001 (round v1) and BSB002 (white square v2) render as the classic white
// bridge. Newer model ids — the black Hue Bridge Pro and anything beyond —
// render as the pro illustration. Unknown/unreachable falls back to the
// classic bridge, which is by far the larger installed base.
const bridgeKind = (modelId?: string | null): BridgeKind => {
  const id = (modelId ?? "").toUpperCase();
  if (id === "BSB001" || id === "BSB002") return "original";
  if (id.startsWith("BSB")) return "pro";
  return "original";
};

const bridgeKindLabel = (kind: BridgeKind) =>
  kind === "pro" ? "Hue Bridge Pro" : "Hue Bridge";

const sampleBridges: DiscoveredBridge[] = [
  { bridgeId: "001788FFFE1A2B3C", bridgeIp: "192.168.1.42", modelId: "BSB002" },
  { bridgeId: "001788FFFE4D5E6F", bridgeIp: "192.168.1.77", modelId: "BSB003" },
];

// Dev toolbar entries. Each has a unique id so multiple variants of the same
// state type (e.g. single vs. multiple bridges) can coexist and toggle.
const wizardDevStates: { id: string; label: string; state: SetupState }[] = [
  { id: "welcome", label: "Welcome", state: { type: "welcome" } },
  { id: "discovering", label: "Discovering", state: { type: "discovering" } },
  {
    id: "selectBridge-one",
    label: "Select bridge (one)",
    state: {
      type: "selectBridge",
      bridges: [sampleBridges[0]],
      selectedBridgeIp: "",
    },
  },
  {
    id: "selectBridge-many",
    label: "Select bridge (multiple)",
    state: {
      type: "selectBridge",
      bridges: sampleBridges,
      selectedBridgeIp: "",
    },
  },
  {
    id: "pairing",
    label: "Pairing",
    state: { type: "pairing", bridge: sampleBridges[0] },
  },
  {
    id: "pairing-pro",
    label: "Pairing (pro)",
    state: { type: "pairing", bridge: sampleBridges[1] },
  },
  { id: "success", label: "Success", state: { type: "success" } },
  {
    id: "error-no-bridges",
    label: "Error: no bridges",
    state: {
      type: "error",
      reason: "no-bridges",
      message: "No Hue Bridges found on your network.",
    },
  },
  {
    id: "error-timeout",
    label: "Error: timeout",
    state: {
      type: "error",
      reason: "timeout",
      message: "Pairing timed out before the bridge button was pressed.",
      bridge: sampleBridges[0],
    },
  },
  {
    id: "error-discovery",
    label: "Error: discovery",
    state: {
      type: "error",
      reason: "discovery",
      message: "Something went wrong while searching for bridges.",
    },
  },
  {
    id: "error-pairing",
    label: "Error: pairing",
    state: {
      type: "error",
      reason: "pairing",
      message: "The bridge rejected the pairing request.",
      bridge: sampleBridges[0],
    },
  },
];

// Dev-only quick-jump shortcuts: the natural next transitions from the current
// state, surfaced as buttons so the wizard flow can be stepped through without
// hunting in the dropdown. Keyed by state type, so "pairing" covers both the
// classic and pro pairing screens. Ids point back into wizardDevStates.
const devNextSteps: Partial<
  Record<SetupState["type"], { id: string; label: string }[]>
> = {
  discovering: [
    { id: "selectBridge-one", label: "One bridge" },
    { id: "selectBridge-many", label: "Multiple bridges" },
  ],
  pairing: [
    { id: "success", label: "Success" },
    { id: "error-no-bridges", label: "No bridges" },
  ],
};

const errorTitles: Record<ErrorReason, string> = {
  "no-bridges": "No bridges found",
  timeout: "Pairing timed out",
  discovery: "Discovery failed",
  pairing: "Pairing failed",
};

const errorHelp: Record<ErrorReason, string> = {
  "no-bridges":
    "Make sure your computer and Hue Bridge are on the same Wi-Fi network, and that the bridge is connected to your router by Ethernet and powered on.",
  timeout:
    "The bridge wasn't authorized in time. Tap Try again to give it another go.",
  discovery:
    "Check that your bridge is powered on and connected to the same network, then try again.",
  pairing: "Try pairing again. If it keeps failing, restart your Hue Bridge.",
};

// Compact bridge thumbnail used on the selection cards: the real illustration
// body reused at a reduced scale. The box is deliberately larger than the
// scaled body (size-40 × 0.6 ≈ 6rem inside a 7rem box) and has no overflow
// clipping, so the device's drop shadow has room to render instead of being
// cut off at the edges.
const BridgeThumb: React.FC<{ kind: BridgeKind }> = ({ kind }) => (
  <div className="flex size-28 shrink-0 items-center justify-center">
    <div className="scale-[0.6]">
      {kind === "pro" ? <HueBridgeProBody /> : <HueBridgeBody />}
    </div>
  </div>
);

// The bridge illustration carrying a terminal-state badge. Rather than dimming
// the whole device with opacity (which just reads as "not rendering well"), the
// device stays fully crisp on a colored blurred halo — green for success, red
// for an error — with a small sticker-style badge in the bottom-right corner
// reinforcing the outcome.
const BridgeStatus: React.FC<{
  kind: BridgeKind;
  status: "success" | "error";
}> = ({ kind, status }) => {
  const isError = status === "error";
  const Illustration =
    kind === "pro" ? HueBridgeProIllustration : HueBridgeIllustration;

  return (
    <div className="relative flex items-center justify-center">
      {/* colored blurred halo sitting behind the device */}
      <div
        className={cn(
          "pointer-events-none absolute size-48 rounded-full blur-2xl",
          isError
            ? "bg-red-500/70 dark:bg-red-500/30"
            : "bg-green-500/80 dark:bg-green-500/30",
        )}
      />

      <div className="relative">
        <Illustration />

        <span className="absolute bottom-4 right-4 flex items-center justify-center rounded-full bg-background p-0.5 shadow-md ring-1 ring-border">
          {isError ? (
            <XCircle className="size-9 text-red-600 dark:text-red-500" />
          ) : (
            <CheckCircle2 className="size-9 text-green-600 dark:text-green-500" />
          )}
        </span>
      </div>
    </div>
  );
};

// Animated Wi-Fi signal shown while scanning for bridges. Cycles through an
// empty frame and the zero/low/high lucide variants so the signal arcs build
// up from nothing and loop.
const DISCOVERY_WIFI_ICONS = [null, WifiZero, WifiLow, WifiHigh] as const;

const DiscoveryWifi: React.FC = () => {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setStep((current) => (current + 1) % DISCOVERY_WIFI_ICONS.length);
    }, 500);
    return () => clearInterval(id);
  }, []);
  const Icon = DISCOVERY_WIFI_ICONS[step];
  return (
    <div className="flex size-16 items-center justify-center">
      {Icon && <Icon className="size-16 text-primary" />}
    </div>
  );
};

export const WizardContainer: React.FC<WizardContainerProps> = ({
  devMode = false,
}) => {
  const { applySession } = useHue();
  const [state, setState] = useState<SetupState>({ type: "welcome" });
  const [isBusy, setIsBusy] = useState(false);
  // Authoritative value for the dev toolbar dropdown. Kept independent of the
  // wizard state so distinct entries that share a state type (one vs. multiple
  // bridges) can be selected and toggled freely.
  const [devStateId, setDevStateId] = useState("welcome");
  const pairingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldPollRef = useRef(false);
  // Remember the last discovered bridges so pairing errors can return to the
  // selection screen without re-running discovery.
  const knownBridgesRef = useRef<DiscoveredBridge[]>([]);
  // Remember the bridge the user picked so every error screen can show that same
  // device (dimmed), even the ones that carry no bridge of their own.
  const selectedBridgeRef = useRef<DiscoveredBridge | null>(null);

  const clearPairingTimeout = () => {
    if (pairingTimeoutRef.current) {
      clearTimeout(pairingTimeoutRef.current);
      pairingTimeoutRef.current = null;
    }
  };

  const showBridgeSelection = (bridges: DiscoveredBridge[]) => {
    knownBridgesRef.current = bridges;
    setDevStateId(
      bridges.length > 1 ? "selectBridge-many" : "selectBridge-one",
    );
    setState({
      type: "selectBridge",
      bridges,
      selectedBridgeIp: "",
    });
  };

  const startDiscovery = async () => {
    if (isBusy) return;

    setDevStateId("discovering");

    if (devMode) {
      setState({ type: "discovering" });
      return;
    }

    setIsBusy(true);
    setState({ type: "discovering" });

    try {
      // Keep the "Looking for Hue Bridges…" state up for at least a beat so the
      // discovery animation doesn't flash by when bridges respond instantly.
      const [bridges] = await Promise.all([
        invoke<DiscoveredBridge[]>("discover-bridges"),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
      if (bridges.length > 0) {
        showBridgeSelection(bridges);
      } else {
        setState({
          type: "error",
          reason: "no-bridges",
          message: "No Hue Bridges found on your network.",
        });
      }
    } catch (error) {
      setState({
        type: "error",
        reason: "discovery",
        message: String(error) || "Failed to discover bridges.",
      });
    } finally {
      setIsBusy(false);
    }
  };

  const startPairing = async (bridge: DiscoveredBridge) => {
    selectedBridgeRef.current = bridge;
    setDevStateId(
      bridgeKind(bridge.modelId) === "pro" ? "pairing-pro" : "pairing",
    );

    if (devMode) {
      setState({ type: "pairing", bridge });
      return;
    }

    setState({ type: "pairing", bridge });
    shouldPollRef.current = true;

    // Silent backstop: if the button is never pressed we stop polling and surface
    // a timeout rather than hammering the bridge forever.
    pairingTimeoutRef.current = setTimeout(() => {
      clearPairingTimeout();
      shouldPollRef.current = false;
      setState({
        type: "error",
        reason: "timeout",
        message: "Pairing timed out before the bridge button was pressed.",
        bridge,
      });
    }, PAIRING_TIMEOUT_SECONDS * 1000);

    const poll = async () => {
      try {
        const session = await invoke<HueSession>("pair-bridge", {
          ip: bridge.bridgeIp,
        });
        clearPairingTimeout();
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

        clearPairingTimeout();
        shouldPollRef.current = false;
        setState({ type: "error", reason: "pairing", message, bridge });
      }
    };

    await poll();
  };

  const setDevState = (nextState: SetupState, devId: string) => {
    clearPairingTimeout();
    shouldPollRef.current = false;
    setIsBusy(false);
    if (nextState.type === "selectBridge") {
      knownBridgesRef.current = nextState.bridges;
    }
    setDevStateId(devId);
    setState(nextState);
  };

  const setDevStateById = (id: string) => {
    const entry = wizardDevStates.find((devState) => devState.id === id);
    if (entry) {
      setDevState(entry.state, entry.id);
    }
  };

  const reset = () => {
    clearPairingTimeout();
    shouldPollRef.current = false;
    knownBridgesRef.current = [];
    selectedBridgeRef.current = null;
    setDevStateId("welcome");
    setState({ type: "welcome" });
  };

  const cancelPairing = () => {
    clearPairingTimeout();
    shouldPollRef.current = false;

    // Back out to bridge selection when we still know the available bridges,
    // otherwise return to the start so the user is never stuck on this screen.
    if (knownBridgesRef.current.length > 0) {
      showBridgeSelection(knownBridgesRef.current);
    } else {
      reset();
    }
  };

  const handleErrorRetry = () => {
    if (state.type !== "error") return;

    clearPairingTimeout();
    shouldPollRef.current = false;

    // Pairing-related failures return to bridge selection when we still know
    // which bridges are available; otherwise we re-run discovery.
    if (
      (state.reason === "timeout" || state.reason === "pairing") &&
      knownBridgesRef.current.length > 0
    ) {
      showBridgeSelection(knownBridgesRef.current);
      return;
    }

    void startDiscovery();
  };

  useEffect(() => {
    return () => {
      clearPairingTimeout();
      shouldPollRef.current = false;
    };
  }, []);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center px-6 py-10">
      {devMode && (
        <div className="fixed right-4 top-14 z-50 flex flex-col items-stretch gap-2 rounded-md border border-border/70 bg-background/60 p-2 shadow-sm backdrop-blur-md">
          <Select
            value={devStateId}
            onValueChange={(value) => {
              if (value) {
                setDevStateById(value as string);
              }
            }}
          >
            <SelectTrigger
              aria-label="Wizard state"
              className="min-w-48 bg-background/70"
            >
              <SelectValue>
                {wizardDevStates.find((devState) => devState.id === devStateId)
                  ?.label ?? state.type}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              {wizardDevStates.map((devState) => (
                <SelectItem key={devState.id} value={devState.id}>
                  {devState.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {devNextSteps[state.type] && (
            <div className="flex flex-col gap-1.5 border-t border-border/70 pt-2">
              <span className="px-0.5 text-xs text-muted-foreground">
                Proceed to
              </span>
              {devNextSteps[state.type]?.map((step) => (
                <Button
                  key={step.id}
                  size="sm"
                  variant="outline"
                  className="justify-start bg-background/70"
                  onClick={() => setDevStateById(step.id)}
                >
                  {step.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        key={state.type}
        className="flex w-full max-w-xl flex-col items-center gap-10 text-center duration-1000 ease-[cubic-bezier(0.16, 1, 0.3, 1)] animate-in fade-in"
      >
        {state.type === "welcome" && (
          <>
            <HueBridgeProIllustration />
            <div className="flex flex-col gap-3">
              <h1 className="font-heading text-4xl font-semibold">Welcome</h1>
              <p className="text-lg text-muted-foreground">
                Let&apos;s connect this app to your Philips Hue system.
              </p>
            </div>
            <Button
              size="xl"
              onClick={() => startDiscovery()}
              disabled={isBusy}
            >
              {isBusy ? "Connecting…" : "Connect"}
            </Button>
          </>
        )}

        {state.type === "discovering" && (
          <>
            <DiscoveryWifi />
            <div className="flex flex-col gap-3">
              <h1 className="text-shimmer font-heading text-4xl font-semibold">
                Looking for Hue Bridges…
              </h1>
              <p className="text-lg text-muted-foreground">
                Scanning your network for a Hue Bridge.
              </p>
            </div>
          </>
        )}

        {state.type === "selectBridge" && (
          <>
            <div className="flex flex-col gap-3">
              <h1 className="font-heading text-3xl font-semibold">
                {state.bridges.length > 1
                  ? "Choose your Hue Bridge"
                  : "Hue Bridge found"}
              </h1>
              <p className="text-lg text-muted-foreground">
                Select the bridge you want to connect to.
              </p>
            </div>

            <div className="flex w-full flex-wrap justify-center gap-4">
              {state.bridges.map((bridge) => {
                const isSelected = bridge.bridgeIp === state.selectedBridgeIp;
                const kind = bridgeKind(bridge.modelId);
                return (
                  <Card
                    key={bridge.bridgeId}
                    size="sm"
                    className={cn(
                      "w-52 cursor-pointer bg-transparent transition-colors hover:bg-muted",
                      isSelected && "bg-muted hover:bg-muted",
                    )}
                    onClick={() =>
                      setState({ ...state, selectedBridgeIp: bridge.bridgeIp })
                    }
                  >
                    <CardContent className="flex flex-col items-center gap-2 text-center">
                      <BridgeThumb kind={kind} />
                      <span className="font-medium">
                        {bridgeKindLabel(kind)}
                      </span>
                      <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">
                          {bridge.bridgeIp}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {bridge.bridgeId}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="flex gap-3">
              <Button size="xl" variant="outline" onClick={() => reset()}>
                Back
              </Button>
              <Button
                size="xl"
                disabled={!state.selectedBridgeIp}
                onClick={() => {
                  const bridge = state.bridges.find(
                    (candidate) =>
                      candidate.bridgeIp === state.selectedBridgeIp,
                  );
                  if (bridge) {
                    void startPairing(bridge);
                  }
                }}
              >
                Continue
              </Button>
            </div>
          </>
        )}

        {state.type === "pairing" && (
          <>
            {bridgeKind(state.bridge.modelId) === "pro" ? (
              <HueBridgeProIllustration pulse />
            ) : (
              <HueBridgeIllustration pulse />
            )}
            <div className="flex flex-col gap-3">
              <h1 className="font-heading text-3xl font-semibold">
                Press the round button on top of your{" "}
                {bridgeKindLabel(bridgeKind(state.bridge.modelId))}.
              </h1>
              <p className="text-lg text-muted-foreground">
                Waiting for the bridge to authorize this app…
              </p>
            </div>
            <Button size="xl" variant="outline" onClick={() => cancelPairing()}>
              Cancel
            </Button>
          </>
        )}

        {state.type === "success" && (
          <>
            <BridgeStatus
              kind={bridgeKind(selectedBridgeRef.current?.modelId)}
              status="success"
            />
            <div className="flex flex-col gap-3">
              <h1 className="font-heading text-4xl font-semibold">
                Connected!
              </h1>
              <p className="text-lg text-muted-foreground">
                Your Hue Bridge is ready to use.
              </p>
            </div>
          </>
        )}

        {state.type === "error" && (
          <>
            <BridgeStatus
              kind={bridgeKind(
                (state.bridge ?? selectedBridgeRef.current)?.modelId,
              )}
              status="error"
            />
            <div className="flex flex-col gap-3">
              <h1 className="font-heading text-3xl font-semibold">
                {errorTitles[state.reason]}
              </h1>
              <p className="text-lg text-muted-foreground">{state.message}</p>
              <p className="text-muted-foreground">{errorHelp[state.reason]}</p>
            </div>
            <div className="flex gap-3">
              <Button size="xl" variant="outline" onClick={() => reset()}>
                Start over
              </Button>
              <Button size="xl" onClick={() => handleErrorRetry()}>
                Try again
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
