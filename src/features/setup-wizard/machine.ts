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
 * A select-bridge state with a lone bridge pre-selected, so a single discovered
 * bridge only needs a Continue press (mirrors the hardware auto-select).
 */
export const bridgeSelectionState = (
  bridges: DiscoveredBridge[],
): SelectBridgeState => ({
  type: "selectBridge",
  bridges,
  selectedBridgeIp: bridges.length === 1 ? bridges[0].bridgeIp : "",
});

/** Applies a radio selection, leaving non-select states untouched. */
export const selectBridgeInState = (
  state: SetupState,
  bridgeIp: string,
): SetupState =>
  state.type === "selectBridge"
    ? { ...state, selectedBridgeIp: bridgeIp }
    : state;

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
