import { rgbToCss } from "@/features/space-screen/utils/color";
import {
  paintTemperatureWheel,
  WHEEL_CANVAS_SIZE,
} from "@/features/space-screen/utils/wheel-canvas";
import {
  tempWheelY,
  temperatureWheelColor,
} from "@/features/space-screen/utils/wheel-color";
import type { HueLight } from "@/types/hue";
import { useEffect, useRef, useState } from "react";

interface MultiTemperatureWheelProps {
  /** Color-temperature-capable lights; each gets its own draggable thumb. */
  lights: HueLight[];
  onPick: (light: HueLight, mired: number) => void;
}

const DEFAULT_CT_MIN = 153;
const DEFAULT_CT_MAX = 500;
const THROTTLE_MS = 180;
const THUMB_HIT_RADIUS = 14;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const ctMinOf = (light: HueLight): number => light.ctMin ?? DEFAULT_CT_MIN;
const ctMaxOf = (light: HueLight): number => light.ctMax ?? DEFAULT_CT_MAX;

const valueFromY = (y: number, light: HueLight): number => {
  const min = ctMinOf(light);
  const max = ctMaxOf(light);
  return Math.round(max - clamp01(y) * (max - min));
};

// Spread newly-seen thumbs across the available chord at their current
// temperature so lights at the same temperature don't stack invisibly.
const initialX = (index: number, count: number, y: number): number => {
  if (count <= 1) return 0.5;
  const chordRadius = Math.sqrt(Math.max(0, 0.25 - (y - 0.5) ** 2));
  const insetRadius = chordRadius * 0.8;
  return 0.5 + ((index / (count - 1)) * 2 - 1) * insetRadius;
};

type Pin = { x: number; y: number };

const yForLight = (light: HueLight): number =>
  light.ct != null ? tempWheelY(light.ct, ctMinOf(light), ctMaxOf(light)) : 0.5;

const pinForLight = (light: HueLight, index: number, count: number): Pin => {
  const y = yForLight(light);
  return { x: initialX(index, count, y), y };
};

/**
 * Group white-temperature picker: the same warm→cool disk as
 * {@link TemperatureWheel}, with one thumb per ct light. Dragging a thumb moves
 * it freely in the disk and changes only that light's temperature.
 */
export const MultiTemperatureWheel: React.FC<MultiTemperatureWheelProps> = ({
  lights,
  onPick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const activeId = useRef<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const lastEmit = useRef(0);
  const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmitted = useRef<Record<string, number>>({});

  const [pins, setPins] = useState<Record<string, Pin>>(() =>
    Object.fromEntries(
      lights.map((light, index) => [
        light.id,
        pinForLight(light, index, lights.length),
      ]),
    ),
  );

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) paintTemperatureWheel(ctx);
  }, []);

  // Reflect each light's live temperature onto its thumb's vertical position
  // when idle, preserving its local x position.
  useEffect(() => {
    if (dragging.current) return;
    setPins((prev) => {
      const next: Record<string, Pin> = {};
      lights.forEach((light, index) => {
        const fallback = pinForLight(light, index, lights.length);
        const x = prev[light.id]?.x ?? fallback.x;
        const sent = lastEmitted.current[light.id];
        if (sent != null && light.ct != null && Math.abs(sent - light.ct) <= 1) {
          next[light.id] = prev[light.id] ?? fallback;
        } else {
          next[light.id] = { x, y: yForLight(light) };
        }
      });
      return next;
    });
  }, [lights]);

  useEffect(
    () => () => {
      if (trailing.current) clearTimeout(trailing.current);
    },
    [],
  );

  const emit = (light: HueLight, y: number, force: boolean) => {
    const next = valueFromY(y, light);
    lastEmitted.current[light.id] = next;
    const now = Date.now();
    if (trailing.current) {
      clearTimeout(trailing.current);
      trailing.current = null;
    }
    if (force || now - lastEmit.current >= THROTTLE_MS) {
      lastEmit.current = now;
      onPick(light, next);
    } else {
      trailing.current = setTimeout(() => {
        lastEmit.current = Date.now();
        onPick(light, next);
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
    emit(light, pos.y, force);
  };

  const grabNearest = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    let nearest: string | null = null;
    let best = Infinity;
    lights.forEach((light, index) => {
      const pin = pins[light.id] ?? pinForLight(light, index, lights.length);
      const tx = rect.left + pin.x * rect.width;
      const ty = rect.top + pin.y * rect.height;
      const distance = Math.hypot(clientX - tx, clientY - ty);
      if (distance < best) {
        best = distance;
        nearest = light.id;
      }
    });
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
      {lights.map((light, index) => {
        const pin = pins[light.id] ?? pinForLight(light, index, lights.length);
        return (
          <span
            key={light.id}
            aria-hidden="true"
            className="absolute z-10 size-7 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border-2 border-white shadow-md ring-1 ring-black/20 transition-[width,height] hover:size-8.5 active:size-8"
            style={{
              left: `${pin.x * 100}%`,
              top: `${pin.y * 100}%`,
              background: rgbToCss(temperatureWheelColor(pin.y)),
            }}
          />
        );
      })}
    </div>
  );
};
