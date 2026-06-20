import { Card } from "@/components/ui/card";
import {
  TILE_HOVER_LIFT_CLASS,
  TILE_INTERACTION_TRANSITION_CLASS,
} from "@/lib/tile-theme";
import { UI_EASE_MS } from "@/lib/transitions";
import { cn } from "@/lib/utils";

/**
 * The shared visual shell for a scene tile — used by both the saved-scene cards
 * in the horizontal rail and the gallery preset cards in the picker. It pins the
 * circle visual to the top and a fixed two-line name box to the bottom, so a
 * one-line name sits vertically centered against where a two-line name would be.
 * Behavior (what a tap does, the play button, the lit/preview background) is
 * supplied by the caller — only the layout is shared.
 */
export const SceneTile: React.FC<{
  name: string;
  visual: React.ReactNode;
  onActivate: () => void;
  /** The tile paints its own palette as the background (drop-shadowed name). */
  activeBackground?: boolean;
  /** Stretch to fill a grid cell instead of the fixed rail width. */
  fullWidth?: boolean;
  /** Small label pinned to the top-right corner (e.g. brightness). */
  cornerLabel?: React.ReactNode;
  /** Small label pinned to the top-left corner (e.g. dynamic speed). */
  cornerLabelLeft?: React.ReactNode;
  /**
   * Interactive control pinned to the top-right corner, revealed on hover/focus
   * (e.g. the scene's overflow menu). Sits above {@link cornerLabel}.
   */
  topRightAction?: React.ReactNode;
  disabled?: boolean;
  ariaPressed?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({
  name,
  visual,
  onActivate,
  activeBackground = false,
  fullWidth = false,
  cornerLabel,
  cornerLabelLeft,
  topRightAction,
  disabled = false,
  ariaPressed,
  className,
  style,
}) => (
  <Card
    size="sm"
    role="button"
    tabIndex={disabled ? -1 : 0}
    aria-pressed={ariaPressed}
    aria-disabled={disabled || undefined}
    onClick={() => {
      if (!disabled) onActivate();
    }}
    onKeyDown={(event) => {
      if (disabled) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivate();
      }
    }}
    className={cn(
      "group relative shrink-0 cursor-pointer items-center justify-between rounded-[1.75rem] bg-tile px-4 py-5 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring",
      TILE_INTERACTION_TRANSITION_CLASS,
      TILE_HOVER_LIFT_CLASS,
      fullWidth ? "h-40 w-full" : "h-40 w-36",
      className,
    )}
    style={
      {
        "--tile-ease": `${UI_EASE_MS.tileBackground}ms`,
        ...style,
      } as React.CSSProperties
    }
  >
    {topRightAction != null && (
      <span className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {topRightAction}
      </span>
    )}
    {cornerLabel != null && (
      <span
        className={cn(
          "pointer-events-none absolute top-3 right-3 text-xs font-medium tabular-nums",
          activeBackground
            ? "text-foreground/80 drop-shadow"
            : "text-muted-foreground",
        )}
      >
        {cornerLabel}
      </span>
    )}
    {cornerLabelLeft != null && (
      <span
        className={cn(
          "pointer-events-none absolute top-3 left-3 flex items-center gap-0.5 text-xs font-medium tabular-nums",
          activeBackground
            ? "text-foreground/80 drop-shadow"
            : "text-muted-foreground",
        )}
      >
        {cornerLabelLeft}
      </span>
    )}
    <div className="mt-2 flex">{visual}</div>
    <span className="flex h-10 min-w-0 flex-col items-center justify-center">
      <span
        className={cn(
          "line-clamp-2 max-w-full text-base leading-tight font-medium break-words",
          activeBackground && "drop-shadow",
        )}
      >
        {name}
      </span>
    </span>
  </Card>
);
