import { useEffect, useRef, useState } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import type { HueGalleryScenePreset } from "@/features/space-screen/data/hueSceneGallery";
import type { HueScene } from "@/types/hue";
import { SceneCard } from "./SceneCard";
import { SceneGalleryCard } from "./SceneGalleryCard";
import { SceneGalleryDialog } from "./SceneGalleryDialog";

const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;

const scrollViewportBy = (
  viewport: HTMLDivElement,
  rawDelta: number,
  deltaMode: number,
) => {
  const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth;

  if (maxScrollLeft <= 0) {
    return false;
  }

  const delta =
    deltaMode === WHEEL_DELTA_LINE
      ? rawDelta * 16
      : deltaMode === WHEEL_DELTA_PAGE
        ? rawDelta * viewport.clientWidth
        : rawDelta;
  const nextScrollLeft = Math.min(
    maxScrollLeft,
    Math.max(0, viewport.scrollLeft + delta),
  );

  if (nextScrollLeft === viewport.scrollLeft) {
    return false;
  }

  viewport.scrollLeft = nextScrollLeft;
  return true;
};

const handleSceneWheel = (event: WheelEvent, viewport: HTMLDivElement) => {
  if (!event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
    return;
  }

  if (!scrollViewportBy(viewport, event.deltaY, event.deltaMode)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
};

function useDragScroll(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const viewport = ref.current;
    if (!viewport) return;

    let pointerId: number | null = null;
    let startX = 0;
    let startScrollLeft = 0;
    let didDrag = false;
    let suppressNextClick = false;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || viewport.scrollWidth <= viewport.clientWidth) {
        return;
      }

      pointerId = event.pointerId;
      startX = event.clientX;
      startScrollLeft = viewport.scrollLeft;
      didDrag = false;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;

      const delta = event.clientX - startX;
      if (!didDrag && Math.abs(delta) < 8) return;

      if (!didDrag) {
        viewport.setPointerCapture(event.pointerId);
      }
      didDrag = true;
      viewport.scrollLeft = startScrollLeft - delta;
      event.preventDefault();
    };

    const endDrag = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;

      pointerId = null;
      if (viewport.hasPointerCapture(event.pointerId)) {
        viewport.releasePointerCapture(event.pointerId);
      }
      if (didDrag) {
        suppressNextClick = true;
        window.setTimeout(() => {
          suppressNextClick = false;
        }, 0);
      }
    };

    const onClick = (event: MouseEvent) => {
      if (!suppressNextClick) return;

      event.preventDefault();
      event.stopPropagation();
      suppressNextClick = false;
    };

    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", endDrag);
    viewport.addEventListener("pointercancel", endDrag);
    viewport.addEventListener("click", onClick, true);
    return () => {
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", endDrag);
      viewport.removeEventListener("pointercancel", endDrag);
      viewport.removeEventListener("click", onClick, true);
    };
  }, [ref]);
}

interface ScenesSectionProps {
  roomZoneName: string;
  scenes: HueScene[];
  activeSceneId: string | null;
  onSceneApply: (scene: HueScene) => void;
  onSceneInspect: (scene: HueScene) => void;
  onSceneTogglePlay: (scene: HueScene) => void;
  onGallerySceneCreate: (preset: HueGalleryScenePreset) => Promise<void>;
  onGallerySceneApplyOnce: (preset: HueGalleryScenePreset) => void;
  onGalleryScenePreview: (preset: HueGalleryScenePreset) => void;
  onGalleryScenePreviewEnd: () => void;
}

export const ScenesSection: React.FC<ScenesSectionProps> = ({
  roomZoneName,
  scenes,
  activeSceneId,
  onSceneApply,
  onSceneInspect,
  onSceneTogglePlay,
  onGallerySceneCreate,
  onGallerySceneApplyOnce,
  onGalleryScenePreview,
  onGalleryScenePreviewEnd,
}) => {
  const [sceneGalleryOpen, setSceneGalleryOpen] = useState(false);
  const [pendingGallerySceneId, setPendingGallerySceneId] = useState<
    string | null
  >(null);

  const scenesViewportRef = useRef<HTMLDivElement>(null);
  useDragScroll(scenesViewportRef);

  useEffect(() => {
    const viewport = scenesViewportRef.current;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      handleSceneWheel(event, viewport);
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, []);

  // Saving keeps the gallery open — closing is explicit (the X or backdrop) so
  // the user can keep auditioning presets and add several without reopening.
  const handleGallerySceneCreate = async (preset: HueGalleryScenePreset) => {
    if (pendingGallerySceneId != null) return;
    setPendingGallerySceneId(preset.id);
    try {
      await onGallerySceneCreate(preset);
    } finally {
      setPendingGallerySceneId(null);
    }
  };
  // Closing the gallery without adding reverts the live preview to whatever the
  // room looked like before. (After a successful add the store has already
  // dropped its snapshot, so this revert is a no-op.)
  const handleGalleryOpenChange = (open: boolean) => {
    if (!open) onGalleryScenePreviewEnd();
    setSceneGalleryOpen(open);
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-sm font-medium text-muted-foreground">Scenes</p>
      <ScrollArea
        fade="horizontal"
        orientation="horizontal"
        hideScrollbar
        className="min-w-0"
        viewportClassName="cursor-grab select-none pb-1 active:cursor-grabbing"
        viewportRef={scenesViewportRef}
      >
        <div className="grid w-max grid-flow-col grid-rows-2 gap-3 p-2">
          <SceneGalleryCard onOpen={() => setSceneGalleryOpen(true)} />
          {scenes.map((scene) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              active={scene.id === activeSceneId}
              onApply={onSceneApply}
              onInspect={onSceneInspect}
              onTogglePlay={onSceneTogglePlay}
            />
          ))}
        </div>
      </ScrollArea>
      <SceneGalleryDialog
        open={sceneGalleryOpen}
        roomZoneName={roomZoneName}
        pendingSceneId={pendingGallerySceneId}
        onOpenChange={handleGalleryOpenChange}
        onScenePreview={onGalleryScenePreview}
        onSceneApplyOnce={onGallerySceneApplyOnce}
        onSceneCreate={handleGallerySceneCreate}
      />
    </div>
  );
};
