import { useEffect, useRef, useState } from "react";
import {
  oklchToCss,
  oklchToRgb,
  rgbToOklch,
  rgbToXy,
  xyBriToRgb,
} from "@/features/space-screen/utils/color";

interface ColorWheelProps {
  /** Current CIE xy of the light, used to position the pin. */
  xy: [number, number] | null;
  /** Throttled while dragging; always fired once more on release. */
  onPick: (xy: [number, number]) => void;
}

const SIZE = 220;
const RADIUS = SIZE / 2;
const THROTTLE_MS = 180;

// The wheel is drawn in OKLCH: angle picks hue, distance-from-center picks
// chroma at a fixed lightness. Out-of-gamut chroma is mapped back into sRGB by
// `oklchToRgb`, so the rim shows the most saturated displayable color per hue.
const WHEEL_L = 0.72;
const MAX_CHROMA = 0.4;

/**
 * An OKLCH hue/chroma wheel. The chosen color is converted to CIE xy for the
 * bridge. Writes are throttled while dragging and committed once more on
 * pointer release.
 */
export const ColorWheel: React.FC<ColorWheelProps> = ({ xy, onPick }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const lastEmit = useRef(0);
  const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Local pin position (0–1 within the wheel), so dragging feels instant.
  const [pin, setPin] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.5 });

  // Paint the wheel once.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(SIZE, SIZE);
    const data = image.data;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx = x - RADIUS;
        const dy = y - RADIUS;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const idx = (y * SIZE + x) * 4;
        if (dist > RADIUS) {
          data[idx + 3] = 0;
          continue;
        }
        let hue = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (hue < 0) hue += 360;
        const chroma = Math.min(dist / RADIUS, 1) * MAX_CHROMA;
        const { r, g, b } = oklchToRgb(WHEEL_L, chroma, hue);
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        // Soft 1px antialiased edge.
        data[idx + 3] = dist > RADIUS - 1 ? Math.round((RADIUS - dist) * 255) : 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, []);

  // Reflect the light's current color onto the pin (when not dragging).
  useEffect(() => {
    if (dragging.current || !xy) return;
    const { r, g, b } = xyBriToRgb(xy[0], xy[1], 1);
    const { C, h } = rgbToOklch(r, g, b);
    const sat = Math.min(C / MAX_CHROMA, 1);
    const angle = (h * Math.PI) / 180;
    setPin({
      x: 0.5 + (Math.cos(angle) * sat) / 2,
      y: 0.5 + (Math.sin(angle) * sat) / 2,
    });
  }, [xy]);

  const emit = (nx: number, ny: number, force: boolean) => {
    const dx = nx - 0.5;
    const dy = ny - 0.5;
    let hue = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (hue < 0) hue += 360;
    const chroma = Math.min(Math.sqrt(dx * dx + dy * dy) * 2, 1) * MAX_CHROMA;
    const { r, g, b } = oklchToRgb(WHEEL_L, chroma, hue);
    const next = rgbToXy(r, g, b);

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
    let nx = (clientX - rect.left) / rect.width;
    let ny = (clientY - rect.top) / rect.height;
    // Clamp to the circle.
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
    const pos = positionFromEvent(clientX, clientY);
    if (!pos) return;
    setPin(pos);
    emit(pos.x, pos.y, force);
  };

  useEffect(
    () => () => {
      if (trailing.current) clearTimeout(trailing.current);
    },
    [],
  );

  const pinColor = (() => {
    const dx = pin.x - 0.5;
    const dy = pin.y - 0.5;
    let hue = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (hue < 0) hue += 360;
    const chroma = Math.min(Math.sqrt(dx * dx + dy * dy) * 2, 1) * MAX_CHROMA;
    return oklchToCss(WHEEL_L, chroma, hue);
  })();

  return (
    <div
      ref={containerRef}
      className="relative cursor-crosshair touch-none rounded-full ring-1 ring-foreground/10"
      style={{ width: SIZE, height: SIZE }}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
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
        width={SIZE}
        height={SIZE}
        className="rounded-full"
      />
      <span
        className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md ring-1 ring-black/20"
        style={{
          left: `${pin.x * 100}%`,
          top: `${pin.y * 100}%`,
          background: pinColor,
        }}
      />
    </div>
  );
};
