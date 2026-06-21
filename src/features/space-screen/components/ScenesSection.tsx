import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import type { HueGalleryScenePreset } from "@/features/space-screen/data/hueSceneGallery";
import { cn } from "@/lib/utils";
import type { HueScene } from "@/types/hue";
import { SceneCard } from "./SceneCard";
import { SceneGalleryCard } from "./SceneGalleryCard";
import { SceneGalleryDialog } from "./SceneGalleryDialog";

// A scene tile is `w-36` (144px) and the rail uses `gap-3` (12px). A column
// occupies one card width plus the gap that follows it.
const SCENE_CARD_WIDTH = 144;
const SCENE_GAP = 12;
// The rail never grows past two rows — beyond that it pages, so the Scenes
// section can't push the Lights below it off-screen.
const MAX_ROWS = 2;

/**
 * How many card columns fit across `ref`'s current width. Tracked with a
 * ResizeObserver so the layout re-derives as the window resizes — this is what
 * lets the rail pick "one row / two rows / carousel" from the actual space
 * available rather than hardcoded breakpoints.
 */
function useColumnCount(ref: React.RefObject<HTMLDivElement | null>): number {
  const [columns, setColumns] = useState(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const width = el.clientWidth;
      const fit = Math.floor(
        (width + SCENE_GAP) / (SCENE_CARD_WIDTH + SCENE_GAP),
      );
      setColumns(Math.max(1, fit));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return columns;
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

  const containerRef = useRef<HTMLDivElement>(null);
  const columnsThatFit = useColumnCount(containerRef);

  // Build the ordered list of tiles (gallery card first, then saved scenes),
  // then decide the layout from how many fit. One row while everything fits on
  // one line; two rows once it spills; only then does the carousel page.
  const tiles: { key: string; node: React.ReactNode }[] = [
    {
      key: "gallery",
      node: <SceneGalleryCard onOpen={() => setSceneGalleryOpen(true)} />,
    },
    ...scenes.map((scene) => ({
      key: scene.id,
      node: (
        <SceneCard
          scene={scene}
          active={scene.id === activeSceneId}
          onApply={onSceneApply}
          onInspect={onSceneInspect}
          onTogglePlay={onSceneTogglePlay}
        />
      ),
    })),
  ];

  const rows = tiles.length <= columnsThatFit ? 1 : MAX_ROWS;

  // Column-major chunking: each carousel slide is a vertical stack of `rows`
  // tiles, matching the original top-to-bottom-then-rightward reading order.
  const columns: (typeof tiles)[] = [];
  for (let i = 0; i < tiles.length; i += rows) {
    columns.push(tiles.slice(i, i + rows));
  }

  // Show the nav only when the carousel can actually move. When the whole rail
  // fits (one or two rows, nothing to page) it reads as a plain grid with no
  // carousel chrome — which is the nicer UX the slider would otherwise clutter.
  const [api, setApi] = useState<CarouselApi>();
  const [canScroll, setCanScroll] = useState(false);
  // Drives the segmented page indicator: one segment per snap point (page), with
  // `selectedIndex` marking the active one. This reads the carousel as discrete
  // pages — you can count the segments to see how many times it pages left/right.
  const [snaps, setSnaps] = useState<number[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!api) return;
    const update = () => {
      setCanScroll(api.canScrollPrev() || api.canScrollNext());
      setSnaps(api.scrollSnapList());
      setSelectedIndex(api.selectedScrollSnap());
    };
    update();
    api.on("select", update);
    api.on("reInit", update);
    return () => {
      api.off("select", update);
      api.off("reInit", update);
    };
  }, [api]);

  // Press-drag scrubbing across the dots: map the pointer's x within the track to
  // a fraction, then page to the nearest dot. Because the dots are evenly spaced,
  // fraction → index is a straight proportional map. Pointer capture keeps a
  // press-drag tracking even when the cursor leaves the row.
  const trackRef = useRef<HTMLDivElement>(null);
  const scrubTo = (clientX: number) => {
    const track = trackRef.current;
    if (!api || !track || snaps.length === 0) return;
    const rect = track.getBoundingClientRect();
    const fraction = Math.min(
      1,
      Math.max(0, (clientX - rect.left) / rect.width),
    );
    api.scrollTo(Math.round(fraction * (snaps.length - 1)));
  };

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
    <div ref={containerRef} className="flex min-w-0 flex-col gap-3 mt-4">
      {/* Remount the carousel when the row count flips so Embla re-measures the
          new slide structure (1-tile vs 2-tile columns) from scratch. */}
      <Carousel
        key={rows}
        setApi={setApi}
        opts={{
          align: "start",
          slidesToScroll: "auto",
          containScroll: "trimSnaps",
        }}
        className="min-w-0"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">Scenes</p>
          {canScroll && (
            <div className="flex items-center gap-2">
              <CarouselPrevious className="static translate-y-0" />
              <CarouselNext className="static translate-y-0" />
            </div>
          )}
        </div>
        <CarouselContent fade className="-ml-3 py-2">
          {columns.map((column) => (
            <CarouselItem
              key={column.map((tile) => tile.key).join("|")}
              className="basis-auto pl-3"
            >
              <div className="flex flex-col gap-3">
                {column.map((tile) => (
                  <Fragment key={tile.key}>{tile.node}</Fragment>
                ))}
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        {canScroll && (
          <div
            ref={trackRef}
            className="group mx-auto mt-3 flex h-5 w-fit cursor-pointer touch-none items-center gap-1.5 px-2"
            role="presentation"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              scrubTo(event.clientX);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                scrubTo(event.clientX);
              }
            }}
          >
            {snaps.map((_, index) => (
              <span
                key={index}
                aria-current={index === selectedIndex}
                className={cn(
                  "h-1.5 rounded-full transition-[width,height,background-color] duration-200",
                  index === selectedIndex
                    ? "w-7 bg-muted-foreground/70 group-hover:h-2.5 group-hover:bg-muted-foreground"
                    : "w-3 bg-muted-foreground/30 group-hover:bg-muted-foreground/50",
                )}
              />
            ))}
          </div>
        )}
      </Carousel>
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
