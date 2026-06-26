import type {
  WidgetConfigDraft,
  WidgetSummary,
} from "@/features/widget-screen/useWidgets";
import { Panel } from "../components/Panel";
import { WidgetCard } from "../components/WidgetCard";

interface WidgetTabProps {
  widgets: WidgetSummary[];
  onReopen: (id: string) => void;
  onClose: (id: string) => void;
  onRemove: (id: string) => Promise<void>;
  onSetPinned: (id: string, pinned: boolean) => void;
  onSetAlwaysOnTop: (id: string, alwaysOnTop: boolean) => void;
  onPreviewConfig: (id: string, config: WidgetConfigDraft) => void;
  onSetConfig: (id: string, config: WidgetConfigDraft) => void;
}

export const WidgetTab = ({
  widgets,
  onReopen,
  onClose,
  onRemove,
  onSetPinned,
  onSetAlwaysOnTop,
  onPreviewConfig,
  onSetConfig,
}: WidgetTabProps) => {
  // Active widgets float to the top so the ones currently on screen are easiest
  // to reach; otherwise keep the original order.
  const sorted = [...widgets].sort(
    (a, b) => Number(b.enabled) - Number(a.enabled),
  );

  if (widgets.length === 0) {
    return (
      <Panel title="Widgets">
        <div className="flex min-h-48 flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm font-medium">No widgets yet</p>
          <p className="text-sm text-muted-foreground">
            Use Add widget to open compact room and zone controls in a separate
            window.
          </p>
          <p className="mt-2 max-w-xs text-xs text-muted-foreground">
            Pin a widget to lock it in place. Set up the controls it controls
            here.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Widgets">
      <div className="space-y-3">
        {sorted.map((widget) => (
          <WidgetCard
            key={widget.widgetId}
            widget={widget}
            onReopen={onReopen}
            onClose={onClose}
            onRemove={onRemove}
            onSetPinned={onSetPinned}
            onSetAlwaysOnTop={onSetAlwaysOnTop}
            onPreviewConfig={onPreviewConfig}
            onSetConfig={onSetConfig}
          />
        ))}
      </div>
    </Panel>
  );
};
