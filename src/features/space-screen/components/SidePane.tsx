import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Pencil, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

interface SidePaneProps {
  /** Small uppercase label above the body (e.g. the product or scene kind). */
  eyebrow: string;
  /** Read-only body; the generic shell wraps it in a scroll area. */
  view: React.ReactNode;
  /** Resource id; switching it collapses edit mode back to the view. */
  resetKey: string;
  /** Pinned footer shown below the read-only view (hidden while editing). */
  viewFooter?: React.ReactNode;
  onClose: () => void;
  /** Accessible label for the pencil/edit toggle. */
  editLabel?: string;
  /**
   * Editing body, slid in from the right when the pencil is tapped. When
   * omitted the pencil is hidden and the pane is read-only. `active` mirrors the
   * editing state so the content can (re)seed its form; `exitEdit` slides back.
   */
  renderEdit?: (ctx: {
    active: boolean;
    exitEdit: () => void;
  }) => React.ReactNode;
}

/**
 * Generic inspector shell shared by the light and scene panes. Owns the header
 * (eyebrow, edit/close buttons, animated back arrow) and the two-pane view/edit
 * slider; callers supply the read-only `view` and an optional `renderEdit` body.
 */
export const SidePane: React.FC<SidePaneProps> = ({
  eyebrow,
  view,
  resetKey,
  viewFooter,
  onClose,
  editLabel = "Edit",
  renderEdit,
}) => {
  // Edit mode slides the editing pane in from the right and swaps the header's
  // action button for a back arrow, rather than opening a separate modal.
  const [editing, setEditing] = useState(false);

  // Reset back to the read-only view whenever a different resource is selected.
  useEffect(() => {
    setEditing(false);
  }, [resetKey]);

  const editable = renderEdit != null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 p-6 pb-4">
        <div className="flex min-w-0 items-center">
          {/* Back arrow animates in alongside the eyebrow in edit mode. */}
          <AnimatePresence initial={false}>
            {editing && (
              <motion.button
                key="back"
                type="button"
                initial={{ width: 0, opacity: 0, marginRight: 0 }}
                animate={{ width: 32, opacity: 1, marginRight: 4 }}
                exit={{ width: 0, opacity: 0, marginRight: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="-ml-1 flex h-8 shrink-0 items-center justify-center overflow-hidden rounded-md text-muted-foreground hover:bg-muted"
                aria-label="Back"
                onClick={() => setEditing(false)}
              >
                <ArrowLeft size={18} />
              </motion.button>
            )}
          </AnimatePresence>
          <p className="truncate font-heading text-xs font-medium text-muted-foreground">
            {eyebrow}
          </p>
        </div>
        <div className="-mr-1 flex shrink-0 gap-1">
          {editable && !editing && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={editLabel}
              onClick={() => setEditing(true)}
            >
              <Pencil />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className="flex h-full w-[200%] transition-transform duration-300 ease-out"
          style={{ transform: editing ? "translateX(-50%)" : "translateX(0)" }}
        >
          {/* View pane */}
          <div className="flex h-full w-1/2 shrink-0 flex-col" inert={editing}>
            <ScrollArea
              fade
              hideScrollbar
              className="min-h-0 flex-1"
              viewportClassName="px-6 pb-6"
            >
              {view}
            </ScrollArea>
            {viewFooter}
          </div>

          {/* Edit pane */}
          <div className="flex h-full w-1/2 shrink-0 flex-col" inert={!editing}>
            {renderEdit?.({
              active: editing,
              exitEdit: () => setEditing(false),
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
