import { cn } from "@/lib/utils";
import type { HuePosition } from "@/types/hue";
import { RotateCcw } from "lucide-react";
import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  CAMERA_TILT_RANGE,
  CAMERA_YAW_LIMIT,
  DEFAULT_CAMERA,
  flatPointToPosition,
  projectPoint,
  roomFloorPointToPosition,
  rotateXY,
  type RoomCamera,
  type RoomView,
} from "./geometry";

const RoomCanvas3D = lazy(() =>
  import("./RoomCanvas3D").then((module) => ({
    default: module.RoomCanvas3D,
  })),
);

export interface RoomPin {
  key: string;
  /** Short label shown inside the pin, e.g. "1" or "3b". */
  label: string;
  name: string;
  position: HuePosition;
  /** Position-check tint; matches the color streamed to the physical light. */
  color?: string | null;
}

interface RoomCanvasProps {
  view: RoomView;
  configurationType: string | null;
  pins: RoomPin[];
  activeKey: string | null;
  onActivate: (key: string) => void;
  onMove: (key: string, update: Partial<HuePosition>) => void;
  className?: string;
}

export const RoomCanvas = (props: RoomCanvasProps) =>
  props.view === "room" ? (
    <Suspense
      fallback={
        <div
          className={cn(
            "rounded-3xl border border-foreground/15 bg-muted/20",
            props.className,
          )}
        />
      }
    >
      <RoomCanvas3D
        configurationType={props.configurationType}
        pins={props.pins}
        activeKey={props.activeKey}
        onActivate={props.onActivate}
        onMove={props.onMove}
        className={props.className}
      />
    </Suspense>
  ) : (
    <SvgRoomCanvas {...props} />
  );

/** Camera for the room view, provided to the SVG scenery components. */
const CameraContext = createContext<RoomCamera>(DEFAULT_CAMERA);

/** Orbit feel: a full-width drag turns ~150°, an upward drag pitches downward. */
const ORBIT_YAW_RATE = 2.6;
const ORBIT_TILT_RATE = 1.8;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * The placement canvas: a flat elevation facing the screen wall, or a
 * one-point-perspective room where depth is visible. Scene props (desk,
 * TV, speakers, …) follow the area's configuration type so the space is
 * easy to reason about. Pins are dragged directly: left/right + height in
 * the flat view, across the floor plan in the room view. Dragging empty
 * space in the room view orbits the camera around the room.
 */
