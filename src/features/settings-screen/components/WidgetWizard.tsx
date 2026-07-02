import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getRoomZoneIcon } from "@/features/home-screen/components/room-zone-icons";
import { ControlCard } from "@/features/widget-screen/components/ControlCard";
import {
  SceneCardRail,
  SceneRailItem,
  SelectableSceneCard,
} from "@/features/widget-screen/components/SceneCardRail";
import {
  newControlId,
  type WidgetControl,
  type WidgetThemeMode,
} from "@/features/widget-screen/types";
import {
  WIDGET_SIDE_PADDING,
  WIDGET_SIZE_METRICS,
  resolveWidgetTheme,
  widgetCardGridColumns,
  widgetShellStyle,
} from "@/features/widget-screen/widgetShell";
import { cn } from "@/lib/utils";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueLight, HueRoomZone, HueScene } from "@/types/hue";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { invoke } from "@tauri-apps/api/core";
import {
  Check,
  ChevronDown,
  GripVertical,
  Lightbulb,
  Search,
  Sparkles,
  Spotlight,
} from "lucide-react";
import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  SettingsWizardContainedStep,
  SettingsWizardLayout,
  SettingsWizardViewport,
} from "./SettingsWizardLayout";

const BLINK_DURATION_MS = 3_000;

const steps = ["Name", "Controls", "Configure"];

// Suggested widget names shown as the input placeholder. One is picked at random
// when the wizard mounts so the field reads as an editable example rather than a
// fixed label — keeping it a curated local list avoids pulling in a generator dep.
const SUGGESTED_NAMES = [
  "Focus Mode",
  "Evening Wind-Down",
  "Movie Night",
  "Morning Routine",
  "Reading Nook",
  "Studio Session",
  "Cozy Hideaway",
  "Late-Night Glow",
  "Weekend Vibes",
  "Sunset Lounge",
  "Golden Hour",
  "Game Night",
];

const randomSuggestedName = () =>
  SUGGESTED_NAMES[Math.floor(Math.random() * SUGGESTED_NAMES.length)];
