import { useEffect, useRef, useState } from "react";
import type { BridgeKind } from "@/types/setup-wizard";
import {
  DEV_DEFAULT_BRIDGE_COUNT,
  DEV_DEFAULT_PAIRING_KIND,
  wizardDevStates,
} from "../constants";

type AppDevViewId = "splash" | "disconnected" | "home-preview";

const appDevViewOptions: { id: AppDevViewId; label: string }[] = [
  { id: "splash", label: "Splash" },
  { id: "disconnected", label: "Disconnected" },
  { id: "home-preview", label: "Ready app" },
];

// Toolbar groups: the app-level preview states plus every wizard dev state.
export const devViewGroups = [
  { label: "App", options: appDevViewOptions },
  {
    label: "Wizard",
    options: wizardDevStates.map(({ id, label }) => ({ id, label })),
  },
];

const DEV_RETRY_MS = 2000;

const getDevViewsEnabled = () => {
  if (!import.meta.env.DEV) return false;

  const value = import.meta.env.VITE_DEV_VIEWS?.trim().toLowerCase();
  return value === "1" || value === "true";
};

/**
 * Dev-only state machine behind the wizard dev toolbar: which preview view is
 * showing, the simulated bridge count, and the faked "retry" spinner on the
 * disconnected preview. Inert (and renders nothing extra) unless VITE_DEV_VIEWS
 * is set in a DEV build.
 */
export const useDevViews = () => {
  const [enabled] = useState(getDevViewsEnabled);
  const [viewId, setViewId] = useState("welcome");
  const [bridgeCount, setBridgeCount] = useState(DEV_DEFAULT_BRIDGE_COUNT);
  const [pairingKind, setPairingKind] = useState<BridgeKind>(
    DEV_DEFAULT_PAIRING_KIND,
  );
  const [retryLoading, setRetryLoading] = useState(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);

  const selectView = (id: string) => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setRetryLoading(false);
    setViewId(id);
  };

  // Fakes a connection retry on the disconnected preview: show the splash
  // briefly, then fall back to disconnected.
  const startRetryTransition = () => {
    if (viewId !== "disconnected") return;
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);

    setRetryLoading(true);
    retryTimeoutRef.current = setTimeout(() => {
      setRetryLoading(false);
      retryTimeoutRef.current = null;
    }, DEV_RETRY_MS);
  };

  return {
    enabled,
    viewId,
    setViewId,
    bridgeCount,
    setBridgeCount,
    pairingKind,
    setPairingKind,
    retryLoading,
    selectView,
    startRetryTransition,
    groups: devViewGroups,
  };
};