const SvgRoomCanvas = ({
  view,
  configurationType,
  pins,
  activeKey,
  onActivate,
  onMove,
  className,
}: RoomCanvasProps) => {
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  // Pointer offset from the pin's drag anchor, so pins don't jump on grab.
  const dragOffset = useRef({ du: 0, dv: 0 });
  const [camera, setCamera] = useState<RoomCamera>(DEFAULT_CAMERA);
  // While orbiting, pins must track the scene without their move transition.
  const [isOrbiting, setIsOrbiting] = useState(false);
  // Last pointer position while an empty-space drag orbits the camera.
  const orbitFrom = useRef<{ u: number; v: number } | null>(null);
  const cameraMoved =
    camera.yaw !== DEFAULT_CAMERA.yaw || camera.tilt !== DEFAULT_CAMERA.tilt;

  const pointerUV = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      u: (event.clientX - bounds.left) / bounds.width,
      v: (event.clientY - bounds.top) / bounds.height,
    };
  };

  /** In the room view pins are dragged by their floor marker. */
  const dragAnchor = (position: HuePosition) =>
    view === "flat"
      ? projectPoint("flat", position.x, position.y, position.z)
      : projectPoint("room", position.x, position.y, -1, camera);

  const moveTo = (key: string, u: number, v: number) => {
    onMove(
      key,
      view === "flat"
        ? flatPointToPosition(u, v)
        : roomFloorPointToPosition(u, v, camera),
    );
  };

  return (
    <div
      data-placement-canvas
      className={cn(
        "relative touch-none overflow-hidden rounded-3xl border border-foreground/15",
        "bg-[radial-gradient(circle_at_center,var(--muted)_1px,transparent_1px)] bg-[size:24px_24px] select-none",
        view === "room" && "cursor-grab active:cursor-grabbing",
        className,
      )}
      onPointerDown={(event) => {
        const pinElement = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-pin-key]",
        );
        const key = pinElement?.dataset.pinKey;
        if (!key) {
          // Empty-space drags orbit the camera in the room view.
          if (view !== "room") return;
          event.currentTarget.setPointerCapture(event.pointerId);
          orbitFrom.current = pointerUV(event);
          setIsOrbiting(true);
          return;
        }
        const pin = pins.find((candidate) => candidate.key === key);
        if (!pin) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const pointer = pointerUV(event);
        const anchor = dragAnchor(pin.position);
        dragOffset.current = {
          du: anchor.u - pointer.u,
          dv: anchor.v - pointer.v,
        };
        onActivate(key);
        setDraggingKey(key);
      }}
      onPointerMove={(event) => {
        if (draggingKey) {
          const pointer = pointerUV(event);
          moveTo(
            draggingKey,
            pointer.u + dragOffset.current.du,
            pointer.v + dragOffset.current.dv,
          );
          return;
        }
        if (!orbitFrom.current) return;
        const pointer = pointerUV(event);
        const du = pointer.u - orbitFrom.current.u;
        const dv = pointer.v - orbitFrom.current.v;
        orbitFrom.current = pointer;
        setCamera((current) => ({
          yaw: clamp(
            current.yaw + du * ORBIT_YAW_RATE,
            -CAMERA_YAW_LIMIT,
            CAMERA_YAW_LIMIT,
          ),
          tilt: clamp(
            current.tilt - dv * ORBIT_TILT_RATE,
            CAMERA_TILT_RANGE[0],
            CAMERA_TILT_RANGE[1],
          ),
        }));
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        setDraggingKey(null);
        orbitFrom.current = null;
        setIsOrbiting(false);
      }}
      onPointerCancel={() => {
        setDraggingKey(null);
        orbitFrom.current = null;
        setIsOrbiting(false);
      }}
    >
      <CameraContext.Provider value={camera}>
        <svg
          viewBox="0 0 160 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 size-full"
          aria-hidden
        >
          {view === "room" ? <RoomFrame /> : <FlatFrame />}
          <SceneProps view={view} configurationType={configurationType} />
          {view === "room" &&
            pins.map((pin) => (
              <PinStem key={pin.key} position={pin.position} />
            ))}
        </svg>
      </CameraContext.Provider>
      {view === "room" && !cameraMoved && (
        <p className="pointer-events-none absolute right-3 bottom-2 text-[10px] font-medium tracking-wide text-muted-foreground/60 uppercase">
          Drag empty space to rotate
        </p>
      )}
      {view === "room" && cameraMoved && (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setCamera(DEFAULT_CAMERA)}
          className="absolute top-3 right-3 z-50 flex cursor-pointer items-center gap-1.5 rounded-full border border-foreground/15 bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur hover:text-foreground"
        >
          <RotateCcw className="size-3.5" /> Reset view
        </button>
      )}
      {pins.map((pin) => {
        const point = projectPoint(
          view,
          pin.position.x,
          pin.position.y,
          pin.position.z,
          camera,
        );
        const scale = view === "room" ? 0.55 + 0.45 * point.s : 1;
        const active = activeKey === pin.key;
        return (
          <button
            key={pin.key}
            type="button"
            data-pin-key={pin.key}
            aria-label={`Place ${pin.name}`}
            title={pin.name}
            style={{
              left: `${point.u * 100}%`,
              top: `${point.v * 100}%`,
              transform: `translate(-50%, -50%) scale(${scale})`,
              zIndex: active ? 40 : 10 + Math.round(point.s * 20),
              backgroundColor: pin.color ?? undefined,
            }}
            className={cn(
              "absolute flex size-11 cursor-grab items-center justify-center rounded-full border-2 font-semibold shadow-md active:cursor-grabbing",
              draggingKey !== pin.key &&
                !isOrbiting &&
                "transition-[left,top,transform] duration-300 ease-out",
              pin.color
                ? "border-white/80 text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.45)]"
                : "bg-background",
              active
                ? "border-primary ring-4 ring-primary/15"
                : !pin.color && "border-foreground/20",
              active && pin.color && "border-white",
            )}
          >
            {pin.label}
          </button>
        );
      })}
    </div>
  );
};

