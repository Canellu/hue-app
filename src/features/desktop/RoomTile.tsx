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
        "gap-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        !editing && "cursor-pointer hover:bg-accent/40",
        group.anyOn && "ring-primary/40",
      )}
    >
      <div className="flex items-center gap-3 px-4">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full ring-1 ring-foreground/10",
            tile.active ? "text-white" : "bg-muted text-muted-foreground",
          )}
          style={tile.active && tile.background ? { background: tile.background } : undefined}
        >
          <Icon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{group.name}</p>
          <p className="text-xs text-muted-foreground">
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

      <div className="px-4" onClick={(e) => e.stopPropagation()}>
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
