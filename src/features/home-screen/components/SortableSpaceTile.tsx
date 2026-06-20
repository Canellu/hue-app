import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SpaceTile } from "./SpaceTile";
import type { HueLight, HueRoomZone } from "@/types/hue";

type ControlCommitPhase = "live" | "final";

interface SortableSpaceTileProps {
  roomZone: HueRoomZone;
  members: HueLight[];
  onOpenSpace: (id: string) => void;
  onRoomZoneToggle: (roomZone: HueRoomZone, nextOn: boolean) => void;
  onRoomZoneBrightness: (
    roomZone: HueRoomZone,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
}

/**
 * Edit-mode wrapper that makes the entire room/zone tile a sortable drag handle.
 * `data.containerId` lets the drag-end handler tell which section a tile started
 * in so it can be moved between sections.
 */
export const SortableSpaceTile: React.FC<
  SortableSpaceTileProps & { containerId: string }
> = ({ roomZone, members, containerId, ...handlers }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: roomZone.id, data: { type: "space", containerId } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    touchAction: "none",
    cursor: "grab",
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <SpaceTile roomZone={roomZone} members={members} editing {...handlers} />
    </div>
  );
};
