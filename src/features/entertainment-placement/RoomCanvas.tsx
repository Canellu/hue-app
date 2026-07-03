import { cn } from "@/lib/utils";
import type { HostSyncDisplay } from "@/types/host-sync";
import type { HuePosition } from "@/types/hue";
import { lazy, Suspense } from "react";

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
  configurationType: string | null;
  displays?: HostSyncDisplay[];
  pins: RoomPin[];
  activeKey: string | null;
  onActivate: (key: string) => void;
  onMove: (key: string, update: Partial<HuePosition>) => void;
  className?: string;
  overlayInsetClassName?: string;
  viewportRightInset?: number;
}

/**
 * Lazy shell around the 3D placement room, so three.js only loads once a
 * placement screen is opened. The canvas' camera presets cover what used to
 * be the separate "front view": head-on the drags set left/right + height,
 * otherwise they move lights across the floor plan.
 */
export const RoomCanvas = (props: RoomCanvasProps) => (
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
    <RoomCanvas3D {...props} />
  </Suspense>
);