// ---- SVG scenery -----------------------------------------------------------

/** Projects room coordinates into the 160x100 viewBox. */
const pt = (
  view: RoomView,
  x: number,
  y: number,
  z: number,
  camera: RoomCamera = DEFAULT_CAMERA,
) => {
  const point = projectPoint(view, x, y, z, camera);
  return { px: point.u * 160, py: point.v * 100, s: point.s };
};

const poly = (
  view: RoomView,
  corners: [number, number, number][],
  camera: RoomCamera,
) =>
  corners
    .map(([x, y, z]) => {
      const { px, py } = pt(view, x, y, z, camera);
      return `${px.toFixed(2)},${py.toFixed(2)}`;
    })
    .join(" ");

const Shape = ({
  view,
  corners,
  className,
}: {
  view: RoomView;
  corners: [number, number, number][];
  className: string;
}) => (
  <polygon
    points={poly(view, corners, useContext(CameraContext))}
    vectorEffect="non-scaling-stroke"
    strokeWidth={1}
    className={className}
  />
);

const Edge = ({
  view,
  from,
  to,
  className = "stroke-foreground/10",
  dashed,
}: {
  view: RoomView;
  from: [number, number, number];
  to: [number, number, number];
  className?: string;
  dashed?: boolean;
}) => {
  const camera = useContext(CameraContext);
  const a = pt(view, ...from, camera);
  const b = pt(view, ...to, camera);
  return (
    <line
      x1={a.px}
      y1={a.py}
      x2={b.px}
      y2={b.py}
      vectorEffect="non-scaling-stroke"
      strokeWidth={1}
      strokeDasharray={dashed ? "3 3" : undefined}
      className={className}
    />
  );
};

const AxisLabel = ({
  view,
  at,
  children,
  anchor = "middle",
}: {
  view: RoomView;
  at: [number, number, number];
  children: string;
  anchor?: "start" | "middle" | "end";
}) => {
  const { px, py } = pt(view, ...at, useContext(CameraContext));
  return (
    <text
      x={px}
      y={py}
      textAnchor={anchor}
      fontSize={3.2}
      className="fill-muted-foreground/70 font-medium uppercase tracking-wide"
    >
      {children}
    </text>
  );
};

/** Room walls with their floor-plan centers, for camera-facing culling. */
const ROOM_WALLS: {
  key: string;
  center: [number, number];
  corners: [number, number, number][];
}[] = [
  {
    key: "screen",
    center: [0, 1],
    corners: [
      [-1, 1, -1],
      [1, 1, -1],
      [1, 1, 1],
      [-1, 1, 1],
    ],
  },
  {
    key: "front",
    center: [0, -1],
    corners: [
      [-1, -1, -1],
      [1, -1, -1],
      [1, -1, 1],
      [-1, -1, 1],
    ],
  },
  {
    key: "left",
    center: [-1, 0],
    corners: [
      [-1, -1, -1],
      [-1, 1, -1],
      [-1, 1, 1],
      [-1, -1, 1],
    ],
  },
  {
    key: "right",
    center: [1, 0],
    corners: [
      [1, -1, -1],
      [1, 1, -1],
      [1, 1, 1],
      [1, -1, 1],
    ],
  },
];

