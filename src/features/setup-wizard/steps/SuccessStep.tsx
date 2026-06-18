import type { SuccessStepProps } from "@/types/setup-wizard";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BridgeStatus } from "@/components/BridgeStatus";
import { bridgeKind } from "../utils/bridge";

export const SuccessStep = ({
  selectedBridge,
  isBusy,
  onEnterHome,
}: SuccessStepProps) => (
  <>
    <BridgeStatus kind={bridgeKind(selectedBridge?.modelId)} status="success" />
    <div className="flex flex-col gap-3">
      <h1 className="font-heading text-4xl font-semibold">Connected!</h1>
      <p className="text-lg text-muted-foreground">
        Your Hue Bridge is ready to use.
      </p>
    </div>
    <Button type="button" size="xl" onClick={onEnterHome} disabled={isBusy}>
      {isBusy ? (
        <>
          <Loader2 className="animate-spin" />
          Getting things ready...
        </>
      ) : (
        "Let's Go"
      )}
    </Button>
  </>
);
