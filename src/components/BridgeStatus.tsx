import { HueBridgeIllustration } from "@/components/HueBridgeIllustration";
import { HueBridgeProIllustration } from "@/components/HueBridgeProIllustration";
import { cn } from "@/lib/utils";
import type { BridgeKind } from "@/types/setup-wizard";
import { CheckCircle2, XCircle } from "lucide-react";

interface BridgeStatusProps {
  kind: BridgeKind;
  status: "success" | "error";
}

export const BridgeStatus = ({ kind, status }: BridgeStatusProps) => {
  const isError = status === "error";
  const Illustration =
    kind === "pro" ? HueBridgeProIllustration : HueBridgeIllustration;

  return (
    <div className="relative flex items-center justify-center">
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
