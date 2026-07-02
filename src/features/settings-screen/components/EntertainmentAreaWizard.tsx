import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type {
  HueEntertainmentConfiguration,
  HueEntertainmentService,
  HueLight,
  HuePosition,
} from "@/types/hue";
import {
  Check,
  Cuboid,
  Lightbulb,
  Monitor,
  Music,
  Search,
  Sparkles,
  Tv,
} from "lucide-react";
import {
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  entertainmentCapabilities,
  type EntertainmentLightCapability,
} from "../entertainment";
import {
  SettingsWizardContainedStep,
  SettingsWizardLayout,
  SettingsWizardViewport,
} from "./SettingsWizardLayout";

const MAX_CHANNELS = 20;
const STEPS = ["Details", "Lights", "Placement"];

const CONFIGURATION_TYPES = [
  {
    value: "screen",
    label: "TV",
    description: "Lights arranged around a television.",
    icon: Tv,
  },
  {
    value: "monitor",
    label: "Monitor",
    description: "Lights arranged around one or more monitors.",
    icon: Monitor,
  },
  {
    value: "music",
    label: "Music",
    description: "Lights placed for music visualization.",
    icon: Music,
  },
  {
    value: "3dspace",
    label: "3D space",
    description: "Lights distributed throughout a room.",
    icon: Cuboid,
  },
  {
    value: "other",
    label: "Other",
    description: "A general entertainment layout.",
    icon: Sparkles,
  },
] as const;

export interface CreateEntertainmentAreaOptions {
  name: string;
  configurationType: HueEntertainmentConfiguration["configuration_type"];
  capabilities: EntertainmentLightCapability[];
  placements: Record<string, HuePosition>;
}

