import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getRoomZoneIcon } from "@/features/home-screen/components/room-zone-icons";
import { sceneBubbleCss } from "@/features/space-screen/utils/color-state";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import { cn } from "@/lib/utils";
import type { HueLight, HueRoomZone, HueScene } from "@/types/hue";
import { Check, ChevronLeft, Lightbulb, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  MAX_CONTROL_SCENES,
  newControlId,
  type ControlTarget,
  type WidgetControl,
} from "../types";

const IconTooltip = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger
        render={<span className="inline-flex">{children}</span>}
      />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

interface ResolvedTarget {
  target: ControlTarget;
  name: string;
  /** Whether a brightness slider makes sense for this target. */
  dimmable: boolean;
  icon: React.ReactNode;
}

const resolveRoomZone = (roomZone: HueRoomZone): ResolvedTarget => {
  const Icon = getRoomZoneIcon(roomZone.class);
  return {
    target: { kind: roomZone.resourceType, id: roomZone.id },
    name: roomZone.name,
    dimmable: roomZone.groupedLightId != null,
    icon: <Icon size={20} strokeWidth={2.5} />,
  };
};

const resolveLight = (light: HueLight): ResolvedTarget => ({
  target: { kind: "light", id: light.id },
  name: light.name,
  dimmable: light.brightness != null,
  icon: <Lightbulb size={20} strokeWidth={2.5} />,
});

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="px-1 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
    {children}
  </p>
);

const TargetRow = ({
  resolved,
  onSelect,
}: {
  resolved: ResolvedTarget;
  onSelect: () => void;
}) => (
  <button
    type="button"
    onClick={onSelect}
    className="flex w-full items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
  >
    <span className="flex size-8 shrink-0 items-center justify-center text-muted-foreground">
      {resolved.icon}
    </span>
    <span className="min-w-0 flex-1 truncate text-sm font-medium">
      {resolved.name}
    </span>
  </button>
);

/** Step 1 — pick the room, zone, or light the control manages. */
const TargetStep = ({
  onPick,
  onCancel,
}: {
  onPick: (resolved: ResolvedTarget) => void;
  onCancel: () => void;
}) => {
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const lights = useHueResourcesStore((state) => state.lights);
  const [query, setQuery] = useState("");

  const rooms = roomZones.filter((rz) => rz.resourceType === "room");
  const zones = roomZones.filter((rz) => rz.resourceType === "zone");
  const term = query.trim().toLowerCase();
  const match = (name: string) => name.toLowerCase().includes(term);

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <IconTooltip label="Cancel">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Cancel"
            onClick={onCancel}
          >
            <X size={18} />
          </Button>
        </IconTooltip>
        <div>
          <p className="text-base font-semibold leading-tight">
            Add a control
          </p>
          <p className="text-xs text-muted-foreground">
            Pick what this control manages.
          </p>
        </div>
      </div>

      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search rooms, zones, lights…"
          className="pl-9"
        />
      </div>

      <div className="grid gap-1">
        {rooms.filter((rz) => match(rz.name)).length > 0 && (
          <SectionLabel>Rooms</SectionLabel>
        )}
        {rooms
          .filter((rz) => match(rz.name))
          .map((rz) => (
            <TargetRow
              key={rz.id}
              resolved={resolveRoomZone(rz)}
              onSelect={() => onPick(resolveRoomZone(rz))}
            />
          ))}

        {zones.filter((rz) => match(rz.name)).length > 0 && (
          <SectionLabel>Zones</SectionLabel>
        )}
        {zones
          .filter((rz) => match(rz.name))
          .map((rz) => (
            <TargetRow
              key={rz.id}
              resolved={resolveRoomZone(rz)}
              onSelect={() => onPick(resolveRoomZone(rz))}
            />
          ))}

        {lights.filter((light) => match(light.name)).length > 0 && (
          <SectionLabel>Lights</SectionLabel>
        )}
        {lights
          .filter((light) => match(light.name))
          .map((light) => (
            <TargetRow
              key={light.id}
              resolved={resolveLight(light)}
              onSelect={() => onPick(resolveLight(light))}
            />
          ))}
      </div>
    </div>
  );
};

