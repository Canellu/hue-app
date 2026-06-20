import { PacedSlider } from "@/components/PacedSlider";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { roomZoneTileColor } from "@/features/space-screen/utils/color-state";
import { LIGHT_THEME } from "@/lib/tile-theme";
import { UI_EASE_MS } from "@/lib/transitions";
import { cn } from "@/lib/utils";
import type { HueLight, HueRoomZone } from "@/types/hue";
import { getRoomZoneIcon } from "./room-zone-icons";

type ControlCommitPhase = "live" | "final";

interface SpaceTileProps {
  roomZone: HueRoomZone;
  members: HueLight[];
  /** When true the tile is a passive drag target: controls/nav are disabled. */
  editing?: boolean;
  onOpenSpace: (id: string) => void;
  onRoomZoneToggle: (roomZone: HueRoomZone, nextOn: boolean) => void;
  onRoomZoneBrightness: (
    roomZone: HueRoomZone,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
}

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
        "justify-center gap-6 transition-colors duration-(--tile-ease) ease-out",
        !editing && "cursor-pointer",
        !editing && !tile.active && "hover:bg-accent/70",
      )}
      style={
        {
          ...LIGHT_THEME,
          "--tile-ease": `${UI_EASE_MS.tileBackground}ms`,
          ...(tile.active && tile.background
            ? { background: tile.background }
            : null),
        } as React.CSSProperties
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
        <PacedSlider
          value={roomZone.anyOn ? Math.max(1, pct) : 1}
          min={1}
          disabled={controlsDisabled}
          ariaLabel={`${roomZone.name} brightness`}
          className="w-full **:data-[slot=slider-thumb]:size-5 **:data-[slot=slider-track]:bg-foreground/35 **:data-[slot=slider-range]:bg-transparent **:data-[slot=slider-range]:bg-linear-to-r **:data-[slot=slider-range]:from-white/50 **:data-[slot=slider-range]:to-white/90"
          size="default"
          isGroup
          onCommit={(value, phase) =>
            onRoomZoneBrightness(roomZone, value, phase)
          }
        />
      </div>
    </Card>
  );
};
