import { HueSyncBoxIllustration } from "@/components/HueSyncBoxIllustration";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle } from "lucide-react";

interface SyncBoxStatusProps {
  status: "success" | "error";
}

// The Sync Box success/error treatment, mirroring BridgeStatus: the device
// illustration over a colored glow, with a check/cross badge tucked into the
// lower-right corner.
export const SyncBoxStatus = ({ status }: SyncBoxStatusProps) => {
  const isError = status === "error";

  return (
    <div className="relative flex items-center justify-center">
      <div
        className={cn(
          "pointer-events-none absolute h-40 w-72 rounded-full blur-2xl",
          isError
            ? "bg-red-500/70 dark:bg-red-500/30"
            : "bg-green-500/80 dark:bg-green-500/30",
        )}
      />

      <div className="relative">
        <HueSyncBoxIllustration />

        <span className="absolute bottom-2 right-2 flex items-center justify-center rounded-full bg-background p-0.5 shadow-md ring-1 ring-border">
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
