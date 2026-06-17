import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  LayoutGrid,
  Plus,
  Settings as SettingsIcon,
} from "lucide-react";

interface AppHeaderProps {
  /** Back navigation handler; when provided the left side shows a back button. */
  onBack?: () => void;
  /** Whether the Settings gear is shown (hidden on the Settings route itself). */
  showSettings: boolean;
  onOpenSettings: () => void;
  /** Whether the Edit Layout control is available (Home screen only). */
  showEditLayout: boolean;
  isEditLayoutMode: boolean;
  onEditLayout: () => void;
  onCancelEditLayout: () => void;
  onSaveEditLayout: () => void;
  onCreateGroup: () => void;
}

/** Time-of-day greeting shown on the Home screen. */
const greeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
};

/** A short vertical rule separating groups of header controls. */
const Divider = () => <Separator orientation="vertical" className="mx-1 h-8" />;

/**
 * Minimal global header with a fixed height so swapping its contents (back
 * button vs. greeting, edit controls) never shifts the layout below it.
 */
export const AppHeader: React.FC<AppHeaderProps> = ({
  onBack,
  showSettings,
  onOpenSettings,
  showEditLayout,
  isEditLayoutMode,
  onEditLayout,
  onCancelEditLayout,
  onSaveEditLayout,
  onCreateGroup,
}) => (
  <header className="flex h-20 shrink-0 items-center justify-between px-6">
    {onBack ? (
      <Button variant="ghost" size="icon-xl" aria-label="Back" onClick={onBack}>
        <ArrowLeft size={26} />
      </Button>
    ) : (
      <span className="font-heading text-3xl font-semibold">{greeting()}</span>
    )}

    <div className="flex items-center gap-2">
      {showEditLayout &&
        (isEditLayoutMode ? (
          <>
            <Button
              variant="outline"
              size="xl"
              className="gap-1.5"
              onClick={onCreateGroup}
            >
              <Plus size={20} />
              Create New Group
            </Button>
            <Divider />
            <Button variant="ghost" size="xl" onClick={onCancelEditLayout}>
              Cancel
            </Button>
            <Button size="xl" onClick={onSaveEditLayout}>
              Save
            </Button>
          </>
        ) : (
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
            {showSettings && <Divider />}
          </>
        ))}

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
