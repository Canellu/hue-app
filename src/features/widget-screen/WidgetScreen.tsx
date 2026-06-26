import { Button } from "@/components/ui/button";
import {
  HueResourcesStoreEffects,
  useHueResourcesStore,
} from "@/stores/HueResourcesStore";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Lock, Pin, PinOff, Settings, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ControlCard } from "./components/ControlCard";
import { useWidgetControls } from "./useWidgetControls";
import type {
  WidgetButtonAlignment,
  WidgetDensity,
  WidgetControl,
  WidgetStylePreset,
  WidgetTitleBarPosition,
} from "./types";
import { resolveWidgetTheme, widgetShellStyle } from "./widgetShell";

interface WidgetWindowState {
  widgetId: string;
  pinned: boolean;
  userSized: boolean;
}

const TITLE_BAR_HEIGHT = 36;
const WIDGET_MIN_HEIGHT = 136;
const WIDGET_CONTENT_WIDTH = 320;
const RESIZE_IGNORE_MS = 650;
const RESIZE_SAVE_DELAY_MS = 300;

const TitleBarButton = ({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (event: React.MouseEvent) => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={(event) => {
      event.stopPropagation();
      onClick(event);
    }}
    className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
  >
    {children}
  </button>
);

/** Edge placement for the absolutely-positioned bar, plus whether its controls
 * stack vertically (left/right) or sit in a row (top/bottom). */
const TITLE_BAR_EDGE: Record<
  WidgetTitleBarPosition,
  { container: string; vertical: boolean }
> = {
  top: { container: "inset-x-0 top-0 flex-row", vertical: false },
  bottom: { container: "inset-x-0 bottom-0 flex-row", vertical: false },
  left: { container: "inset-y-0 left-0 flex-col", vertical: true },
  right: { container: "inset-y-0 right-0 flex-col", vertical: true },
};

/** `justify-*` along the bar's main axis, for the button group's alignment. */
const TITLE_BAR_ALIGN: Record<WidgetButtonAlignment, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
};

const WidgetTitleBar = ({
  widgetId,
  position,
  alignment,
  onOpenSettings,
  onRevealChange,
}: {
  widgetId: string;
  position: WidgetTitleBarPosition;
  alignment: WidgetButtonAlignment;
  onOpenSettings: () => void;
  /** Notifies the shell when the title bar is hovered/focused so it can reveal
   * its own background and border in step with the title bar. */
  onRevealChange: (revealed: boolean) => void;
}) => {
  const [pinned, setPinned] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [focusing, setFocusing] = useState(false);
  const revealed = hovering || focusing;

  useEffect(() => {
    onRevealChange(revealed);
  }, [revealed, onRevealChange]);

  useEffect(() => {
    void invoke<WidgetWindowState>("get-widget-state", { widgetId })
      .then((state) => setPinned(state.pinned))
      .catch(() => setPinned(false));
  }, [widgetId]);

  const togglePinned = async () => {
    const nextPinned = !pinned;
    setPinned(nextPinned);
    try {
      await invoke("set-widget-pinned", { widgetId, pinned: nextPinned });
    } catch {
      setPinned(pinned);
    }
  };

  const edge = TITLE_BAR_EDGE[position];

  return (
    <header
      className={cn(
        "absolute z-10 flex items-center gap-1 px-2 text-foreground",
        edge.container,
        TITLE_BAR_ALIGN[alignment],
        "transition-opacity",
        revealed ? "opacity-100" : "opacity-0",
        pinned ? "cursor-default" : "cursor-grab",
      )}
      style={
        edge.vertical
          ? { width: TITLE_BAR_HEIGHT }
          : { height: TITLE_BAR_HEIGHT }
      }
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setFocusing(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setFocusing(false);
        }
      }}
      onMouseDown={(event) => {
        // A pinned widget is locked to its spot, so dragging is disabled.
        if (
          pinned ||
          event.button !== 0 ||
          (event.target as HTMLElement).closest("button")
        ) {
          return;
        }
        void getCurrentWindow()
          .startDragging()
          .finally(() =>
            invoke("save-widget-bounds", { widgetId }).catch(() => undefined),
          );
      }}
    >
      <div
        className={cn("flex items-center gap-0.5", edge.vertical && "flex-col")}
      >
        {pinned ? (
          <Lock size={13} className="mx-1 text-muted-foreground" />
        ) : null}
        <TitleBarButton
          label={pinned ? "Unpin widget" : "Pin widget to this spot"}
          onClick={() => void togglePinned()}
        >
          {pinned ? <Pin size={15} /> : <PinOff size={15} />}
        </TitleBarButton>
        <TitleBarButton label="Widget settings" onClick={onOpenSettings}>
          <Settings size={15} />
        </TitleBarButton>
        <TitleBarButton
          label="Close widget"
          onClick={() => void invoke("close-widget-window", { widgetId })}
        >
          <X size={16} />
        </TitleBarButton>
      </div>
    </header>
  );
};

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div
    className="flex min-h-24 flex-col items-center justify-center gap-2 px-6 text-center"
    style={{ width: WIDGET_CONTENT_WIDTH }}
  >
    {children}
  </div>
);

