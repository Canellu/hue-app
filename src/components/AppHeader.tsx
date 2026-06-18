import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { HomeGroupingMode } from "@/types/app-layout";
import {
  ArrowLeft,
  LayoutGrid,
  Plus,
  Settings as SettingsIcon,
} from "lucide-react";

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
}) => (
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
      <span className="font-heading text-3xl font-semibold">{greeting()}</span>
    )}

    <div className="flex items-center gap-2">
      {showEditLayout && !isEditLayoutMode && (
        <>
          {groupingMode === "custom" && (
            <>
              <Button
                variant="ghost"
                size="xl"
                className="gap-2"
                onClick={onEditLayout}
              >
                <LayoutGrid size={20} />
                Edit Layout
              </Button>
              <Divider />
            </>
          )}
          <Tabs
            value={groupingMode}
            onValueChange={(value) =>
              onGroupingModeChange(value as HomeGroupingMode)
            }
          >
            <TabsList size="xl" aria-label="Home grouping mode">
              <TabsTrigger value="rooms-first">Rooms</TabsTrigger>
              <TabsTrigger value="zones-first">Zones</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>
          </Tabs>
          <Divider />
        </>
      )}

      {showEditLayout &&
        (isEditLayoutMode ? (
          <>
            <Button
              variant="outline"
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
          </>
        ) : null)}

      {showSettings && !isEditLayoutMode && (
        <Button
          variant="ghost"
          size="icon-xl"
          aria-label="Settings"
          onClick={onOpenSettings}
        >
          <SettingsIcon size={26} />
        </Button>
      )}
    </div>
  </header>
);
