import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ManageControls } from "@/features/widget-screen/components/ManageControls";
import {
  resolveLight,
  resolveRoomZone,
  ControlWizard,
  type ResolvedTarget,
} from "@/features/widget-screen/onboarding/ControlWizard";
import type {
  WidgetButtonAlignment,
  WidgetDensity,
  WidgetControl,
  WidgetStylePreset,
  WidgetThemeMode,
  WidgetTitleBarPosition,
} from "@/features/widget-screen/types";
import type {
  WidgetConfigDraft,
  WidgetSummary,
} from "@/features/widget-screen/useWidgets";
import { WIDGET_PRESET_LABELS } from "@/features/widget-screen/widgetShell";
import { cn } from "@/lib/utils";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import { ChevronDown, Lock, MonitorSmartphone, Pin, PinOff } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { FLAT_CARD } from "../constants";
import { DeleteResourceButton } from "./DeleteResourceButton";

type WizardState =
  | { mode: "add" }
  | { mode: "edit"; control: WidgetControl; resolved: ResolvedTarget };

const STYLE_PRESETS: WidgetStylePreset[] = ["windows11", "macos", "borderless"];
const THEME_MODES: Array<{ value: WidgetThemeMode; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
const DENSITIES: Array<{ value: WidgetDensity; label: string }> = [
  { value: "compact", label: "Single column" },
  { value: "expanded", label: "Two columns" },
];

const TITLE_BAR_POSITIONS: { value: WidgetTitleBarPosition; label: string }[] =
  [
    { value: "top", label: "Top" },
    { value: "bottom", label: "Bottom" },
    { value: "left", label: "Left" },
    { value: "right", label: "Right" },
  ];

/** Alignment labels read differently along a horizontal vs. vertical bar. */
const ALIGNMENT_LABELS: Record<
  "horizontal" | "vertical",
  Record<WidgetButtonAlignment, string>
> = {
  horizontal: { start: "Left", center: "Center", end: "Right" },
  vertical: { start: "Top", center: "Center", end: "Bottom" },
};

const BUTTON_ALIGNMENTS: WidgetButtonAlignment[] = ["start", "center", "end"];

const IconTooltip = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger
        render={<span className="inline-flex">{children}</span>}
      />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export const WidgetCard = ({
  widget,
  onReopen,
  onClose,
  onRemove,
  onSetPinned,
  onSetAlwaysOnTop,
  onPreviewConfig,
  onSetConfig,
}: {
  widget: WidgetSummary;
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
    stylePreset,
    themeMode,
    density,
    titleBarPosition,
    buttonAlignment,
    controls,
  } = widget;
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [draft, setDraft] = useState<WidgetConfigDraft | null>(null);
  const count = controls.length;
  const currentConfig = useMemo<WidgetConfigDraft>(
    () => ({
      controls,
      stylePreset,
      themeMode,
      density,
      titleBarPosition,
      buttonAlignment,
    }),
    [
      buttonAlignment,
      density,
      controls,
      stylePreset,
      themeMode,
      titleBarPosition,
    ],
  );
  const activeConfig = draft ?? currentConfig;
  const alignmentLabels =
    activeConfig.titleBarPosition === "left" ||
    activeConfig.titleBarPosition === "right"
      ? ALIGNMENT_LABELS.vertical
      : ALIGNMENT_LABELS.horizontal;

  useEffect(() => {
    if (!configOpen || !draft) return;
    onPreviewConfig(widgetId, draft);
  }, [configOpen, draft, onPreviewConfig, widgetId]);

  const updateDraft = (next: Partial<WidgetConfigDraft>) =>
    setDraft((current) => ({ ...(current ?? currentConfig), ...next }));

  const openConfigure = () => {
    setDraft(currentConfig);
    setConfigOpen(true);
  };

  const cancelConfigure = () => {
    onPreviewConfig(widgetId, currentConfig);
    setWizard(null);
    setDraft(null);
    setConfigOpen(false);
  };

  const saveConfigure = () => {
    if (draft) onSetConfig(widgetId, draft);
    setWizard(null);
    setDraft(null);
    setConfigOpen(false);
  };

  const openEdit = useCallback((control: WidgetControl) => {
    const { roomZones, lights } = useHueResourcesStore.getState();
    let resolved: ResolvedTarget;
    if (control.target.kind === "light") {
      const light = lights.find(
        (candidate) => candidate.id === control.target.id,
      );
      resolved = light
        ? resolveLight(light)
        : {
            target: control.target,
            name: control.label ?? "Light",
            dimmable: control.showBrightness,
            icon: null,
          };
    } else {
      const roomZone = roomZones.find(
        (candidate) => candidate.id === control.target.id,
      );
      resolved = roomZone
        ? resolveRoomZone(roomZone)
        : {
            target: control.target,
            name: control.label ?? "Space",
            dimmable: control.showBrightness,
            icon: null,
          };
    }
    setWizard({ mode: "edit", control, resolved });
  }, []);

  const completeWizard = (control: WidgetControl) => {
    const list = activeConfig.controls;
    const exists = list.some((existing) => existing.id === control.id);
    updateDraft({
      controls: exists
        ? list.map((existing) =>
            existing.id === control.id ? control : existing,
          )
        : [...list, control],
    });
    setWizard(null);
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
      <button
        type="button"
        onClick={() => (configOpen ? cancelConfigure() : openConfigure())}
        aria-expanded={configOpen}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
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
          <Lock size={12} className="shrink-0 text-muted-foreground" />
        ) : null}

        {enabled ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-(--success-surface) px-2.5 py-1 text-xs font-medium text-(--success-text)">
            <span className="size-1.5 rounded-full bg-success" />
            Active
          </span>
        ) : (
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            Inactive
          </span>
        )}

        <ChevronDown
          size={16}
          className={cn(
            "shrink-0 text-muted-foreground transition-transform",
            configOpen && "rotate-180",
          )}
        />
      </button>
      {configOpen ? (
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

          {enabled ? (
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Pinned</p>
                <p className="text-xs text-muted-foreground">
                  Lock this widget to its current position.
                </p>
              </div>
              <IconTooltip label={pinned ? "Unpin widget" : "Pin widget"}>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={pinned ? "Unpin widget" : "Pin widget"}
                  onClick={() => onSetPinned(widgetId, !pinned)}
                >
                  {pinned ? <Pin /> : <PinOff />}
                </Button>
              </IconTooltip>
            </div>
          ) : null}

          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Always on top</p>
              <p className="text-xs text-muted-foreground">
                {pinned
                  ? "Pinned widgets always stay on top."
                  : "Keep this widget floating above other windows."}
              </p>
            </div>
            <Switch
              checked={pinned || alwaysOnTop}
              disabled={pinned}
              onCheckedChange={(checked) => onSetAlwaysOnTop(widgetId, checked)}
              aria-label="Always on top"
            />
          </div>

          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Visual preset</p>
              <p className="text-xs text-muted-foreground">
                Uses the current app theme automatically.
              </p>
            </div>
            <Select
              value={activeConfig.stylePreset}
              onValueChange={(value) =>
                updateDraft({ stylePreset: value as WidgetStylePreset })
              }
            >
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {STYLE_PRESETS.map((preset) => (
                  <SelectItem key={preset} value={preset}>
                    {WIDGET_PRESET_LABELS[preset]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-xs text-muted-foreground">
                Choose the widget's light or dark appearance.
              </p>
            </div>
            <Select
              value={activeConfig.themeMode}
              onValueChange={(value) =>
                updateDraft({ themeMode: value as WidgetThemeMode })
              }
            >
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {THEME_MODES.map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    {mode.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Layout</p>
              <p className="text-xs text-muted-foreground">
                Match the column layout from the widget wizard.
              </p>
            </div>
            <Select
              value={activeConfig.density}
              onValueChange={(value) =>
                updateDraft({ density: value as WidgetDensity })
              }
            >
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {DENSITIES.map((density) => (
                  <SelectItem key={density.value} value={density.value}>
                    {density.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Title bar position</p>
              <p className="text-xs text-muted-foreground">
                Which edge the window controls sit on.
              </p>
            </div>
            <Select
              value={activeConfig.titleBarPosition}
              onValueChange={(value) =>
                updateDraft({
                  titleBarPosition: value as WidgetTitleBarPosition,
                })
              }
            >
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {TITLE_BAR_POSITIONS.map((position) => (
                  <SelectItem key={position.value} value={position.value}>
                    {position.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Button alignment</p>
              <p className="text-xs text-muted-foreground">
                Where the controls align along the bar.
              </p>
            </div>
            <Select
              value={activeConfig.buttonAlignment}
              onValueChange={(value) =>
                updateDraft({ buttonAlignment: value as WidgetButtonAlignment })
              }
            >
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {BUTTON_ALIGNMENTS.map((alignment) => (
                  <SelectItem key={alignment} value={alignment}>
                    {alignmentLabels[alignment]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {wizard ? (
            <ControlWizard
              editing={
                wizard.mode === "edit"
                  ? { control: wizard.control, resolved: wizard.resolved }
                  : undefined
              }
              onCancel={() => setWizard(null)}
              onComplete={completeWizard}
            />
          ) : (
            <ManageControls
              controls={activeConfig.controls}
              onAdd={() => setWizard({ mode: "add" })}
              onEdit={openEdit}
              onChange={(controls) => updateDraft({ controls })}
            />
          )}

          <div className="mt-5 flex justify-end gap-2 border-t border-border/60 pt-4">
            <span className="mr-auto">
              <DeleteResourceButton
                label="widget"
                description="This permanently removes the widget and its saved controls. This can't be undone."
                tooltip="Delete widget"
                onDelete={() => onRemove(widgetId)}
              />
            </span>
            <Button type="button" variant="ghost" onClick={cancelConfigure}>
              Cancel
            </Button>
            <Button type="button" onClick={saveConfigure}>
              Save
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
};
