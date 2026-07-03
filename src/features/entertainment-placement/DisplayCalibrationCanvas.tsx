import { cn } from "@/lib/utils";
import type { HostSyncDisplay } from "@/types/host-sync";
import type { HuePosition } from "@/types/hue";
import { useMemo, useRef, useState, type PointerEvent } from "react";
import {
  displayBounds,
  displayPointToPosition,
  nearestDisplay,
  positionToDisplayPoint,
  sampleRegionForPosition,
} from "./display-geometry";
import type { RoomPin } from "./RoomCanvas";

interface DisplayCalibrationCanvasProps {
  displays: HostSyncDisplay[];
  pins: RoomPin[];
  activeKey: string | null;
  onActivate: (key: string) => void;
  onMove: (key: string, update: Partial<HuePosition>) => void;
  className?: string;
}

const svgPoint = (svg: SVGSVGElement, event: PointerEvent<SVGSVGElement>) => {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM()?.inverse());
};

export const DisplayCalibrationCanvas = ({
  displays,
  pins,
  activeKey,
  onActivate,
  onMove,
  className,
}: DisplayCalibrationCanvasProps) => {
  const bounds = useMemo(() => displayBounds(displays), [displays]);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  if (!bounds) return null;

  const unit = Math.max(bounds.width, bounds.height);
  const padding = unit * 0.045;
  const pinRadius = unit * 0.022;
  const labelSize = unit * 0.022;

  const movePin = (event: PointerEvent<SVGSVGElement>, key: string) => {
    const pointer = svgPoint(event.currentTarget, event);
    const rawX = pointer.x + dragOffset.current.x;
    const rawY = pointer.y + dragOffset.current.y;
    const display = nearestDisplay(displays, rawX, rawY);
    const x = Math.max(display.x, Math.min(display.x + display.width, rawX));
    const y = Math.max(display.y, Math.min(display.y + display.height, rawY));
    onMove(key, displayPointToPosition(x, y, bounds));
  };

  return (
    <div
      className={cn(
        "relative h-full min-h-72 w-full overflow-hidden rounded-3xl border border-foreground/15 bg-muted/20",
        className,
      )}
    >
      <svg
        role="group"
        aria-label="Light sampling regions on selected displays"
        className="h-full w-full touch-none select-none"
        viewBox={`${bounds.minX - padding} ${bounds.minY - padding} ${bounds.width + padding * 2} ${bounds.height + padding * 2}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={(event) => {
          const target = (event.target as SVGElement).closest<SVGGElement>(
            "[data-pin-key]",
          );
          const key = target?.dataset.pinKey;
          if (!key) return;
          const pin = pins.find((candidate) => candidate.key === key);
          if (!pin) return;
          const pointer = svgPoint(event.currentTarget, event);
          const anchor = positionToDisplayPoint(pin.position, bounds);
          dragOffset.current = {
            x: anchor.x - pointer.x,
            y: anchor.y - pointer.y,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          onActivate(key);
          setDraggingKey(key);
        }}
        onPointerMove={(event) => {
          if (draggingKey) movePin(event, draggingKey);
        }}
        onPointerUp={(event) => {
          if (draggingKey) movePin(event, draggingKey);
          setDraggingKey(null);
        }}
        onPointerCancel={() => setDraggingKey(null)}
      >
        {displays.map((display) => (
          <g key={display.id}>
            <rect
              x={display.x}
              y={display.y}
              width={display.width}
              height={display.height}
              rx={unit * 0.012}
              className="fill-background stroke-foreground/20"
              strokeWidth={unit * 0.003}
            />
            <text
              x={display.x + display.width / 2}
              y={display.y + display.height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              className="pointer-events-none fill-muted-foreground font-medium"
              fontSize={labelSize}
            >
              {display.name}
            </text>
            <text
              x={display.x + display.width / 2}
              y={display.y + display.height / 2 + labelSize * 1.3}
              textAnchor="middle"
              dominantBaseline="middle"
              className="pointer-events-none fill-muted-foreground/70"
              fontSize={labelSize * 0.72}
            >
              {display.width} × {display.height}
            </text>
          </g>
        ))}

        {pins.map((pin) => {
          const point = positionToDisplayPoint(pin.position, bounds);
          const region = sampleRegionForPosition(
            pin.position,
            displays,
            bounds,
          );
          const active = pin.key === activeKey;
          return (
            <g
              key={pin.key}
              data-pin-key={pin.key}
              className="cursor-grab active:cursor-grabbing"
            >
              <rect
                x={region.left}
                y={region.top}
                width={region.right - region.left}
                height={region.bottom - region.top}
                rx={unit * 0.009}
                fill={pin.color ?? "var(--primary)"}
                fillOpacity={pin.color ? 0.28 : active ? 0.2 : 0.1}
                stroke={pin.color ?? "var(--primary)"}
                strokeOpacity={active ? 1 : 0.65}
                strokeWidth={unit * (active ? 0.006 : 0.004)}
              />
              <circle
                cx={point.x}
                cy={point.y}
                r={pinRadius}
                fill={pin.color ?? "var(--primary)"}
                className="stroke-background"
                strokeWidth={unit * 0.005}
              />
              <text
                x={point.x}
                y={point.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="pointer-events-none fill-white font-semibold"
                fontSize={pinRadius}
              >
                {pin.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
        Drag a light to change the screen region it samples
      </div>
    </div>
  );
};
