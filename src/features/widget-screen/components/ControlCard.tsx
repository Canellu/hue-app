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
  TILE_BRIGHTNESS_SLIDER_CLASS,
  TILE_POWER_SWITCH_CLASS,
} from "@/lib/tile-theme";
import { cn } from "@/lib/utils";
import type { HueLight, HueRoomZone, HueScene } from "@/types/hue";
import { Lightbulb } from "lucide-react";
import type { WidgetControl, WidgetStylePreset } from "../types";

/** A scene counts as active unless the bridge reports it inactive/blank. */
const isSceneActive = (scene: HueScene): boolean => {
  const status = scene.status?.trim().toLowerCase().replace(/_/g, " ") ?? "";
  return status !== "" && status !== "inactive";
};

const SceneButton = ({
  scene,
  preset,
  onActivate,
}: {
  scene: HueScene;
  preset: WidgetStylePreset;
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
        "flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        preset === "borderless" && "rounded-sm px-2 py-0.5 text-[11px]",
        preset === "macos" && "px-3 py-1.5",
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
      <span className="truncate">{scene.name}</span>
    </button>
  );
};

/** Renders the resolved control once a room/zone or light target is found. */
export const ControlView = ({
  name,
  icon,
  isOn,
  brightness,
  tileBackground,
  tileTint,
  preset,
  dimmable,
  showBrightness,
  scenes,
  hueEventRevision,
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
  preset: WidgetStylePreset;
  dimmable: boolean;
  showBrightness: boolean;
  scenes: HueScene[];
  hueEventRevision: number;
  onToggle: (next: boolean) => void;
  onBrightness: (pct: number, phase: "live" | "final") => void;
  onActivateScene: (scene: HueScene) => void;
}) => {
  const pct = brightness ?? 0;
  const accent = isOn && tileTint ? tileTint : "var(--muted-foreground)";
  const compact = preset === "borderless";
  const cardClassName = cn(
    "gap-2 overflow-hidden border ring-0",
    preset === "windows11" &&
      "border-[var(--widget-card-border)] bg-[var(--widget-card-bg)] shadow-[var(--widget-card-shadow)] backdrop-blur-xl",
    preset === "borderless" &&
      "border-[var(--widget-card-border)] bg-[var(--widget-card-bg)] shadow-none",
    preset === "macos" &&
      "border-[var(--widget-card-border)] bg-[var(--widget-card-bg)] shadow-[var(--widget-card-shadow)] backdrop-blur-2xl",
    "rounded-[var(--widget-card-radius)]",
  );
  const accentBarHeight = preset === "borderless" ? "h-px" : "h-0.5";

  return (
    <Card
      size="sm"
      className={cardClassName}
      style={
        {
          "--widget-accent": accent,
        } as React.CSSProperties
      }
    >
      <div
        aria-hidden
        className={cn("w-full", accentBarHeight)}
        style={{
          background:
            tileBackground && isOn
              ? `color-mix(in srgb, ${tileBackground} 72%, transparent)`
              : "transparent",
        }}
      />
      <div
        className={cn(
          "flex min-h-[var(--widget-control-height)] items-center px-3",
          compact ? "gap-2" : "gap-2.5",
          preset === "macos" && "px-3.5",
        )}
      >
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-lg",
            compact ? "size-7" : "size-8",
            preset === "macos" && "rounded-2xl bg-foreground/8",
            isOn ? "text-[var(--widget-accent)]" : "text-muted-foreground",
          )}
        >
          {icon}
        </span>
        <p
          className={cn(
            "min-w-0 flex-1 truncate font-medium",
            compact ? "text-sm" : "text-[15px]",
          )}
        >
          {name}
        </p>
        <Switch
          size={compact ? "default" : "xl"}
          className={TILE_POWER_SWITCH_CLASS}
          checked={isOn}
          aria-label={`Toggle ${name}`}
          onCheckedChange={onToggle}
        />
      </div>

      {showBrightness && dimmable ? (
        <div className="px-3 pb-2">
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
        </div>
      ) : null}

      {scenes.length > 0 ? (
        <div
          className={cn(
            "flex flex-wrap gap-1.5 px-3 pb-3",
            preset === "borderless" && "gap-1 px-2.5 pb-2.5",
            preset === "macos" && "px-3.5 pb-3.5",
          )}
        >
          {scenes.map((scene) => (
            <SceneButton
              key={scene.id}
              scene={scene}
              preset={preset}
              onActivate={() => onActivateScene(scene)}
            />
          ))}
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
  preset,
}: {
  control: WidgetControl;
  preset: WidgetStylePreset;
}) => {
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
        icon={<Lightbulb size={22} strokeWidth={2.5} />}
        isOn={light.isOn}
        brightness={light.brightness}
        tileBackground={hex}
        tileTint={hex}
        preset={preset}
        dimmable={light.brightness != null}
        showBrightness={!control.compact && control.showBrightness}
        scenes={[]}
        hueEventRevision={hueEventRevision}
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
      icon={<Icon size={22} strokeWidth={2.5} />}
      isOn={roomZone.anyOn}
      brightness={roomZone.brightness}
      tileBackground={tile.background}
      tileTint={tile.glow ?? tile.background}
      preset={preset}
      dimmable={roomZone.groupedLightId != null}
      showBrightness={!control.compact && control.showBrightness}
      scenes={control.compact ? [] : controlScenes}
      hueEventRevision={hueEventRevision}
      onToggle={(next) => setRoomZoneState(roomZone, next, null)}
      onBrightness={(pct, phase) =>
        setRoomZoneState(roomZone, true, pct, phase)
      }
      onActivateScene={(scene) => void activateScene(scene)}
    />
  );
};
