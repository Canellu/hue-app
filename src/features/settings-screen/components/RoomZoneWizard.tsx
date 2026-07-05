import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getRoomZoneIcon } from "@/features/home-screen/components/room-zone-icons";
import { blinkableLightIds, useBlinkLights } from "@/hooks/useBlinkLights";
import { selectableVariants } from "@/lib/selection-styles";
import { cn } from "@/lib/utils";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueLight, HueSettingsDevice } from "@/types/hue";
import { Home, Layers3, Lightbulb, Search } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { SPACE_ARCHETYPES } from "../constants";
import {
  SettingsWizardContainedStep,
  SettingsWizardLayout,
  SettingsWizardViewport,
} from "./SettingsWizardLayout";

const steps = ["Type", "Name", "Members"];

export type SpaceKind = "room" | "zone";

export interface CreateSpaceOptions {
  resourceType: SpaceKind;
  name: string;
  archetype: string;
  /** Device ids for a room, light ids for a zone. */
  memberIds: string[];
}

interface RoomZoneWizardProps {
  /** Bridge devices, used as room members (rooms group whole devices). */
  devices: HueSettingsDevice[];
  onCreate: (options: CreateSpaceOptions) => void;
  /** Step to mount on. Dev-only: lets a toolbar preview a single screen. */
  initialStep?: number;
}

// Dev-only placeholder members so the selection screens aren't blank when no
// bridge is connected (VITE_DEV_VIEWS preview). Never shown in production.
const DUMMY_DEVICES: HueSettingsDevice[] = [
  {
    id: "dummy-dev-ceiling",
    name: "Ceiling Light",
    productName: "Hue White Ambiance",
    modelId: null,
    productArchetype: null,
    swVersion: null,
    reachable: true,
    uniqueId: null,
    serviceTypes: ["light"],
  },
  {
    id: "dummy-dev-lamp",
    name: "Floor Lamp",
    productName: "Hue Signe Floor",
    modelId: null,
    productArchetype: null,
    swVersion: null,
    reachable: true,
    uniqueId: null,
    serviceTypes: ["light"],
  },
  {
    id: "dummy-dev-dial",
    name: "Smart Dial",
    productName: "Hue Tap Dial",
    modelId: null,
    productArchetype: null,
    swVersion: null,
    reachable: false,
    uniqueId: null,
    serviceTypes: ["button", "relative_rotary"],
  },
];