/** Perspective room shell: floor, walls, and a light floor grid. */
const RoomFrame = () => {
  const view: RoomView = "room";
  const camera = useContext(CameraContext);
  return (
    <g>
      <Shape
        view={view}
        corners={[
          [-1, -1, -1],
          [1, -1, -1],
          [1, 1, -1],
          [-1, 1, -1],
        ]}
        className="fill-foreground/4 stroke-foreground/12"
      />
      {/* Only walls on the far side get a fill, so the view stays open. */}
      {ROOM_WALLS.filter(
        (wall) => rotateXY(wall.center[0], wall.center[1], camera.yaw).y > 0.05,
      ).map((wall) => (
        <Shape
          key={wall.key}
          view={view}
          corners={wall.corners}
          className="fill-foreground/3 stroke-foreground/12"
        />
      ))}
      {/* Corner verticals and the ceiling outline. */}
      {(
        [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ] as const
      ).map(([x, y]) => (
        <Edge key={`c${x}${y}`} view={view} from={[x, y, -1]} to={[x, y, 1]} />
      ))}
      <Edge view={view} from={[-1, -1, 1]} to={[1, -1, 1]} />
      <Edge view={view} from={[1, -1, 1]} to={[1, 1, 1]} />
      <Edge view={view} from={[1, 1, 1]} to={[-1, 1, 1]} />
      <Edge view={view} from={[-1, 1, 1]} to={[-1, -1, 1]} />
      {/* Floor grid. */}
      {[-0.5, 0, 0.5].map((x) => (
        <Edge
          key={`gx${x}`}
          view={view}
          from={[x, -1, -1]}
          to={[x, 1, -1]}
          className="stroke-foreground/6"
        />
      ))}
      {[-0.33, 0.33].map((y) => (
        <Edge
          key={`gy${y}`}
          view={view}
          from={[-1, y, -1]}
          to={[1, y, -1]}
          className="stroke-foreground/6"
        />
      ))}
      <AxisLabel view={view} at={[-0.93, -0.9, -0.93]} anchor="start">
        Left
      </AxisLabel>
      <AxisLabel view={view} at={[0.93, -0.9, -0.93]} anchor="end">
        Right
      </AxisLabel>
    </g>
  );
};

/** Flat elevation shell: floor line, center guides, height labels. */
const FlatFrame = () => {
  const view: RoomView = "flat";
  return (
    <g>
      <Edge
        view={view}
        from={[-1.1, 0, -1]}
        to={[1.1, 0, -1]}
        className="stroke-foreground/12"
      />
      <Edge
        view={view}
        from={[-1.15, 0, 0]}
        to={[1.15, 0, 0]}
        className="stroke-foreground/8"
        dashed
      />
      <Edge
        view={view}
        from={[0, 0, -1.25]}
        to={[0, 0, 1.25]}
        className="stroke-foreground/8"
        dashed
      />
      <AxisLabel view={view} at={[0, 0, 1.22]}>
        High
      </AxisLabel>
      <AxisLabel view={view} at={[0, 0, -1.16]}>
        Low
      </AxisLabel>
      <AxisLabel view={view} at={[-1.05, 0, -1.07]} anchor="start">
        Left
      </AxisLabel>
      <AxisLabel view={view} at={[1.05, 0, -1.07]} anchor="end">
        Right
      </AxisLabel>
    </g>
  );
};

/** Floor shadow + stem so a pin's height is readable in the room view. */
const PinStem = ({ position }: { position: HuePosition }) => {
  const camera = useContext(CameraContext);
  const floor = pt("room", position.x, position.y, -1, camera);
  const bulb = pt("room", position.x, position.y, position.z, camera);
  return (
    <g>
      <ellipse
        cx={floor.px}
        cy={floor.py}
        rx={3.4 * floor.s}
        ry={1.15 * floor.s}
        className="fill-foreground/15"
      />
      {position.z > -0.85 && (
        <line
          x1={floor.px}
          y1={floor.py}
          x2={bulb.px}
          y2={bulb.py}
          vectorEffect="non-scaling-stroke"
          strokeWidth={1}
          strokeDasharray="2 3"
          className="stroke-foreground/25"
        />
      )}
    </g>
  );
};

