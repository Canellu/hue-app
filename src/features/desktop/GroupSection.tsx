import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { RoomTile } from "./RoomTile";
import { SortableRoomTile } from "./SortableRoomTile";
import type { CustomGroup } from "./useDashboardLayout";
import type { HueGroup, HueLight } from "./types";

interface GroupSectionProps {
  group: CustomGroup;
  /** Live room data resolved + ordered to match `group.roomIds`. */
  rooms: HueGroup[];
  lights: HueLight[];
  editing: boolean;
  onOpenRoom: (id: string) => void;
  onGroupToggle: (group: HueGroup, nextOn: boolean) => void;
  onGroupBrightness: (group: HueGroup, pct: number) => void;
}

/**
 * One dashboard category: a header plus a grid of its room/zone tiles. The
 * section is itself sortable (whole-section reordering) and doubles as the
 * droppable container that accepts tiles dragged in from other sections.
 */
export const GroupSection: React.FC<GroupSectionProps> = ({
  group,
  rooms,
  lights,
  editing,
  onOpenRoom,
  onGroupToggle,
  onGroupBrightness,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: group.id, data: { type: "group" }, disabled: !editing });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const membersOf = (room: HueGroup): HueLight[] => {
    const ids = new Set(room.lightIds);
    return lights.filter((light) => ids.has(light.id));
  };

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex flex-col gap-3",
        editing && "rounded-2xl border border-dashed border-border p-4",
      )}
    >
      <header className="flex items-center gap-2">
        {editing && (
          <button
            type="button"
            className="flex size-7 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            aria-label={`Reorder ${group.name}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={18} />
          </button>
        )}
        <h2 className="font-heading text-lg font-medium">{group.name}</h2>
        <span className="text-sm text-muted-foreground">
          {rooms.length} {rooms.length === 1 ? "space" : "spaces"}
        </span>
      </header>

      <SortableContext
        items={group.roomIds}
        strategy={rectSortingStrategy}
        disabled={!editing}
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {rooms.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {editing ? "Drag spaces here" : "No spaces in this group"}
            </p>
          ) : editing ? (
            rooms.map((room) => (
              <SortableRoomTile
                key={room.id}
                group={room}
                members={membersOf(room)}
                containerId={group.id}
                onOpenRoom={onOpenRoom}
                onGroupToggle={onGroupToggle}
                onGroupBrightness={onGroupBrightness}
              />
            ))
          ) : (
            rooms.map((room) => (
              <RoomTile
                key={room.id}
                group={room}
                members={membersOf(room)}
                onOpenRoom={onOpenRoom}
                onGroupToggle={onGroupToggle}
                onGroupBrightness={onGroupBrightness}
              />
            ))
          )}
        </div>
      </SortableContext>
    </section>
  );
};
