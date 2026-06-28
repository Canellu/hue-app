import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { SceneTile } from "@/features/space-screen/components/SceneTile";
import {
  sceneBrightness,
  sceneBubbleCss,
  sceneHexes,
} from "@/features/space-screen/utils/color-state";
import { isSceneActive } from "@/features/space-screen/utils/scene-status";
import { activeTileTheme } from "@/lib/tile-theme";
import { cn } from "@/lib/utils";
import type { HueScene } from "@/types/hue";
import { Check, Palette } from "lucide-react";

/** The scene's color bubble, or a palette placeholder when it has no colors. */
const SceneBubble = ({
  bubble,
  size = "default",
}: {
  bubble: string | null;
  /** "xs" matches the miniature widget rail tile. */
  size?: "default" | "xs";
}) => {
  const tiny = size === "xs";
  return bubble ? (
    <span
      className={cn(
        "shrink-0 rounded-full shadow-sm ring-1 ring-foreground/15",
        tiny ? "size-7" : "size-10",
      )}
      style={{ background: bubble }}
    />
  ) : (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground ring-1 ring-foreground/10",
        tiny ? "size-7" : "size-10",
      )}
    >
      <Palette className={tiny ? "size-3.5" : "size-5"} />
    </span>
  );
};

/**
 * Horizontal, drag-scrollable rail of scene cards. Overflow is communicated by
 * the edge fade alone — there are no page dots or arrow buttons; the rail just
 * drags. Children are expected to be {@link CarouselItem}s; use
 * {@link SceneRailItem} to wrap each card.
 */
export const SceneCardRail = ({ children }: { children: React.ReactNode }) => {
  return (
    <Carousel
      opts={{
        align: "start",
        slidesToScroll: "auto",
        containScroll: "trimSnaps",
      }}
      className="min-w-0"
    >
      <CarouselContent fade className="-ml-2 py-1">
        {children}
      </CarouselContent>
    </Carousel>
  );
};

/** Wraps a single scene card as a carousel slide sized to its content. */
export const SceneRailItem = ({ children }: { children: React.ReactNode }) => (
  <CarouselItem className="basis-auto pl-2">{children}</CarouselItem>
);

/** A scene card that applies the scene on tap (the live widget display). */
export const WidgetSceneCard = ({
  scene,
  onActivate,
}: {
  scene: HueScene;
  onActivate: () => void;
}) => {
  const bubble = sceneBubbleCss(scene);
  const active = isSceneActive(scene);
  const activeBackground = active && bubble != null;
  return (
    <SceneTile
      size="xs"
      name={scene.name}
      ariaPressed={active}
      activeBackground={activeBackground}
      className={
        activeBackground
          ? "text-foreground"
          : active
            ? "bg-foreground/10"
            : undefined
      }
      style={
        activeBackground && bubble
          ? activeTileTheme(
              bubble,
              sceneHexes(scene)[0] ?? bubble,
              sceneBrightness(scene),
            )
          : undefined
      }
      onActivate={onActivate}
      visual={<SceneBubble bubble={bubble} size="xs" />}
    />
  );
};

/**
 * A scene card used in the settings pickers: tapping toggles whether the scene
 * is one of the control's quick scenes. Shows a check when selected and dims
 * when the per-control limit is reached.
 */
export const SelectableSceneCard = ({
  scene,
  selected,
  disabled,
  onToggle,
}: {
  scene: HueScene;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) => {
  const bubble = sceneBubbleCss(scene);
  return (
    <SceneTile
      size="sm"
      name={scene.name}
      ariaPressed={selected}
      disabled={disabled}
      onActivate={onToggle}
      className={cn(
        selected && "bg-foreground/10",
        disabled && "opacity-40",
      )}
      cornerLabel={
        selected ? (
          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check size={12} strokeWidth={3} />
          </span>
        ) : undefined
      }
      visual={<SceneBubble bubble={bubble} />}
    />
  );
};