// ---- Props per configuration type ------------------------------------------

const SceneProps = ({
  view,
  configurationType,
}: {
  view: RoomView;
  configurationType: string | null;
}) => {
  switch (configurationType) {
    case "monitor":
      return <DeskSetup view={view} />;
    case "screen":
      return <TvSetup view={view} />;
    case "music":
      return <MusicSetup view={view} />;
    case "3dspace":
      return <SpaceSetup view={view} />;
    default:
      return <OtherSetup view={view} />;
  }
};

const SCREEN_FILL = "fill-primary/12 stroke-primary/35";
const PROP_FILL = "fill-foreground/6 stroke-foreground/15";
const PROP_SOFT = "fill-foreground/4 stroke-foreground/10";

/** Desk, monitor, and gaming chair for "Monitor" areas. */
const DeskSetup = ({ view }: { view: RoomView }) => {
  if (view === "flat") {
    return (
      <g>
        {/* Desk slab with legs. */}
        <Shape
          view={view}
          corners={[
            [-0.5, 0, -0.25],
            [0.5, 0, -0.25],
            [0.5, 0, -0.31],
            [-0.5, 0, -0.31],
          ]}
          className={PROP_FILL}
        />
        <Edge
          view={view}
          from={[-0.46, 0, -0.31]}
          to={[-0.46, 0, -1]}
          className="stroke-foreground/15"
        />
        <Edge
          view={view}
          from={[0.46, 0, -0.31]}
          to={[0.46, 0, -1]}
          className="stroke-foreground/15"
        />
        {/* Monitor front-on. */}
        <Shape
          view={view}
          corners={[
            [-0.28, 0, -0.14],
            [0.28, 0, -0.14],
            [0.28, 0, 0.28],
            [-0.28, 0, 0.28],
          ]}
          className={SCREEN_FILL}
        />
        <Edge
          view={view}
          from={[0, 0, -0.14]}
          to={[0, 0, -0.25]}
          className="stroke-foreground/20"
        />
      </g>
    );
  }
  return (
    <g>
      {/* Desk: top slab, front edge, legs. */}
      <Shape
        view={view}
        corners={[
          [-0.5, 0.62, -0.25],
          [0.5, 0.62, -0.25],
          [0.5, 0.97, -0.25],
          [-0.5, 0.97, -0.25],
        ]}
        className={PROP_FILL}
      />
      <Shape
        view={view}
        corners={[
          [-0.5, 0.62, -0.25],
          [0.5, 0.62, -0.25],
          [0.5, 0.62, -0.32],
          [-0.5, 0.62, -0.32],
        ]}
        className="fill-foreground/8 stroke-foreground/15"
      />
      <Edge
        view={view}
        from={[-0.47, 0.64, -0.32]}
        to={[-0.47, 0.64, -1]}
        className="stroke-foreground/15"
      />
      <Edge
        view={view}
        from={[0.47, 0.64, -0.32]}
        to={[0.47, 0.64, -1]}
        className="stroke-foreground/15"
      />
      {/* Monitor on the desk. */}
      <Shape
        view={view}
        corners={[
          [-0.29, 0.9, -0.16],
          [0.29, 0.9, -0.16],
          [0.29, 0.9, 0.3],
          [-0.29, 0.9, 0.3],
        ]}
        className={SCREEN_FILL}
      />
      <Edge
        view={view}
        from={[0, 0.9, -0.16]}
        to={[0, 0.9, -0.25]}
        className="stroke-foreground/20"
      />
      {/* Gaming chair: seat, backrest, pedestal. */}
      <Shape
        view={view}
        corners={[
          [-0.15, 0.02, -0.5],
          [0.15, 0.02, -0.5],
          [0.15, 0.24, -0.5],
          [-0.15, 0.24, -0.5],
        ]}
        className={PROP_SOFT}
      />
      <Shape
        view={view}
        corners={[
          [-0.13, 0.02, -0.5],
          [0.13, 0.02, -0.5],
          [0.13, 0.02, 0.08],
          [-0.13, 0.02, 0.08],
        ]}
        className="fill-foreground/8 stroke-foreground/15"
      />
      <Edge
        view={view}
        from={[0, 0.1, -0.5]}
        to={[0, 0.1, -0.88]}
        className="stroke-foreground/20"
      />
      <PropEllipse
        view={view}
        at={[0, 0.1, -0.96]}
        rx={7}
        ry={2.2}
        className="fill-foreground/8"
      />
    </g>
  );
};

