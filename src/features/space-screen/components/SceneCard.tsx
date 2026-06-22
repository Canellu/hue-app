import { MoreHorizontal, Palette, Play, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  sceneBrightness,
  sceneBubbleCss,
  sceneHexes,
} from "@/features/space-screen/utils/color-state";
import { isSceneDynamicActive } from "@/features/space-screen/utils/scene-status";
import { activeTileTheme } from "@/lib/tile-theme";
import { cn } from "@/lib/utils";
import type { HueScene } from "@/types/hue";
import { SceneTile } from "./SceneTile";

export const SceneCard: React.FC<{
  scene: HueScene;
  active?: boolean;
  compact?: boolean;
  onApply: (scene: HueScene) => void;
  /** Open the scene in the side pane without applying it. */
  onInspect: (scene: HueScene) => void;
  onTogglePlay: (scene: HueScene) => void;
}> = ({
  scene,
  active = false,
  compact = false,
  onApply,
  onInspect,
  onTogglePlay,
}) => {
  const bubble = sceneBubbleCss(scene);
  const activeBackground = active && bubble != null;
  const dynamicActive = isSceneDynamicActive(scene);

  return (
    <SceneTile
      name={scene.name}
      ariaPressed={active}
      activeBackground={activeBackground}
      fullWidth={compact}
      className={
        activeBackground ? "text-foreground" : active ? "bg-accent" : undefined
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
      // Tapping a scene always applies its colors to the room's lights.
      onActivate={() => onApply(scene)}
      // The overflow button opens the inspector side pane (details + edit)
      // without applying the scene.
      topRightAction={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Open ${scene.name} options`}
          className={cn(
            activeBackground &&
              "text-foreground hover:bg-white/20 hover:text-foreground",
          )}
          onClick={(event) => {
            event.stopPropagation();
            onInspect(scene);
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      }
      visual={
        <SceneCardVisual
          active={active}
          bubble={bubble}
          compact={compact}
          dynamic={scene.dynamic}
          dynamicActive={dynamicActive}
          sceneName={scene.name}
          onTogglePlay={() => onTogglePlay(scene)}
        />
      }
    />
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
          "flex aspect-square shrink-0 items-center justify-center rounded-full shadow-sm ring-1 ring-foreground/15 backdrop-blur-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
          showBubble
            ? "text-white"
            : active || bubble
              ? "bg-white/30 text-white"
              : "bg-foreground/15 text-foreground",
          size,
        )}
        style={
          showBubble ? { background: bubble } : undefined
        }
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
        className={cn(
          "aspect-square shrink-0 rounded-full shadow-sm ring-1 ring-foreground/15",
          size,
        )}
        style={{ background: bubble }}
      />
    );
  }

  return (
    <span
      className={cn(
        "flex aspect-square shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground ring-1 ring-foreground/10",
        size,
      )}
    >
      <Palette className="size-6" />
    </span>
  );
};
