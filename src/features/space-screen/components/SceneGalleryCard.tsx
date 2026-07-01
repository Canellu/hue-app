import { Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  gallerySceneBubbleCss,
  HUE_SCENE_GALLERY_PREVIEWS,
} from "@/features/space-screen/data/hueSceneGallery";
import { TILE_INTERACTION_TRANSITION_CLASS } from "@/lib/tile-theme";
import { UI_EASE_MS } from "@/lib/transitions";
import { cn } from "@/lib/utils";

export const SceneGalleryCard: React.FC<{
  onOpen?: () => void;
  editing?: boolean;
  disabled?: boolean;
}> = ({ onOpen, editing = false, disabled = false }) => {
  const inactive = editing || disabled;
  return (
    <Card
      size="sm"
      role="button"
      tabIndex={inactive ? -1 : 0}
      aria-disabled={inactive}
      onClick={inactive ? undefined : onOpen}
      onKeyDown={(event) => {
        if (inactive) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen?.();
        }
      }}
      className={cn(
        "h-36 w-32 shrink-0 items-center justify-center gap-3 rounded-[1.75rem] border-2 border-border bg-background px-3 text-center shadow-none outline-none focus-visible:ring-2 focus-visible:ring-ring",
        editing
          ? "cursor-grab"
          : disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer",
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
              className="flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground shadow-sm ring-2 ring-background"
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
      <span className="text-base leading-tight font-semibold">
        Scene gallery
      </span>
    </Card>
  );
};