/** Wall-mounted TV and sofa for "TV" areas. */
const TvSetup = ({ view }: { view: RoomView }) => {
  if (view === "flat") {
    return (
      <g>
        <Shape
          view={view}
          corners={[
            [-0.35, 0, 0.0],
            [0.35, 0, 0.0],
            [0.35, 0, 0.55],
            [-0.35, 0, 0.55],
          ]}
          className={SCREEN_FILL}
        />
        <Shape
          view={view}
          corners={[
            [-0.26, 0, -0.95],
            [0.26, 0, -0.95],
            [0.26, 0, -0.78],
            [-0.26, 0, -0.78],
          ]}
          className={PROP_FILL}
        />
      </g>
    );
  }
  return (
    <g>
      {/* TV on the back wall + console. */}
      <Shape
        view={view}
        corners={[
          [-0.42, 0.99, 0.02],
          [0.42, 0.99, 0.02],
          [0.42, 0.99, 0.6],
          [-0.42, 0.99, 0.6],
        ]}
        className={SCREEN_FILL}
      />
      <Shape
        view={view}
        corners={[
          [-0.3, 0.92, -1],
          [0.3, 0.92, -1],
          [0.3, 0.92, -0.74],
          [-0.3, 0.92, -0.74],
        ]}
        className={PROP_FILL}
      />
      {/* Sofa facing the TV: seat slab, then its backrest nearer the camera. */}
      <Shape
        view={view}
        corners={[
          [-0.38, -0.48, -0.55],
          [0.38, -0.48, -0.55],
          [0.38, -0.14, -0.55],
          [-0.38, -0.14, -0.55],
        ]}
        className={PROP_SOFT}
      />
      <Shape
        view={view}
        corners={[
          [-0.38, -0.5, -1],
          [0.38, -0.5, -1],
          [0.38, -0.5, -0.22],
          [-0.38, -0.5, -0.22],
        ]}
        className="fill-foreground/8 stroke-foreground/15"
      />
    </g>
  );
};

/** Stereo speakers for "Music" areas. */
const MusicSetup = ({ view }: { view: RoomView }) => {
  const speaker = (side: -1 | 1) => {
    const cx = side * 0.65;
    if (view === "flat") {
      return (
        <g key={side}>
          <Shape
            view={view}
            corners={[
              [cx - 0.09, 0, -1],
              [cx + 0.09, 0, -1],
              [cx + 0.09, 0, -0.12],
              [cx - 0.09, 0, -0.12],
            ]}
            className={PROP_FILL}
          />
          <PropEllipse
            view={view}
            at={[cx, 0, -0.35]}
            rx={2.2}
            ry={3.4}
            className="fill-foreground/10"
          />
          <PropEllipse
            view={view}
            at={[cx, 0, -0.75]}
            rx={3.2}
            ry={5}
            className="fill-foreground/10"
          />
        </g>
      );
    }
    return (
      <g key={side}>
        <Shape
          view={view}
          corners={[
            [cx - 0.09, 0.74, -0.12],
            [cx + 0.09, 0.74, -0.12],
            [cx + 0.09, 0.9, -0.12],
            [cx - 0.09, 0.9, -0.12],
          ]}
          className={PROP_SOFT}
        />
        <Shape
          view={view}
          corners={[
            [cx - 0.09, 0.74, -1],
            [cx + 0.09, 0.74, -1],
            [cx + 0.09, 0.74, -0.12],
            [cx - 0.09, 0.74, -0.12],
          ]}
          className={PROP_FILL}
        />
        <PropEllipse
          view={view}
          at={[cx, 0.74, -0.32]}
          rx={1.6}
          ry={2.4}
          className="fill-foreground/10"
        />
        <PropEllipse
          view={view}
          at={[cx, 0.74, -0.7]}
          rx={2.4}
          ry={3.6}
          className="fill-foreground/10"
        />
      </g>
    );
  };
  return (
    <g>
      {speaker(-1)}
      {speaker(1)}
    </g>
  );
};

