import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type {
  WidgetButtonAlignment,
  WidgetDensity,
  WidgetControl,
  WidgetState,
  WidgetStylePreset,
  WidgetThemeMode,
  WidgetTitleBarPosition,
} from "./types";

export type WidgetSummary = WidgetState;

const toSummary = (state: WidgetState): WidgetSummary => ({
  widgetId: state.widgetId,
  title: state.title ?? null,
  enabled: state.enabled,
  pinned: state.pinned,
  alwaysOnTop: state.alwaysOnTop ?? false,
  userSized: state.userSized ?? false,
  stylePreset: state.stylePreset ?? "windows11",
  themeMode: state.themeMode ?? "system",
  density: state.density ?? "compact",
  titleBarPosition: state.titleBarPosition ?? "top",
  buttonAlignment: state.buttonAlignment ?? "end",
  controls: state.controls ?? [],
});

export interface WidgetConfigDraft {
  controls: WidgetControl[];
  stylePreset: WidgetStylePreset;
  themeMode: WidgetThemeMode;
  density: WidgetDensity;
  titleBarPosition: WidgetTitleBarPosition;
  buttonAlignment: WidgetButtonAlignment;
}

/**
 * Tracks every persisted widget (open and closed) from the main window and
 * exposes actions to open, reopen, close, remove, and pin them. The list is
 * refreshed on mount, when the main window regains focus (widgets can be closed
 * from their own title bar), and after each action.
 */
export const useWidgets = () => {
  const [widgets, setWidgets] = useState<WidgetSummary[]>([]);
  const [opening, setOpening] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = await invoke<WidgetState[]>("list-widgets");
      setWidgets(list.map(toSummary));
    } catch {
      // Keep the last known list if the lookup fails; it's a non-critical view.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  // `widgetId` opens a brand-new widget when omitted, or reopens a known
  // (closed) one when given.
  const openWidget = useCallback(
    async (
      widgetId?: string,
      options?: {
        title?: string;
        controls?: WidgetSummary["controls"];
        stylePreset?: WidgetStylePreset;
        themeMode?: WidgetThemeMode;
        density?: WidgetDensity;
      },
    ) => {
      if (opening) return;
      setOpening(true);
      try {
        await invoke("open-widget-window", { widgetId, ...options });
        await refresh();
      } catch (error) {
        toast.error(String(error) || "Unable to open widget");
      } finally {
        setOpening(false);
      }
    },
    [opening, refresh],
  );

  const closeWidget = useCallback(
    async (widgetId: string) => {
      try {
        await invoke("close-widget-window", { widgetId });
        await refresh();
      } catch (error) {
        toast.error(String(error) || "Unable to close widget");
      }
    },
    [refresh],
  );

  const removeWidget = useCallback(
    async (widgetId: string) => {
      try {
        await invoke("remove-widget", { widgetId });
        await refresh();
      } catch (error) {
        toast.error(String(error) || "Unable to remove widget");
      }
    },
    [refresh],
  );

  const setPinned = useCallback(
    async (widgetId: string, pinned: boolean) => {
      try {
        await invoke("set-widget-pinned", { widgetId, pinned });
        await refresh();
      } catch (error) {
        toast.error(String(error) || "Unable to update widget");
      }
    },
    [refresh],
  );

  const setAlwaysOnTop = useCallback(
    async (widgetId: string, alwaysOnTop: boolean) => {
      setWidgets((current) =>
        current.map((widget) =>
          widget.widgetId === widgetId ? { ...widget, alwaysOnTop } : widget,
        ),
      );
      try {
        await invoke("set-widget-always-on-top", { widgetId, alwaysOnTop });
        await refresh();
      } catch (error) {
        toast.error(String(error) || "Unable to update widget");
        await refresh();
      }
    },
    [refresh],
  );

  const setStylePreset = useCallback(
    async (widgetId: string, stylePreset: WidgetStylePreset) => {
      setWidgets((current) =>
        current.map((widget) =>
          widget.widgetId === widgetId ? { ...widget, stylePreset } : widget,
        ),
      );
      try {
        await invoke("set-widget-style-preset", { widgetId, stylePreset });
        await refresh();
      } catch (error) {
        toast.error(String(error) || "Unable to update widget style");
        await refresh();
      }
    },
    [refresh],
  );

  const setTitleBar = useCallback(
    async (
      widgetId: string,
      position: WidgetTitleBarPosition,
      alignment: WidgetButtonAlignment,
    ) => {
      setWidgets((current) =>
        current.map((widget) =>
          widget.widgetId === widgetId
            ? {
                ...widget,
                titleBarPosition: position,
                buttonAlignment: alignment,
              }
            : widget,
        ),
      );
      try {
        await invoke("set-widget-titlebar", { widgetId, position, alignment });
        await refresh();
      } catch (error) {
        toast.error(String(error) || "Unable to update widget title bar");
        await refresh();
      }
    },
    [refresh],
  );

  const setControls = useCallback(
    async (widgetId: string, controls: WidgetSummary["controls"]) => {
      setWidgets((current) =>
        current.map((widget) =>
          widget.widgetId === widgetId ? { ...widget, controls } : widget,
        ),
      );
      try {
        await invoke("set-widget-controls", { widgetId, controls });
        await refresh();
      } catch (error) {
        toast.error(String(error) || "Unable to update controls");
        await refresh();
      }
    },
    [refresh],
  );

  const previewConfig = useCallback(
    async (widgetId: string, config: WidgetConfigDraft) => {
      try {
        await invoke("preview-widget-config", { widgetId, ...config });
      } catch {
        // Preview is best-effort; save/cancel still reconciles persisted state.
      }
    },
    [],
  );

  const setConfig = useCallback(
    async (widgetId: string, config: WidgetConfigDraft) => {
      setWidgets((current) =>
        current.map((widget) =>
          widget.widgetId === widgetId ? { ...widget, ...config } : widget,
        ),
      );
      try {
        await invoke("set-widget-config", { widgetId, ...config });
        await refresh();
      } catch (error) {
        toast.error(String(error) || "Unable to update widget");
        await refresh();
      }
    },
    [refresh],
  );

  return {
    widgets,
    opening,
    openWidget,
    closeWidget,
    removeWidget,
    setPinned,
    setAlwaysOnTop,
    setStylePreset,
    setTitleBar,
    setControls,
    previewConfig,
    setConfig,
    refresh,
  };
};
