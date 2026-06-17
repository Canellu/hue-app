import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { roomTileColor } from "./colorState";
import { DebouncedSlider } from "./DebouncedSlider";
import { getRoomIcon } from "./roomIcons";
import type { HueGroup, HueLight } from "./types";

interface RoomTileProps {
  group: HueGroup;
  members: HueLight[];
  /** When true the tile is a passive drag target: controls/nav are disabled. */
  editing?: boolean;
  onOpenRoom: (id: string) => void;
  onGroupToggle: (group: HueGroup, nextOn: boolean) => void;
  onGroupBrightness: (group: HueGroup, pct: number) => void;
}

/**
 * Presentational room/zone tile. Used directly on a static dashboard and
 * wrapped by `SortableRoomTile` while the layout is being edited.
 */
export const RoomTile: React.FC<RoomTileProps> = ({
  group,
  members,
  editing = false,
  onOpenRoom,
  onGroupToggle,
  onGroupBrightness,
}) => {
  const Icon = getRoomIcon(group.class);
  const on = members.filter((light) => light.isOn).length;
  const pct = group.brightness ?? 0;
  const tile = roomTileColor(members);
  const controlsDisabled = editing || !group.groupedLightId;

  return (
    <Card
      size="sm"
      role={editing ? undefined : "button"}
      tabIndex={editing ? -1 : 0}
      aria-disabled={editing || undefined}
      onClick={editing ? undefined : () => onOpenRoom(group.id)}
      onKeyDown={
        editing
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenRoom(group.id);
              }
            }
      }
      className={cn(
        "min-h-36 justify-center gap-4 bg-muted/45 outline-none ring-0 transition-colors focus-visible:ring-2 focus-visible:ring-ring dark:bg-muted/30",
        !editing && "cursor-pointer hover:bg-accent/70 dark:hover:bg-accent/50",
        group.anyOn && "bg-accent/80 dark:bg-accent/60",
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
          <p className="truncate text-base font-medium">{group.name}</p>
          <p className="text-sm text-muted-foreground">
            {group.lightCount} {group.lightCount === 1 ? "light" : "lights"}
            {on > 0 ? ` · ${on} on` : ""}
          </p>
        </div>
        <Switch
          checked={group.anyOn}
          disabled={controlsDisabled}
          aria-label={`Toggle ${group.name}`}
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={(checked) => onGroupToggle(group, checked)}
        />
      </div>

      <div className="px-5" onClick={(e) => e.stopPropagation()}>
        <DebouncedSlider
          value={group.anyOn ? pct : 0}
          disabled={controlsDisabled}
          ariaLabel={`${group.name} brightness`}
          debounceMs={300}
          onCommit={(value) => onGroupBrightness(group, value)}
        />
      </div>
    </Card>
  );
};
