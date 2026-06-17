import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
  onDeleteGroup: (groupId: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
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
  onDeleteGroup,
  onRenameGroup,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: group.id, data: { type: "group" }, disabled: !editing });

  // Inline rename: clicking the name (while editing) swaps it for an input
  // prefilled with the current name. The new value is written to the draft
  // layout immediately (on blur/Enter) but only persisted when Save is pressed.
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(group.name);

  const startRename = () => {
    setDraftName(group.name);
    setRenaming(true);
  };

  const commitRename = () => {
    const next = draftName.trim();
    if (next && next !== group.name) onRenameGroup(group.id, next);
    setRenaming(false);
  };

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
        // Padding + a transparent border are always reserved so toggling edit
        // mode only changes color/background — never the layout (no shift).
        "flex flex-col gap-3 rounded-2xl border border-transparent p-4 transition-colors",
        editing && "border-dashed border-border bg-muted/10",
      )}
    >
      <header className="flex items-center">
        {/* Drag handle animates in/out so it never reserves layout space. */}
        <AnimatePresence initial={false}>
          {editing && (
            <motion.button
              key="grip"
              type="button"
              initial={{ width: 0, opacity: 0, marginRight: 0 }}
              animate={{ width: 28, opacity: 1, marginRight: 8 }}
              exit={{ width: 0, opacity: 0, marginRight: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="flex h-7 shrink-0 cursor-grab items-center justify-center overflow-hidden rounded-md text-muted-foreground hover:bg-muted"
              aria-label={`Reorder ${group.name}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical size={18} />
            </motion.button>
          )}
        </AnimatePresence>

        {editing && renaming ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenaming(false);
            }}
            aria-label={`Rename ${group.name}`}
            className="font-heading min-w-0 rounded-md border border-border bg-background px-2 py-0.5 text-lg font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        ) : editing ? (
          <button
            type="button"
            onClick={startRename}
            className="font-heading rounded-md px-2 py-0.5 text-lg font-medium hover:bg-muted"
            title="Rename group"
          >
            {group.name}
          </button>
        ) : (
          <h2 className="font-heading text-lg font-medium">{group.name}</h2>
        )}

        <span className="ml-2 text-sm text-muted-foreground">
          {rooms.length} {rooms.length === 1 ? "space" : "spaces"}
        </span>
        {editing && rooms.length === 0 && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto text-muted-foreground hover:text-destructive"
            aria-label={`Delete ${group.name}`}
            title="Delete group"
            onClick={() => onDeleteGroup(group.id)}
          >
            <Trash2 size={16} />
          </Button>
        )}
      </header>

      <SortableContext
        items={group.roomIds}
        strategy={rectSortingStrategy}
        disabled={!editing}
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {rooms.length === 0 ? (
            <div
              className={cn(
                // min-h matches one RoomTile so the grid doesn't shift when a
                // space is dropped in and replaces this placeholder.
                "col-span-full flex min-h-36 items-center justify-center rounded-2xl border border-transparent text-sm text-muted-foreground",
                editing && "border-dashed border-border/70 bg-muted/20",
              )}
            >
              {editing ? "Drag spaces here" : "No spaces in this group"}
            </div>
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
