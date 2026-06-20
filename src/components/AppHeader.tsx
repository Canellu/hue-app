import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { HomeGroupingMode } from "@/types/app-layout";
import {
  ArrowLeft,
  Pencil,
  Plus,
  Settings as SettingsIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/** Short labels for the current grouping mode, shown on the layout control. */
const GROUPING_MODE_LABELS: Record<HomeGroupingMode, string> = {
  "rooms-first": "Rooms first",
  "zones-first": "Zones first",
  custom: "Custom layout",
};

interface AppHeaderProps {
  /** Back navigation handler; when provided the left side shows a back button. */
  onBack?: () => void;
  title?: string;
  description?: string;
  /** Whether the Settings gear is shown (hidden on the Settings route itself). */
  showSettings: boolean;
  onOpenSettings: () => void;
  /** Whether the Edit Layout control is available (Home screen only). */
  showEditLayout: boolean;
  groupingMode: HomeGroupingMode;
  onGroupingModeChange: (mode: HomeGroupingMode) => void;
  isEditLayoutMode: boolean;
  onEditLayout: () => void;
  onCancelEditLayout: () => void;
  onSaveEditLayout: () => void;
  onCreateSection: () => void;
}

/** Time-of-day greeting shown on the Home screen. */
const greeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
};

/** A short vertical rule separating clusters of header controls. */
const Divider = () => (
  <Separator orientation="vertical" className="mx-1 h-12" />
);

/**
 * Minimal global header with a fixed height so swapping its contents (back
 * button vs. greeting, edit controls) never shifts the layout below it.
 *
 * Pinned above the scroll area so it stays put while the page scrolls; content
 * fades out at the viewport's top edge just beneath it.
 */
export const AppHeader: React.FC<AppHeaderProps> = ({
  onBack,
  title,
  description,
  showSettings,
  onOpenSettings,
  showEditLayout,
  groupingMode,
  onGroupingModeChange,
  isEditLayoutMode,
  onEditLayout,
  onCancelEditLayout,
  onSaveEditLayout,
  onCreateSection,
}) => {
  const isCustomLayout = groupingMode === "custom";
  const reduceMotion = useReducedMotion();
  // Crossfade between the layout controls and the edit-mode controls so
  // entering/leaving edit mode swaps the cluster without a hard cut.
  const crossfade = {
    duration: reduceMotion ? 0 : 0.2,
    ease: "easeOut",
  } as const;

  return (
    <header className="flex h-20 shrink-0 items-center justify-between px-6">
      {onBack ? (
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon-xl"
            aria-label="Back"
            onClick={onBack}
          >
            <ArrowLeft size={26} />
          </Button>
          {title && (
            <div className="min-w-0">
              <h1 className="truncate font-heading text-2xl font-semibold">
                {title}
              </h1>
              {description && (
                <p className="truncate text-sm text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <span className="font-heading text-3xl font-semibold">
          {greeting()}
        </span>
      )}

      <div className="relative flex items-center justify-end gap-2">
        {/* The outgoing cluster is popped out of flow (popLayout) and fades
          out while the incoming one fades in, so edit mode swaps cleanly. */}
        <AnimatePresence initial={false} mode="wait">
          {isEditLayoutMode ? (
            <motion.div
              key="edit-controls"
              className="flex items-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={crossfade}
            >
              <Button
                variant="ghost"
                size="xl"
                className="gap-1.5"
                onClick={onCreateSection}
              >
                <Plus size={20} />
                Add New Section
              </Button>
              <Divider />
              <Button variant="ghost" size="xl" onClick={onCancelEditLayout}>
                Cancel
              </Button>
              <Button size="xl" onClick={onSaveEditLayout}>
                Save
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="view-controls"
              className="flex items-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={crossfade}
            >
              {showEditLayout && (
                <>
                  {/* In Custom layout, a standalone Edit button arranges the
                    hand-built layout; the select switches modes either way. */}
                  {isCustomLayout && (
                    <Button
                      variant="ghost"
                      size="xl"
                      className="gap-2"
                      onClick={onEditLayout}
                    >
                      <Pencil size={18} />
                      Edit
                    </Button>
                  )}
                  <Select
                    value={groupingMode}
                    onValueChange={(value) =>
                      onGroupingModeChange(value as HomeGroupingMode)
                    }
                  >
                    <SelectTrigger aria-label="Change layout">
                      <SelectValue>
                        {(value: HomeGroupingMode) =>
                          GROUPING_MODE_LABELS[value]
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent
                      alignItemWithTrigger={false}
                      className="min-w-56"
                    >
                      {/* Rooms/Zones only re-sort the auto-generated layout... */}
                      <SelectGroup>
                        <SelectLabel>Sort order</SelectLabel>
                        <SelectItem value="rooms-first">Rooms first</SelectItem>
                        <SelectItem value="zones-first">Zones first</SelectItem>
                      </SelectGroup>
                      <SelectSeparator />
                      {/* ...whereas Custom is a separate, hand-arranged layout. */}
                      <SelectGroup>
                        <SelectLabel>Arrange yourself</SelectLabel>
                        <SelectItem value="custom">Custom layout</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </>
              )}

              {showSettings && (
                <Button
                  variant="ghost"
                  size="icon-xl"
                  aria-label="Settings"
                  onClick={onOpenSettings}
                >
                  <SettingsIcon size={26} />
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
};