export const RoomZoneWizard = ({
  devices,
  onCreate,
  initialStep = 0,
}: RoomZoneWizardProps) => {
  const lights = useHueResourcesStore((state) => state.lights);

  const [step, setStep] = useState(initialStep);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(initialStep);
  const [resourceType, setResourceType] = useState<SpaceKind | null>(null);
  const [name, setName] = useState("");
  const [archetype, setArchetype] = useState("other");
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  // Fall back to placeholders in dev when the store/bridge is empty, so the
  // member screens are never blank to design against.
  const deviceOptions =
    devices.length === 0 && import.meta.env.DEV ? DUMMY_DEVICES : devices;
  const lightOptions = lights;

  // Rooms group whole devices; zones group individual lights. The Type screen
  // is what surfaces this distinction to the user.
  const isRoom = resourceType === "room";
  const memberOptions: Array<HueSettingsDevice | HueLight> = isRoom
    ? deviceOptions
    : lightOptions;

  const normalizedQuery = query.trim().toLowerCase();
  const filteredMembers = memberOptions.filter(
    (option) =>
      normalizedQuery.length === 0 ||
      [option.name, option.productName].some((field) =>
        field?.toLowerCase().includes(normalizedQuery),
      ),
  );

  const { blink } = useBlinkLights();

  // Selecting a member blinks its physical light(s) so the user can confirm
  // they picked the right one. Deselecting stays silent, and placeholder dev
  // rows are filtered out inside the hook.
  const toggleMember = (option: HueSettingsDevice | HueLight) => {
    const id = option.id;
    if (!selected.includes(id)) {
      void blink(id, blinkableLightIds(option, lights));
    }
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  };

  const canContinue =
    (step === 0 && resourceType != null) ||
    (step === 1 && name.trim().length > 0) ||
    step === 2;

  const nextStep = () => {
    if (!canContinue) return;
    setStep((current) => {
      const next = Math.min(2, current + 1);
      setMaxUnlockedStep((unlocked) => Math.max(unlocked, next));
      return next;
    });
  };

  // Switching type changes what the member list means, so clear any selection
  // carried over from the other kind.
  const chooseType = (kind: SpaceKind) => {
    setResourceType((current) => {
      if (current !== kind) setSelected([]);
      return kind;
    });
  };

  const create = () => {
    if (!resourceType || !name.trim()) return;
    onCreate({
      resourceType,
      name: name.trim(),
      archetype,
      memberIds: selected,
    });
  };

  const ArchetypeIcon = getRoomZoneIcon(archetype);

  return (
    <SettingsWizardLayout
      steps={steps}
      step={step}
      maxUnlockedStep={maxUnlockedStep}
      onStepChange={setStep}
      canContinue={canContinue}
      onContinue={nextStep}
      finalAction={{
        label: <>Create {resourceType}</>,
        disabled: !resourceType || !name.trim(),
        onClick: create,
      }}
    >
      <SettingsWizardViewport stepKey={step} contained={step === 2}>
        {step === 0 ? (
          <section className="mx-auto flex w-full max-w-md flex-col gap-10 py-16">
            <div className="space-y-3 text-center">
              <h1 className="font-heading text-3xl font-semibold">
                Room or zone?
              </h1>
              <p className="text-base text-muted-foreground">
                Both group your lights for quick control and scenes — they just
                group them differently.
              </p>
            </div>
            <div className="grid gap-4">
              <TypeOption
                active={resourceType === "room"}
                icon={<Home size={22} />}
                title="Room"
                description="Groups whole devices by where they physically are. Each device lives in exactly one room."
                onClick={() => chooseType("room")}
              />
              <TypeOption
                active={resourceType === "zone"}
                icon={<Layers3 size={22} />}
                title="Zone"
                description="Groups individual lights across rooms — great for scenes. A light can belong to many zones."
                onClick={() => chooseType("zone")}
              />
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="mx-auto flex w-full max-w-md flex-col gap-10 py-16">
            <div className="space-y-3 text-center">
              <h1 className="font-heading text-3xl font-semibold">
                Name your {resourceType}
              </h1>
              <p className="text-base text-muted-foreground">
                Pick a name and an icon so this {resourceType} is easy to spot.
              </p>
            </div>
            <div className="flex flex-col items-center gap-3">
              <span className="flex size-16 items-center justify-center rounded-2xl bg-foreground/5 text-foreground">
                <ArchetypeIcon size={28} />
              </span>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canContinue) nextStep();
                }}
                placeholder={isRoom ? "Living Room" : "Downstairs"}
                autoFocus
                size="xl"
                className="rounded-2xl border-foreground/15 bg-input/50 text-center text-lg"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Icon</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SPACE_ARCHETYPES.map((option) => {
                  const Icon = getRoomZoneIcon(option.value);
                  const isActive = archetype === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setArchetype(option.value)}
                      title={option.label}
                      aria-label={option.label}
                      aria-pressed={isActive}
                      data-selected={isActive ? "" : undefined}
                      className={cn(
                        "flex size-11 items-center justify-center rounded-xl text-muted-foreground",
                        selectableVariants(),
                        isActive && "text-foreground",
                      )}
                    >
                      <Icon size={20} />
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <SettingsWizardContainedStep>
            <div className="shrink-0 space-y-3 text-center">
              <h1 className="font-heading text-3xl font-semibold">
                {isRoom ? "Add devices" : "Add lights"}
              </h1>
              <p className="text-base text-muted-foreground">
                {isRoom
                  ? "Choose the devices that belong in this room. You can change this later."
                  : "Choose the lights this zone controls. You can change this later."}
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
                placeholder={isRoom ? "Search devices" : "Search lights"}
                size="xl"
                className="rounded-2xl border-foreground/15 bg-input/50 pl-12 text-left"
              />
            </div>

            {memberOptions.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {isRoom
                  ? "No devices are available yet."
                  : "No lights are available yet."}
              </p>
            ) : (
              <ScrollArea
                fade="bottom"
                className="min-h-0 flex-1 overflow-hidden"
                viewportClassName="pr-2"
              >
                <div className="divide-y divide-foreground/10 overflow-hidden rounded-2xl border border-foreground/12 bg-input/40">
                  {filteredMembers.length > 0 ? (
                    filteredMembers.map((option) => (
                      <MemberRow
                        key={option.id}
                        checked={selected.includes(option.id)}
                        icon={<Lightbulb size={18} />}
                        title={option.name}
                        meta={memberMeta(option)}
                        onToggle={() => toggleMember(option)}
                      />
                    ))
                  ) : (
                    <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                      No matches
                    </p>
                  )}
                </div>
              </ScrollArea>
            )}
          </SettingsWizardContainedStep>
        ) : null}
      </SettingsWizardViewport>
    </SettingsWizardLayout>
  );
};

const memberMeta = (option: HueSettingsDevice | HueLight) =>
  [option.productName, option.reachable ? "Reachable" : "Offline"]
    .filter(Boolean)
    .join(" · ");

const TypeOption = ({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    data-selected={active ? "" : undefined}
    className={cn(
      "flex items-start gap-4 rounded-2xl p-4 text-left",
      selectableVariants(),
    )}
  >
    <span
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-xl",
        active ? "bg-foreground/10 text-foreground" : "bg-foreground/5",
      )}
    >
      {icon}
    </span>
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-2 text-base font-semibold">
        {title}
      </span>
      <span className="mt-1 block text-sm text-muted-foreground">
        {description}
      </span>
    </span>
  </button>
);

const MemberRow = ({
  checked,
  icon,
  title,
  meta,
  onToggle,
}: {
  checked: boolean;
  icon: React.ReactNode;
  title: string;
  meta: string;
  onToggle: () => void;
}) => (
  <label
    data-selected={checked ? "" : undefined}
    className={cn(
      "relative flex cursor-pointer items-center gap-3 px-4 py-2.5",
      selectableVariants({ treatment: "row" }),
    )}
  >
    <Checkbox checked={checked} onCheckedChange={onToggle} />
    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground/5 text-muted-foreground">
      {icon}
    </span>
    <span className="min-w-0">
      <span className="block truncate text-sm font-medium">{title}</span>
      <span className="block truncate text-xs text-muted-foreground">
        {meta}
      </span>
    </span>
  </label>
);
