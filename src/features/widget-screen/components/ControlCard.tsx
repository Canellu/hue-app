import { PacedSlider } from "@/components/PacedSlider";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { getRoomZoneIcon } from "@/features/home-screen/components/room-zone-icons";
import {
  lightColorHex,
  roomZoneTileColor,
  sceneBubbleCss,
} from "@/features/space-screen/utils/color-state";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import {
  activeTileTheme,
  TILE_BRIGHTNESS_SLIDER_CLASS,
  TILE_INTERACTION_TRANSITION_CLASS,
  TILE_POWER_SWITCH_CLASS,
} from "@/lib/tile-theme";
import { UI_EASE_MS } from "@/lib/transitions";
import { isSceneActive } from "@/features/space-screen/utils/scene-status";
import { cn } from "@/lib/utils";
import type { HueLight, HueRoomZone, HueScene } from "@/types/hue";
import { Lightbulb } from "lucide-react";
import type { CSSProperties } from "react";
import {
  SceneCardRail,
  SceneRailItem,
  WidgetSceneCard,
} from "./SceneCardRail";
import type { WidgetControl, WidgetSizeMode } from "../types";

/** A compact, pill-shaped scene button used in the rail when the control is compact. */
const SceneButton = ({
  scene,
  onActivate,
}: {
  scene: HueScene;
  onActivate: () => void;
}) => {
  const bubble = sceneBubbleCss(scene);
  const active = isSceneActive(scene);
  return (
    <button
      type="button"
      onClick={onActivate}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-foreground/40 bg-foreground/15"
          : "border-border/60 hover:bg-foreground/10",
      )}
    >
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full ring-1 ring-foreground/20"
        style={{ background: bubble ?? "var(--muted-foreground)" }}
      />
      <span className="whitespace-nowrap">{scene.name}</span>
    </button>
  );
};

/**
 * Renders the resolved control once a room/zone or light target is found. The
 * card mirrors the real Home/Space tile: a control header that tints with the
 * light's live color (and dims with its brightness) when on, sitting on the
 * neutral card surface. A control's chosen scenes appear below the header in a
 * horizontal, drag-scrollable rail — as miniature scene cards (full) or pill
 * buttons (compact) — on that neutral surface so they stay legible against any
 * header tint.
 */
