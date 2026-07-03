import { cn } from "@/lib/utils";
import type { HuePosition } from "@/types/hue";
import { Canvas, useThree } from "@react-three/fiber";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import {
  BoxGeometry,
  DoubleSide,
  EdgesGeometry,
  MathUtils,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Shape,
  Vector2,
  Vector3,
} from "three";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { RoomPin } from "./RoomCanvas";

const CAMERA_FOV = 38;
const CAMERA_ASPECT = 16 / 10;
const DEFAULT_CAMERA_RADIUS = 3.8;
const MIN_CAMERA_RADIUS = 2.6;
const MAX_CAMERA_RADIUS = 5.4;
const DEFAULT_CAMERA_TARGET = { x: 0, y: -0.05, z: 0 };
const MAX_PAN = { x: 0.8, y: 0.65, z: 0.8 };
const DEFAULT_YAW = 0;
const DEFAULT_TILT = 0.28;
const MIN_TILT = -0.08;
const MAX_TILT = Math.PI / 2;
const ORBIT_YAW_RATE = 2.6;
const ORBIT_TILT_RATE = 2.4;
const PAN_RATE = 2.2;
const WHEEL_ZOOM_RATE = 0.001;
const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 1);

const STRUCTURE_COLOR = "#8b8b8b";
const PROP_COLOR = "#777777";
const ACCENT_COLOR = "#d6a84f";

interface RoomCanvas3DProps {
  configurationType: string | null;
  pins: RoomPin[];
  activeKey: string | null;
  onActivate: (key: string) => void;
  onMove: (key: string, update: Partial<HuePosition>) => void;
  className?: string;
}

interface CameraTarget {
  x: number;
  y: number;
  z: number;
}

const clampAxis = (value: number) =>
  Math.max(-1, Math.min(1, Math.round(value * 100) / 100));

const updateCamera = (
  camera: PerspectiveCamera,
  yaw: number,
  tilt: number,
  radius: number,
  target: CameraTarget,
) => {
  const horizontalRadius = radius * Math.cos(tilt);
  camera.position.set(
    target.x + Math.sin(yaw) * horizontalRadius,
    target.y + radius * Math.sin(tilt),
    target.z - Math.cos(yaw) * horizontalRadius,
  );
  camera.up
    .set(
      -Math.sin(yaw) * Math.sin(tilt),
      Math.cos(tilt),
      Math.cos(yaw) * Math.sin(tilt),
    )
    .normalize();
  camera.lookAt(target.x, target.y, target.z);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
};

// The default camera faces Three.js +Z, where screen-right is world -X.
// Hue +X is physical right when seated facing the screen.
const positionToWorld = ({ x, y, z }: HuePosition) => new Vector3(-x, z, y);

const projectToCanvas = (world: Vector3, camera: PerspectiveCamera) => {
  const projected = world.clone().project(camera);
  return {
    left: `${((projected.x + 1) / 2) * 100}%`,
    top: `${((1 - projected.y) / 2) * 100}%`,
  };
};

