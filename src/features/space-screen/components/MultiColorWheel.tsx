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
import type { HueLight } from "@/types/hue";
import { useEffect, useRef, useState } from "react";

interface MultiColorWheelProps {
  /** Color-capable lights of the space; each gets its own draggable thumb. */
  lights: HueLight[];
  /**
   * Fired (throttled while dragging, once more on release) for one light.
   * `vividHex` is the exact pre-gamut-clamp color the thumb shows, so the
   * room/zone tile renders the same vivid color the wheel paints.
   */
  onPick: (light: HueLight, xy: [number, number], vividHex: string) => void;
}

const THROTTLE_MS = 180;
// Half the thumb's rendered diameter (size-7 = 28px). A press within this many
// pixels of a thumb centre drags it from where it is; a press farther away
// grabs the nearest thumb and snaps it to the cursor.
const THUMB_HIT_RADIUS = 14;

type Pin = { x: number; y: number };

const pinForLight = (light: HueLight): Pin =>
  light.xy ? xyToPin(light.xy) : { x: 0.5, y: 0.5 };

/**
 * Group color picker: the same HSV wheel as {@link ColorWheel}, but with one
 * thumb per color light so a whole room/zone can be tuned at once. Pressing the
 * wheel grabs the nearest thumb; dragging moves only that light's color. Each
 * thumb reflects its light's live color when idle and tracks the drag instantly.
 */
export const MultiColorWheel: React.FC<MultiColorWheelProps> = ({
  lights,
  onPick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const activeId = useRef<string | null>(null);
  // Client-pixel offset from the cursor to the grabbed thumb centre, locked on
  // press so a grab inside a thumb drags it without snapping it to the cursor.
  const dragOffset = useRef({ x: 0, y: 0 });
  const lastEmit = useRef(0);
  const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The xy we last sent per light. A pick is clamped into the light's gamut, so
  // the echoed xy can pull a rim thumb back inside; ignore inbound xy that is
  // (within rounding) the value we just sent so the thumb stays put.
  const lastEmitted = useRef<Record<string, [number, number]>>({});

  // Local pin positions (0–1 within the disk) keyed by light id, so dragging
  // feels instant and survives store updates mid-drag.
  const [pins, setPins] = useState<Record<string, Pin>>(() =>
    Object.fromEntries(lights.map((light) => [light.id, pinForLight(light)])),
  );

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) paintColorWheel(ctx);
  }, []);

  // Reflect each light's live color onto its thumb when idle, skipping the thumb
  // whose echo we are still ignoring (see `lastEmitted`).
  useEffect(() => {
    if (dragging.current) return;
    setPins((prev) => {
      const next: Record<string, Pin> = {};
      for (const light of lights) {
        const sent = lastEmitted.current[light.id];
        if (
          light.xy &&
          sent &&
          Math.abs(sent[0] - light.xy[0]) < 0.012 &&
          Math.abs(sent[1] - light.xy[1]) < 0.012
        ) {
          next[light.id] = prev[light.id] ?? pinForLight(light);
        } else {
          next[light.id] = pinForLight(light);
        }
      }
      return next;
    });
  }, [lights]);

  useEffect(
    () => () => {
      if (trailing.current) clearTimeout(trailing.current);
    },
    [],
  );

  const emit = (light: HueLight, px: number, py: number, force: boolean) => {
    const [hue, saturation] = pinToHueSaturation(px, py);
    const rgb = hsvToRgb(hue, saturation, 1);
    const next = rgbToXy(rgb.r, rgb.g, rgb.b, light.gamut);
    // The vivid color this thumb shows for the pin, before gamut clamping.
    const vividHex = rgbToHex(rgb);
    lastEmitted.current[light.id] = next;
    const now = Date.now();
    if (trailing.current) {
      clearTimeout(trailing.current);
      trailing.current = null;
    }
    if (force || now - lastEmit.current >= THROTTLE_MS) {
      lastEmit.current = now;
      onPick(light, next, vividHex);
    } else {
      trailing.current = setTimeout(() => {
        lastEmit.current = Date.now();
        onPick(light, next, vividHex);
      }, THROTTLE_MS);
    }
  };

  const positionFromEvent = (clientX: number, clientY: number): Pin | null => {
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
    const id = activeId.current;
    if (!id) return;
    const light = lights.find((candidate) => candidate.id === id);
    if (!light) return;
    const pos = positionFromEvent(clientX, clientY);
    if (!pos) return;
    setPins((prev) => ({ ...prev, [id]: pos }));
    emit(light, pos.x, pos.y, force);
  };

  // Pick the thumb whose centre is closest to the press, and lock the grab
  // offset only when the press lands within the thumb's hit radius.
  const grabNearest = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    let nearest: string | null = null;
    let best = Infinity;
    for (const light of lights) {
      const pin = pins[light.id] ?? pinForLight(light);
      const tx = rect.left + pin.x * rect.width;
      const ty = rect.top + pin.y * rect.height;
      const distance = Math.hypot(clientX - tx, clientY - ty);
      if (distance < best) {
        best = distance;
        nearest = light.id;
      }
    }
    activeId.current = nearest;
    if (nearest && best <= THUMB_HIT_RADIUS) {
      const pin = pins[nearest] ?? { x: 0.5, y: 0.5 };
      dragOffset.current = {
        x: rect.left + pin.x * rect.width - clientX,
        y: rect.top + pin.y * rect.height - clientY,
      };
    } else {
      dragOffset.current = { x: 0, y: 0 };
    }
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <div
        ref={containerRef}
        className="relative aspect-square w-full cursor-pointer touch-none rounded-full"
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          grabNearest(e.clientX, e.clientY);
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
          activeId.current = null;
        }}
      >
        <canvas
          ref={canvasRef}
          width={WHEEL_CANVAS_SIZE}
          height={WHEEL_CANVAS_SIZE}
          className="size-full rounded-full"
        />
        {lights.map((light) => {
          const pin = pins[light.id] ?? pinForLight(light);
          const [hue, saturation] = pinToHueSaturation(pin.x, pin.y);
          return (
            <span
              key={light.id}
              aria-hidden="true"
              className="absolute z-10 size-7 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border-2 border-white shadow-md ring-1 ring-black/20 transition-[width,height] hover:size-8.5 active:size-8"
              style={{
                left: `${pin.x * 100}%`,
                top: `${pin.y * 100}%`,
                background: rgbToCss(hsvToRgb(hue, saturation, 1)),
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
