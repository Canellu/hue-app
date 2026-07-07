import type {
  DiscoveredBridge,
  ErrorState,
  SelectBridgeState,
  SetupState,
} from "@/types/setup-wizard";

// Pure SetupState transitions shared by the real flow and the dev driver. No
// React, no side effects — just "given this state/input, what's the next
// state?". Keeping these here means the two drivers never duplicate routing
// logic, and new screens slot in by extending SetupState + these helpers.

/**
 * Whether a discovered bridge id refers to an already-paired one. Tolerant of
 * the short id mDNS exposes (a 6-char suffix of the full v2 bridge id), so a
 * bridge is still recognised as paired even if discovery couldn't recover its
 * full id from the public config.
 */
export const bridgeIdIsPaired = (
  bridgeId: string,
  pairedIds: string[],
): boolean => {
  const id = bridgeId.toUpperCase();
  return pairedIds.some((paired) => {
    const other = paired.toUpperCase();
    return (
      other === id ||
      (id.length >= 6 &&
        other.length >= 6 &&
        (other.endsWith(id) || id.endsWith(other)))
    );
  });
};

const isPaired = (
  bridge: DiscoveredBridge,
  alreadyPairedIds: string[],
): boolean => bridgeIdIsPaired(bridge.bridgeId, alreadyPairedIds);

/**
 * A select-bridge state. A lone, not-yet-paired bridge is pre-selected so it
 * only needs a Continue press (mirrors the hardware auto-select). Bridges
 * already paired on this device are recorded so they render as "already added"
 * and stay unselectable.
 */
export const bridgeSelectionState = (
  bridges: DiscoveredBridge[],
  alreadyPairedIds: string[] = [],
): SelectBridgeState => {
  const normalizedPaired = alreadyPairedIds.map((id) => id.toUpperCase());
  const lone = bridges.length === 1 ? bridges[0] : undefined;
  return {
    type: "selectBridge",
    bridges,
    selectedBridgeIp:
      lone && !isPaired(lone, normalizedPaired) ? lone.bridgeIp : "",
    alreadyPairedIds: normalizedPaired,
  };
};

/**
 * Applies a radio selection, leaving non-select states untouched. Selecting a
 * bridge that's already paired is a no-op — it can't be re-paired.
 */
export const selectBridgeInState = (
  state: SetupState,
  bridgeIp: string,
): SetupState => {
  if (state.type !== "selectBridge") return state;
  const target = state.bridges.find((bridge) => bridge.bridgeIp === bridgeIp);
  if (target && isPaired(target, state.alreadyPairedIds ?? [])) return state;
  return { ...state, selectedBridgeIp: bridgeIp };
};

/** The bridge the user has highlighted in a select-bridge state, if any. */
export const highlightedBridge = (
  state: SetupState,
): DiscoveredBridge | null =>
  state.type === "selectBridge"
    ? (state.bridges.find((b) => b.bridgeIp === state.selectedBridgeIp) ?? null)
    : null;

/**
 * Where "Try again" should land from an error: back to bridge selection when we
 * still know the discovered bridges and the failure happened during/after
 * pairing; otherwise restart discovery from scratch.
 */
export const retriesToBridgeSelection = (
  state: ErrorState,
  hasKnownBridges: boolean,
): boolean =>
  hasKnownBridges && (state.reason === "timeout" || state.reason === "pairing");
