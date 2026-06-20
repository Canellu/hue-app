import { PacedSlider } from "@/components/PacedSlider";
import { SensorReadingPill } from "@/components/SensorReadingPill";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  roomZoneTileColor,
  sceneBubbleCss,
} from "@/features/space-screen/utils/color-state";
import { LIGHT_THEME } from "@/lib/tile-theme";
import { UI_EASE_MS } from "@/lib/transitions";
import { cn } from "@/lib/utils";
import type {
  HueAccessory,
  HueAccessoryService,
  HueLight,
  HueRoomZone,
  HueScene,
} from "@/types/hue";
import {
  Gauge,
  Palette,
  Play,
  Radar,
  Sparkles,
  Square,
  ToggleLeft,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useReducer, useRef, useState } from "react";
import { LightCard } from "./components/LightCard";
import {
  gallerySceneBubbleCss,
  HUE_SCENE_GALLERY_COUNT,
  HUE_SCENE_GALLERY_PREVIEWS,
  HUE_SCENE_GALLERY_SECTIONS,
  type HueGalleryScenePreset,
} from "./data/hueSceneGallery";

const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;

const SPEED_MIN = 1;
const SPEED_MAX = 12;

const sceneSpeedToStep = (speed: number | null | undefined): number =>
  Math.min(
    SPEED_MAX,
    Math.max(SPEED_MIN, Math.round((speed ?? 0.5) * (SPEED_MAX - 1)) + 1),
  );

const normalizeSceneStatus = (status: string | null | undefined): string =>
  status?.trim().toLowerCase().replace(/_/g, " ") ?? "";

const isSceneDynamicActive = (scene: HueScene): boolean =>
  scene.dynamic && normalizeSceneStatus(scene.status) === "dynamic palette";

/**
 * Forces a re-render whenever `ref`'s element changes size. Layout animations
 * only fire across React renders, but the grid's width changes from CSS-driven
 * events (the inspector pane animating its width, window resizing) that never
 * trigger a render on their own. Observing the element and re-rendering on each
 * size tick lets `motion`'s `layout` re-measure and animate the reflow instead
 * of snapping. The observer is frame-rate bounded and idle unless resizing.
 */
function useAnimateOnResize(ref: React.RefObject<HTMLElement | null>) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => rerender());
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
}

const handleHorizontalWheel: React.WheelEventHandler<HTMLDivElement> = (
  event,
) => {
  const viewport = event.currentTarget;
  const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth;

  if (maxScrollLeft <= 0 || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
    return;
  }

  const delta =
    event.deltaMode === WHEEL_DELTA_LINE
      ? event.deltaY * 16
      : event.deltaMode === WHEEL_DELTA_PAGE
        ? event.deltaY * viewport.clientWidth
        : event.deltaY;
  const nextScrollLeft = Math.min(
    maxScrollLeft,
    Math.max(0, viewport.scrollLeft + delta),
  );

  if (nextScrollLeft === viewport.scrollLeft) return;

  event.preventDefault();
  viewport.scrollLeft = nextScrollLeft;
};

type ControlCommitPhase = "live" | "final";

