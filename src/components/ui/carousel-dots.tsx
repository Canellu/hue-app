import { useEffect, useRef, useState } from "react";

import {
  type CarouselApi,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

/**
 * The segmented page indicator for a {@link Carousel}: one segment per snap
 * point (page), with the active one widened. Press-drag across the track to
 * scrub between pages — the dots double as a draggable scrubber.
 *
 * Renders nothing until the carousel can actually page, so a rail that fits on
 * one screen reads as a plain row with no carousel chrome. Pass `arrows` to
 * flank the dots with prev/next buttons (e.g. in settings, where the extra
 * affordance is wanted but it's hidden on the bare widget).
 */
export const CarouselDots = ({
  api,
  arrows = false,
  className,
}: {
  api: CarouselApi | undefined;
  arrows?: boolean;
  className?: string;
}) => {
  const [canScroll, setCanScroll] = useState(false);
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

  // Press-drag scrubbing across the dots: map the pointer's x within the track
  // to a fraction, then page to the nearest dot. Because the dots are evenly
  // spaced, fraction → index is a straight proportional map. Pointer capture
  // keeps a press-drag tracking even when the cursor leaves the row.
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

  if (!canScroll) return null;

  return (
    <div
      className={cn("mt-3 flex items-center justify-center gap-1.5", className)}
    >
      {arrows && (
        <CarouselPrevious className="static size-7 translate-y-0" />
      )}
      <div
        ref={trackRef}
        className="group flex h-5 w-fit cursor-pointer touch-none items-center gap-1.5 px-2"
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
      {arrows && <CarouselNext className="static size-7 translate-y-0" />}
    </div>
  );
};
