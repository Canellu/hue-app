import { useEffect, useRef, useState } from "react";
import {
  type Oklch,
  oklchToRgb,
  rgbToCss,
} from "@/features/space-screen/utils/color";

interface TemperatureWheelProps {
  value: number;
  min: number;
  max: number;
  onPick: (mired: number) => void;
}

const CANVAS_SIZE = 360;
const RADIUS = CANVAS_SIZE / 2;
const THROTTLE_MS = 180;
// Half the thumb's rendered diameter (size-8 = 32px). A press within this many
// pixels of the thumb centre grabs it; a press outside snaps it to the cursor.
const THUMB_HIT_RADIUS = 16;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const temperatureStops: Array<[number, Oklch]> = [
  [0, { L: 0.81, C: 0.13, h: 75 }],
  [0.12, { L: 0.86, C: 0.11, h: 84 }],
  [0.26, { L: 0.9, C: 0.095, h: 90 }],
  [0.44, { L: 0.95, C: 0.06, h: 94 }],
  [0.62, { L: 0.98, C: 0.032, h: 98 }],
  [0.82, { L: 0.995, C: 0.006, h: 96 }],
  [0.92, { L: 0.98, C: 0.012, h: 204 }],
  [0.97, { L: 0.96, C: 0.026, h: 208 }],
  [1, { L: 0.94, C: 0.04, h: 208 }],
];

const mixOklch = (from: Oklch, to: Oklch, amount: number): Oklch => ({
  L: from.L + (to.L - from.L) * amount,
  C: from.C + (to.C - from.C) * amount,
  h: from.h + (to.h - from.h) * amount,
});

const valueFromY = (y: number, min: number, max: number): number =>
  Math.round(max - clamp01(y) * (max - min));

const yFromValue = (value: number, min: number, max: number): number => {
  if (max === min) return 0.5;
  return clamp01((max - value) / (max - min));
};

const pinFromValue = (value: number, min: number, max: number) => ({
  x: 0.5,
  y: yFromValue(value, min, max),
});

const temperatureWheelColor = (y: number) => {
  let from = temperatureStops[0];
  let to = temperatureStops[temperatureStops.length - 1];

  for (let i = 1; i < temperatureStops.length; i++) {
    if (y <= temperatureStops[i][0]) {
      from = temperatureStops[i - 1];
      to = temperatureStops[i];
      break;
    }
  }

  const span = to[0] - from[0] || 1;
  const color = mixOklch(from[1], to[1], clamp01((y - from[0]) / span));
  return oklchToRgb(color.L, color.C, color.h);
};

/**
 * Hue-style white temperature selector. The bridge exposes color temperature as
 * one mired value, so the vertical position controls the emitted temperature;
 * the two-dimensional pin movement mirrors the Hue app's white ambiance picker.
 */
export const TemperatureWheel: React.FC<TemperatureWheelProps> = ({
  value,
  min,
  max,
  onPick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  // Client-pixel offset from the cursor to the thumb centre, locked on press so
  // a grab inside the thumb drags it without snapping the centre to the cursor.
  const dragOffset = useRef({ x: 0, y: 0 });
  const lastEmit = useRef(0);
  const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmitted = useRef<number | null>(null);

  const [pin, setPin] = useState(() => pinFromValue(value, min, max));

  useEffect(() => {
    if (dragging.current) return;
    if (
      lastEmitted.current != null &&
      Math.abs(lastEmitted.current - value) <= 1
    ) {
      return;
    }
    setPin(pinFromValue(value, min, max));
  }, [value, min, max]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const image = ctx.createImageData(CANVAS_SIZE, CANVAS_SIZE);
    const data = image.data;

    for (let y = 0; y < CANVAS_SIZE; y++) {
      for (let x = 0; x < CANVAS_SIZE; x++) {
        const dx = x - RADIUS;
        const dy = y - RADIUS;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const idx = (y * CANVAS_SIZE + x) * 4;

        if (dist > RADIUS) {
          data[idx + 3] = 0;
          continue;
        }

        const { r, g, b } = temperatureWheelColor(y / (CANVAS_SIZE - 1));
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] =
          dist > RADIUS - 1 ? Math.round((RADIUS - dist) * 255) : 255;
      }
    }

    ctx.putImageData(image, 0, 0);
  }, [min, max]);

  const emit = (nextPin: { x: number; y: number }, force: boolean) => {
    const next = valueFromY(nextPin.y, min, max);
    lastEmitted.current = next;
    const now = Date.now();

    if (trailing.current) {
      clearTimeout(trailing.current);
      trailing.current = null;
    }

    if (force || now - lastEmit.current >= THROTTLE_MS) {
      lastEmit.current = now;
      onPick(next);
    } else {
      trailing.current = setTimeout(() => {
        lastEmit.current = Date.now();
        onPick(next);
      }, THROTTLE_MS);
    }
  };

  const positionFromEvent = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    let nx = (clientX + dragOffset.current.x - rect.left) / rect.width;
    let ny = (clientY + dragOffset.current.y - rect.top) / rect.height;
    const dx = nx - 0.5;
    const dy = ny - 0.5;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.5) {
      nx = 0.5 + (dx / dist) * 0.5;
      ny = 0.5 + (dy / dist) * 0.5;
    }
    return { x: nx, y: ny };
  };

  const handlePointer = (clientX: number, clientY: number, force: boolean) => {
    const nextPin = positionFromEvent(clientX, clientY);
    if (!nextPin) return;
    setPin(nextPin);
    emit(nextPin, force);
  };

  useEffect(
    () => () => {
      if (trailing.current) clearTimeout(trailing.current);
    },
    [],
  );

  const pinColor = rgbToCss(temperatureWheelColor(pin.y));

  return (
    <div
      ref={containerRef}
      className="relative aspect-square w-full cursor-pointer touch-none rounded-full"
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const thumbX = rect.left + pin.x * rect.width;
          const thumbY = rect.top + pin.y * rect.height;
          const grabbed =
            Math.hypot(e.clientX - thumbX, e.clientY - thumbY) <=
            THUMB_HIT_RADIUS;
          dragOffset.current = grabbed
            ? { x: thumbX - e.clientX, y: thumbY - e.clientY }
            : { x: 0, y: 0 };
        }
        handlePointer(e.clientX, e.clientY, false);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        handlePointer(e.clientX, e.clientY, false);
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        handlePointer(e.clientX, e.clientY, true);
      }}
    >
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="size-full rounded-full"
      />
      <span
        aria-hidden="true"
        className="absolute z-10 size-8 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border-2 border-white shadow-md ring-1 ring-black/20 transition-[width,height] hover:size-9.5 active:size-9"
        style={{
          left: `${pin.x * 100}%`,
          top: `${pin.y * 100}%`,
          background: pinColor,
        }}
      />
    </div>
  );
};