interface SpaceScreenProps {
  roomZone: HueRoomZone;
  lights: HueLight[];
  scenes: HueScene[];
  /** Live accessory readings keyed by owning device id. */
  readingsByDevice: Map<string, HueAccessoryService[]>;
  activeSceneId: string | null;
  selectedLightId: string | null;
  error: string | null;
  onRoomZoneToggle: (roomZone: HueRoomZone, nextOn: boolean) => void;
  onRoomZoneBrightness: (
    roomZone: HueRoomZone,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
  onLightToggle: (light: HueLight, nextOn: boolean) => void;
  onLightBrightness: (
    light: HueLight,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
  onSelectLight: (id: string) => void;
  /** Tapping a scene card: apply its stored colors and open its inspector. */
  onSceneApply: (scene: HueScene) => void;
  /** The card's play/stop button: start or stop the dynamic palette. */
  onSceneTogglePlay: (scene: HueScene) => void;
  /** Transient speed change for the scene that is currently playing. */
  onDynamicSpeedLive: (scene: HueScene, step: number) => void;
  selectedSceneId: string | null;
  onGallerySceneCreate: (preset: HueGalleryScenePreset) => Promise<void>;
}

export const SpaceScreen: React.FC<SpaceScreenProps> = ({
  roomZone,
  lights,
  scenes,
  readingsByDevice,
  activeSceneId,
  selectedLightId,
  error,
  onRoomZoneToggle,
  onRoomZoneBrightness,
  onLightToggle,
  onLightBrightness,
  onSelectLight,
  onSceneApply,
  onSceneTogglePlay,
  onDynamicSpeedLive,
  selectedSceneId,
  onGallerySceneCreate,
}) => {
  const brightnessPct = roomZone.brightness ?? 0;
  const tile = roomZoneTileColor(lights);
  const switches = roomZone.accessories.filter((a) => a.kind === "switch");
  const sensors = roomZone.accessories.filter((a) => a.kind === "sensor");
  const [sceneGalleryOpen, setSceneGalleryOpen] = useState(false);
  const [pendingGallerySceneId, setPendingGallerySceneId] = useState<
    string | null
  >(null);

  // The dynamic scene currently animating in this space, if any. Its live speed
  // slider sits under the group controls and only tweaks the running playback.
  const playingScene = scenes.find(isSceneDynamicActive) ?? null;

  const lightsGridRef = useRef<HTMLDivElement>(null);
  useAnimateOnResize(lightsGridRef);

  const showScenes = scenes.length > 0 || lights.length > 0;
  const handleGallerySceneCreate = async (preset: HueGalleryScenePreset) => {
    if (pendingGallerySceneId != null) return;
    setPendingGallerySceneId(preset.id);
    try {
      await onGallerySceneCreate(preset);
      setSceneGalleryOpen(false);
    } finally {
      setPendingGallerySceneId(null);
    }
  };

  return (
    <section className="mx-auto flex w-full min-w-0 flex-col gap-6">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Card
        className={cn(
          "gap-4 transition-colors duration-(--tile-ease) ease-out",
          !tile.active && "hover:bg-accent/70",
        )}
        style={
          {
            ...LIGHT_THEME,
            "--tile-ease": `${UI_EASE_MS.tileBackground}ms`,
            ...(tile.active && tile.background
              ? { background: tile.background }
              : null),
          } as React.CSSProperties
        }
      >
        <div className="flex items-center justify-between gap-4 px-6">
          <span
            className={cn(
              "text-sm font-medium",
              tile.active ? "text-foreground" : "text-muted-foreground",
            )}
          >
            Group controls
          </span>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "text-xs tabular-nums",
                tile.active ? "text-foreground/80" : "text-muted-foreground",
              )}
            >
              {Math.round(brightnessPct)}%
            </span>
            <Switch
              size="xl"
              className="dark:data-checked:bg-foreground/35 dark:data-unchecked:bg-input dark:**:data-[slot=switch-thumb]:data-unchecked:bg-background"
              checked={roomZone.anyOn}
              aria-label={`Toggle ${roomZone.name}`}
              onCheckedChange={(checked) => onRoomZoneToggle(roomZone, checked)}
            />
          </div>
        </div>
        <div className="px-6">
          <PacedSlider
            value={roomZone.anyOn ? Math.max(1, brightnessPct) : 1}
            min={1}
            ariaLabel={`${roomZone.name} brightness`}
            className={cn(
              tile.active &&
                "**:data-[slot=slider-track]:bg-foreground/35 **:data-[slot=slider-range]:bg-transparent **:data-[slot=slider-range]:bg-linear-to-r **:data-[slot=slider-range]:from-white/50 **:data-[slot=slider-range]:to-white/90",
            )}
            isGroup
            onCommit={(pct, phase) =>
              onRoomZoneBrightness(roomZone, pct, phase)
            }
          />
        </div>
        {playingScene && (
          <DynamicSpeedControl
            key={playingScene.id}
            scene={playingScene}
            active={tile.active}
            onSpeedLive={onDynamicSpeedLive}
          />
        )}
      </Card>
      {showScenes && (
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">Scenes</p>
          <ScrollArea
            fade="horizontal"
            orientation="horizontal"
            hideScrollbar
            className="min-w-0"
            viewportClassName="pb-1"
            viewportProps={{ onWheel: handleHorizontalWheel }}
          >
            <div className="flex w-max gap-3 p-2">
              {scenes.map((scene) => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  active={scene.id === activeSceneId}
                  selected={scene.id === selectedSceneId}
                  onApply={onSceneApply}
                  onTogglePlay={onSceneTogglePlay}
                />
              ))}
              <SceneGalleryCard onOpen={() => setSceneGalleryOpen(true)} />
            </div>
          </ScrollArea>
          <SceneGalleryDialog
            open={sceneGalleryOpen}
            roomZoneName={roomZone.name}
            pendingSceneId={pendingGallerySceneId}
            onOpenChange={setSceneGalleryOpen}
            onSceneCreate={handleGallerySceneCreate}
          />
        </div>
      )}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">Lights</p>
        {lights.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This room or zone has no individual lights.
          </p>
        ) : (
          <div
            ref={lightsGridRef}
            className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {lights.map((light) => (
                <motion.div
                  key={light.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <LightCard
                    light={light}
                    selected={light.id === selectedLightId}
                    onSelect={onSelectLight}
                    onToggle={onLightToggle}
                    onBrightness={onLightBrightness}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
      <AccessorySection
        title="Switches"
        icon={ToggleLeft}
        accessories={switches}
        readingsByDevice={readingsByDevice}
      />
      <AccessorySection
        title="Sensors"
        icon={Radar}
        accessories={sensors}
        readingsByDevice={readingsByDevice}
      />
    </section>
  );
};

/**
 * Live speed control for the dynamic scene currently playing in this space.
 * Seeded from the scene's saved speed but its changes are transient — they only
 * re-pace the running playback and are never written back to the scene.
 */
const DynamicSpeedControl: React.FC<{
  scene: HueScene;
  active: boolean;
  onSpeedLive: (scene: HueScene, step: number) => void;
}> = ({ scene, active, onSpeedLive }) => {
  const [step, setStep] = useState(() => sceneSpeedToStep(scene.speed));

  return (
    <div className="flex flex-col gap-2 border-t border-foreground/10 px-6 pt-4">
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex items-center gap-2 text-sm font-medium",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <Gauge size={15} />
          Dynamic speed
        </span>
        <span
          className={cn(
            "text-xs tabular-nums",
            active ? "text-foreground/80" : "text-muted-foreground",
          )}
        >
          {step}
        </span>
      </div>
      <PacedSlider
        value={step}
        min={SPEED_MIN}
        max={SPEED_MAX}
        step={1}
        ariaLabel={`${scene.name} live dynamic speed`}
        className={cn(
          active &&
            "**:data-[slot=slider-track]:bg-foreground/35 **:data-[slot=slider-range]:bg-transparent **:data-[slot=slider-range]:bg-linear-to-r **:data-[slot=slider-range]:from-white/50 **:data-[slot=slider-range]:to-white/90",
        )}
        isGroup
        onInput={(value) => setStep(Math.round(value))}
        onCommit={(value) => {
          const next = Math.round(value);
          setStep(next);
          onSpeedLive(scene, next);
        }}
      />
    </div>
  );
};

const SceneCard: React.FC<{
  scene: HueScene;
  active?: boolean;
  selected?: boolean;
  compact?: boolean;
  onApply: (scene: HueScene) => void;
  onTogglePlay: (scene: HueScene) => void;
}> = ({
  scene,
  active = false,
  selected = false,
  compact = false,
  onApply,
  onTogglePlay,
}) => {
  const bubble = sceneBubbleCss(scene);
  const activeBackground = active && bubble != null;
  const dynamicActive = isSceneDynamicActive(scene);

  return (
    <Card
      size="sm"
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={() => onApply(scene)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onApply(scene);
        }
      }}
      className={cn(
        "group relative shrink-0 cursor-pointer items-center justify-between rounded-[1.75rem] px-4 py-5 text-center outline-none transition-[background,color,transform] duration-(--tile-ease) ease-out focus-visible:ring-2 focus-visible:ring-ring",
        compact ? "h-36 w-full" : "h-40 w-40",
        activeBackground
          ? "text-white ring-0 hover:scale-[1.01]"
          : active
            ? "bg-accent ring-0 hover:bg-accent"
            : "hover:bg-accent/70",
        selected && "ring-2 ring-ring",
      )}
      style={
        {
          ...LIGHT_THEME,
          "--tile-ease": `${UI_EASE_MS.tileBackground}ms`,
          ...(activeBackground ? { background: bubble } : null),
        } as React.CSSProperties
      }
    >
      <SceneCardVisual
        active={active}
        bubble={bubble}
        compact={compact}
        dynamic={scene.dynamic}
        dynamicActive={dynamicActive}
        sceneName={scene.name}
        onTogglePlay={() => onTogglePlay(scene)}
      />
      <span className="flex min-w-0 flex-col items-center gap-1">
        <span
          className={cn(
            "line-clamp-2 max-w-full text-base leading-tight font-medium break-words",
            activeBackground && "drop-shadow",
          )}
        >
          {scene.name}
        </span>
      </span>
    </Card>
  );
};

const SceneCardVisual: React.FC<{
  active: boolean;
  bubble: string | null;
  compact: boolean;
  dynamic: boolean;
  dynamicActive: boolean;
  sceneName: string;
  onTogglePlay: () => void;
}> = ({
  active,
  bubble,
  compact,
  dynamic,
  dynamicActive,
  sceneName,
  onTogglePlay,
}) => {
  const size = compact ? "size-12" : "size-14";

  if (dynamic) {
    const Icon = dynamicActive ? Square : Play;
    // Show the scene's palette behind the play/stop icon so a dynamic scene
    // still reads as colorful at a glance. On the active card (whose own
    // background is already the palette) fall back to a translucent white chip
    // so it doesn't stack palette-on-palette.
    const showBubble = bubble != null && !active;
    // The play/stop chip is its own button: tapping it toggles the dynamic
    // palette, while tapping anywhere else on the card applies the colors.
    return (
      <button
        type="button"
        aria-label={dynamicActive ? `Stop ${sceneName}` : `Play ${sceneName}`}
        onClick={(event) => {
          event.stopPropagation();
          onTogglePlay();
        }}
        onKeyDown={(event) => event.stopPropagation()}
        className={cn(
          "flex aspect-square items-center justify-center rounded-full ring-1 backdrop-blur-sm outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring",
          showBubble
            ? "text-white ring-white/25 shadow-sm"
            : active || bubble
              ? "bg-white/30 text-white ring-white/20"
              : "bg-foreground/15 text-foreground ring-foreground/10",
          size,
        )}
        style={showBubble ? { background: bubble } : undefined}
      >
        <Icon
          className={cn(
            "size-6 fill-current drop-shadow",
            !dynamicActive && "ml-0.5",
          )}
          strokeWidth={2.5}
        />
      </button>
    );
  }

  if (bubble) {
    return (
      <span
        className={cn("aspect-square rounded-full shadow-sm ring-1 ring-foreground/15", size)}
        style={{ background: bubble }}
      />
    );
  }

  return (
    <span
      className={cn(
        "flex aspect-square items-center justify-center rounded-full bg-secondary text-muted-foreground ring-1 ring-foreground/10",
        size,
      )}
    >
      <Palette className="size-6" />
    </span>
  );
};

const SceneGalleryCard: React.FC<{
  onOpen: () => void;
}> = ({ onOpen }) => (
  <Card
    size="sm"
    role="button"
    tabIndex={0}
    onClick={onOpen}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onOpen();
      }
    }}
    className="h-40 w-40 shrink-0 cursor-pointer items-center justify-center gap-4 rounded-[1.75rem] bg-card/60 px-4 text-center outline-none transition-colors hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring"
  >
    <span className="flex items-center -space-x-3">
      {HUE_SCENE_GALLERY_PREVIEWS.map((preset, index) => {
        const bubble = gallerySceneBubbleCss(preset);
        return (
          <span
            key={preset.id}
            className="flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground shadow-sm ring-2 ring-card"
            style={
              bubble
                ? {
                    background: bubble,
                    zIndex: HUE_SCENE_GALLERY_PREVIEWS.length - index,
                  }
                : { zIndex: HUE_SCENE_GALLERY_PREVIEWS.length - index }
            }
          >
            {!bubble && <Sparkles className="size-4" />}
          </span>
        );
      })}
    </span>
    <span className="flex max-w-28 flex-col gap-1">
      <span className="text-base leading-tight font-semibold">
        Hue scene gallery
      </span>
      <span className="text-xs text-muted-foreground">
        {HUE_SCENE_GALLERY_COUNT} presets
      </span>
    </span>
  </Card>
);

