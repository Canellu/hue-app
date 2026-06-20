import { PacedSlider } from "@/components/PacedSlider";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lightColorHex } from "@/features/space-screen/utils/color-state";
import { activeTileTheme } from "@/lib/tile-theme";
import { cn } from "@/lib/utils";
import {
  getLightIcon,
  LIGHT_ICON_OPTIONS,
} from "@/features/space-screen/utils/light-icons";
import {
  type LightColorChange,
  useHueResourcesStore,
} from "@/stores/HueResourcesStore";
import type { HueLight, HueRoomZone } from "@/types/hue";
import { invoke } from "@tauri-apps/api/core";
import {
  Lightbulb,
  Loader2,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ColorWheel } from "./ColorWheel";
import { SidePane } from "./SidePane";
import { TemperatureWheel } from "./TemperatureWheel";

type ControlCommitPhase = "live" | "final";

type Tab = "color" | "kelvin" | "effects";

// The Hue bridge rejects resource names longer than 32 characters.
const MAX_NAME_LENGTH = 32;

interface LightPaneProps {
  light: HueLight;
  hueEventRevision: number;
  onClose: () => void;
  onLightToggle: (light: HueLight, nextOn: boolean) => void;
  onLightBrightness: (
    light: HueLight,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
  onLightColor: (light: HueLight, change: LightColorChange) => void;
}

// Friendly labels for the v2 effect identifiers a fixture may report.
const EFFECT_LABELS: Record<string, string> = {
  no_effect: "None",
  candle: "Candle",
  fire: "Fireplace",
  sparkle: "Sparkle",
  prism: "Prism",
  glisten: "Glisten",
  opal: "Opal",
  underwater: "Underwater",
  cosmos: "Cosmos",
  sunbeam: "Sunbeam",
  enchant: "Enchant",
};

const TAB_LABELS: Record<Tab, string> = {
  color: "Color",
  kelvin: "White",
  effects: "Effects",
};

// What the light is used for. Hue uses this when assigning scene colors:
// task ("functional") lights get usable whites, decorative lights get ambiance.
const FUNCTION_OPTIONS = [
  { value: "functional", label: "Task" },
  { value: "decorative", label: "Decorative" },
  { value: "mixed", label: "Mixed" },
];

const effectLabel = (id: string): string =>
  EFFECT_LABELS[id] ??
  id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const LightPane: React.FC<LightPaneProps> = ({
  light,
  hueEventRevision,
  onClose,
  onLightToggle,
  onLightBrightness,
  onLightColor,
}) => {
  const hasEffects = useMemo(
    () =>
      [...(light.effectsV2 ?? []), ...(light.effects ?? [])].some(
        (e) => e !== "no_effect",
      ),
    [light.effects, light.effectsV2],
  );
  const effectOptions = useMemo(
    () =>
      Array.from(
        new Set([...(light.effectsV2 ?? []), ...(light.effects ?? [])]),
      ),
    [light.effects, light.effectsV2],
  );

  const availableTabs = useMemo<Tab[]>(() => {
    const tabs: Tab[] = [];
    if (light.supportsColor) tabs.push("color");
    if (light.supportsCt) tabs.push("kelvin");
    if (hasEffects) tabs.push("effects");
    return tabs;
  }, [light.supportsColor, light.supportsCt, hasEffects]);

  const [tab, setTab] = useState<Tab>("color");

  // Keep the active tab valid as the selected light changes.
  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.includes(tab)) {
      setTab(availableTabs[0]);
    }
  }, [availableTabs, tab]);

  const brightnessPct = Math.round(light.brightness ?? 0);
  const ctMin = light.ctMin ?? 153;
  const ctMax = light.ctMax ?? 500;
  const ct = light.ct ?? Math.round((ctMin + ctMax) / 2);
  const DeviceIcon = getLightIcon(light.typeName);
  const color = light.isOn ? lightColorHex(light) : null;
  const previewStyle =
    color != null ? activeTileTheme(color, color, brightnessPct) : undefined;

  const view = (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 pt-1">
        <span
          className={cn(
            "flex size-16 items-center justify-center rounded-2xl text-foreground",
            color != null ? "shadow-sm" : "bg-muted",
          )}
          style={previewStyle}
        >
          <DeviceIcon size={32} strokeWidth={2.25} />
        </span>
        <h2 className="max-w-full truncate text-center font-heading text-lg font-medium text-foreground">
          {light.name}
        </h2>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {light.isOn ? "On" : "Off"}
        </span>
        <Switch
          checked={light.isOn}
          disabled={!light.reachable}
          aria-label={`Toggle ${light.name}`}
          onCheckedChange={(checked) => onLightToggle(light, checked)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">
            Brightness
          </p>
          <span className="text-xs text-muted-foreground tabular-nums">
            {brightnessPct}%
          </span>
        </div>
        <PacedSlider
          value={Math.max(1, brightnessPct)}
          min={1}
          disabled={!light.reachable}
          ariaLabel={`${light.name} brightness`}
          isGroup={false}
          animateKey={hueEventRevision}
          onCommit={(value, phase) => onLightBrightness(light, value, phase)}
        />
      </div>

      {availableTabs.length > 0 && (
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          {availableTabs.length > 1 && (
            <TabsList className="w-full">
              {availableTabs.map((id) => (
                <TabsTrigger key={id} value={id}>
                  {TAB_LABELS[id]}
                </TabsTrigger>
              ))}
            </TabsList>
          )}

          {light.supportsColor && (
            <TabsContent value="color" className="flex w-full p-8">
              <ColorWheel
                xy={light.xy}
                gamut={light.gamut}
                onPick={(xy) => onLightColor(light, { xy })}
              />
            </TabsContent>
          )}

          {light.supportsCt && (
            <TabsContent value="kelvin" className="flex w-full p-8">
              <TemperatureWheel
                value={ct}
                min={ctMin}
                max={ctMax}
                onPick={(value) => onLightColor(light, { ct: value })}
              />
            </TabsContent>
          )}

          {hasEffects && (
            <TabsContent value="effects" className="py-4">
              <div className="grid grid-cols-2 gap-2">
                {effectOptions.map((effect) => (
                  <Button
                    key={effect}
                    variant={
                      light.effect === effect || light.effectV2 === effect
                        ? "default"
                        : "outline"
                    }
                    className="justify-start gap-2"
                    onClick={() => onLightColor(light, { effect })}
                  >
                    <Sparkles size={16} />
                    {effectLabel(effect)}
                  </Button>
                ))}
              </div>
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );

  return (
    <SidePane
      eyebrow={light.productName ?? light.typeName ?? "Hue light"}
      editLabel={`Edit ${light.name}`}
      resetKey={light.id}
      onClose={onClose}
      view={view}
      renderEdit={({ active, exitEdit }) => (
        <EditPane
          light={light}
          active={active}
          onClosePane={onClose}
          onExitEdit={exitEdit}
        />
      )}
    />
  );
};

const MetaRow: React.FC<{ label: string; value: string | null }> = ({
  label,
  value,
}) =>
  value ? (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium">{value}</dd>
    </div>
  ) : null;

/**
 * Editing pane shown inside the side pane (slid in from the right when the
 * pencil is tapped). Mirrors the read-only view's icon → name layout, but the
 * icon is a button that opens a picker modal and the name is click-to-edit.
 * `active` flips true when the pane scrolls into view, which (re)seeds the form
 * from the current light.
 */
const EditPane: React.FC<{
  light: HueLight;
  active: boolean;
  onClosePane: () => void;
  onExitEdit: () => void;
}> = ({ light, active, onClosePane, onExitEdit }) => {
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const loadAll = useHueResourcesStore((state) => state.loadAll);
  const setSelectedLightId = useHueResourcesStore(
    (state) => state.setSelectedLightId,
  );
  const [name, setName] = useState(light.name);
  const [icon, setIcon] = useState(light.typeName ?? "");
  const [func, setFunc] = useState(light.function ?? "");
  const [room, setRoom] = useState<string | null>(
    roomForLight(light, roomZones),
  );
  const [zoneIds, setZoneIds] = useState<string[]>(
    zonesForLight(light, roomZones),
  );
  const [deletePending, setDeletePending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!active) return;
    setName(light.name);
    setIcon(light.typeName ?? "");
    setFunc(light.function ?? "");
    setRoom(roomForLight(light, roomZones));
    setZoneIds(zonesForLight(light, roomZones));
    setDeletePending(false);
    setError(null);
    setRenaming(false);
  }, [light, active, roomZones]);

  const iconOptions = useMemo(() => {
    if (!icon || LIGHT_ICON_OPTIONS.some((option) => option.value === icon)) {
      return LIGHT_ICON_OPTIONS;
    }
    return [
      { value: icon, label: labelFromHueId(icon), Icon: Lightbulb },
      ...LIGHT_ICON_OPTIONS,
    ];
  }, [icon]);

  const rooms = useMemo(
    () => roomZones.filter((space) => space.resourceType === "room"),
    [roomZones],
  );
  const roomName = rooms.find((space) => space.id === room)?.name ?? null;
  const zones = useMemo(
    () => roomZones.filter((space) => space.resourceType === "zone"),
    [roomZones],
  );

  const roomItems = useMemo(
    () => ({
      [NONE]: "No room",
      ...Object.fromEntries(rooms.map((space) => [space.id, space.name])),
    }),
    [rooms],
  );
  const zoneItems = useMemo(
    () => Object.fromEntries(zones.map((space) => [space.id, space.name])),
    [zones],
  );

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name cannot be empty.");
      return;
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      setError(`Name cannot exceed ${MAX_NAME_LENGTH} characters.`);
      return;
    }
    if (!light.deviceId) {
      setError("This light is missing its owning device id.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      if (deletePending) {
        await invoke("delete-hue-resource", {
          resourceType: "device",
          id: light.deviceId,
        });
        setSelectedLightId(null);
        onClosePane();
        await loadAll();
        return;
      }

      if (
        trimmed !== light.name ||
        icon !== (light.typeName ?? "") ||
        func !== (light.function ?? "")
      ) {
        await invoke("update-hue-resource", {
          resourceType: "light",
          id: light.id,
          body: {
            metadata: {
              name: trimmed,
              ...(icon ? { archetype: icon } : null),
              ...(func ? { function: func } : null),
            },
          },
        });
      }

      if (room !== roomForLight(light, roomZones)) {
        await updateRoomPlacement(light, roomZones, room);
      }
      await updateZonesPlacement(light, roomZones, zoneIds);

      await loadAll();
      onExitEdit();
    } catch (saveError) {
      setError(String(saveError) || "Unable to save device changes.");
    } finally {
      setIsSaving(false);
    }
  };

  const EditIcon = getLightIcon(icon || null);
  const color = light.isOn ? lightColorHex(light) : null;
  const previewStyle =
    color != null
      ? activeTileTheme(color, color, Math.round(light.brightness ?? 0))
      : undefined;

  return (
    <div className="flex h-full flex-col">
      <ScrollArea
        fade
        hideScrollbar
        className="min-h-0 flex-1"
        viewportClassName="px-6 pb-6"
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-3 pt-1">
            <button
              type="button"
              disabled={isSaving || deletePending}
              onClick={() => setPickerOpen(true)}
              aria-label="Choose icon"
              className={cn(
                "flex size-16 items-center justify-center rounded-2xl text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50",
                color != null
                  ? "shadow-sm hover:opacity-90"
                  : "bg-muted hover:bg-accent",
              )}
              style={previewStyle}
            >
              <EditIcon size={32} strokeWidth={2.25} />
            </button>
            {renaming ? (
              <div className="flex w-full flex-col items-center gap-1">
                <Input
                  autoFocus
                  size="lg"
                  value={name}
                  maxLength={MAX_NAME_LENGTH}
                  disabled={isSaving || deletePending}
                  aria-label={`Rename ${light.name}`}
                  className="max-w-full text-center font-heading text-lg font-medium"
                  onChange={(event) => setName(event.target.value)}
                  onFocus={(event) => event.target.select()}
                  onBlur={() => setRenaming(false)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === "Escape") {
                      setRenaming(false);
                    }
                  }}
                />
                <span className="text-xs text-muted-foreground tabular-nums">
                  {name.length}/{MAX_NAME_LENGTH}
                </span>
              </div>
            ) : (
              <button
                type="button"
                disabled={isSaving || deletePending}
                onClick={() => setRenaming(true)}
                title="Rename"
                className="flex max-w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-center font-heading text-lg font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                <span className="truncate">{name || "Unnamed light"}</span>
                <Pencil className="size-4 shrink-0 text-muted-foreground" />
              </button>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Function</Label>
            <Select
              items={Object.fromEntries(
                FUNCTION_OPTIONS.map((option) => [option.value, option.label]),
              )}
              value={func || null}
              onValueChange={(value) => setFunc((value as string | null) ?? "")}
              disabled={isSaving || deletePending}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose function" />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {FUNCTION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Task lights are what you use to see; decorative lights set
              ambiance. Hue uses this to assign scene colors.
            </p>
          </div>

          <div className="grid gap-2">
            <Label>Room</Label>
            <Select
              items={roomItems}
              value={room ?? NONE}
              onValueChange={(value) =>
                setRoom(value === NONE ? null : (value as string))
              }
              disabled={isSaving || deletePending}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No room" />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectItem value={NONE}>No room</SelectItem>
                {rooms.map((space) => (
                  <SelectItem key={space.id} value={space.id}>
                    {space.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Zones</Label>
            <Select
              multiple
              items={zoneItems}
              value={zoneIds}
              onValueChange={(value) => setZoneIds(value)}
              disabled={isSaving || deletePending}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No zones">
                  {(value: string[]) =>
                    value.length === 0
                      ? "No zones"
                      : value
                          .map(
                            (id) =>
                              zones.find((space) => space.id === id)?.name ??
                              id,
                          )
                          .join(", ")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {zones.map((space) => (
                  <SelectItem key={space.id} value={space.id}>
                    {space.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Accordion>
            <AccordionItem value="device-info">
              <AccordionTrigger>Device information</AccordionTrigger>
              <AccordionContent>
                <dl className="flex flex-col gap-2 text-sm">
                  <MetaRow label="Type" value={light.typeName} />
                  <MetaRow label="Product" value={light.productName} />
                  <MetaRow label="Model ID" value={light.modelId} />
                  <MetaRow label="Firmware" value={light.swVersion} />
                  <MetaRow
                    label="Connection"
                    value={light.reachable ? "Reachable" : "Unreachable"}
                  />
                  <MetaRow label="Zigbee MAC" value={light.uniqueId} />
                  <MetaRow label="Light ID" value={light.id} />
                  <MetaRow label="Device ID" value={light.deviceId} />
                </dl>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="border-t border-border pt-5">
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-destructive">
                  Delete device
                </p>
                <p className="text-sm text-muted-foreground">
                  {roomName
                    ? `Remove this device from ${roomName} and your Hue setup. Save confirms it.`
                    : "Remove this device from your Hue setup. Save confirms it."}
                </p>
              </div>
              <Button
                type="button"
                variant={deletePending ? "outline" : "destructive"}
                disabled={isSaving}
                onClick={() => setDeletePending((current) => !current)}
              >
                <Trash2 />
                {deletePending ? "Undo" : "Delete"}
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </ScrollArea>

      <div className="flex gap-2 border-t border-border p-6 pt-4">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={isSaving}
          onClick={onExitEdit}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={isSaving}
          onClick={() => void save()}
        >
          {isSaving ? <Loader2 className="animate-spin" /> : null}
          {deletePending ? "Delete device" : "Save"}
        </Button>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose icon</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {iconOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setIcon(option.value);
                  setPickerOpen(false);
                }}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-2xl border border-border p-3 text-center text-xs text-muted-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  option.value === icon &&
                    "border-primary bg-accent text-foreground ring-1 ring-primary",
                )}
              >
                <option.Icon size={26} className="text-foreground" />
                {option.label}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Sentinel for the "no room"/"no zone" option, since base-ui selects can't hold
// a null value alongside string ids.
const NONE = "__none__";

const roomForLight = (
  light: HueLight,
  roomZones: HueRoomZone[],
): string | null =>
  roomZones.find(
    (space) =>
      space.resourceType === "room" &&
      light.deviceId != null &&
      space.deviceIds.includes(light.deviceId),
  )?.id ?? null;

const zonesForLight = (light: HueLight, roomZones: HueRoomZone[]): string[] =>
  roomZones
    .filter(
      (space) =>
        space.resourceType === "zone" && space.lightIds.includes(light.id),
    )
    .map((space) => space.id);

// Rooms own devices, so membership is keyed by deviceId. A device lives in at
// most one room; clear any other room before assigning the new one.
const updateRoomPlacement = async (
  light: HueLight,
  roomZones: HueRoomZone[],
  roomId: string | null,
) => {
  const deviceId = light.deviceId;
  if (!deviceId) return;

  await Promise.all(
    roomZones
      .filter(
        (space) =>
          space.resourceType === "room" &&
          space.id !== roomId &&
          space.deviceIds.includes(deviceId),
      )
      .map((space) =>
        invoke("update-room-members", {
          roomId: space.id,
          deviceIds: space.deviceIds.filter((id) => id !== deviceId),
        }),
      ),
  );

  if (roomId) {
    await invoke("assign-device-to-room", { deviceId, roomId });
  }
};

// Zones reference lights directly. A light may belong to several zones at once,
// so diff the chosen set against the current one: drop it from de-selected zones
// and add it to newly selected ones, leaving untouched memberships alone.
const updateZonesPlacement = async (
  light: HueLight,
  roomZones: HueRoomZone[],
  zoneIds: string[],
) => {
  const deviceId = light.deviceId;
  if (!deviceId) return;

  const target = new Set(zoneIds);
  const current = roomZones.filter(
    (space) =>
      space.resourceType === "zone" && space.lightIds.includes(light.id),
  );
  const currentIds = new Set(current.map((space) => space.id));

  const removals = current
    .filter((space) => !target.has(space.id))
    .map((space) =>
      invoke("update-zone-members", {
        zoneId: space.id,
        lightIds: space.lightIds.filter((id) => id !== light.id),
      }),
    );

  const additions = zoneIds
    .filter((zoneId) => !currentIds.has(zoneId))
    .map((zoneId) => invoke("assign-device-to-zone", { deviceId, zoneId }));

  await Promise.all([...removals, ...additions]);
};

const labelFromHueId = (id: string): string =>
  id.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
