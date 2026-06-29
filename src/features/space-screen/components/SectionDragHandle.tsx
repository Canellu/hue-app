import { useSortable } from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createContext, useContext } from "react";

/**
 * Passes a section's reorder drag handle (from the wrapping `useSortable`) down
 * to wherever that section renders its title, so the grip can sit inline with
 * the heading and push it over — instead of floating in the margin. The provider
 * lives on the sortable wrapper; `<SectionGrip />` reads it next to each title.
 */
type SectionGripValue = Pick<
  ReturnType<typeof useSortable>,
  "attributes" | "listeners"
> & {
  editing: boolean;
  label: string;
};

const SectionGripContext = createContext<SectionGripValue | null>(null);

export const SectionGripProvider = SectionGripContext.Provider;

/**
 * Inline reorder handle for a space section. It expands into the heading row
 * when edit mode starts, matching the Home custom-layout section handles.
 */
export const SectionGrip: React.FC = () => {
  const ctx = useContext(SectionGripContext);
  if (!ctx) return null;
  const { editing, label, attributes, listeners } = ctx;
  return (
    <AnimatePresence initial={editing}>
      {editing && (
        <motion.button
          key="grip"
          type="button"
          initial={{ width: 0, opacity: 0, marginRight: 0 }}
          animate={{ width: 28, opacity: 1, marginRight: 8 }}
          exit={{ width: 0, opacity: 0, marginRight: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="flex h-7 shrink-0 cursor-grab items-center justify-center overflow-hidden rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
          aria-label={label}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={18} />
        </motion.button>
      )}
    </AnimatePresence>
  );
};