export const ControlView = ({
  name,
  icon,
  isOn,
  brightness,
  tileBackground,
  tileTint,
  dimmable,
  showBrightness,
  scenes,
  compact,
  hueEventRevision,
  sizeMode = "default",
  onToggle,
  onBrightness,
  onActivateScene,
}: {
  name: string;
  icon: React.ReactNode;
  isOn: boolean;
  brightness: number | null;
  tileBackground: string | null;
  tileTint: string | null;
  dimmable: boolean;
  showBrightness: boolean;
  scenes: HueScene[];
  /**
   * The control's compact (slider-hidden) mode. Compact controls render scenes
   * as pill buttons in the rail; full controls render them as scene cards.
   */
  compact: boolean;
  hueEventRevision: number;
  sizeMode?: WidgetSizeMode;
  onToggle: (next: boolean) => void;
  onBrightness: (pct: number, phase: "live" | "final") => void;
  onActivateScene: (scene: HueScene) => void;
}) => {
  const pct = brightness ?? 0;
  // The header reads as "lit" only when the control is on *and* has a color to
  // paint with; otherwise it stays on the card's neutral surface.
  const lit = isOn && tileBackground != null;

  return (
    <Card
      size="sm"
      // `h-full` + flex column lets the card fill its grid cell, which the grid
      // stretches to the tallest card in the row — so cards on a row share one
      // height. The scene area (the last child) grows to absorb any extra height,
      // keeping its strip flush to the card's bottom rather than floating.
      className="flex h-full flex-col gap-0 overflow-hidden border border-tile-border bg-card bg-clip-padding p-0 ring-0"
    >
      {/* Lit control header — the real space/light tile treatment. */}
      <div
        // `text-foreground` re-declares `color` *inside* the scope where the lit
        // theme overrides `--foreground`, so the unstyled name `<p>` below inherits
        // the computed tile ink. Without it the `<p>` inherits the Card's already-
        // resolved color (the widget window's theme), and the ink choice never
        // reaches the text.
        className={cn(
          "flex flex-col text-foreground",
          sizeMode === "small"
            ? "gap-2 p-2.5"
            : sizeMode === "large"
              ? "gap-3 p-3.5"
              : "gap-2.5 p-3",
          TILE_INTERACTION_TRANSITION_CLASS,
        )}
        style={
          lit
            ? ({
                "--tile-ease": `${UI_EASE_MS.tileBackground}ms`,
                // Only dim the header by brightness when the target actually
                // reports one; a non-dimmable lit target keeps its full color.
                ...activeTileTheme(
                  tileBackground,
                  tileTint ?? tileBackground,
                  brightness ?? undefined,
                ),
              } as CSSProperties)
            : undefined
        }
      >
        <div
          className={cn(
            "flex items-center",
            sizeMode === "small"
              ? "gap-2"
              : sizeMode === "large"
                ? "gap-3"
                : "gap-2.5",
          )}
        >
          <span
            className={cn(
              "flex shrink-0 items-center justify-center",
              sizeMode === "small"
                ? "size-8"
                : sizeMode === "large"
                  ? "size-10"
                  : "size-9",
              lit ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {icon}
          </span>
          <p
            className={cn(
              "min-w-0 flex-1 truncate font-medium",
              sizeMode === "small"
                ? "text-sm"
                : sizeMode === "large"
                  ? "text-base"
                  : "text-[15px]",
            )}
          >
            {name}
          </p>
          <Switch
            size="xl"
            className={TILE_POWER_SWITCH_CLASS}
            checked={isOn}
            aria-label={`Toggle ${name}`}
            onCheckedChange={onToggle}
          />
        </div>

        {showBrightness && dimmable ? (
          <PacedSlider
            value={isOn ? Math.max(1, pct) : 1}
            min={1}
            ariaLabel={`${name} brightness`}
            className={cn(
              TILE_BRIGHTNESS_SLIDER_CLASS,
              !isOn && "tile-brightness-slider-off",
            )}
            size="default"
            isGroup
            animateKey={hueEventRevision}
            onCommit={onBrightness}
          />
        ) : null}
      </div>

      {/* Neutral scene area: legible against the (possibly tinted) header. It
          grows (`flex-1`) so its strip fills any extra height the row's tallest
          sibling forces onto this card. */}
      {scenes.length > 0 ? (
        <div
          className={cn(
            "flex-1 border-t border-tile-border/70 bg-background/40 px-2",
            compact ? "py-2" : "pt-1.5 pb-1",
          )}
        >
          <SceneCardRail>
            {scenes.map((scene) => (
              <SceneRailItem key={scene.id}>
                {compact ? (
                  <SceneButton
                    scene={scene}
                    onActivate={() => onActivateScene(scene)}
                  />
                ) : (
                  <WidgetSceneCard
                    scene={scene}
                    onActivate={() => onActivateScene(scene)}
                  />
                )}
              </SceneRailItem>
            ))}
          </SceneCardRail>
        </div>
      ) : null}
    </Card>
  );
};

const UnavailableCard = ({ label }: { label: string }) => (
  <Card size="sm" className="border border-tile-border bg-tile-off">
    <div className="px-(--card-spacing) py-1">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">
        This target isn’t available right now.
      </p>
    </div>
  </Card>
);

/**
 * One configured control on the widget. Resolves its target from the shared Hue
 * store and renders the constrained control: a power toggle, an optional
 * brightness slider, and (for room/zone targets) the chosen scene buttons.
 */
export const ControlCard = ({
  control,
  sizeMode = "default",
}: {
  control: WidgetControl;
  sizeMode?: WidgetSizeMode;
}) => {
  const iconSize = sizeMode === "small" ? 20 : sizeMode === "large" ? 24 : 22;
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const lights = useHueResourcesStore((state) => state.lights);
  const scenes = useHueResourcesStore((state) => state.scenes);
  const hueEventRevision = useHueResourcesStore(
    (state) => state.hueEventRevision,
  );
  const setRoomZoneState = useHueResourcesStore(
    (state) => state.setRoomZoneState,
  );
  const setLightState = useHueResourcesStore((state) => state.setLightState);
  const activateScene = useHueResourcesStore((state) => state.activateScene);

  if (control.target.kind === "light") {
    const light = lights.find(
      (candidate) => candidate.id === control.target.id,
    );
    if (!light) return <UnavailableCard label={control.label ?? "Light"} />;
    const hex = light.isOn ? lightColorHex(light) : null;
    return (
      <ControlView
        name={control.label ?? light.name}
        icon={<Lightbulb size={iconSize} strokeWidth={2.5} />}
        isOn={light.isOn}
        brightness={light.brightness}
        tileBackground={hex}
        tileTint={hex}
        dimmable={light.brightness != null}
        showBrightness={!control.compact && control.showBrightness}
        scenes={[]}
        compact={control.compact ?? false}
        hueEventRevision={hueEventRevision}
        sizeMode={sizeMode}
        onToggle={(next) => setLightState(light, next, null)}
        onBrightness={(pct, phase) => setLightState(light, true, pct, phase)}
        onActivateScene={() => undefined}
      />
    );
  }

  const roomZone: HueRoomZone | undefined = roomZones.find(
    (candidate) => candidate.id === control.target.id,
  );
  if (!roomZone) return <UnavailableCard label={control.label ?? "Room"} />;

  const members: HueLight[] = lights.filter((light) =>
    roomZone.lightIds.includes(light.id),
  );
  const tile = roomZoneTileColor(members);
  // Resolve the chosen scenes in the order the control stored them, dropping
  // any that no longer exist on the bridge.
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const controlScenes = control.sceneIds
    .map((id) => sceneById.get(id))
    .filter((scene): scene is HueScene => scene != null);

  const Icon = getRoomZoneIcon(roomZone.class);
  return (
    <ControlView
      name={control.label ?? roomZone.name}
      icon={<Icon size={iconSize} strokeWidth={2.5} />}
      isOn={roomZone.anyOn}
      brightness={roomZone.brightness}
      tileBackground={tile.background}
      tileTint={tile.glow ?? tile.background}
      dimmable={roomZone.groupedLightId != null}
      showBrightness={!control.compact && control.showBrightness}
      scenes={controlScenes}
      compact={control.compact ?? false}
      hueEventRevision={hueEventRevision}
      sizeMode={sizeMode}
      onToggle={(next) => setRoomZoneState(roomZone, next, null)}
      onBrightness={(pct, phase) =>
        setRoomZoneState(roomZone, true, pct, phase)
      }
      onActivateScene={(scene) => void activateScene(scene)}
    />
  );
};
