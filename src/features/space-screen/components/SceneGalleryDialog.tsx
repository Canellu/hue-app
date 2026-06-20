import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  gallerySceneBubbleCss,
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
  // Brief acknowledgement shown on a button after an action lands, since the
  // gallery stays open (closing is explicit) and otherwise nothing would change.
  const [confirmation, setConfirmation] = useState<null | "saved" | "set">(
    null,
  );
  const confirmationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashConfirmation = (kind: "saved" | "set") => {
    setConfirmation(kind);
    if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    confirmationTimer.current = setTimeout(() => setConfirmation(null), 1400);
  };

  // Forget the in-modal selection when the gallery closes; the parent's
  // onOpenChange is what reverts the lights themselves.
  useEffect(() => {
    if (!open) {
      setPreviewedPreset(null);
      setConfirmation(null);
      if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    }
  }, [open]);

  useEffect(
    () => () => {
      if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    },
    [],
  );

  const adding = pendingSceneId != null;
  const handlePreview = (preset: HueGalleryScenePreset) => {
    setConfirmation(null);
    setPreviewedPreset(preset);
    onScenePreview(preset);
  };

  const handleSetOnce = () => {
    if (!previewedPreset) return;
    onSceneApplyOnce(previewedPreset);
    flashConfirmation("set");
  };

  const handleSave = async () => {
    if (!previewedPreset || adding) return;
    try {
      await onSceneCreate(previewedPreset);
      flashConfirmation("saved");
    } catch {
      // The store surfaces the error in the space view; leave the modal open.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-3rem)] gap-4 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Hue scene gallery</DialogTitle>
          <DialogDescription>
            Tap a preset to preview it live in {roomZoneName}. Set once applies
            it now; Save to {roomZoneName} keeps it as a scene.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea
          fade
          className="h-[min(34rem,calc(100vh-15rem))]"
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
              {confirmation === "set" ? "Set" : "Set once"}
            </Button>
            <Button
              disabled={!previewedPreset || adding}
              onClick={() => void handleSave()}
            >
              {adding
                ? "Saving…"
                : confirmation === "saved"
                  ? "Saved"
                  : `Save to ${roomZoneName}`}
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
      fullWidth
      ariaPressed={previewed}
      activeBackground={activeBackground}
      cornerLabel={`${Math.round(preset.brightness)}%`}
      cornerLabelLeft={
        preset.dynamic ? hueDynamicSpeedValueToStep(preset.speed) : undefined
      }
      className={
        activeBackground
          ? "text-foreground"
          : "border border-border bg-transparent shadow-none"
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