/** Step 2 — name it, choose controls, and (for groups) pick quick scenes. */
const ControlsStep = ({
  resolved,
  initial,
  onBack,
  onSave,
}: {
  resolved: ResolvedTarget;
  initial?: WidgetControl;
  onBack: () => void;
  onSave: (control: WidgetControl) => void;
}) => {
  const scenes = useHueResourcesStore((state) => state.scenes);
  const [label, setLabel] = useState(initial?.label ?? "");
  const [showBrightness, setShowBrightness] = useState(
    initial?.showBrightness ?? resolved.dimmable,
  );
  const [sceneIds, setSceneIds] = useState<string[]>(initial?.sceneIds ?? []);

  // Scenes only apply to a group target, filtered to the ones that target it.
  const groupScenes = useMemo<HueScene[]>(
    () =>
      resolved.target.kind === "light"
        ? []
        : scenes.filter((scene) => scene.group === resolved.target.id),
    [resolved.target, scenes],
  );

  const toggleScene = (id: string) =>
    setSceneIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= MAX_CONTROL_SCENES) return current;
      return [...current, id];
    });

  const handleSave = () => {
    onSave({
      id: initial?.id ?? newControlId(),
      target: resolved.target,
      label: label.trim() ? label.trim() : null,
      showBrightness: resolved.dimmable ? showBrightness : false,
      sceneIds: resolved.target.kind === "light" ? [] : sceneIds,
      compact: initial?.compact ?? false,
      hotkey: initial?.hotkey ?? null,
    });
  };

  const atSceneLimit = sceneIds.length >= MAX_CONTROL_SCENES;

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-2">
        <IconTooltip label="Back">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Back"
            onClick={onBack}
          >
            <ChevronLeft size={18} />
          </Button>
        </IconTooltip>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center text-muted-foreground">
            {resolved.icon}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold leading-tight">
              {label.trim() || resolved.name}
            </p>
            <p className="text-xs text-muted-foreground capitalize">
              {resolved.target.kind}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-medium">Name</p>
        <Input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder={resolved.name}
        />
      </div>

      {resolved.dimmable ? (
        <label className="flex items-center justify-between gap-3">
          <span className="space-y-0.5">
            <span className="block text-sm font-medium">Brightness slider</span>
            <span className="block text-xs text-muted-foreground">
              Show a dimmer under the toggle.
            </span>
          </span>
          <Switch
            checked={showBrightness}
            onCheckedChange={setShowBrightness}
            aria-label="Show brightness slider"
          />
        </label>
      ) : null}

      {resolved.target.kind !== "light" ? (
        <div className="grid gap-2">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Quick scenes</p>
            <p className="text-xs text-muted-foreground">
              {groupScenes.length === 0
                ? "No scenes saved for this space yet."
                : `Tap to add up to ${MAX_CONTROL_SCENES} scene buttons.`}
            </p>
          </div>
          <div className="grid gap-1.5">
            {groupScenes.map((scene) => {
              const selected = sceneIds.includes(scene.id);
              const bubble = sceneBubbleCss(scene);
              const disabled = !selected && atSceneLimit;
              return (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => toggleScene(scene.id)}
                  disabled={disabled}
                  aria-pressed={selected}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    selected
                      ? "border-foreground/30 bg-foreground/10"
                      : "border-border/60 bg-card hover:bg-muted/40",
                    disabled && "opacity-40",
                  )}
                >
                  <span
                    aria-hidden
                    className="size-3.5 shrink-0 rounded-full ring-1 ring-border/60"
                    style={{ background: bubble ?? "var(--muted)" }}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {scene.name}
                  </span>
                  {selected ? (
                    <Check size={16} className="shrink-0 text-foreground" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <Button type="button" onClick={handleSave} className="w-full">
        {initial ? "Save changes" : "Add control"}
      </Button>
    </div>
  );
};

/**
 * Two-step onboarding for a single control: pick a target, then choose its
 * controls. Pass `editing` to jump straight to the controls step for an
 * existing control.
 */
export const ControlWizard = ({
  editing,
  onCancel,
  onComplete,
}: {
  editing?: { control: WidgetControl; resolved: ResolvedTarget };
  onCancel: () => void;
  onComplete: (control: WidgetControl) => void;
}) => {
  const [picked, setPicked] = useState<ResolvedTarget | null>(
    editing?.resolved ?? null,
  );

  if (!picked) {
    return <TargetStep onPick={setPicked} onCancel={onCancel} />;
  }

  return (
    <ControlsStep
      resolved={picked}
      initial={editing?.control}
      onBack={editing ? onCancel : () => setPicked(null)}
      onSave={onComplete}
    />
  );
};

export type { ResolvedTarget };
export { resolveLight, resolveRoomZone };
