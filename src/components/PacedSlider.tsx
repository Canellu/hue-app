import { useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { UI_EASE_MS } from "@/lib/transitions";

interface PacedSliderProps {
  /** Committed value (0–100 unless min/max overridden). */
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
  /** Extra inline styles merged onto the slider root (e.g. a track gradient). */
  style?: React.CSSProperties;
  size?: "default" | "lg" | "xl";
  /**
   * How long (ms) the fill/thumb eases to a value that changed on its own (a
   * toggle ramp, a scene, an external change) — matched to the bridge fade so
   * the bar finishes alongside the bulb. Live drag frames never ease.
   */
  easeMs?: number;
  /**
   * Whether this controls a grouped_light (room/zone). Selects the throttle
   * profile: the Hue Bridge caps group commands at ~1/s but allows ~10/s for a
   * single light (see docs/HUE/hue-system-performance.md).
   */
  isGroup: boolean;
  /** Overrides the hardware default throttle frame, in ms. */
  liveMs?: number;
  /** Fires the paced value (leading, trailing, and on release). */
  onCommit: (value: number, phase: "live" | "final") => void;
  /** Per-frame callback for local visual feedback (fires every move). */
  onInput?: (value: number) => void;
}

const first = (v: number | readonly number[]): number =>
  Array.isArray(v) ? v[0] : (v as number);

/** Hue Bridge command budgets, in ms between writes (see perf doc). */
const GROUP_LIVE_MS = 1000;
const LIGHT_LIVE_MS = 200;

/**
 * How long to keep trusting the value we just sent over inbound bridge echoes.
 * A write triggers a brief flurry of events — including ones the bridge emitted
 * *before* it processed our write (carrying the old value) and intermediate
 * frames mid-transition. Without this guard those echoes snap the thumb back to
 * where the drag started. Cleared early once an echo confirms what we sent.
 */
const SETTLE_MS = 1500;

/**
 * A shadcn Slider tuned for the Hue Bridge's command budget. The handle tracks
 * the pointer at 60fps locally (`onValueChange` → `setLocal`/`onInput`) while
 * writes to the bridge are paced with a hybrid throttle:
 *
 * - **Leading edge** — the first move of a throttle frame commits immediately.
 * - **Trailing catch-up** — if the finger stops but stays down, a deferred
 *   commit fires for the remainder of the current frame so the lights reach the
 *   cursor while held.
 * - **Instant release** — `onValueCommitted` bypasses all pacing and commits the
 *   final resting value, then resets the throttle clock so the next interaction
 *   starts instantly.
 * - **Settle protection** — after committing, the thumb holds the sent value
 *   until the authoritative value catches up, so a stale event can't snap it
 *   backward.
 */
export const PacedSlider: React.FC<PacedSliderProps> = ({
  value,
  min = 0,
  max = 100,
  step,
  disabled,
  ariaLabel,
  className = "w-full",
  style,
  size = "default",
  isGroup,
  liveMs,
  easeMs = UI_EASE_MS.sliderFill,
  onCommit,
  onInput,
}) => {
  const activeLiveMs = liveMs ?? (isGroup ? GROUP_LIVE_MS : LIGHT_LIVE_MS);

  const [local, setLocal] = useState(value);
  // Drives whether the fill/thumb eases: off while the finger is down (so the
  // thumb tracks 1:1), on otherwise (so a value that arrives on its own glides).
  const [interacting, setInteracting] = useState(false);
  // The first paint must land the thumb at its value with no transition — when
  // the slider mounts inside a panel that's opening, an enabled ease would make
  // the thumb visibly travel from the track start to the current value. Easing
  // is switched on only after that initial paint.
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => setHasMounted(true), []);
  // Timestamp (ms) of the last bridge write; 0 means "frame is open, commit now".
  const lastCommitAt = useRef(0);
  // Latest dragged value, read by the trailing timer.
  const latest = useRef(value);
  const trailingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInteracting = useRef(false);
  // The value we last sent and are waiting to see reflected back. While set, we
  // ignore inbound `value` changes that don't match it (stale/echoed state).
  const pending = useRef<number | null>(null);

  // Re-sync to the authoritative value, but never while dragging and never back
  // past a value we've committed but not yet seen confirmed.
  useEffect(() => {
    if (isInteracting.current) return;
    if (pending.current !== null) {
      if (Math.round(value) === Math.round(pending.current)) {
        pending.current = null;
        if (settleTimer.current) clearTimeout(settleTimer.current);
      }
      return;
    }
    setLocal(value);
  }, [value]);

  useEffect(
    () => () => {
      if (trailingTimer.current) clearTimeout(trailingTimer.current);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  // Remember the value we sent so inbound echoes can be reconciled against it,
  // and arm a fallback so a confirmation that never arrives (e.g. a failed
  // write) eventually releases the thumb back to bridge state.
  const armSettle = (next: number) => {
    pending.current = next;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      pending.current = null;
    }, SETTLE_MS);
  };

  const flush = (next: number) => {
    lastCommitAt.current = Date.now();
    onCommit(next, "live");
    armSettle(next);
  };

  const schedule = (next: number) => {
    isInteracting.current = true;
    setInteracting(true);
    latest.current = next;
    setLocal(next);
    onInput?.(next);

    const elapsed = Date.now() - lastCommitAt.current;
    if (elapsed >= activeLiveMs) {
      // Leading edge: a fresh frame, commit straight away.
      if (trailingTimer.current) {
        clearTimeout(trailingTimer.current);
        trailingTimer.current = null;
      }
      flush(next);
    } else {
      // Mid-frame: (re)arm a trailing commit for the remaining time so a paused
      // finger still catches the lights up to where the cursor came to rest.
      if (trailingTimer.current) clearTimeout(trailingTimer.current);
      trailingTimer.current = setTimeout(() => {
        trailingTimer.current = null;
        flush(latest.current);
      }, activeLiveMs - elapsed);
    }
  };

  const commitNow = (next: number) => {
    if (trailingTimer.current) {
      clearTimeout(trailingTimer.current);
      trailingTimer.current = null;
    }
    isInteracting.current = false;
    setInteracting(false);
    latest.current = next;
    setLocal(next);
    onCommit(next, "final");
    armSettle(next);
    // Start the next interaction on a fresh frame so it commits instantly.
    lastCommitAt.current = 0;
  };

  // While the finger is down we add nothing, so position changes are instant.
  // Otherwise the fill and thumb get a transition (a descendant rule, so it wins
  // over the primitive's own) whose duration matches the bridge fade.
  const easeClass =
    interacting || !hasMounted
      ? undefined
      : "[&_[data-slot=slider-range]]:transition-[inset-inline-start,inset-inline-end,left,right,width] [&_[data-slot=slider-range]]:duration-(--paced-ease) [&_[data-slot=slider-range]]:ease-out [&_[data-slot=slider-thumb]]:transition-[inset-inline-start,left,right,translate] [&_[data-slot=slider-thumb]]:duration-(--paced-ease) [&_[data-slot=slider-thumb]]:ease-out";

  return (
    <Slider
      value={[local]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(className, easeClass)}
      size={size}
      style={{ ...style, "--paced-ease": `${easeMs}ms` } as React.CSSProperties}
      onValueChange={(v) => schedule(first(v))}
      onValueCommitted={(v) => commitNow(first(v))}
    />
  );
};
