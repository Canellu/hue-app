import { useSortable } from "@dnd-kit/sortable";
import { CSS as DndCSS } from "@dnd-kit/utilities";

import { cn } from "@/lib/utils";

/**
 * Wraps a section item (light/scene/accessory card) so the whole card body is a
 * drag handle for reordering while editing. With the card's own live controls
 * muted in edit mode, the only gestures left are a stationary tap (multiselect,
 * handled by the section's click-capture) and a deliberate drag (reorder) — the
 * shared `DndContext` separates them via its pointer activation distance. No
 * grip glyph is drawn: the whole card is the handle, so the chrome is omitted.
 */
export const SortableItem: React.FC<{
  id: string;
  editing: boolean;
  transitionDisabled?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ id, editing, transitionDisabled = false, className, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !editing });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: DndCSS.Transform.toString(transform),
        transition: transitionDisabled ? undefined : transition,
        opacity: isDragging ? 0.45 : undefined,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={cn(
        editing && "relative cursor-grab touch-none active:cursor-grabbing",
        className,
      )}
      {...(editing ? { ...attributes, ...listeners } : {})}
    >
      {children}
    </div>
  );
};
