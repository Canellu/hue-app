import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ManageControls } from "@/features/widget-screen/components/ManageControls";
import type {
  WidgetSizeMode,
  WidgetThemeMode,
} from "@/features/widget-screen/types";
import type {
  WidgetConfigDraft,
  WidgetSummary,
} from "@/features/widget-screen/useWidgets";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  Monitor,
  MonitorSmartphone,
  Maximize2,
  Minimize2,
  Moon,
  Pin,
  PinOff,
  Sun,
  Scaling,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { FLAT_CARD } from "../constants";
import { DeleteResourceButton } from "./DeleteResourceButton";
import {
  SegmentedControl,
  type SegmentIcon,
} from "./SegmentedControl";
import { WidgetPositionPicker } from "./WidgetPositionPicker";

const THEME_MODES = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] satisfies Array<{
  value: WidgetThemeMode;
  label: string;
  icon: SegmentIcon;
}>;

const SIZE_MODES = [
  { value: "small", label: "Small", icon: Minimize2 },
  { value: "default", label: "Default", icon: Scaling },
  { value: "large", label: "Large", icon: Maximize2 },
] satisfies Array<{
  value: WidgetSizeMode;
  label: string;
  icon: SegmentIcon;
}>;

export const WidgetCard = ({
  widget,
  openRequest,
  onReopen,
  onClose,
  onRemove,
  onSetPinned,
  onSetAlwaysOnTop,
  onPreviewConfig,
  onSetConfig,
}: {
  widget: WidgetSummary;
  openRequest?: number;
  onReopen: (id: string) => void;
  onClose: (id: string) => void;
  onRemove: (id: string) => Promise<void>;
  onSetPinned: (id: string, pinned: boolean) => void;
  onSetAlwaysOnTop: (id: string, alwaysOnTop: boolean) => void;
  onPreviewConfig: (id: string, config: WidgetConfigDraft) => void;
  onSetConfig: (id: string, config: WidgetConfigDraft) => void;
}) => {
  const {
    widgetId,
    enabled,
    pinned,
    alwaysOnTop,
    themeMode,
    sizeMode,
    controls,
  } = widget;
  const [configOpen, setConfigOpen] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [draft, setDraft] = useState<WidgetConfigDraft | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const count = controls.length;
  const currentConfig = useMemo<WidgetConfigDraft>(
    () => ({
      controls,
      themeMode,
      sizeMode,
    }),
    [controls, sizeMode, themeMode],
  );
  const activeConfig = draft ?? currentConfig;

  useEffect(() => {
    if (!configOpen || !draft) return;
    onPreviewConfig(widgetId, draft);
  }, [configOpen, draft, onPreviewConfig, widgetId]);

  useEffect(() => {
    if (openRequest === undefined) return;
    setDraft(currentConfig);
    setConfigOpen(true);
  }, [currentConfig, openRequest]);

  const updateDraft = (next: Partial<WidgetConfigDraft>) =>
    setDraft((current) => ({ ...(current ?? currentConfig), ...next }));

  const openConfigure = () => {
    setDraft(currentConfig);
    setConfigOpen(true);
  };

  const hasChanges =
    draft !== null && JSON.stringify(draft) !== JSON.stringify(currentConfig);

  // Closes the panel (used by the header toggle); discards any unsaved edits
  // and rolls the live preview back to the saved config.
  const closeConfigure = () => {
    onPreviewConfig(widgetId, currentConfig);
    setDraft(null);
    setConfigOpen(false);
  };

  // Reverts edits back to the saved config but keeps the panel open.
  const resetConfigure = () => {
    onPreviewConfig(widgetId, currentConfig);
    setDraft(null);
  };

  // Persists the draft but keeps the panel open. Once the parent props reflect
  // the saved values, `hasChanges` flips back to false and Save disables again.
  const saveConfigure = () => {
    if (draft) onSetConfig(widgetId, draft);
  };

  const toggleConfigure = () => {
    if (!configOpen) {
      openConfigure();
    } else if (hasChanges) {
      setConfirmCloseOpen(true);
    } else {
      closeConfigure();
    }
  };

  return (
    <Card
      className={cn(
        "gap-0 py-0",
        // Active widgets read as "lifted" off the list with real elevation;
        // closed ones stay as quiet flat rows.
        enabled
          ? "border-border bg-card shadow-sm ring-0"
          : FLAT_CARD,
      )}
    >
      <div
        className={cn(
          "flex items-center transition-colors hover:bg-[oklch(0.95_0_0)] dark:hover:bg-[oklch(0.30_0_0)]",
          configOpen &&
            "bg-[oklch(0.97_0_0)] dark:bg-[oklch(0.28_0_0)]",
        )}
      >
        <button
          type="button"
          onClick={toggleConfigure}
          aria-expanded={configOpen}
          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
        >
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-lg border",
              enabled
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground",
            )}
          >
            <MonitorSmartphone size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {widget.title ?? "Hue Widget"}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {count === 0
                ? "No controls"
                : `${count} control${count > 1 ? "s" : ""}`}
            </span>
          </span>

          {pinned ? (
            <Pin size={12} className="shrink-0 text-muted-foreground" />
          ) : null}
        </button>
        <button
          type="button"
          aria-label={enabled ? "Deactivate widget" : "Activate widget"}
          className={cn(
            "mr-2 flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-75",
            enabled
              ? "bg-(--success-surface) text-(--success-text)"
              : "bg-muted text-muted-foreground",
          )}
          onClick={() => enabled ? onClose(widgetId) : onReopen(widgetId)}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              enabled ? "bg-success" : "bg-muted-foreground",
            )}
          />
          {enabled ? "Active" : "Inactive"}
        </button>
        <button
          type="button"
          onClick={toggleConfigure}
          aria-label={
            configOpen ? "Close widget settings" : "Open widget settings"
          }
          aria-expanded={configOpen}
          className="mr-4 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground"
        >
          <ChevronDown
            size={16}
            className={cn(
              "transition-transform",
              configOpen && "rotate-180",
            )}
          />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {configOpen ? (
          <motion.div
            key="configuration"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: prefersReducedMotion ? 0 : 0.2,
              ease: [0.4, 0, 0.2, 1],
            }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/60 px-4 py-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">
                Show this widget in its own window.
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={(checked) =>
                checked ? onReopen(widgetId) : onClose(widgetId)
              }
              aria-label="Active"
            />
          </div>

          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Pinned</p>
              <p className="text-xs text-muted-foreground">
                Lock this widget to its current position.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-lg"
              aria-label={pinned ? "Unpin widget" : "Pin widget"}
              onClick={() => onSetPinned(widgetId, !pinned)}
            >
              {pinned ? <PinOff /> : <Pin />}
              {pinned ? "Unpin" : "Pin"}
            </Button>
          </div>

          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Always on top</p>
              <p className="text-xs text-muted-foreground">
                Keep this widget floating above other windows.
              </p>
            </div>
            <Switch
              checked={alwaysOnTop}
              onCheckedChange={(checked) => onSetAlwaysOnTop(widgetId, checked)}
              aria-label="Always on top"
            />
          </div>

          <WidgetPositionPicker widgetId={widgetId} />

          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-xs text-muted-foreground">
                Choose the widget's light or dark appearance.
              </p>
            </div>
            <SegmentedControl
              value={activeConfig.themeMode}
              onValueChange={(value) =>
                updateDraft({ themeMode: value as WidgetThemeMode })
              }
              ariaLabel="Widget theme"
              options={THEME_MODES}
              layoutId={`widget-theme-mode-pill-${widgetId}`}
            />
          </div>

          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Widget size</p>
              <p className="text-xs text-muted-foreground">
                Adjust the dimensions of the widget controls.
              </p>
            </div>
            <SegmentedControl
              value={activeConfig.sizeMode}
              onValueChange={(value) =>
                updateDraft({ sizeMode: value as WidgetSizeMode })
              }
              ariaLabel="Widget size"
              options={SIZE_MODES}
              layoutId={`widget-size-mode-pill-${widgetId}`}
            />
          </div>

          <ManageControls
            controls={activeConfig.controls}
            onChange={(controls) => updateDraft({ controls })}
          />

          <div className="mt-5 flex justify-end gap-2 border-t border-border/60 pt-4">
            <span className="mr-auto">
              <DeleteResourceButton
                label="widget"
                description="This permanently removes the widget and its saved controls. This can't be undone."
                tooltip="Delete widget"
                onDelete={() => onRemove(widgetId)}
              />
            </span>
            <Button
              type="button"
              variant="ghost"
              onClick={resetConfigure}
              disabled={!hasChanges}
            >
              Reset
            </Button>
            <Button type="button" onClick={saveConfigure} disabled={!hasChanges}>
              Save
            </Button>
          </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AlertDialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
        <AlertDialogContent>
          <AlertDialogCancel
            variant="ghost"
            size="icon"
            aria-label="Keep editing"
            className="absolute top-4 right-4 size-8 rounded-full text-muted-foreground"
          >
            <X size={16} />
          </AlertDialogCancel>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this widget. Closing now will discard
              them and revert to the last saved configuration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmCloseOpen(false);
                closeConfigure();
              }}
            >
              Discard
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                saveConfigure();
                setConfirmCloseOpen(false);
                setConfigOpen(false);
              }}
            >
              Save changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