const themeModes: Array<{ value: WidgetThemeMode; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
// Dev-only placeholder targets so the Control screen has something to
// select when no bridge is connected (e.g. the VITE_DEV_VIEWS preview). Never
// surfaced in production builds — a real empty wizard shows no fake targets.
const makeDummyRoomZone = (
  id: string,
  name: string,
  klass: string,
  resourceType: "room" | "zone",
  lightCount: number,
): HueRoomZone =>
  ({
    id,
    name,
    class: klass,
    resourceType,
    anyOn: false,
    allOn: false,
    brightness: 60,
    lightCount,
    lightIds: [],
    deviceIds: [],
    groupedLightId: null,
    accessories: [],
  }) as HueRoomZone;

const makeDummyLight = (
  id: string,
  name: string,
  productName: string,
  reachable: boolean,
): HueLight => ({
  id,
  deviceId: null,
  name,
  isOn: false,
  brightness: 70,
  reachable,
  colorMode: null,
  xy: null,
  ct: null,
  effect: null,
  effects: [],
  effectV2: null,
  effectsV2: [],
  supportsColor: true,
  supportsCt: true,
  ctMin: null,
  ctMax: null,
  gamut: null,
  modelId: null,
  productName,
  typeName: null,
  swVersion: null,
  uniqueId: null,
  function: "functional",
});

const DUMMY_ROOM_ZONES: HueRoomZone[] = [
  makeDummyRoomZone("dummy-living", "Living Room", "living_room", "room", 4),
  makeDummyRoomZone("dummy-bedroom", "Bedroom", "bedroom", "room", 2),
  makeDummyRoomZone("dummy-kitchen", "Kitchen", "kitchen", "room", 3),
  makeDummyRoomZone("dummy-ground", "Ground Floor", "downstairs", "zone", 9),
];

const DUMMY_LIGHTS: HueLight[] = [
  makeDummyLight("dummy-desk", "Desk Lamp", "Hue Go", true),
  makeDummyLight("dummy-sofa", "Sofa Strip", "Hue Lightstrip Plus", true),
  makeDummyLight("dummy-hall", "Hallway Spot", "Hue White Ambiance", false),
  makeDummyLight("dummy-ceiling", "Ceiling Light", "Hue White Ambiance", true),
  makeDummyLight("dummy-floor", "Floor Lamp", "Hue Signe Floor", true),
  makeDummyLight("dummy-night", "Nightstand", "Hue Go", true),
  makeDummyLight("dummy-mirror", "Mirror Light", "Hue White Ambiance", true),
  makeDummyLight("dummy-tv", "TV Backlight", "Hue Play", true),
  makeDummyLight(
    "dummy-bookshelf",
    "Bookshelf Strip",
    "Hue Lightstrip Plus",
    true,
  ),
  makeDummyLight("dummy-entry", "Entryway Spot", "Hue White Ambiance", false),
  makeDummyLight("dummy-counter", "Counter Strip", "Hue Lightstrip Plus", true),
  makeDummyLight(
    "dummy-pendant",
    "Kitchen Pendant",
    "Hue White Ambiance",
    true,
  ),
  makeDummyLight("dummy-reading", "Reading Lamp", "Hue White Ambiance", true),
  makeDummyLight("dummy-corner", "Corner Lamp", "Hue Signe Table", true),
  makeDummyLight("dummy-bath", "Bathroom Light", "Hue White Ambiance", true),
  makeDummyLight("dummy-vanity", "Vanity Light", "Hue White Ambiance", false),
  makeDummyLight("dummy-closet", "Closet Light", "Hue White", true),
  makeDummyLight("dummy-stair", "Stairway Light", "Hue White Ambiance", true),
  makeDummyLight("dummy-porch", "Porch Light", "Hue White", false),
  makeDummyLight("dummy-garage", "Garage Light", "Hue White", true),
  makeDummyLight("dummy-patio", "Patio Strip", "Hue Lightstrip Outdoor", true),
  makeDummyLight("dummy-garden", "Garden Spot", "Hue Lily", true),
  makeDummyLight("dummy-office", "Office Lamp", "Hue Go", true),
  makeDummyLight("dummy-accent", "Accent Light", "Hue Iris", true),
  makeDummyLight("dummy-dining", "Dining Pendant", "Hue White Ambiance", true),
];

interface WidgetWizardProps {
  onCreate: (options: {
    title: string;
    controls: WidgetControl[];
    themeMode: WidgetThemeMode;
  }) => void;
  /** Step to mount on. Dev-only: lets the dev toolbar preview a single screen. */
  initialStep?: number;
}

const targetKey = (kind: "room" | "zone" | "light", id: string) =>
  `${kind}:${id}`;

export const WidgetWizard = ({
  onCreate,
  initialStep = 0,
}: WidgetWizardProps) => {
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const lights = useHueResourcesStore((state) => state.lights);
  const scenes = useHueResourcesStore((state) => state.scenes);
  const [step, setStep] = useState(initialStep);
  const [title, setTitle] = useState("");
  const [namePlaceholder] = useState(randomSuggestedName);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [spacesOpen, setSpacesOpen] = useState(true);
  const [lightsOpen, setLightsOpen] = useState(true);
  const [themeMode, setThemeMode] = useState<WidgetThemeMode>("system");
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(initialStep);
  // Editable list of controls, seeded from the step-1 selection. Held as state
  // (not derived) so it can be reordered and configured per-control.
  const [controls, setControls] = useState<WidgetControl[]>([]);
  const [blinkingTargets, setBlinkingTargets] = useState<Set<string>>(
    () => new Set(),
  );

  // Fall back to placeholder targets in dev when the store is empty (no bridge),
  // so the selection UI is never blank to design against. Production keeps the
  // real lists, even when empty.
  const roomZoneOptions =
    roomZones.length === 0 && import.meta.env.DEV
      ? DUMMY_ROOM_ZONES
      : roomZones;
  const lightOptions =
    lights.length === 0 && import.meta.env.DEV ? DUMMY_LIGHTS : lights;

  const normalizedQuery = query.trim().toLowerCase();
  const matchesQuery = (...fields: Array<string | null>) =>
    normalizedQuery.length === 0 ||
    fields.some((field) => field?.toLowerCase().includes(normalizedQuery));

  const filteredRoomZones = roomZoneOptions.filter((target) =>
    matchesQuery(target.name),
  );
  const filteredLights = lightOptions.filter((light) =>
    matchesQuery(light.name, light.productName),
  );

  const roomZoneKeys = filteredRoomZones.map((target) =>
    targetKey(target.resourceType, target.id),
  );
  const lightKeys = filteredLights.map((light) => targetKey("light", light.id));
  const roomZonesAllSelected =
    roomZoneKeys.length > 0 &&
    roomZoneKeys.every((key) => selected.includes(key));
  const lightsAllSelected =
    lightKeys.length > 0 && lightKeys.every((key) => selected.includes(key));

  const setKeysSelected = (keys: string[], select: boolean) =>
    setSelected((current) =>
      select
        ? Array.from(new Set([...current, ...keys]))
        : current.filter((key) => !keys.includes(key)),
    );

  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const previewTheme = resolveWidgetTheme(themeMode, systemDark);

  // Reconcile the editable list with the step-1 selection: append a default
  // (full) control for each newly selected target, drop deselected ones, and
  // preserve the order + per-control config of everything kept — so going Back
  // to tweak the selection never wipes configuration or reordering.
  useEffect(() => {
    setControls((current) => {
      const selectedSet = new Set(selected);
      const kept = current.filter((control) =>
        selectedSet.has(targetKey(control.target.kind, control.target.id)),
      );
      const keptKeys = new Set(
        kept.map((control) =>
          targetKey(control.target.kind, control.target.id),
        ),
      );

      const additions: WidgetControl[] = [];
      for (const target of roomZoneOptions) {
        const key = targetKey(target.resourceType, target.id);
        if (!selectedSet.has(key) || keptKeys.has(key)) continue;
        additions.push({
          id: newControlId(),
          target: { kind: target.resourceType, id: target.id },
          label: target.name,
          showBrightness: target.groupedLightId != null,
          sceneIds: [],
          compact: false,
          hotkey: null,
        });
      }
      for (const target of lightOptions) {
        const key = targetKey("light", target.id);
        if (!selectedSet.has(key) || keptKeys.has(key)) continue;
        additions.push({
          id: newControlId(),
          target: { kind: "light", id: target.id },
          label: target.name,
          showBrightness: target.brightness != null,
          sceneIds: [],
          compact: false,
          hotkey: null,
        });
      }

      // Nothing added and nothing removed → keep the same reference (no churn).
      if (additions.length === 0 && kept.length === current.length) {
        return current;
      }
      return [...kept, ...additions];
    });
  }, [selected, roomZoneOptions, lightOptions]);

  const setControlCompact = (id: string, compact: boolean) =>
    setControls((current) =>
      current.map((control) =>
        control.id === id ? { ...control, compact } : control,
      ),
    );

  const toggleControlScene = (id: string, sceneId: string) =>
    setControls((current) =>
      current.map((control) => {
        if (control.id !== id) return control;
        if (control.sceneIds.includes(sceneId)) {
          return {
            ...control,
            sceneIds: control.sceneIds.filter((value) => value !== sceneId),
          };
        }
        return { ...control, sceneIds: [...control.sceneIds, sceneId] };
      }),
    );

  const reorderControls = (from: number, to: number) =>
    setControls((current) => arrayMove(current, from, to));

  const roomZoneById = new Map(
    roomZoneOptions.map((target) => [target.id, target] as const),
  );

  const canContinue =
    (step === 0 && title.trim().length > 0) ||
    (step === 1 && selected.length > 0) ||
    step === 2;

  const toggleTarget = (key: string) =>
    setSelected((current) =>
      current.includes(key)
        ? current.filter((value) => value !== key)
        : [...current, key],
    );

  const blinkLights = async (key: string, lightIds: string[]) => {
    if (lightIds.length === 0 || blinkingTargets.has(key)) return;
    setBlinkingTargets((current) => new Set(current).add(key));
    try {
      await Promise.all(
        lightIds.map((id) =>
          invoke("signal-light", { id, durationMs: BLINK_DURATION_MS }),
        ),
      );
      await new Promise((resolve) =>
        window.setTimeout(resolve, BLINK_DURATION_MS),
      );
    } catch (error) {
      console.error("Failed to blink Hue lights", error);
    } finally {
      setBlinkingTargets((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const flashRoomZone = (roomZone: HueRoomZone) =>
    void blinkLights(
      targetKey(roomZone.resourceType, roomZone.id),
      roomZone.lightIds,
    );

  const flashLight = (light: HueLight) => {
    // Placeholder dev lights aren't in the store; blinking them would hit the
    // backend for a non-existent resource, so no-op unless it's a real light.
    if (!lights.some((candidate) => candidate.id === light.id)) return;
    void blinkLights(targetKey("light", light.id), [light.id]);
  };

  const create = () =>
    onCreate({
      title: title.trim(),
      controls,
      themeMode,
    });

  const nextStep = () => {
    if (!canContinue) return;
    setStep((current) => {
      const next = Math.min(2, current + 1);
      setMaxUnlockedStep((unlocked) => Math.max(unlocked, next));
      return next;
    });
  };

  return (
    <SettingsWizardLayout
      steps={steps}
      step={step}
      maxUnlockedStep={maxUnlockedStep}
      onStepChange={setStep}
      canContinue={canContinue}
      onContinue={nextStep}
      finalAction={{
        label: "Create Widget",
        disabled: !title.trim() || !selected.length,
        onClick: create,
      }}
    >
      <SettingsWizardViewport stepKey={step} contained={step === 1}>
        {step === 0 ? (
          <section className="mx-auto flex w-full max-w-md flex-col items-center gap-12 py-16 text-center">
            <div className="space-y-3">
              <h1 className="font-heading text-3xl font-semibold">
                Name your widget
              </h1>
              <p className="text-base text-muted-foreground">
                Give this widget a unique name so you can easily identify and
                manage it in the application.
              </p>
            </div>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canContinue) nextStep();
              }}
              placeholder={namePlaceholder}
              autoFocus
              size="xl"
              className="rounded-2xl border-foreground/15 bg-input/50 text-left text-lg"
            />
          </section>
        ) : null}

        {step === 1 ? (
          <SettingsWizardContainedStep>
            <div className="shrink-0 space-y-3 text-center">
              <h1 className="font-heading text-3xl font-semibold">
                Select Controls
              </h1>
              <p className="text-base text-muted-foreground">
                Choose the rooms, zones, or individual lights you want to manage
                with this widget.
              </p>
            </div>

            <div className="relative w-full shrink-0">
              <Search
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search rooms, zones, or lights"
                size="xl"
                className="rounded-2xl border-foreground/15 bg-input/50 pl-12 text-left"
              />
            </div>

            {roomZoneOptions.length === 0 && lightOptions.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No rooms or lights are available yet.
              </p>
            ) : (
              <ScrollArea
                fade="bottom"
                className="min-h-0 flex-1 overflow-hidden"
                viewportClassName="pr-2"
              >
                <div className="space-y-6 pb-1">
                  {roomZoneOptions.length > 0 ? (
                    <TargetSection
                      title="Rooms & Zones"
                      count={filteredRoomZones.length}
                      open={spacesOpen}
                      onToggleOpen={() => setSpacesOpen((open) => !open)}
                      allSelected={roomZonesAllSelected}
                      onSelectAll={() =>
                        setKeysSelected(roomZoneKeys, !roomZonesAllSelected)
                      }
                    >
                      {filteredRoomZones.length > 0 ? (
                        filteredRoomZones.map((target) => (
                          <TargetRow
                            key={target.id}
                            checked={selected.includes(
                              targetKey(target.resourceType, target.id),
                            )}
                            blinking={blinkingTargets.has(
                              targetKey(target.resourceType, target.id),
                            )}
                            icon={(() => {
                              const Icon = getRoomZoneIcon(target.class);
                              return <Icon size={18} />;
                            })()}
                            title={target.name}
                            meta={`${target.resourceType} · ${target.lightCount} light${target.lightCount === 1 ? "" : "s"}`}
                            onToggle={() =>
                              toggleTarget(
                                targetKey(target.resourceType, target.id),
                              )
                            }
                            onFlash={() => flashRoomZone(target)}
                          />
                        ))
                      ) : (
                        <EmptyRow />
                      )}
                    </TargetSection>
                  ) : null}

                  {lightOptions.length > 0 ? (
                    <TargetSection
                      title="Individual Lights"
                      count={filteredLights.length}
                      open={lightsOpen}
                      onToggleOpen={() => setLightsOpen((open) => !open)}
                      allSelected={lightsAllSelected}
                      onSelectAll={() =>
                        setKeysSelected(lightKeys, !lightsAllSelected)
                      }
                    >
                      {filteredLights.length > 0 ? (
                        filteredLights.map((light) => (
                          <TargetRow
                            key={light.id}
                            checked={selected.includes(
                              targetKey("light", light.id),
                            )}
                            blinking={blinkingTargets.has(
                              targetKey("light", light.id),
                            )}
                            icon={<Lightbulb size={18} />}
                            title={light.name}
                            meta={[
                              light.productName,
                              light.reachable ? "Reachable" : "Offline",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                            onToggle={() =>
                              toggleTarget(targetKey("light", light.id))
                            }
                            onFlash={() => flashLight(light)}
                          />
                        ))
                      ) : (
                        <EmptyRow />
                      )}
                    </TargetSection>
                  ) : null}
                </div>
              </ScrollArea>
            )}
          </SettingsWizardContainedStep>
        ) : null}

        {step === 2 ? (
          <section className="space-y-6">
            <div className="space-y-2 text-center">
              <h1 className="font-heading text-3xl font-semibold">Configure</h1>
              <p className="text-base text-muted-foreground">
                Arrange your controls and style the desktop frame before the
                widget opens.
              </p>
              <p className="text-xs text-muted-foreground/80">
                All settings can be changed after the widget is created.
              </p>
            </div>
            <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
              <Tabs defaultValue="controls" className="min-w-0 gap-4">
                <TabsList className="w-full">
                  <TabsTrigger value="controls">Controls</TabsTrigger>
                  <TabsTrigger value="appearance">Appearance</TabsTrigger>
                </TabsList>
                <TabsContent
                  value="controls"
                  className="flex min-w-0 flex-col gap-3"
                >
                  {controls.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
                      Go back and choose at least one control to configure it
                      here.
                    </p>
                  ) : (
                    controls.map((control) => {
                      const isLight = control.target.kind === "light";
                      const Icon = isLight
                        ? Lightbulb
                        : getRoomZoneIcon(
                            roomZoneById.get(control.target.id)?.class ?? "",
                          );
                      const groupScenes = isLight
                        ? []
                        : scenes.filter(
                            (scene) => scene.group === control.target.id,
                          );
                      return (
                        <ControlConfigRow
                          key={control.id}
                          control={control}
                          icon={<Icon size={18} strokeWidth={2.5} />}
                          groupScenes={groupScenes}
                          onCompactChange={(compact) =>
                            setControlCompact(control.id, compact)
                          }
                          onToggleScene={(sceneId) =>
                            toggleControlScene(control.id, sceneId)
                          }
                        />
                      );
                    })
                  )}
                </TabsContent>
                <TabsContent value="appearance" className="space-y-5">
                  <PickerGroup title="Theme">
                    {themeModes.map((mode) => (
                      <OptionButton
                        key={mode.value}
                        active={themeMode === mode.value}
                        compact
                        icon={<Sparkles size={16} />}
                        title={mode.label}
                        onClick={() => setThemeMode(mode.value)}
                      />
                    ))}
                  </PickerGroup>
                </TabsContent>
              </Tabs>

              <WidgetPreview
                theme={previewTheme}
                controls={controls}
                onReorder={reorderControls}
              />
            </div>
          </section>
        ) : null}
      </SettingsWizardViewport>
    </SettingsWizardLayout>
  );
};

const TargetSection = ({
  title,
  count,
  open,
  onToggleOpen,
  allSelected,
  onSelectAll,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggleOpen: () => void;
  allSelected: boolean;
  onSelectAll: () => void;
  children: React.ReactNode;
}) => (
  <div>
    <div className="sticky top-0 z-10 flex items-center justify-between bg-background/85 px-1 pb-2.5 backdrop-blur">
      <button
        type="button"
        onClick={onToggleOpen}
        className="group flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDown
          size={16}
          className={cn(
            "transition-transform duration-200",
            !open && "-rotate-90",
          )}
        />
        <span>{title}</span>
        <span className="text-xs tabular-nums text-muted-foreground/70">
          {count}
        </span>
      </button>
      <button
        type="button"
        onClick={onSelectAll}
        className="text-xs font-medium text-primary transition-opacity hover:opacity-70"
      >
        {allSelected ? "Clear all" : "Select all"}
      </button>
    </div>
    {open ? (
      <div className="divide-y divide-foreground/10 overflow-hidden rounded-2xl border border-foreground/12 bg-input/40">
        {children}
      </div>
    ) : null}
  </div>
);

const EmptyRow = () => (
  <p className="px-4 py-6 text-center text-xs text-muted-foreground">
    No matches
  </p>
);

const TargetRow = ({
  checked,
  blinking,
  icon,
  title,
  meta,
  onToggle,
  onFlash,
}: {
  checked: boolean;
  blinking: boolean;
  icon: React.ReactNode;
  title: string;
  meta: string;
  onToggle: () => void;
  onFlash: () => void;
}) => (
  <div
    className={cn(
      "group flex items-center gap-2 px-4 py-2.5 transition-colors",
      checked ? "bg-primary/5" : "hover:bg-foreground/3",
    )}
  >
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-foreground/30",
        )}
      >
        {checked ? <Check size={14} /> : null}
      </span>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground/5 text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {meta}
        </span>
      </span>
    </button>
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Blink ${title}`}
              disabled={blinking}
              className={cn(
                "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
                blinking && "opacity-100 disabled:opacity-100",
              )}
              onClick={onFlash}
            >
              <Spotlight
                size={15}
                className={cn(blinking && "animate-pulse")}
              />
            </Button>
          }
        />
        <TooltipContent side="bottom">
          {blinking ? `Blinking ${title}…` : `Blink ${title}`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
);

const OptionButton = ({
  active,
  compact,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  compact?: boolean;
  icon: React.ReactNode;
  title: string;
  description?: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex min-h-12 items-start gap-3 rounded-lg border p-3 text-left transition-colors",
      active
        ? "border-foreground/35 bg-foreground/10"
        : "border-border hover:bg-muted/50",
      compact && "min-h-0 py-2.5",
    )}
  >
    <span className="mt-0.5 text-muted-foreground">{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-2 text-sm font-medium">
        {title}
        {active ? <Check size={14} /> : null}
      </span>
      {description ? (
        <span className="mt-1 block text-xs text-muted-foreground">
          {description}
        </span>
      ) : null}
    </span>
  </button>
);

const PickerGroup = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-2">
    <p className="text-sm font-medium">{title}</p>
    <div className="grid gap-2">{children}</div>
  </div>
);

/**
 * One row in the Configure → Controls tab: a Compact/Full toggle for the
 * control's body, plus (for room/zone targets) an inline scene multi-select.
 */
const ControlConfigRow = ({
  control,
  icon,
  groupScenes,
  onCompactChange,
  onToggleScene,
}: {
  control: WidgetControl;
  icon: React.ReactNode;
  groupScenes: HueScene[];
  onCompactChange: (compact: boolean) => void;
  onToggleScene: (sceneId: string) => void;
}) => {
  const compact = control.compact ?? false;
  const isLight = control.target.kind === "light";

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center text-muted-foreground">
          {icon}
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {control.label ?? (isLight ? "Light" : "Room")}
        </p>
        <div className="flex shrink-0 items-center rounded-lg bg-foreground/5 p-0.5">
          {(
            [
              { value: false, label: "Full" },
              { value: true, label: "Compact" },
            ] as const
          ).map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => onCompactChange(option.value)}
              aria-pressed={compact === option.value}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                compact === option.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {!isLight ? (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            {groupScenes.length === 0
              ? "No scenes saved for this space yet."
              : "Scenes — tap to add them as quick buttons."}
          </p>
          {groupScenes.length > 0 ? (
            <SceneCardRail>
              {groupScenes.map((scene) => {
                const selected = control.sceneIds.includes(scene.id);
                return (
                  <SceneRailItem key={scene.id}>
                    <SelectableSceneCard
                      scene={scene}
                      selected={selected}
                      disabled={false}
                      onToggle={() => onToggleScene(scene.id)}
                    />
                  </SceneRailItem>
                );
              })}
            </SceneCardRail>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

const WidgetPreview = ({
  theme,
  controls,
  onReorder,
}: {
  theme: ReturnType<typeof resolveWidgetTheme>;
  controls: WidgetControl[];
  onReorder: (from: number, to: number) => void;
}) => {
  const sizeMode = "default" as const;
  const sizeMetrics = WIDGET_SIZE_METRICS[sizeMode];

  // The widget has a fixed pixel width (320 / 652) and grows with the number of
  // controls, so it can outsize the preview frame. Rather than scroll, we scale
  // the whole shell down to fit. CSS transforms don't affect layout flow, so we
  // measure the natural size and the available stage, then pick a contain scale.
  const stageRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = controls.findIndex((control) => control.id === active.id);
    const to = controls.findIndex((control) => control.id === over.id);
    if (from === -1 || to === -1) return;
    onReorder(from, to);
  };

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const shell = shellRef.current;
    if (!stage || !shell) return;
    const fit = () => {
      const availW = stage.clientWidth;
      const availH = stage.clientHeight;
      const shellW = shell.offsetWidth;
      const shellH = shell.offsetHeight;
      if (!shellW || !shellH) return;
      setScale(Math.min(1, availW / shellW, availH / shellH));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  const grid =
    controls.length > 0 ? (
      <div
        className="grid w-full content-start"
        style={{
          gap: sizeMetrics.gridGap,
          gridTemplateColumns: widgetCardGridColumns(sizeMode),
        }}
      >
        {controls.map((control) => (
          <SortablePreviewCard key={control.id} id={control.id} scale={scale}>
            <ControlCard control={control} sizeMode={sizeMode} />
          </SortablePreviewCard>
        ))}
      </div>
    ) : (
      <p className="px-6 py-10 text-center text-sm text-muted-foreground">
        Select at least one control to preview the widget.
      </p>
    );

  return (
    <div className="h-112 overflow-hidden rounded-xl border border-border/70 bg-[linear-gradient(135deg,#627d98,#d9c8a9_52%,#52616b)] p-6">
      <div
        ref={stageRef}
        className="flex h-full w-full items-center justify-center"
      >
        <div
          ref={shellRef}
          // Establish an explicit nested theme boundary. `theme-light` prevents
          // the app's outer `.dark` class from activating dark variants here.
          className={cn(
            "border border-border/40 text-foreground shadow-2xl",
            theme === "dark" ? "dark" : "theme-light",
          )}
          style={{
            ...widgetShellStyle(theme),
            width: sizeMetrics.cardBasis + WIDGET_SIDE_PADDING * 2,
            paddingTop: sizeMetrics.edgePadding,
            paddingRight: WIDGET_SIDE_PADDING,
            paddingBottom: WIDGET_SIDE_PADDING,
            paddingLeft: WIDGET_SIDE_PADDING,
            transform: `scale(${scale})`,
            transformOrigin: "center",
          }}
        >
          {controls.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={controls.map((control) => control.id)}
                strategy={rectSortingStrategy}
              >
                {grid}
              </SortableContext>
            </DndContext>
          ) : (
            grid
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Makes a preview card draggable for reordering. The preview shell is rendered
 * at `transform: scale(scale)`, so dnd-kit's pointer-delta and sibling-shift
 * transforms (measured in screen px) over-move by `scale` inside the scaled
 * container — divide them back out so dragging tracks the pointer. The inner
 * card is pointer-events-none so its sample controls never swallow the drag.
 */
const SortablePreviewCard = ({
  id,
  scale,
  children,
}: {
  id: string;
  scale: number;
  children: React.ReactNode;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const adjusted = transform
    ? { ...transform, x: transform.x / scale, y: transform.y / scale }
    : null;

  return (
    <div
      ref={setNodeRef}
      className="group/card relative min-w-0"
      style={{
        transform: CSS.Transform.toString(adjusted),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 10 : undefined,
        cursor: "grab",
        touchAction: "none",
      }}
      {...attributes}
      {...listeners}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute right-1.5 top-1.5 z-10 flex size-5 items-center justify-center rounded-md bg-foreground/10 text-muted-foreground opacity-0 transition-opacity group-hover/card:opacity-100"
      >
        <GripVertical size={13} />
      </span>
      <div className="pointer-events-none">{children}</div>
    </div>
  );
};
