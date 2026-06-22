import type { Gamut } from "@/features/space-screen/utils/color";
import {
  hsvToRgb,
  rgbToCss,
  rgbToHex,
  rgbToXy,
} from "@/features/space-screen/utils/color";
import {
  paintColorWheel,
  WHEEL_CANVAS_SIZE,
} from "@/features/space-screen/utils/wheel-canvas";
import {
  pinToHueSaturation,
  xyToPin,
} from "@/features/space-screen/utils/wheel-color";
import { useEffect, useRef, useState } from "react";

interface ColorWheelProps {
  /** Current CIE xy of the light, used to position the pin. */
  xy: [number, number] | null;
  /** The light's gamut; picks are clamped into it before being sent. */
  gamut?: Gamut | null;
  /**
   * Throttled while dragging; always fired once more on release. `vividHex` is
   * the exact (pre-gamut-clamp) color the thumb shows, so cards and tiles can
   * render the same vivid color instead of the duller readback of the clamped
   * xy the bridge stores.
   */
  onPick: (xy: [number, number], vividHex: string) => void;
}

const THROTTLE_MS = 180;
// Half the thumb's rendered diameter (size-8 = 32px). A press within this many
// pixels of the thumb centre grabs it; a press outside snaps it to the cursor.
const THUMB_HIT_RADIUS = 16;

// A standard HSV wheel: hue is the angle, saturation is the radius, value is
// fixed at full. Red (hue 0) sits at 12 o'clock and hues increase clockwise, so
// a quarter turn is 90° of hue. White is at the center, fully saturated colors
// at the rim. The hue/saturation math lives in `wheel-color.ts` so light cards
// and tile gradients can render the same colors this wheel paints.

/**
 * A standard HSV hue/saturation wheel. The chosen color is converted to CIE xy
 * (clamped into the light's gamut) for the bridge. Writes are throttled while
 * dragging and committed once more on pointer release.
 */
export const ColorWheel: React.FC<ColorWheelProps> = ({
  xy,
  gamut,
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
  // The xy we last sent. The picked color is clamped into the light's gamut, so
  // an edge pick resolves to a less-saturated reachable color whose reflection
  // would pull the pin back inside the rim. We keep the pin where the user put
  // it by ignoring inbound xy that is (within rounding) the value we just sent.
  const lastEmitted = useRef<[number, number] | null>(null);

  // Local pin position (0–1 within the wheel), so dragging feels instant.
  const [pin, setPin] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.5 });

  // Paint the wheel once: hue from angle, saturation from radius, value = 1.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) paintColorWheel(ctx);
  }, []);

  // Reflect the light's current color onto the pin (when not dragging) — unless
  // this xy is the echo of our own pick, in which case the pin already sits
  // where the user placed it and must not be pulled back off the rim.
  useEffect(() => {
    if (dragging.current || !xy) return;
    const sent = lastEmitted.current;
    if (
      sent &&
      Math.abs(sent[0] - xy[0]) < 0.012 &&
      Math.abs(sent[1] - xy[1]) < 0.012
    ) {
      return;
    }
    setPin(xyToPin(xy));
  }, [xy]);

  useEffect(
    () => () => {
      if (trailing.current) clearTimeout(trailing.current);
    },
    [],
  );

  const emit = (px: number, py: number, force: boolean) => {
    const [hue, saturation] = pinToHueSaturation(px, py);
    const rgb = hsvToRgb(hue, saturation, 1);
    const next = rgbToXy(rgb.r, rgb.g, rgb.b, gamut);
    // The vivid color the thumb shows for this pin, before gamut clamping.
    const vividHex = rgbToHex(rgb);
    lastEmitted.current = next;
    const now = Date.now();
    if (trailing.current) {
      clearTimeout(trailing.current);
      trailing.current = null;
    }
    if (force || now - lastEmit.current >= THROTTLE_MS) {
      lastEmit.current = now;
      onPick(next, vividHex);
    } else {
      trailing.current = setTimeout(() => {
        lastEmit.current = Date.now();
        onPick(next, vividHex);
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
    const pos = positionFromEvent(clientX, clientY);
    if (!pos) return;
    setPin(pos);
    emit(pos.x, pos.y, force);
  };

  const pinColor = (() => {
    const [hue, saturation] = pinToHueSaturation(pin.x, pin.y);
    return rgbToCss(hsvToRgb(hue, saturation, 1));
  })();

  return (
    <div className="flex w-full flex-col gap-3">
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
          width={WHEEL_CANVAS_SIZE}
          height={WHEEL_CANVAS_SIZE}
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
    </div>
  );
};
