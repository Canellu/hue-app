import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { overlaySelectionClassName } from "@/lib/selection-styles";
import { cn } from "@/lib/utils";
import type { SelectBridgeStepProps } from "@/types/setup-wizard";
import { BridgeThumb } from "../components/BridgeThumb";
import { bridgeKind, bridgeKindLabel } from "../utils/bridge";

const CARD_WIDTH = 192; // w-48
const GAP = 16; // gap-4
const MAX_CONTENT_WIDTH = 1152; // 72rem breakout cap
const VIEWPORT_FRACTION = 0.88; // never spill past the viewport

const getAvailableWidth = () =>
  typeof window === "undefined"
    ? MAX_CONTENT_WIDTH
    : Math.min(window.innerWidth * VIEWPORT_FRACTION, MAX_CONTENT_WIDTH);

// Pick the column count that fits the window, then back it off so the cards
// spread evenly across the fewest rows — avoiding a lone orphan on the last row
// (e.g. 6 bridges become 3+3 instead of 5+1).
const useBalancedColumns = (count: number) => {
  const [available, setAvailable] = useState(getAvailableWidth);

  useEffect(() => {
    const update = () => setAvailable(getAvailableWidth());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const maxColumns = Math.max(
    1,
    Math.floor((available + GAP) / (CARD_WIDTH + GAP)),
  );
  const columnsThatFit = Math.min(count, maxColumns);
  const rows = Math.ceil(count / columnsThatFit);
  return Math.max(1, Math.ceil(count / rows));
};

export const SelectBridgeStep = ({
  state,
  onSelectBridge,
  onContinue,
  onBack,
}: SelectBridgeStepProps) => {
  const isSingle = state.bridges.length === 1;
  const columns = useBalancedColumns(state.bridges.length);
  const rowWidth = columns * CARD_WIDTH + (columns - 1) * GAP;

  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-3xl font-semibold">
          {isSingle ? "Hue Bridge found" : "Choose your Hue Bridge"}
        </h1>
        <p className="text-lg text-muted-foreground">
          {isSingle
            ? "Press Continue to connect to this bridge."
            : "Select the bridge you want to connect to."}
        </p>
      </div>

      <div
        className="flex max-w-[88vw] flex-wrap justify-center gap-4"
        style={{ width: rowWidth }}
      >
        {state.bridges.map((bridge) => {
          const isSelected = bridge.bridgeIp === state.selectedBridgeIp;
          const kind = bridgeKind(bridge.modelId);

          return (
            <Card
              key={bridge.bridgeId}
              size="sm"
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              data-selected={isSelected ? "" : undefined}
              className={cn(
                "w-48 cursor-pointer border border-foreground/10 transition-[box-shadow,background-color]",
                "bg-[oklch(0.99_0_0)] hover:bg-[oklch(0.96_0_0)]",
                "dark:bg-[oklch(0.24_0_0)] dark:hover:bg-[oklch(0.25_0_0)]",
                isSelected && overlaySelectionClassName,
              )}
              onClick={() => onSelectBridge(bridge.bridgeIp)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectBridge(bridge.bridgeIp);
                }
              }}
            >
              <CardContent className="flex min-w-0 flex-col items-center gap-2 text-center">
                <BridgeThumb kind={kind} />
                <span className="font-medium">{bridgeKindLabel(kind)}</span>
                <div className="flex w-full min-w-0 flex-col">
                  <span className="truncate text-sm text-muted-foreground">
                    {bridge.bridgeIp}
                  </span>
                  <span className="break-all text-xs text-muted-foreground">
                    {bridge.bridgeId}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex gap-3">
        <Button size="xl" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          size="xl"
          disabled={!state.selectedBridgeIp}
          onClick={onContinue}
        >
          Continue
        </Button>
      </div>
    </>
  );
};
