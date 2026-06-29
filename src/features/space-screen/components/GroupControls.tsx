import { PacedSlider } from "@/components/PacedSlider";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { roomZoneTileColor } from "@/features/space-screen/utils/color-state";
import {
  activeTileTheme,
  TILE_BRIGHTNESS_SLIDER_CLASS,
  TILE_INTERACTION_TRANSITION_CLASS,
  TILE_POWER_SWITCH_CLASS,
} from "@/lib/tile-theme";
import { UI_EASE_MS } from "@/lib/transitions";
import { cn } from "@/lib/utils";
import type { HueLight, HueRoomZone } from "@/types/hue";
import { SectionGrip } from "./SectionDragHandle";

type ControlCommitPhase = "live" | "final";

interface GroupControlsProps {
  roomZone: HueRoomZone;
  lights: HueLight[];
  hueEventRevision: number;
  /** In edit mode the controls are muted and tapping the tile does nothing. */
  editing?: boolean;
  onToggle: (roomZone: HueRoomZone, nextOn: boolean) => void;
  onBrightness: (
    roomZone: HueRoomZone,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
  /** Opens the multi-light group pane for adjusting every light at once. */
  onOpen: (roomZone: HueRoomZone) => void;
}

/**
 * The room/zone group controls tile with brightness and power controls.
 */
export const GroupControls: React.FC<GroupControlsProps> = ({
  roomZone,
  lights,
  hueEventRevision,
  editing = false,
  onToggle,
  onBrightness,
  onOpen,
}) => {
  const brightnessPct = roomZone.brightness ?? 0;
  const tile = roomZoneTileColor(lights);

  return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center">
          <div className="flex h-7 items-center">
            <SectionGrip />
            <p className="text-sm font-medium text-muted-foreground">
              Group controls
            </p>
          </div>
        </div>
        <Card
          // gap-0: the always-visible block (below) owns its own gap so the
          // collapsible panel sits flush and isn't a gap-spaced sibling — a
          // sibling gap is static layout that snaps when the panel hides.
          role="button"
          tabIndex={editing ? -1 : 0}
          aria-label={`Adjust ${roomZone.name} lights`}
          onClick={() => {
            if (!editing) onOpen(roomZone);
          }}
          onKeyDown={(e) => {
            if (editing) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpen(roomZone);
            }
          }}
          className={cn(
            "gap-0 border border-tile-border bg-tile-off outline-none focus-visible:ring-2 focus-visible:ring-ring",
            TILE_INTERACTION_TRANSITION_CLASS,
            tile.active && "ring-transparent",
            editing ? "cursor-default" : "cursor-pointer",
          )}
          style={
            {
              "--tile-ease": `${UI_EASE_MS.tileBackground}ms`,
              ...(tile.active && tile.background
                ? {
                    ...activeTileTheme(
                      tile.background,
                      tile.glow ?? tile.background,
                      brightnessPct,
                    ),
                  }
                : null),
            } as React.CSSProperties
          }
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4 px-6">
              <span
                className={cn(
                  "text-sm font-medium",
                  tile.active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                Brightness
              </span>
              <div className="flex items-center">
                <div onClick={(e) => !editing && e.stopPropagation()}>
                  <Switch
                    size="xl"
                    className={TILE_POWER_SWITCH_CLASS}
                    checked={roomZone.anyOn}
                    disabled={editing}
                    aria-label={`Toggle ${roomZone.name}`}
                    onCheckedChange={(checked) => onToggle(roomZone, checked)}
                  />
                </div>
              </div>
            </div>
            <div
              className="px-6"
              onClick={(e) => !editing && e.stopPropagation()}
            >
              <PacedSlider
                value={roomZone.anyOn ? Math.max(1, brightnessPct) : 1}
                min={1}
                disabled={editing}
                ariaLabel={`${roomZone.name} brightness`}
                className={cn(
                  TILE_BRIGHTNESS_SLIDER_CLASS,
                  !roomZone.anyOn && "tile-brightness-slider-off",
                )}
                isGroup
                animateKey={hueEventRevision}
                onCommit={(pct, phase) => onBrightness(roomZone, pct, phase)}
              />
            </div>
          </div>
        </Card>
      </div>
  );
};
