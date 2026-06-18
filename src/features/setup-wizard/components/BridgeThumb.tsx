import { HueBridgeBody } from "@/components/HueBridgeIllustration";
import { HueBridgeProBody } from "@/components/HueBridgeProIllustration";
import type { BridgeKind } from "@/types/setup-wizard";

interface BridgeThumbProps {
  kind: BridgeKind;
}

export const BridgeThumb = ({ kind }: BridgeThumbProps) => (
  <div className="flex size-28 shrink-0 items-center justify-center">
    <div className="scale-[0.6]">
      {kind === "pro" ? <HueBridgeProBody /> : <HueBridgeBody />}
    </div>
  </div>
);