export const RoomCanvas3D = ({
  configurationType,
  pins,
  activeKey,
  onActivate,
  onMove,
  className,
}: RoomCanvas3DProps) => {
  const [yaw, setYaw] = useState(DEFAULT_YAW);
  const [tilt, setTilt] = useState(DEFAULT_TILT);
  const [radius, setRadius] = useState(DEFAULT_CAMERA_RADIUS);
  const [target, setTarget] = useState<CameraTarget>(DEFAULT_CAMERA_TARGET);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const navigationFrom = useRef<{ u: number; v: number } | null>(null);
  const navigationMode = useRef<"orbit" | "pan" | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const raycaster = useMemo(() => new Raycaster(), []);
  const floorHit = useMemo(() => new Vector3(), []);
  const camera = useMemo(
    () => new PerspectiveCamera(CAMERA_FOV, CAMERA_ASPECT, 0.1, 100),
    [],
  );
  updateCamera(camera, yaw, tilt, radius, target);
  const cameraMoved =
    yaw !== DEFAULT_YAW ||
    tilt !== DEFAULT_TILT ||
    radius !== DEFAULT_CAMERA_RADIUS ||
    target.x !== DEFAULT_CAMERA_TARGET.x ||
    target.y !== DEFAULT_CAMERA_TARGET.y ||
    target.z !== DEFAULT_CAMERA_TARGET.z;

  const pointerUV = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      u: (event.clientX - bounds.left) / bounds.width,
      v: (event.clientY - bounds.top) / bounds.height,
    };
  };

  const floorPoint = (u: number, v: number) => {
    raycaster.setFromCamera(new Vector2(u * 2 - 1, 1 - v * 2), camera);
    const point = raycaster.ray.intersectPlane(FLOOR_PLANE, floorHit);
    return point ? { x: -point.x, y: point.z } : null;
  };

  const finishGesture = (event?: ReactPointerEvent<HTMLDivElement>) => {
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraggingKey(null);
    navigationFrom.current = null;
    navigationMode.current = null;
    setIsNavigating(false);
  };

  const zoomBy = (factor: number) => {
    setRadius((current) =>
      MathUtils.clamp(current * factor, MIN_CAMERA_RADIUS, MAX_CAMERA_RADIUS),
    );
  };

  return (
    <div
      data-placement-canvas
      className={cn(
        "relative h-auto shrink-0 touch-none self-start overflow-hidden rounded-3xl border border-foreground/15",
        "bg-[radial-gradient(circle_at_center,var(--muted)_1px,transparent_1px)] bg-[size:24px_24px] select-none",
        navigationMode.current === "pan"
          ? "cursor-move"
          : "cursor-grab active:cursor-grabbing",
        className,
      )}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("[data-camera-control]")) {
          return;
        }

        const pinElement = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-pin-key]",
        );
        const key = pinElement?.dataset.pinKey;
        const pointer = pointerUV(event);
        event.currentTarget.setPointerCapture(event.pointerId);

        if (key) {
          const pin = pins.find((candidate) => candidate.key === key);
          const hit = floorPoint(pointer.u, pointer.v);
          if (!pin || !hit) {
            finishGesture(event);
            return;
          }
          dragOffset.current = {
            x: pin.position.x - hit.x,
            y: pin.position.y - hit.y,
          };
          onActivate(key);
          setDraggingKey(key);
          return;
        }

        navigationFrom.current = pointer;
        navigationMode.current =
          event.shiftKey || event.button === 1 || event.button === 2
            ? "pan"
            : "orbit";
        setIsNavigating(true);
      }}
      onPointerMove={(event) => {
        const pointer = pointerUV(event);
        if (draggingKey) {
          const hit = floorPoint(pointer.u, pointer.v);
          if (!hit) return;
          onMove(draggingKey, {
            x: clampAxis(hit.x + dragOffset.current.x),
            y: clampAxis(hit.y + dragOffset.current.y),
          });
          return;
        }

        if (!navigationFrom.current || !navigationMode.current) return;
        const du = pointer.u - navigationFrom.current.u;
        const dv = pointer.v - navigationFrom.current.v;
        navigationFrom.current = pointer;

        if (navigationMode.current === "pan") {
          const panScale = PAN_RATE * (radius / DEFAULT_CAMERA_RADIUS);
          const right = new Vector3().setFromMatrixColumn(
            camera.matrixWorld,
            0,
          );
          const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
          const movement = right
            .multiplyScalar(-du * panScale)
            .add(up.multiplyScalar(dv * panScale));
          setTarget((current) => ({
            x: MathUtils.clamp(current.x + movement.x, -MAX_PAN.x, MAX_PAN.x),
            y: MathUtils.clamp(
              current.y + movement.y,
              DEFAULT_CAMERA_TARGET.y - MAX_PAN.y,
              DEFAULT_CAMERA_TARGET.y + MAX_PAN.y,
            ),
            z: MathUtils.clamp(current.z + movement.z, -MAX_PAN.z, MAX_PAN.z),
          }));
          return;
        }

        setYaw((current) => current + du * ORBIT_YAW_RATE);
        setTilt((current) =>
          MathUtils.clamp(current - dv * ORBIT_TILT_RATE, MIN_TILT, MAX_TILT),
        );
      }}
      onPointerUp={finishGesture}
      onPointerCancel={() => finishGesture()}
      onContextMenu={(event) => event.preventDefault()}
      onWheel={(event: ReactWheelEvent<HTMLDivElement>) => {
        event.preventDefault();
        zoomBy(Math.exp(event.deltaY * WHEEL_ZOOM_RATE));
      }}
    >
      <div className="absolute inset-0">
        <Canvas
          camera={camera}
          dpr={[1, 1.5]}
          frameloop="demand"
          gl={{ alpha: true, antialias: true }}
        >
          <InvalidateCameraFrame
            yaw={yaw}
            tilt={tilt}
            radius={radius}
            target={target}
          />
          <RoomScene configurationType={configurationType} pins={pins} />
        </Canvas>
      </div>

      <p className="pointer-events-none absolute right-3 bottom-2 text-[10px] font-medium tracking-wide text-muted-foreground/60 uppercase">
        Drag to rotate · Shift-drag to pan · Scroll to zoom
      </p>
      <div
        data-camera-control
        className="absolute top-3 right-3 z-50 flex items-center gap-1"
      >
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={radius >= MAX_CAMERA_RADIUS}
          onClick={() => zoomBy(1.25)}
          className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-foreground/15 bg-background/80 text-muted-foreground backdrop-blur hover:text-foreground disabled:cursor-default disabled:opacity-40"
        >
          <ZoomOut className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={radius <= MIN_CAMERA_RADIUS}
          onClick={() => zoomBy(0.8)}
          className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-foreground/15 bg-background/80 text-muted-foreground backdrop-blur hover:text-foreground disabled:cursor-default disabled:opacity-40"
        >
          <ZoomIn className="size-3.5" />
        </button>
        {cameraMoved && (
          <button
            type="button"
            onClick={() => {
              setYaw(DEFAULT_YAW);
              setTilt(DEFAULT_TILT);
              setRadius(DEFAULT_CAMERA_RADIUS);
              setTarget(DEFAULT_CAMERA_TARGET);
            }}
            className="flex cursor-pointer items-center gap-1.5 rounded-full border border-foreground/15 bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur hover:text-foreground"
          >
            <RotateCcw className="size-3.5" /> Reset view
          </button>
        )}
      </div>

      {[
        { label: "Left", position: new Vector3(0.92, -0.93, -0.9) },
        { label: "Right", position: new Vector3(-0.92, -0.93, -0.9) },
      ].map(({ label, position }) => (
        <span
          key={label}
          style={projectToCanvas(position, camera)}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-[10px] font-medium tracking-wide text-muted-foreground/65 uppercase"
        >
          {label}
        </span>
      ))}

      {pins.map((pin) => {
        const world = positionToWorld(pin.position);
        const distance = camera.position.distanceTo(world);
        const scale = MathUtils.clamp(
          DEFAULT_CAMERA_RADIUS / distance,
          0.72,
          1.2,
        );
        const active = activeKey === pin.key;
        return (
          <button
            key={pin.key}
            type="button"
            data-pin-key={pin.key}
            aria-label={`Place ${pin.name}`}
            title={pin.name}
            style={{
              ...projectToCanvas(world, camera),
              transform: `translate(-50%, -50%) scale(${scale})`,
              zIndex: active ? 40 : 20,
              backgroundColor: pin.color ?? undefined,
            }}
            className={cn(
              "absolute flex size-11 cursor-grab items-center justify-center rounded-full border-2 font-semibold shadow-md active:cursor-grabbing",
              draggingKey !== pin.key &&
                !isNavigating &&
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

const InvalidateCameraFrame = ({
  yaw,
  tilt,
  radius,
  target,
}: {
  yaw: number;
  tilt: number;
  radius: number;
  target: CameraTarget;
}) => {
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    invalidate();
  }, [invalidate, radius, target.x, target.y, target.z, tilt, yaw]);
  return null;
};

const RoomScene = ({
  configurationType,
  pins,
}: {
  configurationType: string | null;
  pins: RoomPin[];
}) => {
  const roomEdges = useMemo(() => {
    const room = new BoxGeometry(2, 2, 2);
    const edges = new EdgesGeometry(room);
    room.dispose();
    return edges;
  }, []);

  return (
    <>
      <ambientLight intensity={1.25} />
      <directionalLight position={[-3, 5, -4]} intensity={1.5} />

      <mesh position={[0, -1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2, 2]} />
        <meshStandardMaterial
          color={STRUCTURE_COLOR}
          transparent
          opacity={0.1}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <gridHelper
        args={[2, 6, STRUCTURE_COLOR, STRUCTURE_COLOR]}
        position={[0, -0.995, 0]}
        material-transparent
        material-opacity={0.18}
      />
      <lineSegments geometry={roomEdges}>
        <lineBasicMaterial color={STRUCTURE_COLOR} transparent opacity={0.35} />
      </lineSegments>

      <SceneProps3D configurationType={configurationType} />

      {pins.map((pin) => (
        <PinMarker3D key={pin.key} pin={pin} />
      ))}
    </>
  );
};

const PinMarker3D = ({ pin }: { pin: RoomPin }) => {
  const height = Math.max(0.01, pin.position.z + 1);
  const color = pin.color ?? ACCENT_COLOR;
  return (
    <group>
      <mesh position={[-pin.position.x, -1 + height / 2, pin.position.y]}>
        <cylinderGeometry args={[0.008, 0.008, height, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} />
      </mesh>
      <mesh
        position={[-pin.position.x, -0.992, pin.position.y]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[0.065, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.25} />
      </mesh>
      <mesh position={[-pin.position.x, pin.position.z, pin.position.y]}>
        <sphereGeometry args={[0.045, 16, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.2}
        />
      </mesh>
    </group>
  );
};

const BoxProp = ({
  position,
  scale,
  color = PROP_COLOR,
  opacity = 0.28,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  color?: string;
  opacity?: number;
}) => (
  <mesh position={position}>
    <boxGeometry args={scale} />
    <meshStandardMaterial color={color} transparent opacity={opacity} />
  </mesh>
);

const SceneProps3D = ({
  configurationType,
}: {
  configurationType: string | null;
}) => {
  switch (configurationType) {
    case "monitor":
      return <DeskSetup3D />;
    case "screen":
      return <TvSetup3D />;
    case "music":
      return <MusicSetup3D />;
    case "3dspace":
      return <SpaceSetup3D />;
    default:
      return <OtherSetup3D />;
  }
};

const DeskSetup3D = () => (
  <group>
    <BoxProp position={[0, -0.42, 0.55]} scale={[1.25, 0.08, 0.52]} />
    <BoxProp position={[-0.52, -0.7, 0.55]} scale={[0.07, 0.55, 0.42]} />
    <BoxProp position={[0.52, -0.7, 0.55]} scale={[0.07, 0.55, 0.42]} />
    <BoxProp
      position={[0, 0.02, 0.76]}
      scale={[0.82, 0.48, 0.05]}
      color={ACCENT_COLOR}
      opacity={0.22}
    />
    <BoxProp position={[0, -0.25, 0.69]} scale={[0.06, 0.3, 0.06]} />
  </group>
);

const TvSetup3D = () => (
  <group>
    <BoxProp
      position={[0, 0.22, 0.93]}
      scale={[1.35, 0.76, 0.06]}
      color={ACCENT_COLOR}
      opacity={0.2}
    />
    <BoxProp position={[0, -0.67, 0.72]} scale={[1.45, 0.34, 0.42]} />
    <SofaProp />
  </group>
);

const SofaProp = () => {
  const profile = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-0.8, -1);
    shape.lineTo(-0.3, -1);
    shape.lineTo(-0.3, -0.7);
    shape.lineTo(-0.63, -0.7);
    shape.lineTo(-0.63, -0.32);
    shape.lineTo(-0.81, -0.32);
    shape.lineTo(-0.81, -1);
    shape.closePath();
    return shape;
  }, []);

  return (
    <mesh position={[0.675, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <extrudeGeometry
        args={[
          profile,
          { depth: 1.35, bevelEnabled: false, curveSegments: 1 },
        ]}
      />
      <meshStandardMaterial color={PROP_COLOR} transparent opacity={0.28} />
    </mesh>
  );
};

const MusicSetup3D = () => (
  <group>
    <BoxProp position={[-0.7, -0.35, 0.55]} scale={[0.28, 1.15, 0.3]} />
    <BoxProp position={[0.7, -0.35, 0.55]} scale={[0.28, 1.15, 0.3]} />
    <BoxProp position={[0, -0.72, 0.25]} scale={[0.65, 0.18, 0.42]} />
    <mesh position={[0, -0.985, -0.15]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.62, 40]} />
      <meshStandardMaterial
        color={ACCENT_COLOR}
        transparent
        opacity={0.12}
        depthWrite={false}
      />
    </mesh>
  </group>
);

const SpaceSetup3D = () => (
  <group>
    <mesh position={[0, -0.988, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.72, 40]} />
      <meshStandardMaterial
        color={ACCENT_COLOR}
        transparent
        opacity={0.1}
        depthWrite={false}
      />
    </mesh>
    <BoxProp position={[0, -0.72, 0.05]} scale={[0.85, 0.18, 0.48]} />
    <BoxProp position={[0, -0.53, 0.23]} scale={[0.85, 0.38, 0.12]} />
    <mesh position={[-0.68, -0.7, 0.55]}>
      <cylinderGeometry args={[0.12, 0.16, 0.55, 18]} />
      <meshStandardMaterial color={PROP_COLOR} transparent opacity={0.28} />
    </mesh>
    <mesh position={[0.7, -0.25, 0.48]}>
      <cylinderGeometry args={[0.025, 0.025, 1.45, 12]} />
      <meshStandardMaterial color={PROP_COLOR} transparent opacity={0.35} />
    </mesh>
    <mesh position={[0.7, 0.48, 0.48]}>
      <sphereGeometry args={[0.16, 20, 14]} />
      <meshStandardMaterial color={ACCENT_COLOR} transparent opacity={0.3} />
    </mesh>
  </group>
);

const OtherSetup3D = () => (
  <group>
    <BoxProp position={[0, -0.72, 0]} scale={[0.8, 0.16, 0.55]} />
    <BoxProp position={[0, -0.5, 0.22]} scale={[0.8, 0.4, 0.12]} />
  </group>
);
