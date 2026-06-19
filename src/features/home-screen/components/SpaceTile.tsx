import { DebouncedSlider } from "@/components/DebouncedSlider";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { roomZoneTileColor } from "@/features/space-screen/utils/color-state";
import { cn } from "@/lib/utils";
import type { HueLight, HueRoomZone } from "@/types/hue";
import { getRoomZoneIcon } from "./room-zone-icons";

interface SpaceTileProps {
  roomZone: HueRoomZone;
  members: HueLight[];
  /** When true the tile is a passive drag target: controls/nav are disabled. */
  editing?: boolean;
  onOpenSpace: (id: string) => void;
  onRoomZoneToggle: (roomZone: HueRoomZone, nextOn: boolean) => void;
  onRoomZoneBrightness: (roomZone: HueRoomZone, pct: number) => void;
}

// Pin the tile to the light-theme palette (mirrors the `:root` tokens in
// App.css) so it renders identically in light and dark mode. Defining these
// custom properties on the card overrides the inherited `.dark` values for the
// whole subtree, including the Switch/Slider/Card child components.
const LIGHT_THEME = {
  "--background": "oklch(0.99 0 0)",
  "--foreground": "oklch(0.145 0 0)",
  "--card": "oklch(1 0 0)",
  "--card-foreground": "oklch(0.145 0 0)",
  "--muted": "oklch(0.97 0 0)",
  "--muted-foreground": "oklch(0.556 0 0)",
  "--accent": "oklch(0.97 0 0)",
  "--accent-foreground": "oklch(0.205 0 0)",
  "--border": "oklch(0.922 0 0)",
  "--input": "oklch(0.922 0 0)",
  "--ring": "oklch(0.708 0 0)",
} as React.CSSProperties;

/**
 * Presentational room/zone tile. Used directly on the Home screen and
 * wrapped by `SortableSpaceTile` while the layout is being edited.
 */
export const SpaceTile: React.FC<SpaceTileProps> = ({
  roomZone,
  members,
  editing = false,
  onOpenSpace,
  onRoomZoneToggle,
  onRoomZoneBrightness,
}) => {
  const Icon = getRoomZoneIcon(roomZone.class);
  const pct = roomZone.brightness ?? 0;
  const tile = roomZoneTileColor(members);
  const controlsDisabled = editing || !roomZone.groupedLightId;

  return (
    <Card
      size="sm"
      role={editing ? undefined : "button"}
      tabIndex={editing ? -1 : 0}
      aria-disabled={editing || undefined}
      onClick={editing ? undefined : () => onOpenSpace(roomZone.id)}
      onKeyDown={
        editing
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenSpace(roomZone.id);
              }
            }
      }
      className={cn(
        "justify-center gap-6 transition-colors",
        !editing && "cursor-pointer",
        !editing && !tile.active && "hover:bg-accent/70",
      )}
      style={
        tile.active && tile.background
          ? { ...LIGHT_THEME, background: tile.background }
          : LIGHT_THEME
      }
    >
      <div className="flex items-center gap-4 px-(--card-spacing)">
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center",
            tile.active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <Icon size={26} strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium">{roomZone.name}</p>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <Switch
            size="xl"
            className="dark:data-checked:bg-foreground/35 dark:data-unchecked:bg-input dark:**:data-[slot=switch-thumb]:data-unchecked:bg-background"
            checked={roomZone.anyOn}
            disabled={controlsDisabled}
            aria-label={`Toggle ${roomZone.name}`}
            onCheckedChange={(checked) => onRoomZoneToggle(roomZone, checked)}
          />
        </div>
      </div>

      <div className="px-(--card-spacing)" onClick={(e) => e.stopPropagation()}>
        <DebouncedSlider
          value={roomZone.anyOn ? pct : 0}
          disabled={controlsDisabled}
          ariaLabel={`${roomZone.name} brightness`}
          className="w-full **:data-[slot=slider-thumb]:size-5 **:data-[slot=slider-track]:bg-foreground/35 **:data-[slot=slider-range]:bg-transparent **:data-[slot=slider-range]:bg-linear-to-r **:data-[slot=slider-range]:from-white/50 **:data-[slot=slider-range]:to-white/90"
          size="default"
          debounceMs={300}
          onCommit={(value) => onRoomZoneBrightness(roomZone, value)}
        />
      </div>
    </Card>
  );
};
