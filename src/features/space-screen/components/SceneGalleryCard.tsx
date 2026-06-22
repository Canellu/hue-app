import { Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  gallerySceneBubbleCss,
  HUE_SCENE_GALLERY_COUNT,
  HUE_SCENE_GALLERY_PREVIEWS,
} from "@/features/space-screen/data/hueSceneGallery";
import { TILE_INTERACTION_TRANSITION_CLASS } from "@/lib/tile-theme";
import { UI_EASE_MS } from "@/lib/transitions";
import { cn } from "@/lib/utils";

export const SceneGalleryCard: React.FC<{
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
    className={cn(
      "h-40 w-36 shrink-0 cursor-pointer items-center justify-center gap-4 rounded-[1.75rem] border-2 border-border bg-background px-4 text-center shadow-none outline-none focus-visible:ring-2 focus-visible:ring-ring",
      TILE_INTERACTION_TRANSITION_CLASS,
    )}
    style={
      {
        "--tile-ease": `${UI_EASE_MS.tileBackground}ms`,
      } as React.CSSProperties
    }
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
