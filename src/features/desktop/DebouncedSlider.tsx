import { useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";

interface DebouncedSliderProps {
  /** Committed value (0–100 unless min/max overridden). */
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
  /** Trailing-debounce delay before committing to the bridge. */
  debounceMs?: number;
  /** Fires the debounced/final value once the user pauses or releases. */
  onCommit: (value: number) => void;
  /** Optional immediate, per-frame callback for local visual feedback. */
  onInput?: (value: number) => void;
}

const first = (v: number | readonly number[]): number =>
  Array.isArray(v) ? v[0] : (v as number);

/**
 * A shadcn Slider that updates instantly on screen but throttles writes to the
 * Hue bridge. The handle tracks the cursor every frame (`onValueChange`); the
 * committed value is sent only after the user pauses (`debounceMs`) or releases
 * the pointer (`onValueCommitted`) — the pattern that keeps the bridge from
 * being flooded.
 */
export const DebouncedSlider: React.FC<DebouncedSliderProps> = ({
  value,
  min = 0,
  max = 100,
  disabled,
  ariaLabel,
  className = "w-full",
  debounceMs = 200,
  onCommit,
  onInput,
}) => {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-sync to the authoritative value when not mid-drag (prop changes win).
  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const schedule = (next: number) => {
    setLocal(next);
    onInput?.(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onCommit(next), debounceMs);
  };

  const commitNow = (next: number) => {
    if (timer.current) clearTimeout(timer.current);
    onCommit(next);
  };

  return (
    <Slider
      value={[local]}
      min={min}
      max={max}
      disabled={disabled}
      aria-label={ariaLabel}
      className={className}
      onValueChange={(v) => schedule(first(v))}
      onValueCommitted={(v) => commitNow(first(v))}
    />
  );
};
