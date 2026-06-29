import { useEffect, useReducer, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";

import type { HueLight } from "@/types/hue";
import { LightCard } from "./LightCard";

type ControlCommitPhase = "live" | "final";

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

interface LightsSectionProps {
  lights: HueLight[];
  selectedLightId: string | null;
  hueEventRevision: number;
  onSelectLight: (id: string) => void;
  onLightToggle: (light: HueLight, nextOn: boolean) => void;
  onLightBrightness: (
    light: HueLight,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
}

export const LightsSection: React.FC<LightsSectionProps> = ({
  lights,
  selectedLightId,
  hueEventRevision,
  onSelectLight,
  onLightToggle,
  onLightBrightness,
}) => {
  const lightsGridRef = useRef<HTMLDivElement>(null);
  useAnimateOnResize(lightsGridRef);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-muted-foreground">
        Lights{" "}
        <span className="text-muted-foreground/60">{lights.length}</span>
      </p>
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
                  hueEventRevision={hueEventRevision}
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
  );
};
