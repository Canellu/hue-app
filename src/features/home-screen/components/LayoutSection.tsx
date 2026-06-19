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
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SpaceTile } from "./SpaceTile";
import { SortableSpaceTile } from "./SortableSpaceTile";
import type { HomeLayoutSection } from "@/types/app-layout";
import type { HueLight, HueRoomZone } from "@/types/hue";

interface LayoutSectionProps {
  section: HomeLayoutSection;
  /** Live room/zone data resolved + ordered to match `section.spaceIds`. */
  roomZones: HueRoomZone[];
  lights: HueLight[];
  editing: boolean;
  onOpenSpace: (id: string) => void;
  onRoomZoneToggle: (roomZone: HueRoomZone, nextOn: boolean) => void;
  onRoomZoneBrightness: (roomZone: HueRoomZone, pct: number) => void;
  onDeleteSection: (sectionId: string) => void;
  onRenameSection: (sectionId: string, name: string) => void;
}

/**
 * One local Home layout section: a header plus a grid of room/zone tiles. The
 * section is itself sortable (whole-section reordering) and doubles as the
 * droppable container that accepts tiles dragged in from other sections.
 */
export const LayoutSection: React.FC<LayoutSectionProps> = ({
  section,
  roomZones,
  lights,
  editing,
  onOpenSpace,
  onRoomZoneToggle,
  onRoomZoneBrightness,
  onDeleteSection,
  onRenameSection,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: section.id,
    data: { type: "section" },
    disabled: !editing,
  });

  // Inline rename: clicking the name (while editing) swaps it for an input
  // prefilled with the current name. The new value is written to the draft
  // layout immediately (on blur/Enter) but only persisted when Save is pressed.
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(section.name);

  const startRename = () => {
    setDraftName(section.name);
    setRenaming(true);
  };

  const commitRename = () => {
    const next = draftName.trim();
    if (next && next !== section.name) onRenameSection(section.id, next);
    setRenaming(false);
  };

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const membersOf = (roomZone: HueRoomZone): HueLight[] => {
    const ids = new Set(roomZone.lightIds);
    return lights.filter((light) => ids.has(light.id));
  };

  const countText = String(roomZones.length);

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
              aria-label={`Reorder ${section.name}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical size={18} />
            </motion.button>
          )}
        </AnimatePresence>

        {editing && renaming ? (
          <Input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenaming(false);
            }}
            aria-label={`Rename ${section.name}`}
            size="lg"
            className="font-heading w-auto min-w-0 max-w-xs text-lg font-medium"
          />
        ) : editing ? (
          <button
            type="button"
            onClick={startRename}
            className="font-heading rounded-md px-2 py-0.5 text-lg font-medium hover:bg-muted"
            title="Rename section"
          >
            {section.name}
          </button>
        ) : (
          <h2 className="font-heading text-lg font-medium">{section.name}</h2>
        )}

        <span className="ml-2 text-sm text-muted-foreground">{countText}</span>
        {editing && roomZones.length === 0 && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto text-muted-foreground hover:text-destructive"
            aria-label={`Delete ${section.name}`}
            title="Delete section"
            onClick={() => onDeleteSection(section.id)}
          >
            <Trash2 size={16} />
          </Button>
        )}
      </header>

      <SortableContext
        items={section.spaceIds}
        strategy={rectSortingStrategy}
        disabled={!editing}
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
          {roomZones.length === 0 ? (
            <div
              className={cn(
                // min-h matches one SpaceTile so the grid doesn't shift when a
                // space is dropped in and replaces this placeholder.
                "col-span-full flex min-h-36 items-center justify-center rounded-2xl border border-transparent text-sm text-muted-foreground",
                editing && "border-dashed border-border/70 bg-muted/20",
              )}
            >
              {editing ? "Drag spaces here" : "No spaces in this group"}
            </div>
          ) : editing ? (
            roomZones.map((roomZone) => (
              <SortableSpaceTile
                key={roomZone.id}
                roomZone={roomZone}
                members={membersOf(roomZone)}
                containerId={section.id}
                onOpenSpace={onOpenSpace}
                onRoomZoneToggle={onRoomZoneToggle}
                onRoomZoneBrightness={onRoomZoneBrightness}
              />
            ))
          ) : (
            roomZones.map((roomZone) => (
              <SpaceTile
                key={roomZone.id}
                roomZone={roomZone}
                members={membersOf(roomZone)}
                onOpenSpace={onOpenSpace}
                onRoomZoneToggle={onRoomZoneToggle}
                onRoomZoneBrightness={onRoomZoneBrightness}
              />
            ))
          )}
        </div>
      </SortableContext>
    </section>
  );
};