/** The scrollable control list, or an empty/loading/unconfigured prompt. */
const ControlList = ({
  controls,
  preset,
  density,
  onOpenSettings,
}: {
  controls: WidgetControl[];
  preset: WidgetStylePreset;
  density: WidgetDensity;
  onOpenSettings: () => void;
}) => {
  const hasLoaded = useHueResourcesStore((state) => state.hasLoaded);
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const lights = useHueResourcesStore((state) => state.lights);

  if (!hasLoaded) {
    return (
      <Centered>
        <p className="text-sm text-muted-foreground">
          Connecting to your bridge…
        </p>
      </Centered>
    );
  }

  if (roomZones.length === 0 && lights.length === 0) {
    return (
      <Centered>
        <p className="text-base font-semibold">No Hue devices</p>
        <p className="text-sm text-muted-foreground">
          Open the main app to set up your bridge, then reopen this widget.
        </p>
      </Centered>
    );
  }

  if (controls.length === 0) {
    return (
      <Centered>
        <p className="text-sm font-semibold">No controls</p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onOpenSettings}
        >
          <Settings size={15} />
          Configure in Settings
        </Button>
      </Centered>
    );
  }

  return (
    <div
      className={cn(
        "content-start gap-[var(--widget-spacing)]",
        density === "expanded" ? "grid grid-cols-2" : "grid",
      )}
      style={{
        width:
          density === "expanded"
            ? WIDGET_CONTENT_WIDTH * 2 + 12
            : WIDGET_CONTENT_WIDTH,
      }}
    >
      {controls.map((control) => (
        <ControlCard key={control.id} control={control} preset={preset} />
      ))}
    </div>
  );
};

export const WidgetScreen = ({ widgetId }: { widgetId: string }) => {
  const {
    controls,
    stylePreset,
    themeMode,
    density,
    titleBarPosition,
    buttonAlignment,
  } = useWidgetControls(widgetId);
  const [shellRevealed, setShellRevealed] = useState(false);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [flashing, setFlashing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const userSizedRef = useRef(false);
  const ignoreResizeUntilRef = useRef(0);
  const resizeSaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.dataset.window = "widget";
    void invoke<WidgetWindowState>("widget-frontend-ready", { widgetId })
      .then((state) => {
        userSizedRef.current = state.userSized;
      })
      .catch(() => undefined);
    return () => {
      delete document.documentElement.dataset.window;
    };
  }, [widgetId]);

  // The OS drag-drop handler is disabled (so transparent corners work), which
  // would otherwise let a stray file drop navigate the webview away. Swallow it.
  useEffect(() => {
    const prevent = (event: DragEvent) => event.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  useEffect(() => {
    void invoke("set-widget-acrylic", {
      widgetId,
      enabled: false,
      radius: null,
      color: null,
    }).catch(() => undefined);
  }, [widgetId]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const unlisten = listen("widget-flash", () => {
      setFlashing(true);
      window.setTimeout(() => setFlashing(false), 420);
    });
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, []);

  const syncWidgetLayout = useCallback(() => {
    const content = contentRef.current;
    if (!content || !("__TAURI_INTERNALS__" in window)) return;

    const contentRect = content.getBoundingClientRect();
    const contentWidth = Math.max(content.scrollWidth, contentRect.width);
    const contentHeight = Math.max(content.scrollHeight, contentRect.height);
    const width = Math.ceil(contentWidth);
    const height = Math.ceil(Math.max(contentHeight, WIDGET_MIN_HEIGHT));
    if (width <= 0 || height <= 0) return;

    ignoreResizeUntilRef.current = Date.now() + RESIZE_IGNORE_MS;
    void invoke<WidgetWindowState>("sync-widget-layout", {
      widgetId,
      minWidth: width,
      minHeight: height,
      autoFit: true,
    })
      .then((state) => {
        userSizedRef.current = state.userSized;
      })
      .catch(() => undefined);
  }, [widgetId]);

  useLayoutEffect(() => {
    syncWidgetLayout();
  }, [syncWidgetLayout, controls, stylePreset]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => syncWidgetLayout());
    observer.observe(content);
    return () => observer.disconnect();
  }, [syncWidgetLayout]);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;

    let active = true;
    void getCurrentWindow()
      .onResized(() => {
        if (!active || Date.now() < ignoreResizeUntilRef.current) return;
        if (resizeSaveTimerRef.current != null) {
          window.clearTimeout(resizeSaveTimerRef.current);
        }
        resizeSaveTimerRef.current = window.setTimeout(() => {
          userSizedRef.current = true;
          void invoke("save-widget-bounds", {
            widgetId,
            userSized: true,
          }).catch(() => undefined);
        }, RESIZE_SAVE_DELAY_MS);
      })
      .then((unlisten) => {
        if (!active) unlisten();
      });

    return () => {
      active = false;
      if (resizeSaveTimerRef.current != null) {
        window.clearTimeout(resizeSaveTimerRef.current);
      }
    };
  }, [widgetId]);

  const openSettings = () =>
    void invoke("open-widget-settings").catch(() => undefined);

  const shellStyle = useMemo(
    () =>
      widgetShellStyle(stylePreset, resolveWidgetTheme(themeMode, systemDark)),
    [stylePreset, systemDark, themeMode],
  );

  return (
    <main
      className={cn(
        "group/widget relative h-screen w-screen overflow-hidden border text-foreground transition-colors",
        shellRevealed ? "border-border/45 shadow-2xl" : "border-transparent",
        flashing && "bg-primary/35",
      )}
      style={
        shellRevealed
          ? shellStyle
          : { ...shellStyle, backgroundColor: "transparent" }
      }
    >
      <HueResourcesStoreEffects />
      <WidgetTitleBar
        widgetId={widgetId}
        position={titleBarPosition}
        alignment={buttonAlignment}
        onOpenSettings={openSettings}
        onRevealChange={setShellRevealed}
      />

      {/* Pad every edge by the title-bar height so the controls never touch
          the window edges and the overlaid title bar never covers them. */}
      <section
        ref={contentRef}
        className="w-fit"
        style={{ padding: TITLE_BAR_HEIGHT }}
      >
        <ControlList
          controls={controls}
          preset={stylePreset}
          density={density}
          onOpenSettings={openSettings}
        />
      </section>
    </main>
  );
};