export const EntertainmentAreaWizard = ({
  lights,
  services,
  isLoadingCapabilities,
  capabilityError,
  isCreating,
  onCreate,
}: {
  lights: HueLight[];
  services: HueEntertainmentService[];
  isLoadingCapabilities: boolean;
  capabilityError: string | null;
  isCreating: boolean;
  onCreate: (options: CreateEntertainmentAreaOptions) => void;
}) => {
  const capabilities = useMemo(
    () => entertainmentCapabilities(lights, services),
    [lights, services],
  );
  const [step, setStep] = useState(0);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(0);
  const [name, setName] = useState("");
  const [configurationType, setConfigurationType] =
    useState<HueEntertainmentConfiguration["configuration_type"]>("screen");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [placements, setPlacements] = useState<Record<string, HuePosition>>({});
  const [query, setQuery] = useState("");
  const [activeLightId, setActiveLightId] = useState<string | null>(null);
  const [draggingLightId, setDraggingLightId] = useState<string | null>(null);

  const capabilityByLightId = useMemo(
    () =>
      new Map(
        capabilities.map((capability) => [capability.light.id, capability]),
      ),
    [capabilities],
  );
  const selectedCapabilities = selectedIds.flatMap((id) => {
    const capability = capabilityByLightId.get(id);
    return capability ? [capability] : [];
  });
  const selectedChannelCount = selectedCapabilities.reduce(
    (total, capability) => total + capability.channelCount,
    0,
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredCapabilities = capabilities.filter(({ light }) =>
    normalizedQuery.length === 0
      ? true
      : [light.name, light.productName, light.modelId].some((value) =>
          value?.toLowerCase().includes(normalizedQuery),
        ),
  );

  const initializePlacements = () => {
    setPlacements((current) => {
      const next = { ...current };
      selectedIds.forEach((id, index) => {
        if (next[id]) return;
        const angle =
          selectedIds.length === 1
            ? 0
            : (index / selectedIds.length) * Math.PI * 2 - Math.PI / 2;
        next[id] = {
          x: selectedIds.length === 1 ? 0 : round(Math.cos(angle) * 0.72),
          y: 0.8,
          z: selectedIds.length === 1 ? 0 : round(-Math.sin(angle) * 0.72),
        };
      });
      return next;
    });
    setActiveLightId((current) =>
      current && selectedIds.includes(current)
        ? current
        : (selectedIds[0] ?? null),
    );
  };

  const canContinue =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 &&
      selectedCapabilities.length > 0 &&
      selectedChannelCount <= MAX_CHANNELS) ||
    step === 2;

  const nextStep = () => {
    if (!canContinue) return;
    if (step === 1) initializePlacements();
    setStep((current) => {
      const next = Math.min(STEPS.length - 1, current + 1);
      setMaxUnlockedStep((unlocked) => Math.max(unlocked, next));
      return next;
    });
  };

  const toggleLight = (capability: EntertainmentLightCapability) => {
    const id = capability.light.id;
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      const channels = current.reduce(
        (total, lightId) =>
          total + (capabilityByLightId.get(lightId)?.channelCount ?? 0),
        0,
      );
      return channels + capability.channelCount <= MAX_CHANNELS
        ? [...current, id]
        : current;
    });
  };

  const updatePlacement = (id: string, update: Partial<HuePosition>) => {
    setPlacements((current) => ({
      ...current,
      [id]: { ...(current[id] ?? { x: 0, y: 0.8, z: 0 }), ...update },
    }));
  };

  const movePin = (id: string, event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    updatePlacement(id, {
      x: round(clamp(((event.clientX - bounds.left) / bounds.width) * 2 - 1)),
      z: round(clamp(1 - ((event.clientY - bounds.top) / bounds.height) * 2)),
    });
  };

  const submit = () => {
    if (
      !name.trim() ||
      selectedCapabilities.length === 0 ||
      selectedCapabilities.some(({ light }) => !placements[light.id])
    ) {
      return;
    }
    onCreate({
      name: name.trim(),
      configurationType,
      capabilities: selectedCapabilities,
      placements,
    });
  };

  const activeLight = activeLightId
    ? capabilityByLightId.get(activeLightId)?.light
    : undefined;
  const activePlacement = activeLightId ? placements[activeLightId] : undefined;

  return (
    <SettingsWizardLayout
      steps={STEPS}
      step={step}
      maxUnlockedStep={maxUnlockedStep}
      onStepChange={(nextStep) => {
        if (nextStep === 2) initializePlacements();
        setStep(nextStep);
      }}
      canContinue={canContinue}
      onContinue={nextStep}
      finalAction={{
        label: isCreating ? "Creating…" : "Create entertainment area",
        disabled:
          isCreating || !name.trim() || selectedCapabilities.length === 0,
        onClick: submit,
      }}
    >
      <SettingsWizardViewport stepKey={step} contained={step !== 0}>
        {step === 0 ? (
          <section className="mx-auto flex w-full max-w-2xl flex-col gap-9 py-8">
            <div className="space-y-3 text-center">
              <h1 className="font-heading text-3xl font-semibold">
                Set up your area
              </h1>
              <p className="text-base text-muted-foreground">
                Name the area and choose what its light placement is optimized
                for.
              </p>
            </div>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canContinue) nextStep();
              }}
              maxLength={32}
              placeholder="Living room TV"
              autoFocus
              size="xl"
              className="mx-auto max-w-md rounded-2xl border-foreground/15 bg-input/50 text-center text-lg"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {CONFIGURATION_TYPES.map((option) => {
                const Icon = option.icon;
                const active = configurationType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setConfigurationType(option.value)}
                    className={cn(
                      "flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/5"
                        : "border-foreground/15 hover:bg-foreground/5",
                    )}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
                      <Icon size={19} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-semibold">
                        {option.label}
                        {active ? (
                          <Check size={15} className="text-primary" />
                        ) : null}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <SettingsWizardContainedStep contentClassName="gap-5">
            <div className="shrink-0 space-y-3 text-center">
              <h1 className="font-heading text-3xl font-semibold">
                Add compatible lights
              </h1>
              <p className="text-base text-muted-foreground">
                Only lights whose bridge service supports entertainment
                rendering are shown.
              </p>
            </div>
            <div className="relative shrink-0">
              <Search
                size={18}
                className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search compatible lights"
                size="xl"
                className="rounded-2xl border-foreground/15 bg-input/50 pl-12"
              />
            </div>
            {isLoadingCapabilities ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Checking light capabilities…
              </p>
            ) : capabilityError ? (
              <p className="py-12 text-center text-sm text-destructive">
                {capabilityError}
              </p>
            ) : capabilities.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No entertainment-capable lights were found on this bridge.
              </p>
            ) : (
              <ScrollArea
                fade="bottom"
                className="min-h-0 flex-1 overflow-hidden"
              >
                <div className="divide-y divide-foreground/10 overflow-hidden rounded-2xl border border-foreground/12 bg-input/40">
                  {filteredCapabilities.length > 0 ? (
                    filteredCapabilities.map((capability) => {
                      const checked = selectedIds.includes(capability.light.id);
                      const wouldExceed =
                        !checked &&
                        selectedChannelCount + capability.channelCount >
                          MAX_CHANNELS;
                      return (
                        <label
                          key={capability.light.id}
                          className={cn(
                            "flex items-center gap-3 px-4 py-3 transition-colors",
                            wouldExceed
                              ? "cursor-not-allowed opacity-45"
                              : "cursor-pointer hover:bg-foreground/3",
                            checked && "bg-primary/5",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={checked}
                            disabled={wouldExceed}
                            onChange={() => toggleLight(capability)}
                          />
                          <span
                            className={cn(
                              "flex size-5 shrink-0 items-center justify-center rounded-md border",
                              checked
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-foreground/30",
                            )}
                          >
                            {checked ? <Check size={14} /> : null}
                          </span>
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground/5 text-muted-foreground">
                            <Lightbulb size={18} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {capability.light.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {[
                                capability.light.productName,
                                capability.light.reachable
                                  ? "Reachable"
                                  : "Offline",
                                capability.channelCount > 1
                                  ? `${capability.channelCount} channels`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  ) : (
                    <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No compatible lights match your search.
                    </p>
                  )}
                </div>
              </ScrollArea>
            )}
            <p className="shrink-0 text-center text-xs text-muted-foreground">
              {selectedIds.length} selected · {selectedChannelCount}/
              {MAX_CHANNELS} channels
            </p>
          </SettingsWizardContainedStep>
        ) : null}

        {step === 2 ? (
          <SettingsWizardContainedStep
            className="max-w-3xl"
            contentClassName="gap-5 py-2"
          >
            <div className="shrink-0 space-y-2 text-center">
              <h1 className="font-heading text-3xl font-semibold">
                Place your lights
              </h1>
              <p className="text-sm text-muted-foreground">
                Drag each light horizontally and vertically. Select it to adjust
                front-to-back depth.
              </p>
            </div>
            <div
              data-placement-canvas
              className="relative min-h-64 flex-1 touch-none overflow-hidden rounded-3xl border border-foreground/15 bg-[radial-gradient(circle_at_center,var(--muted)_1px,transparent_1px)] bg-[size:24px_24px] select-none"
              onPointerDown={(event) => {
                const pin = (event.target as HTMLElement).closest<HTMLElement>(
                  "[data-light-id]",
                );
                const id = pin?.dataset.lightId;
                if (!id) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                setActiveLightId(id);
                setDraggingLightId(id);
                movePin(id, event);
              }}
              onPointerMove={(event) => {
                if (draggingLightId) movePin(draggingLightId, event);
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
                setDraggingLightId(null);
              }}
              onPointerCancel={() => setDraggingLightId(null)}
            >
              <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-foreground/10" />
              <div className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-foreground/10" />
              <span className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                High
              </span>
              <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                Low
              </span>
              {selectedCapabilities.map(({ light }, index) => {
                const position = placements[light.id] ?? { x: 0, y: 0.8, z: 0 };
                return (
                  <button
                    key={light.id}
                    type="button"
                    data-light-id={light.id}
                    aria-label={`Place ${light.name}`}
                    title={light.name}
                    style={{
                      left: `${((position.x + 1) / 2) * 100}%`,
                      top: `${((1 - position.z) / 2) * 100}%`,
                    }}
                    className={cn(
                      "absolute flex size-11 -translate-1/2 cursor-grab items-center justify-center rounded-full border-2 bg-background font-semibold shadow-md active:cursor-grabbing",
                      activeLightId === light.id
                        ? "z-10 border-primary ring-4 ring-primary/15"
                        : "border-foreground/20",
                    )}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
            <ScrollArea className="max-h-32 shrink-0">
              <div className="flex gap-2 pb-2">
                {selectedCapabilities.map(({ light }, index) => (
                  <button
                    key={light.id}
                    type="button"
                    onClick={() => setActiveLightId(light.id)}
                    className={cn(
                      "flex min-w-40 items-center gap-2 rounded-xl border px-3 py-2 text-left",
                      activeLightId === light.id
                        ? "border-primary bg-primary/5"
                        : "border-foreground/12",
                    )}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground/7 text-xs font-semibold">
                      {index + 1}
                    </span>
                    <span className="min-w-0 truncate text-sm font-medium">
                      {light.name}
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
            {activeLight && activePlacement ? (
              <div className="flex shrink-0 items-center gap-4 rounded-2xl bg-foreground/4 px-4 py-3">
                <div className="min-w-32">
                  <p className="truncate text-sm font-medium">
                    {activeLight.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Front-to-back depth
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">Front</span>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={activePlacement.y}
                  aria-label={`${activeLight.name} depth`}
                  onChange={(event) =>
                    updatePlacement(activeLight.id, {
                      y: Number(event.target.value),
                    })
                  }
                  className="min-w-0 flex-1 accent-primary"
                />
                <span className="text-xs text-muted-foreground">Back</span>
              </div>
            ) : null}
          </SettingsWizardContainedStep>
        ) : null}
      </SettingsWizardViewport>
    </SettingsWizardLayout>
  );
};

const clamp = (value: number) => Math.max(-1, Math.min(1, value));
const round = (value: number) => Math.round(value * 100) / 100;
