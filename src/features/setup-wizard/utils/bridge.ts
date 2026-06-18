import type { BridgeKind } from "@/types/setup-wizard";

// BSB001 and BSB002 render as the classic white bridge. Newer BSB model ids
// render as the pro bridge. Unknown models fall back to the larger installed
// base: the classic bridge.
export const bridgeKind = (modelId?: string | null): BridgeKind => {
  const id = (modelId ?? "").toUpperCase();
  if (id === "BSB001" || id === "BSB002") return "original";
  if (id.startsWith("BSB")) return "pro";
  return "original";
};

export const bridgeKindLabel = (kind: BridgeKind) =>
  kind === "pro" ? "Hue Bridge Pro" : "Hue Bridge";
