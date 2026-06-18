import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { DebouncedSlider } from "@/components/DebouncedSlider";
import { roomZoneTileColor } from "@/features/space-screen/utils/color-state";
import { getRoomZoneIcon } from "./room-zone-icons";
import type { HueLight, HueRoomZone } from "@/types/hue";

interface SpaceTileProps {
  roomZone: HueRoomZone;
  members: HueLight[];
  /** When true the tile is a passive drag target: controls/nav are disabled. */
  editing?: boolean;
  onOpenSpace: (id: string) => void;
  onRoomZoneToggle: (roomZone: HueRoomZone, nextOn: boolean) => void;
  onRoomZoneBrightness: (roomZone: HueRoomZone, pct: number) => void;
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
  const on = members.filter((light) => light.isOn).length;
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
        "min-h-36 justify-center gap-4 border-border/70 bg-card outline-none ring-0 shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring dark:border-border/80 dark:bg-muted/55",
        !editing && "cursor-pointer hover:bg-accent/70 dark:hover:bg-accent/55",
        roomZone.anyOn && "bg-accent/80 dark:bg-accent/65",
      )}
    >
      <div className="flex items-center gap-4 px-5">
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-full ring-1 ring-foreground/10",
            tile.active ? "text-white" : "bg-muted text-muted-foreground",
          )}
          style={tile.active && tile.background ? { background: tile.background } : undefined}
        >
          <Icon size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium">{roomZone.name}</p>
          <p className="text-sm text-muted-foreground">
            {roomZone.lightCount}{" "}
            {roomZone.lightCount === 1 ? "light" : "lights"}
            {on > 0 ? ` · ${on} on` : ""}
          </p>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <Switch
            size="lg"
            checked={roomZone.anyOn}
            disabled={controlsDisabled}
            aria-label={`Toggle ${roomZone.name}`}
            onCheckedChange={(checked) => onRoomZoneToggle(roomZone, checked)}
          />
        </div>
      </div>

      <div className="px-5" onClick={(e) => e.stopPropagation()}>
        <DebouncedSlider
          value={roomZone.anyOn ? pct : 0}
          disabled={controlsDisabled}
          ariaLabel={`${roomZone.name} brightness`}
          size="lg"
          debounceMs={300}
          onCommit={(value) => onRoomZoneBrightness(roomZone, value)}
        />
      </div>
    </Card>
  );
};
