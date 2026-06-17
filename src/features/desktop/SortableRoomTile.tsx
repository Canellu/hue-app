import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { RoomTile } from "./RoomTile";
import type { HueGroup, HueLight } from "./types";

interface SortableRoomTileProps {
  group: HueGroup;
  members: HueLight[];
  onOpenRoom: (id: string) => void;
  onGroupToggle: (group: HueGroup, nextOn: boolean) => void;
  onGroupBrightness: (group: HueGroup, pct: number) => void;
}

/**
 * Edit-mode wrapper that makes the entire room tile a sortable drag handle.
 * `data.containerId` lets the drag-end handler tell which group a tile started
 * in so it can be moved between sections.
 */
export const SortableRoomTile: React.FC<
  SortableRoomTileProps & { containerId: string }
> = ({ group, members, containerId, ...handlers }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: group.id, data: { type: "room", containerId } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    touchAction: "none",
    cursor: "grab",
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <RoomTile group={group} members={members} editing {...handlers} />
    </div>
  );
};
