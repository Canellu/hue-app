import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  gallerySceneBubbleCss,
  HUE_SCENE_GALLERY_COUNT,
  HUE_SCENE_GALLERY_SECTIONS,
  type HueGalleryScenePreset,
} from "@/features/space-screen/data/hueSceneGallery";
import { activeTileTheme } from "@/lib/tile-theme";
import { hueDynamicSpeedValueToStep } from "@/lib/hue-speed";
import { SceneTile } from "./SceneTile";

export const SceneGalleryDialog: React.FC<{
  open: boolean;
  roomZoneName: string;
  pendingSceneId: string | null;
  onOpenChange: (open: boolean) => void;
  onScenePreview: (preset: HueGalleryScenePreset) => void;
  onSceneApplyOnce: (preset: HueGalleryScenePreset) => void;
  onSceneCreate: (preset: HueGalleryScenePreset) => Promise<void>;
}> = ({
  open,
  roomZoneName,
  pendingSceneId,
  onOpenChange,
  onScenePreview,
  onSceneApplyOnce,
  onSceneCreate,
}) => {
  const [previewedPreset, setPreviewedPreset] =
    useState<HueGalleryScenePreset | null>(null);

  // Forget the in-modal selection when the gallery closes; the parent's
  // onOpenChange is what reverts the lights themselves.
  useEffect(() => {
    if (!open) setPreviewedPreset(null);
  }, [open]);

  const adding = pendingSceneId != null;
  const handlePreview = (preset: HueGalleryScenePreset) => {
    setPreviewedPreset(preset);
    onScenePreview(preset);
  };

  const handleSetOnce = () => {
    if (!previewedPreset) return;
    onSceneApplyOnce(previewedPreset);
    onOpenChange(false);
  };

  const handleSave = async () => {
    if (!previewedPreset || adding) return;
    try {
      await onSceneCreate(previewedPreset);
      onOpenChange(false);
    } catch {
      // The store surfaces the error in the space view; leave the modal open.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] gap-4 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Hue scene gallery{" "}
            <span className="text-muted-foreground">
              {HUE_SCENE_GALLERY_COUNT}
            </span>
          </DialogTitle>
        </DialogHeader>
        <ScrollArea
          fade
          className="h-[min(44rem,calc(100vh-11rem))]"
          viewportClassName="pr-3"
        >
          <div className="space-y-12">
            {HUE_SCENE_GALLERY_SECTIONS.map((section) => (
              <section key={section.id} className="space-y-4">
                <div className="min-w-0 space-y-0.5">
                  <h3 className="truncate text-base font-semibold">
                    {section.title}{" "}
                    <span className="text-muted-foreground">
                      {section.scenes.length}
                    </span>
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {section.description}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {[...section.scenes]
                    .sort((a, b) => a.brightness - b.brightness)
                    .map((preset) => (
                      <GalleryPresetCard
                        key={preset.id}
                        preset={preset}
                        previewed={preset.id === previewedPreset?.id}
                        onPreview={handlePreview}
                      />
                    ))}
                </div>
              </section>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter className="sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {previewedPreset
              ? `Previewing ${previewedPreset.name}`
              : "Tap a preset to preview it live."}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!previewedPreset || adding}
              onClick={handleSetOnce}
            >
              Set once
            </Button>
            <Button
              disabled={!previewedPreset || adding}
              onClick={() => void handleSave()}
            >
              Save to {roomZoneName}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const GalleryPresetCard: React.FC<{
  preset: HueGalleryScenePreset;
  previewed: boolean;
  onPreview: (preset: HueGalleryScenePreset) => void;
}> = ({ preset, previewed, onPreview }) => {
  const bubble = gallerySceneBubbleCss(preset);
  const activeBackground = previewed && bubble != null;

  return (
    <SceneTile
      name={preset.name}
      ariaPressed={previewed}
      activeBackground={activeBackground}
      cornerLabel={`${Math.round(preset.brightness)}%`}
      cornerLabelLeft={
        preset.dynamic ? hueDynamicSpeedValueToStep(preset.speed) : undefined
      }
      className={
        activeBackground
          ? "text-foreground"
          : // A hairline edge 0.04 lighter/darker than the `--tile` surface
            // (light 0.99 → 0.95, dark 0.26 → 0.30) so the card reads as a
            // distinct chip without a hard border.
            "border border-[oklch(0.95_0_0)] dark:border-[oklch(0.30_0_0)]"
      }
      style={
        activeBackground && bubble
          ? activeTileTheme(bubble, preset.colors[0]?.hex ?? bubble)
          : undefined
      }
      onActivate={() => onPreview(preset)}
      visual={
        bubble ? (
          <span
            className="aspect-square size-14 shrink-0 rounded-full shadow-sm ring-1 ring-foreground/15"
            style={{ background: bubble }}
          />
        ) : (
          <span className="flex aspect-square size-14 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground ring-1 ring-foreground/10">
            <Sparkles className="size-6" />
          </span>
        )
      }
    />
  );
};
