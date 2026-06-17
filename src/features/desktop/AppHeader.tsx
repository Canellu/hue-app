import { LayoutGrid, Settings as SettingsIcon, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface AppHeaderProps {
  connected: boolean;
  onOpenSettings: () => void;
  /** Whether the Edit Layout control is available (Home screen only). */
  showEditLayout: boolean;
  isEditLayoutMode: boolean;
  onEditLayout: () => void;
  onCancelEditLayout: () => void;
  onSaveEditLayout: () => void;
}

/** Minimal global header: wordmark on the left, layout/connection/settings right. */
export const AppHeader: React.FC<AppHeaderProps> = ({
  connected,
  onOpenSettings,
  showEditLayout,
  isEditLayoutMode,
  onEditLayout,
  onCancelEditLayout,
  onSaveEditLayout,
}) => (
  <header className="flex items-center justify-between border-b border-border px-6 py-3">
    <span className="font-heading text-base font-medium">Hue Controller</span>
    <div className="flex items-center gap-2">
      {showEditLayout &&
        (isEditLayoutMode ? (
          <>
            <Button variant="ghost" size="sm" onClick={onCancelEditLayout}>
              Cancel
            </Button>
            <Button size="sm" onClick={onSaveEditLayout}>
              Save
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={onEditLayout}>
            <LayoutGrid size={16} />
            Edit Layout
          </Button>
        ))}

      {!isEditLayoutMode && (
        <>
          <Badge
            variant={connected ? "secondary" : "destructive"}
            className="gap-1"
            title={connected ? "Bridge connected" : "Bridge unreachable"}
          >
            {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
            {connected ? "Live" : "Offline"}
          </Badge>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Settings"
            onClick={onOpenSettings}
          >
            <SettingsIcon size={18} />
          </Button>
        </>
      )}
    </div>
  </header>
);