const SceneGalleryDialog: React.FC<{
  open: boolean;
  roomZoneName: string;
  pendingSceneId: string | null;
  onOpenChange: (open: boolean) => void;
  onSceneCreate: (preset: HueGalleryScenePreset) => Promise<void>;
}> = ({ open, roomZoneName, pendingSceneId, onOpenChange, onSceneCreate }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[calc(100vh-3rem)] gap-4 sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle>Hue scene gallery</DialogTitle>
        <DialogDescription>
          Pick a preset to add it as a saved scene for {roomZoneName}.
        </DialogDescription>
      </DialogHeader>
      <ScrollArea
        fade
        className="h-[min(34rem,calc(100vh-12rem))]"
        viewportClassName="pr-3"
      >
        <div className="space-y-6">
          {HUE_SCENE_GALLERY_SECTIONS.map((section) => (
            <section key={section.id} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold">
                    {section.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {section.description}
                  </p>
                </div>
                <Badge variant="outline">
                  {section.scenes.length}{" "}
                  {section.scenes.length === 1 ? "preset" : "presets"}
                </Badge>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
                {section.scenes.map((preset) => (
                  <GalleryPresetCard
                    key={preset.id}
                    preset={preset}
                    pending={preset.id === pendingSceneId}
                    disabled={pendingSceneId != null}
                    onSelect={onSceneCreate}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </ScrollArea>
    </DialogContent>
  </Dialog>
);

const GalleryPresetCard: React.FC<{
  preset: HueGalleryScenePreset;
  pending: boolean;
  disabled: boolean;
  onSelect: (preset: HueGalleryScenePreset) => Promise<void>;
}> = ({ preset, pending, disabled, onSelect }) => {
  const bubble = gallerySceneBubbleCss(preset);

  return (
    <Card
      size="sm"
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled) void onSelect(preset);
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void onSelect(preset);
        }
      }}
      className={cn(
        "h-36 w-full cursor-pointer items-center justify-between rounded-[1.75rem] px-4 py-5 text-center outline-none transition-[background,opacity,transform] duration-(--tile-ease) ease-out focus-visible:ring-2 focus-visible:ring-ring",
        disabled ? "cursor-default opacity-60" : "hover:bg-accent/70",
      )}
      style={
        {
          ...LIGHT_THEME,
          "--tile-ease": `${UI_EASE_MS.tileBackground}ms`,
        } as React.CSSProperties
      }
    >
      {bubble ? (
        <span
          className="size-12 rounded-full shadow-sm ring-1 ring-foreground/15"
          style={{ background: bubble }}
        />
      ) : (
        <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground ring-1 ring-foreground/10">
          <Sparkles className="size-5" />
        </span>
      )}
      <span className="flex min-w-0 flex-col items-center gap-1">
        <span className="line-clamp-2 max-w-full text-base leading-tight font-semibold break-words">
          {preset.name}
        </span>
        <span className="line-clamp-1 max-w-full text-xs text-muted-foreground">
          {pending ? "Adding..." : `${Math.round(preset.brightness)}%`}
        </span>
      </span>
    </Card>
  );
};

const AccessorySection: React.FC<{
  title: string;
  icon: LucideIcon;
  accessories: HueAccessory[];
  readingsByDevice: Map<string, HueAccessoryService[]>;
}> = ({ title, icon: Icon, accessories, readingsByDevice }) => {
  if (accessories.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {accessories.map((accessory) => {
          const readings = readingsByDevice.get(accessory.id) ?? [];
          return (
            <Card key={accessory.id} className="gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{accessory.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {accessory.productName ??
                      (accessory.kind === "switch" ? "Switch" : "Sensor")}
                  </p>
                </div>
                {!accessory.reachable && (
                  <span className="shrink-0 text-xs font-medium text-destructive">
                    Offline
                  </span>
                )}
              </div>
              {readings.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {readings.map((service) => (
                    <SensorReadingPill key={service.id} service={service} />
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};
