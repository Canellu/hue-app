import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Radio } from "lucide-react";

export const SyncIndicator: React.FC<{
  syncedCount: number;
  totalCount: number;
  showCount?: boolean;
  className?: string;
}> = ({ syncedCount, totalCount, showCount = false, className }) => {
  // "light sync", not "the Sync Box": the stream may be owned by another app
  // (e.g. the official Hue Sync app) and the lock applies either way.
  const label =
    syncedCount === 1 && totalCount === 1
      ? "Controlled by light sync"
      : syncedCount === totalCount
        ? `All ${totalCount} ${totalCount === 1 ? "light is" : "lights are"} controlled by light sync`
        : `${syncedCount} of ${totalCount} lights are controlled by light sync`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              role="status"
              aria-label={label}
              className={cn(
                // Fixed, theme-independent colors: the badge always overlays a
                // color-tinted (often lit) tile, so it must keep the same look
                // in light and dark mode instead of inheriting palette tokens
                // (which flip and can go icon-on-same-tone — invisible).
                "inline-flex h-5 min-w-5 items-center justify-center gap-1 rounded-full border border-black/15 bg-white/85 px-1 text-[10px] font-semibold text-neutral-900 shadow-sm backdrop-blur-sm",
                className,
              )}
            >
              <Radio className="size-3" />
              {showCount && (
                <span>
                  {syncedCount}/{totalCount}
                </span>
              )}
            </span>
          }
        />
        <TooltipContent side="top" className="max-w-64">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
