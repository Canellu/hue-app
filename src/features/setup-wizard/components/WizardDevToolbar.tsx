import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BridgeKind, WizardDevToolbarProps } from "@/types/setup-wizard";

const MIN_BRIDGE_COUNT = 1;
const MAX_BRIDGE_COUNT = 10;

export const WizardDevToolbar = ({
  value,
  groups,
  nextSteps,
  onSelectState,
  bridgeCount,
  onBridgeCountChange,
  pairingKind,
  onPairingKindChange,
}: WizardDevToolbarProps) => {
  const currentOption = groups
    .flatMap((group) => group.options)
    .find((option) => option.id === value);

  const showBridgeStepper =
    value === "selectBridge" &&
    bridgeCount !== undefined &&
    onBridgeCountChange !== undefined;

  const showPairingTabs =
    value === "pairing" &&
    pairingKind !== undefined &&
    onPairingKindChange !== undefined;

  return (
    <div className="fixed right-4 top-14 z-50 flex flex-col items-stretch gap-2">
      <Select
        value={value}
        onValueChange={(value) => {
          if (value) {
            onSelectState(value);
          }
        }}
      >
        <SelectTrigger aria-label="Dev view">
          <SelectValue>{currentOption?.label ?? value}</SelectValue>
        </SelectTrigger>
        <SelectContent align="end">
          {groups.map((group, groupIndex) => (
            <div
              key={group.label}
              className={
                groupIndex > 0
                  ? "mt-1 border-t border-border/70 pt-1"
                  : undefined
              }
            >
              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                {group.label}
              </div>
              {group.options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </div>
          ))}
        </SelectContent>
      </Select>

      {showBridgeStepper && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-background/80 px-2 py-1.5 shadow-sm backdrop-blur-md">
          <span className="px-0.5 text-xs text-muted-foreground">
            Bridges found
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              className="size-7"
              aria-label="Fewer bridges"
              disabled={bridgeCount <= MIN_BRIDGE_COUNT}
              onClick={() =>
                onBridgeCountChange(Math.max(MIN_BRIDGE_COUNT, bridgeCount - 1))
              }
            >
              <Minus className="size-4" />
            </Button>
            <span className="w-5 text-center text-sm tabular-nums">
              {bridgeCount}
            </span>
            <Button
              size="icon"
              variant="outline"
              className="size-7"
              aria-label="More bridges"
              disabled={bridgeCount >= MAX_BRIDGE_COUNT}
              onClick={() =>
                onBridgeCountChange(Math.min(MAX_BRIDGE_COUNT, bridgeCount + 1))
              }
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {showPairingTabs && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-background/80 px-2 py-1.5 shadow-sm backdrop-blur-md">
          <span className="px-0.5 text-xs text-muted-foreground">Bridge</span>
          <Tabs
            value={pairingKind}
            onValueChange={(next) => onPairingKindChange(next as BridgeKind)}
          >
            <TabsList size="default">
              <TabsTrigger value="original">Normal</TabsTrigger>
              <TabsTrigger value="pro">Pro</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      {nextSteps && (
        <div className="flex flex-col gap-1.5">
          <span className="px-0.5 text-xs text-muted-foreground">
            Proceed to
          </span>
          {nextSteps.map((step) => (
            <Button
              key={step.id}
              size="sm"
              variant="outline"
              className="justify-start bg-background/80 shadow-sm backdrop-blur-md"
              onClick={() => onSelectState(step.id)}
            >
              {step.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};
