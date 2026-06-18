import { HueBridgeIllustration } from "@/components/HueBridgeIllustration";
import { HueBridgeProIllustration } from "@/components/HueBridgeProIllustration";
import { Button } from "@/components/ui/button";
import type { PairingStepProps } from "@/types/setup-wizard";
import { bridgeKind, bridgeKindLabel } from "../utils/bridge";

export const PairingStep = ({ state, onCancel }: PairingStepProps) => {
  const kind = bridgeKind(state.bridge.modelId);

  return (
    <>
      {kind === "pro" ? (
        <HueBridgeProIllustration pulse />
      ) : (
        <HueBridgeIllustration pulse />
      )}
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-3xl font-semibold">
          Press the round button on top of your {bridgeKindLabel(kind)}.
        </h1>
        <p className="text-lg text-muted-foreground">
          Waiting for the bridge to authorize this app…
        </p>
      </div>
      <Button size="xl" variant="outline" onClick={onCancel}>
        Back
      </Button>
    </>
  );
};