/** Rug, plant, and floor lamp for "3D space" areas — lights all around. */
const SpaceSetup = ({ view }: { view: RoomView }) => {
  if (view === "flat") {
    return (
      <g>
        <Plant view={view} x={-0.82} y={0} />
        <FloorLamp view={view} x={0.82} y={0} />
      </g>
    );
  }
  return (
    <g>
      <Shape
        view={view}
        corners={[
          [-0.55, -0.5, -1],
          [0.55, -0.5, -1],
          [0.55, 0.5, -1],
          [-0.55, 0.5, -1],
        ]}
        className="fill-foreground/5 stroke-foreground/12"
      />
      <Shape
        view={view}
        corners={[
          [-0.45, -0.38, -1],
          [0.45, -0.38, -1],
          [0.45, 0.38, -1],
          [-0.45, 0.38, -1],
        ]}
        className="fill-transparent stroke-foreground/8"
      />
      <Plant view={view} x={-0.82} y={0.78} />
      <FloorLamp view={view} x={0.82} y={0.7} />
    </g>
  );
};

/** A rug keeps "Other" areas from being an empty box. */
const OtherSetup = ({ view }: { view: RoomView }) => {
  if (view === "flat") return null;
  return (
    <Shape
      view={view}
      corners={[
        [-0.5, -0.45, -1],
        [0.5, -0.45, -1],
        [0.5, 0.45, -1],
        [-0.5, 0.45, -1],
      ]}
      className="fill-foreground/5 stroke-foreground/12"
    />
  );
};

const Plant = ({ view, x, y }: { view: RoomView; x: number; y: number }) => (
  <g>
    <Shape
      view={view}
      corners={[
        [x - 0.06, y, -1],
        [x + 0.06, y, -1],
        [x + 0.045, y, -0.78],
        [x - 0.045, y, -0.78],
      ]}
      className={PROP_FILL}
    />
    <PropEllipse
      view={view}
      at={[x, y, -0.52]}
      rx={4.4}
      ry={6}
      className="fill-foreground/8"
    />
  </g>
);

const FloorLamp = ({
  view,
  x,
  y,
}: {
  view: RoomView;
  x: number;
  y: number;
}) => (
  <g>
    <Edge
      view={view}
      from={[x, y, -1]}
      to={[x, y, 0.42]}
      className="stroke-foreground/20"
    />
    <Shape
      view={view}
      corners={[
        [x - 0.05, y, 0.42],
        [x + 0.05, y, 0.42],
        [x + 0.07, y, 0.62],
        [x - 0.07, y, 0.62],
      ]}
      className={PROP_FILL}
    />
  </g>
);

const PropEllipse = ({
  view = "room",
  at,
  rx,
  ry,
  className,
}: {
  view?: RoomView;
  at: [number, number, number];
  rx: number;
  ry: number;
  className: string;
}) => {
  const point = pt(view, ...at, useContext(CameraContext));
  return (
    <ellipse
      cx={point.px}
      cy={point.py}
      rx={rx * point.s}
      ry={ry * point.s}
      className={className}
    />
  );
};
