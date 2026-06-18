import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { SensorReadingPill } from "@/components/SensorReadingPill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type {
  HueAccessoryService,
  HueLight,
  HueRoomZone,
  HueScene,
  HueSettingsDevice,
  HueSettingsSummary,
  HueSwitchInputConfiguration,
} from "@/types/hue";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Boxes,
  Check,
  ChevronDown,
  CircleX,
  FilterX,
  Home,
  Loader2,
  Monitor,
  Moon,
  Palette,
  Pencil,
  Plus,
  Power,
  Router,
  Save,
  Search,
  SlidersHorizontal,
  Sun,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useHue } from "../../context/HueContext";
import type { ThemeMode } from "../../context/ThemeContext";
import { classifyDevice } from "./utils/devices";

type RenameableResourceType =
  | "light"
  | "room"
  | "zone"
  | "scene"
  | "smart_scene";
type DeleteableResourceType = RenameableResourceType | "device";

/** How the Devices tab buckets accessories for display. */
type DeviceGrouping = "type" | "room";

const deviceGroupingOptions = [
  { value: "type", label: "By type" },
  { value: "room", label: "By room" },
] satisfies Array<{ value: DeviceGrouping; label: string }>;

/** Reachability filter applied to the device list before grouping. */
type DeviceStatusFilter = "all" | "reachable" | "unreachable";

const deviceStatusItems: Record<DeviceStatusFilter, string> = {
  all: "All statuses",
  reachable: "Reachable",
  unreachable: "Unreachable",
};

interface SettingsScreenProps {
  themeMode: ThemeMode;
  onThemeModeChange: (themeMode: ThemeMode) => void;
}

const themeOptions = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] satisfies Array<{
  value: ThemeMode;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}>;

const settingsTabs = [
  { value: "app", label: "App", icon: Monitor },
  { value: "bridge", label: "Bridge", icon: Router },
  { value: "devices", label: "Devices", icon: Boxes },
  { value: "spaces", label: "Rooms & Zones", icon: Home },
  { value: "scenes", label: "Scenes", icon: Palette },
] satisfies Array<{ value: string; label: string; icon: LucideIcon }>;

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  themeMode,
  onThemeModeChange,
}) => {
  const navigate = useNavigate();
  const search = useSearch({ from: "/settings" });
  const { bridgeId, bridgeIp, connected, resetSession } = useHue();
  const lights = useHueResourcesStore((state) => state.lights);
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const scenes = useHueResourcesStore((state) => state.scenes);
  const loadAll = useHueResourcesStore((state) => state.loadAll);
  const [summary, setSummary] = useState<HueSettingsSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [deviceGrouping, setDeviceGrouping] = useState<DeviceGrouping>("type");
  const [deviceQuery, setDeviceQuery] = useState("");
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatusFilter>("all");
  const activeTab = settingsTabs.some((tab) => tab.value === search.tab)
    ? search.tab
    : "app";

  // Tracks which device sections the user has collapsed. Devices defaults to a
  // compact view, so known sections start collapsed.
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(["Lights", "Switches", "Sensors", "Other Devices"]),
  );
  const [zoneName, setZoneName] = useState("");
  const [zoneLightIds, setZoneLightIds] = useState<string[]>([]);
  const [isCreatingZone, setIsCreatingZone] = useState(false);
  const [sceneName, setSceneName] = useState("");
  const [sceneSpaceId, setSceneSpaceId] = useState<string | null>(null);
  const [isCreatingScene, setIsCreatingScene] = useState(false);

  const spacesById = useMemo(
    () => new Map(roomZones.map((roomZone) => [roomZone.id, roomZone])),
    [roomZones],
  );
  const accessoryServicesByDevice = useMemo(() => {
    const map = new Map<string, HueAccessoryService[]>();
    for (const service of summary?.accessoryServices ?? []) {
      if (!service.deviceId) continue;
      const current = map.get(service.deviceId) ?? [];
      current.push(service);
      map.set(service.deviceId, current);
    }
    return map;
  }, [summary?.accessoryServices]);
  const switchConfigsByDevice = useMemo(() => {
    const map = new Map<string, HueSwitchInputConfiguration[]>();
    for (const config of summary?.switchInputConfigurations ?? []) {
      if (!config.deviceId) continue;
      const current = map.get(config.deviceId) ?? [];
      current.push(config);
      map.set(config.deviceId, current);
    }
    return map;
  }, [summary?.switchInputConfigurations]);

  // Search + reachability narrow the lists before either grouping runs, so the
  // two views (by type / by room) and the result counter all stay consistent.
  const query = deviceQuery.trim().toLowerCase();
  // Search the human-facing fields only. Model numbers and Zigbee IDs are
  // deliberately excluded: their digits (e.g. "7602031P7") collide with name
  // searches like "hue go 2" and produce confusing false matches.
  const filteredLights = useMemo(
    () =>
      lights.filter(
        (light) =>
          matchesStatus(light.reachable, deviceStatus) &&
          matchesQuery(query, [light.name, light.productName, light.typeName]),
      ),
    [lights, deviceStatus, query],
  );
  const filteredDevices = useMemo(
    () =>
      (summary?.devices ?? []).filter(
        (device) =>
          matchesStatus(device.reachable, deviceStatus) &&
          matchesQuery(query, [
            device.name,
            device.productName,
            device.productArchetype,
            ...device.serviceTypes,
          ]),
      ),
    [summary?.devices, deviceStatus, query],
  );

  // Lights have their own rich panel (sourced from the store), so the device
  // groups cover the rest: switches, sensors, and anything uncategorised.
  const deviceGroups = useMemo(() => {
    const switches: HueSettingsDevice[] = [];
    const sensors: HueSettingsDevice[] = [];
    const other: HueSettingsDevice[] = [];
    for (const device of filteredDevices) {
      const kind = classifyDevice(device);
      if (kind === "switch") switches.push(device);
      else if (kind === "sensor") sensors.push(device);
      else if (kind !== "light") other.push(device);
    }
    return { switches, sensors, other };
  }, [filteredDevices]);

  // Alternative view: every non-bridge device bucketed by the room it lives in,
  // using each room's `deviceIds`. Devices not placed in a room fall into a
  // trailing "Unassigned" bucket. Rooms keep their store order.
  const deviceRoomGroups = useMemo(() => {
    const rooms = roomZones.filter(
      (roomZone) => roomZone.resourceType === "room",
    );
    const roomByDeviceId = new Map<string, HueRoomZone>();
    for (const room of rooms) {
      for (const deviceId of room.deviceIds) roomByDeviceId.set(deviceId, room);
    }

    const buckets = new Map<
      string,
      { title: string; devices: HueSettingsDevice[] }
    >();
    for (const room of rooms)
      buckets.set(room.id, { title: room.name, devices: [] });
    const unassigned: HueSettingsDevice[] = [];

    for (const device of filteredDevices) {
      if (isBridgeDevice(device)) continue;
      const room = roomByDeviceId.get(device.id);
      if (room) buckets.get(room.id)?.devices.push(device);
      else unassigned.push(device);
    }

    const groups = [...buckets.values()].filter(
      (group) => group.devices.length > 0,
    );
    if (unassigned.length > 0) {
      groups.push({ title: "Unassigned", devices: unassigned });
    }
    return groups;
  }, [roomZones, filteredDevices]);

  const sectionKeys = useMemo(
    () =>
      deviceGrouping === "type"
        ? ["Lights", "Switches", "Sensors", "Other Devices"]
        : deviceRoomGroups.map((group) => group.title),
    [deviceGrouping, deviceRoomGroups],
  );
  // Count what each view actually renders. "By type" lists lights from the
  // store plus the non-light devices; "By room" lists every non-bridge device
  // (lights included) grouped by room. Counting both lists unconditionally
  // would double-count a Hue Go, which is both a light and a device.
  const matchCount =
    deviceGrouping === "type"
      ? filteredLights.length +
        deviceGroups.switches.length +
        deviceGroups.sensors.length +
        deviceGroups.other.length
      : deviceRoomGroups.reduce((sum, group) => sum + group.devices.length, 0);
  const totalCount = useMemo(() => {
    const devices = summary?.devices ?? [];
    return deviceGrouping === "type"
      ? lights.length +
          devices.filter((device) => classifyDevice(device) !== "light").length
      : devices.filter((device) => !isBridgeDevice(device)).length;
  }, [deviceGrouping, lights.length, summary?.devices]);
  const emptyDevicesMessage = isLoadingSummary
    ? "Loading devices..."
    : query || deviceStatus !== "all"
      ? "No devices match your filters."
      : "No devices found.";
  const isSectionOpen = (key: string) => !collapsedSections.has(key);
  const toggleSection = (key: string) =>
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const expandAllSections = () => setCollapsedSections(new Set());
  const collapseAllSections = () => setCollapsedSections(new Set(sectionKeys));

  useEffect(() => {
    setCollapsedSections((current) => {
      const next = new Set(current);
      let changed = false;
      for (const key of sectionKeys) {
        if (!next.has(key)) {
          next.add(key);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [sectionKeys]);

  const loadSettingsSummary = async () => {
    setSettingsError(null);
    try {
      const nextSummary = await invoke<HueSettingsSummary>(
        "get-hue-settings-summary",
      );
      setSummary(nextSummary);
    } catch (error) {
      setSettingsError(String(error) || "Unable to load bridge settings.");
    } finally {
      setIsLoadingSummary(false);
    }
  };

  useEffect(() => {
    void loadSettingsSummary();
  }, []);

  const refreshSettings = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setActionMessage(null);
    await Promise.all([loadAll(), loadSettingsSummary()]);
    setIsRefreshing(false);
  };

  const renameResource = async (
    resourceType: RenameableResourceType,
    id: string,
    name: string,
  ) => {
    await invoke("rename-hue-resource", { resourceType, id, name });
    await refreshSettings();
    setActionMessage("Name updated.");
  };

  const deleteResource = async (
    resourceType: DeleteableResourceType,
    id: string,
  ) => {
    await invoke("delete-hue-resource", { resourceType, id });
    await refreshSettings();
    setActionMessage(`${humanize(resourceType)} deleted.`);
    toast.success(`${humanize(resourceType)} deleted`);
  };

  const createZone = async (event: FormEvent) => {
    event.preventDefault();
    const name = zoneName.trim();
    if (!name || isCreatingZone) return;
    setIsCreatingZone(true);
    setSettingsError(null);
    try {
      await invoke("create-hue-zone", {
        name,
        lightIds: zoneLightIds,
      });
      setZoneName("");
      setZoneLightIds([]);
      await refreshSettings();
      setActionMessage("Zone created.");
    } catch (error) {
      setSettingsError(String(error) || "Unable to create zone.");
    } finally {
      setIsCreatingZone(false);
    }
  };

  const updateMembers = async (roomZone: HueRoomZone, ids: string[]) => {
    if (roomZone.resourceType === "room") {
      await invoke("update-room-members", {
        roomId: roomZone.id,
        deviceIds: ids,
      });
    } else {
      await invoke("update-zone-members", {
        zoneId: roomZone.id,
        lightIds: ids,
      });
    }
    await refreshSettings();
    setActionMessage("Membership updated.");
  };

  const createScene = async (event: FormEvent) => {
    event.preventDefault();
    const name = sceneName.trim();
    const space = roomZones.find((candidate) => candidate.id === sceneSpaceId);
    if (!name || !space || isCreatingScene) return;
    setIsCreatingScene(true);
    setSettingsError(null);
    try {
      await invoke("create-hue-scene", {
        name,
        groupId: space.id,
        groupType: space.resourceType,
      });
      setSceneName("");
      setSceneSpaceId(null);
      await refreshSettings();
      setActionMessage("Scene created from current light state.");
    } catch (error) {
      setSettingsError(String(error) || "Unable to create scene.");
    } finally {
      setIsCreatingScene(false);
    }
  };

  const saveSwitchConfig = async (
    id: string,
    body: Record<string, unknown>,
  ) => {
    await invoke("set-switch-input-configuration", { id, body });
    await refreshSettings();
    setActionMessage("Switch input configuration updated.");
  };

  const bridgeDetails = summary?.bridge;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(tab) =>
        void navigate({ to: "/settings", search: { tab } })
      }
      orientation="vertical"
    >
      <div className="flex w-full flex-1 gap-6">
        <aside className="sticky top-0 flex w-16 shrink-0 flex-col gap-1 self-start rounded-2xl bg-muted/45 p-2 sm:w-60 dark:bg-muted/30">
          <TabsList
            className="h-auto w-full flex-col items-stretch gap-1 rounded-none bg-transparent p-0"
            aria-label="Settings sections"
          >
            {settingsTabs.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                title={label}
                className="h-10 justify-start gap-2 rounded-xl px-3 data-active:bg-background max-sm:justify-center max-sm:px-0"
              >
                <Icon size={16} />
                <span className="truncate max-sm:hidden">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </aside>
        <div className="min-w-0 flex-1 space-y-5">
        <div className="min-w-0">
          {settingsError ? (
            <p className="text-sm text-destructive">{settingsError}</p>
          ) : actionMessage ? (
            <p className="text-sm text-muted-foreground">{actionMessage}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Bridge and Hue setup details from your local network.
            </p>
          )}
        </div>

      <TabsContent value="bridge" className="space-y-5">
        <BridgeHeader
          connected={connected}
          bridgeId={bridgeDetails?.bridgeId ?? bridgeId}
          bridgeIp={bridgeDetails?.bridgeIp ?? bridgeIp}
          productName={bridgeDetails?.productName}
          isLoading={isLoadingSummary}
        />
        <Panel title="Bridge Details">
          <dl className="grid gap-3 text-sm">
            <MetaRow
              label="Bridge ID"
              value={bridgeDetails?.bridgeId ?? bridgeId}
            />
            <MetaRow
              label="IP address"
              value={bridgeDetails?.bridgeIp ?? bridgeIp}
            />
            <MetaRow label="Product" value={bridgeDetails?.productName} />
            <MetaRow label="Model ID" value={bridgeDetails?.modelId} />
            <MetaRow label="Firmware" value={bridgeDetails?.swVersion} />
            <MetaRow
              label="Application key"
              value={
                bridgeDetails?.applicationKeySaved
                  ? "Saved on this device"
                  : "Unknown"
              }
            />
          </dl>
        </Panel>
      </TabsContent>

      <TabsContent value="devices" className="space-y-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1">
              <Search
                size={16}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={deviceQuery}
                onChange={(event) => setDeviceQuery(event.target.value)}
                placeholder="Search by name, product, or capability"
                aria-label="Search devices"
                className="pl-9 pr-9"
              />
              {deviceQuery && (
                <button
                  type="button"
                  onClick={() => setDeviceQuery("")}
                  aria-label="Clear search"
                  className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                >
                  <CircleX size={16} />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="lg"
                className="gap-2"
                onClick={() =>
                  void navigate({ to: "/settings/device-discovery" })
                }
                disabled={!summary?.deviceDiscoverySupported}
              >
                <Plus size={16} />
                Add devices
              </Button>
              <Select
                items={deviceStatusItems}
                value={deviceStatus}
                onValueChange={(value) =>
                  setDeviceStatus(value as DeviceStatusFilter)
                }
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.entries(deviceStatusItems) as Array<
                      [DeviceStatusFilter, string]
                    >
                  ).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Tabs
                value={deviceGrouping}
                onValueChange={(value) =>
                  setDeviceGrouping(value as DeviceGrouping)
                }
              >
                <TabsList aria-label="Device grouping">
                  {deviceGroupingOptions.map(({ value, label }) => (
                    <TabsTrigger key={value} value={value}>
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Showing{" "}
              <span className="font-medium text-foreground">{matchCount}</span>{" "}
              of {totalCount} devices
              {(query || deviceStatus !== "all") && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-2 h-7 gap-1.5 px-2 text-xs"
                  onClick={() => {
                    setDeviceQuery("");
                    setDeviceStatus("all");
                  }}
                >
                  <FilterX size={14} />
                  Clear filters
                </Button>
              )}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={expandAllSections}
              >
                Expand all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={collapseAllSections}
              >
                Collapse all
              </Button>
            </div>
          </div>
        </div>

        {deviceGrouping === "type" ? (
          matchCount === 0 ? (
            <Panel title="Devices">
              <EmptyText>{emptyDevicesMessage}</EmptyText>
            </Panel>
          ) : (
            <>
              {filteredLights.length > 0 && (
                <CollapsibleSection
                  title="Lights"
                  count={filteredLights.length}
                  open={isSectionOpen("Lights")}
                  onToggle={() => toggleSection("Lights")}
                >
                  <div className="grid gap-3">
                    {filteredLights.map((light) => (
                      <EditableLightRow
                        key={light.id}
                        light={light}
                        onRename={renameResource}
                      />
                    ))}
                  </div>
                </CollapsibleSection>
              )}

              {deviceGroups.switches.length > 0 && (
                <DeviceGroupPanel
                  title="Switches"
                  devices={deviceGroups.switches}
                  servicesByDevice={accessoryServicesByDevice}
                  switchConfigsByDevice={switchConfigsByDevice}
                  isLoading={isLoadingSummary}
                  open={isSectionOpen("Switches")}
                  onToggle={() => toggleSection("Switches")}
                  onDelete={deleteResource}
                  onSaveSwitchConfig={saveSwitchConfig}
                />
              )}
              {deviceGroups.sensors.length > 0 && (
                <DeviceGroupPanel
                  title="Sensors"
                  devices={deviceGroups.sensors}
                  servicesByDevice={accessoryServicesByDevice}
                  switchConfigsByDevice={switchConfigsByDevice}
                  isLoading={isLoadingSummary}
                  open={isSectionOpen("Sensors")}
                  onToggle={() => toggleSection("Sensors")}
                  onDelete={deleteResource}
                  onSaveSwitchConfig={saveSwitchConfig}
                />
              )}
              {deviceGroups.other.length > 0 && (
                <DeviceGroupPanel
                  title="Other Devices"
                  devices={deviceGroups.other}
                  servicesByDevice={accessoryServicesByDevice}
                  switchConfigsByDevice={switchConfigsByDevice}
                  isLoading={isLoadingSummary}
                  open={isSectionOpen("Other Devices")}
                  onToggle={() => toggleSection("Other Devices")}
                  onDelete={deleteResource}
                  onSaveSwitchConfig={saveSwitchConfig}
                />
              )}
            </>
          )
        ) : deviceRoomGroups.length === 0 ? (
          <Panel title="Rooms">
            <EmptyText>
              {isLoadingSummary
                ? "Loading devices..."
                : query || deviceStatus !== "all"
                  ? "No devices match your filters."
                  : "No devices are placed in a room yet."}
            </EmptyText>
          </Panel>
        ) : (
          deviceRoomGroups.map((group) => (
            <DeviceGroupPanel
              key={group.title}
              title={group.title}
              devices={group.devices}
              servicesByDevice={accessoryServicesByDevice}
              switchConfigsByDevice={switchConfigsByDevice}
              isLoading={isLoadingSummary}
              open={isSectionOpen(group.title)}
              onToggle={() => toggleSection(group.title)}
              onDelete={deleteResource}
              onSaveSwitchConfig={saveSwitchConfig}
            />
          ))
        )}
      </TabsContent>

      <TabsContent value="spaces" className="space-y-5">
        <Panel title="Create Zone">
          <CreateZoneForm
            lights={lights}
            name={zoneName}
            selectedLightIds={zoneLightIds}
            isSaving={isCreatingZone}
            onNameChange={setZoneName}
            onSelectedLightIdsChange={setZoneLightIds}
            onSubmit={createZone}
          />
        </Panel>
        <Panel title="Rooms & Zones">
          <div className="grid gap-3">
            {roomZones.map((roomZone) => (
              <SpaceManagementRow
                key={roomZone.id}
                roomZone={roomZone}
                devices={summary?.devices ?? []}
                lights={lights}
                onRename={renameResource}
                onDelete={deleteResource}
                onUpdateMembers={updateMembers}
              />
            ))}
            {roomZones.length === 0 && (
              <EmptyText>No rooms or zones loaded.</EmptyText>
            )}
          </div>
        </Panel>
      </TabsContent>

      <TabsContent value="scenes" className="space-y-5">
        <Panel title="Create Scene">
          <CreateSceneForm
            roomZones={roomZones}
            name={sceneName}
            selectedSpaceId={sceneSpaceId}
            isSaving={isCreatingScene}
            onNameChange={setSceneName}
            onSpaceChange={setSceneSpaceId}
            onSubmit={createScene}
          />
        </Panel>
        <Panel title="Scenes">
          <div className="grid gap-3">
            {scenes.map((scene) => (
              <EditableSceneRow
                key={scene.id}
                scene={scene}
                space={scene.group ? spacesById.get(scene.group) : undefined}
                onRename={renameResource}
                onDelete={deleteResource}
              />
            ))}
            {scenes.length === 0 && <EmptyText>No scenes loaded.</EmptyText>}
          </div>
        </Panel>
      </TabsContent>

      <TabsContent value="app" className="space-y-5">
        <Panel title="Theme">
          <Tabs
            value={themeMode}
            onValueChange={(value) => onThemeModeChange(value as ThemeMode)}
          >
            <TabsList size="xl" aria-label="Theme mode">
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value} className="gap-2">
                  <Icon size={18} />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </Panel>

        <Panel title="Advanced">
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="destructive" size="xl" className="gap-2" />
              }
            >
              <Power size={18} />
              Remove bridge & reset
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove bridge?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the saved bridge and credentials from this
                  device. You'll need to pair again to control your lights.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel size="xl">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  size="xl"
                  className="gap-2"
                  onClick={() => void resetSession()}
                >
                  <Power size={18} />
                  Remove bridge
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Panel>
      </TabsContent>
        </div>
      </div>
    </Tabs>
  );
};

const BridgeHeader = ({
  connected,
  bridgeId,
  bridgeIp,
  productName,
  isLoading,
}: {
  connected: boolean;
  bridgeId: string | null | undefined;
  bridgeIp: string | null | undefined;
  productName: string | null | undefined;
  isLoading: boolean;
}) => (
  <div className="rounded-2xl bg-muted/45 p-5 dark:bg-muted/30">
    <div className="flex items-center gap-3">
      <span className="flex size-10 items-center justify-center rounded-full bg-background text-muted-foreground">
        <Router size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{productName ?? "Hue Bridge"}</p>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span
            className={cn(
              "size-2 rounded-full",
              connected ? "bg-green-500" : "bg-destructive",
            )}
          />
          {connected ? "Connected" : "Disconnected"}
        </p>
      </div>
      {isLoading && (
        <Loader2 size={18} className="animate-spin text-muted-foreground" />
      )}
    </div>
    <Separator className="my-4" />
    <dl className="grid gap-2 text-sm md:grid-cols-2">
      <MetaRow label="Bridge ID" value={bridgeId} />
      <MetaRow label="IP address" value={bridgeIp} />
    </dl>
  </div>
);

const Panel = ({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </CardTitle>
      {action && <CardAction>{action}</CardAction>}
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

/**
 * A panel whose body collapses behind a header that doubles as a toggle. Open
 * state is owned by the parent so the Devices tab can drive expand/collapse all.
 */
const CollapsibleSection = ({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) => (
  <Card className="gap-0 py-0">
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/40"
    >
      <span className="flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {count != null && (
          <Badge variant="secondary" className="tabular-nums">
            {count}
          </Badge>
        )}
      </span>
      <ChevronDown
        size={16}
        className={cn(
          "shrink-0 text-muted-foreground transition-transform",
          open && "rotate-180",
        )}
      />
    </button>
    {open && <div className="px-5 pb-5">{children}</div>}
  </Card>
);

const EditableLightRow = ({
  light,
  onRename,
}: {
  light: HueLight;
  onRename: (
    resourceType: RenameableResourceType,
    id: string,
    name: string,
  ) => Promise<void>;
}) => (
  <EditableResourceRow
    id={light.id}
    resourceType="light"
    name={light.name}
    eyebrow={light.productName ?? light.typeName ?? "Hue light"}
    meta={[
      light.modelId,
      light.swVersion ? `Firmware ${light.swVersion}` : null,
      light.reachable ? "Reachable" : "Unreachable",
    ]}
    onRename={onRename}
  />
);

const SpaceManagementRow = ({
  roomZone,
  devices,
  lights,
  onRename,
  onDelete,
  onUpdateMembers,
}: {
  roomZone: HueRoomZone;
  devices: HueSettingsDevice[];
  lights: HueLight[];
  onRename: (
    resourceType: RenameableResourceType,
    id: string,
    name: string,
  ) => Promise<void>;
  onDelete: (resourceType: DeleteableResourceType, id: string) => Promise<void>;
  onUpdateMembers: (roomZone: HueRoomZone, ids: string[]) => Promise<void>;
}) => {
  const memberOptions =
    roomZone.resourceType === "room"
      ? devices.filter((device) => !device.serviceTypes.includes("bridge"))
      : lights;
  const memberIds =
    roomZone.resourceType === "room" ? roomZone.deviceIds : roomZone.lightIds;

  return (
    <EditableResourceRow
      id={roomZone.id}
      resourceType={roomZone.resourceType}
      name={roomZone.name}
      eyebrow={roomZone.resourceType === "room" ? "Room" : "Zone"}
      meta={[
        `${roomZone.lightCount} ${roomZone.lightCount === 1 ? "light" : "lights"}`,
        roomZone.anyOn ? "On" : "Off",
        roomZone.class,
      ]}
      onRename={onRename}
      onDelete={onDelete}
      deleteDescription={`Delete ${roomZone.resourceType} "${roomZone.name}" from the bridge.`}
    >
      <MembershipEditor
        roomZone={roomZone}
        options={memberOptions}
        selectedIds={memberIds}
        onSave={(ids) => onUpdateMembers(roomZone, ids)}
      />
    </EditableResourceRow>
  );
};

const EditableSceneRow = ({
  scene,
  space,
  onRename,
  onDelete,
}: {
  scene: HueScene;
  space?: HueRoomZone;
  onRename: (
    resourceType: RenameableResourceType,
    id: string,
    name: string,
  ) => Promise<void>;
  onDelete: (resourceType: DeleteableResourceType, id: string) => Promise<void>;
}) => (
  <EditableResourceRow
    id={scene.id}
    resourceType={scene.resourceType}
    name={scene.name}
    eyebrow={`${scene.smart ? "Smart scene" : "Scene"} · ${space?.name ?? "No space"}`}
    meta={[
      scene.status,
      scene.dynamic ? "Dynamic" : null,
      `${scene.colors.length} ${scene.colors.length === 1 ? "color" : "colors"}`,
    ]}
    onRename={onRename}
    onDelete={onDelete}
    deleteDescription={`Delete scene "${scene.name}" from the bridge.`}
  />
);

const EditableResourceRow = ({
  id,
  resourceType,
  name,
  eyebrow,
  meta,
  onRename,
  onDelete,
  deleteDescription,
  children,
}: {
  id: string;
  resourceType: RenameableResourceType;
  name: string;
  eyebrow: string;
  meta: Array<string | null | undefined>;
  onRename: (
    resourceType: RenameableResourceType,
    id: string,
    name: string,
  ) => Promise<void>;
  onDelete?: (
    resourceType: DeleteableResourceType,
    id: string,
  ) => Promise<void>;
  deleteDescription?: string;
  children?: React.ReactNode;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditing) setDraftName(name);
  }, [isEditing, name]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === name) {
      setIsEditing(false);
      setDraftName(name);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onRename(resourceType, id, trimmed);
      setIsEditing(false);
    } catch (renameError) {
      setError(String(renameError) || "Unable to rename resource.");
    } finally {
      setIsSaving(false);
    }
  };

  const visibleMeta = meta.filter(Boolean);

  return (
    <div className="rounded-xl bg-background/70 px-3 py-3">
      {isEditing ? (
        <form className="flex gap-2" onSubmit={(event) => void submit(event)}>
          <Input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            aria-label={`${eyebrow} name`}
            disabled={isSaving}
          />
          <Button type="submit" size="icon" disabled={isSaving}>
            {isSaving ? <Loader2 className="animate-spin" /> : <Check />}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={isSaving}
            onClick={() => {
              setIsEditing(false);
              setDraftName(name);
              setError(null);
            }}
          >
            <X />
          </Button>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{eyebrow}</p>
            <p className="truncate font-medium">{name}</p>
            {visibleMeta.length > 0 && (
              <p className="truncate text-sm text-muted-foreground">
                {visibleMeta.join(" · ")}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setIsEditing(true)}
              aria-label={`Rename ${name}`}
            >
              <Pencil />
            </Button>
            {onDelete && (
              <DeleteResourceButton
                label={name}
                description={deleteDescription ?? `Delete ${name}.`}
                onDelete={() => onDelete(resourceType, id)}
              />
            )}
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      {children}
    </div>
  );
};

const CreateZoneForm = ({
  lights,
  name,
  selectedLightIds,
  isSaving,
  onNameChange,
  onSelectedLightIdsChange,
  onSubmit,
}: {
  lights: HueLight[];
  name: string;
  selectedLightIds: string[];
  isSaving: boolean;
  onNameChange: (name: string) => void;
  onSelectedLightIdsChange: (ids: string[]) => void;
  onSubmit: (event: FormEvent) => void;
}) => {
  const selected = new Set(selectedLightIds);
  const toggleLight = (id: string) => {
    onSelectedLightIdsChange(
      selected.has(id)
        ? selectedLightIds.filter((lightId) => lightId !== id)
        : [...selectedLightIds, id],
    );
  };

  return (
    <form className="grid gap-3" onSubmit={(event) => void onSubmit(event)}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Zone name"
          aria-label="Zone name"
          disabled={isSaving}
        />
        <Button
          type="submit"
          className="gap-2"
          disabled={!name.trim() || isSaving}
        >
          {isSaving ? <Loader2 className="animate-spin" /> : <Plus />}
          Create zone
        </Button>
      </div>
      <ResourceChecklist
        emptyText="No lights are loaded."
        options={lights}
        selectedIds={selectedLightIds}
        onToggle={toggleLight}
      />
    </form>
  );
};

const CreateSceneForm = ({
  roomZones,
  name,
  selectedSpaceId,
  isSaving,
  onNameChange,
  onSpaceChange,
  onSubmit,
}: {
  roomZones: HueRoomZone[];
  name: string;
  selectedSpaceId: string | null;
  isSaving: boolean;
  onNameChange: (name: string) => void;
  onSpaceChange: (id: string | null) => void;
  onSubmit: (event: FormEvent) => void;
}) => {
  const items = useMemo(() => {
    const map: Record<string, string> = {};
    for (const space of roomZones) {
      map[space.id] =
        `${space.resourceType === "room" ? "Room" : "Zone"} · ${space.name}`;
    }
    return map;
  }, [roomZones]);

  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_auto_auto]"
      onSubmit={(event) => void onSubmit(event)}
    >
      <Input
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        placeholder="Scene name"
        aria-label="Scene name"
        disabled={isSaving}
      />
      <Select
        items={items}
        value={selectedSpaceId}
        onValueChange={(value) => onSpaceChange(value as string | null)}
      >
        <SelectTrigger className="w-full sm:w-56">
          <SelectValue placeholder="Target space" />
        </SelectTrigger>
        <SelectContent>
          {roomZones.map((space) => (
            <SelectItem key={space.id} value={space.id}>
              {space.resourceType === "room" ? "Room" : "Zone"} · {space.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="submit"
        className="gap-2"
        disabled={!name.trim() || !selectedSpaceId || isSaving}
      >
        {isSaving ? <Loader2 className="animate-spin" /> : <Plus />}
        Save scene
      </Button>
    </form>
  );
};

const MembershipEditor = ({
  roomZone,
  options,
  selectedIds,
  onSave,
}: {
  roomZone: HueRoomZone;
  options: Array<HueSettingsDevice | HueLight>;
  selectedIds: string[];
  onSave: (ids: string[]) => Promise<void>;
}) => {
  const [draftIds, setDraftIds] = useState(selectedIds);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraftIds(selectedIds);
  }, [selectedIds]);

  const isDirty = !sameIdSet(draftIds, selectedIds);
  const toggle = (id: string) => {
    setDraftIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const save = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onSave(draftIds);
    } catch (saveError) {
      setError(String(saveError) || "Unable to update members.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Accordion className="mt-3">
      <AccordionItem value="members">
        <AccordionTrigger>
          Edit {roomZone.resourceType === "room" ? "devices" : "lights"}
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid gap-3">
            <ResourceChecklist
              emptyText={
                roomZone.resourceType === "room"
                  ? "No devices are loaded."
                  : "No lights are loaded."
              }
              options={options}
              selectedIds={draftIds}
              onToggle={toggle}
            />
            <div className="flex items-center justify-between gap-3">
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {draftIds.length} selected
                </p>
              )}
              <Button
                type="button"
                size="sm"
                className="gap-2"
                disabled={!isDirty || isSaving}
                onClick={() => void save()}
              >
                {isSaving ? <Loader2 className="animate-spin" /> : <Save />}
                Save members
              </Button>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

const ResourceChecklist = ({
  options,
  selectedIds,
  emptyText,
  onToggle,
}: {
  options: Array<HueSettingsDevice | HueLight>;
  selectedIds: string[];
  emptyText: string;
  onToggle: (id: string) => void;
}) => {
  const selected = new Set(selectedIds);
  if (options.length === 0) return <EmptyText>{emptyText}</EmptyText>;

  return (
    <ScrollArea
      fade
      className="max-h-64 rounded-xl bg-background/60"
      viewportClassName="p-2"
    >
      <div className="grid gap-2">
      {options.map((option) => (
        <label
          key={option.id}
          className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/60"
        >
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={selected.has(option.id)}
            onChange={() => onToggle(option.id)}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{option.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {resourceOptionMeta(option)}
            </span>
          </span>
        </label>
      ))}
      </div>
    </ScrollArea>
  );
};

const DeleteResourceButton = ({
  label,
  description,
  onDelete,
}: {
  label: string;
  description: string;
  onDelete: () => Promise<void>;
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await onDelete();
    } catch (deleteError) {
      setError(String(deleteError) || "Unable to delete resource.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button type="button" size="icon" variant="ghost" />}
      >
        <Trash2 />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel size="xl" disabled={isDeleting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            size="xl"
            className="gap-2"
            disabled={isDeleting}
            onClick={(event) => {
              event.preventDefault();
              void handleDelete();
            }}
          >
            {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const DeviceGroupPanel = ({
  title,
  devices,
  servicesByDevice,
  switchConfigsByDevice,
  isLoading,
  open,
  onToggle,
  onDelete,
  onSaveSwitchConfig,
}: {
  title: string;
  devices: HueSettingsDevice[];
  servicesByDevice: Map<string, HueAccessoryService[]>;
  switchConfigsByDevice: Map<string, HueSwitchInputConfiguration[]>;
  isLoading: boolean;
  open: boolean;
  onToggle: () => void;
  onDelete: (resourceType: DeleteableResourceType, id: string) => Promise<void>;
  onSaveSwitchConfig: (
    id: string,
    body: Record<string, unknown>,
  ) => Promise<void>;
}) => (
  <CollapsibleSection
    title={title}
    count={devices.length}
    open={open}
    onToggle={onToggle}
  >
    <div className="grid gap-3">
      {devices.map((device) => (
        <DeviceRow
          key={device.id}
          device={device}
          services={servicesByDevice.get(device.id) ?? []}
          switchConfigs={switchConfigsByDevice.get(device.id) ?? []}
          onDelete={onDelete}
          onSaveSwitchConfig={onSaveSwitchConfig}
        />
      ))}
      {devices.length === 0 && (
        <EmptyText>
          {isLoading
            ? "Loading devices..."
            : `No ${title.toLowerCase()} found.`}
        </EmptyText>
      )}
    </div>
  </CollapsibleSection>
);

const DeviceRow = ({
  device,
  services,
  switchConfigs,
  onDelete,
  onSaveSwitchConfig,
}: {
  device: HueSettingsDevice;
  services: HueAccessoryService[];
  switchConfigs: HueSwitchInputConfiguration[];
  onDelete: (resourceType: DeleteableResourceType, id: string) => Promise<void>;
  onSaveSwitchConfig: (
    id: string,
    body: Record<string, unknown>,
  ) => Promise<void>;
}) => (
  <Card size="sm" className="bg-background/70">
    <CardContent>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          {device.productArchetype
            ? humanize(device.productArchetype)
            : "Hue device"}
        </p>
        <p className="truncate font-medium">{device.name}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Badge variant={device.reachable ? "secondary" : "destructive"}>
          {device.reachable ? "Reachable" : "Unreachable"}
        </Badge>
        {!isBridgeDevice(device) && (
          <DeleteResourceButton
            label={device.name}
            description={`Delete device "${device.name}" from the bridge.`}
            onDelete={() => onDelete("device", device.id)}
          />
        )}
      </div>
    </div>

    {(() => {
      const readings = services.filter((service) => service.value);
      if (readings.length === 0) return null;
      return (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {readings.map((service) => (
            <SensorReadingPill key={service.id} service={service} />
          ))}
        </div>
      );
    })()}

    <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
      <DeviceField label="Product" value={device.productName} />
      <DeviceField label="Model" value={device.modelId} />
      <DeviceField label="Firmware" value={device.swVersion} />
      <DeviceField label="Zigbee ID" value={device.uniqueId} mono />
    </dl>

    {device.serviceTypes.length > 0 && (
      <div className="mt-3">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          Capabilities
        </p>
        <div className="flex flex-wrap gap-1">
          {device.serviceTypes.map((serviceType) => (
            <Badge key={serviceType} variant="outline">
              {humanize(serviceType)}
            </Badge>
          ))}
        </div>
      </div>
    )}

    {(services.length > 0 || switchConfigs.length > 0) && (
      <Accordion className="mt-3">
        {services.length > 0 && (
          <AccordionItem value="services">
            <AccordionTrigger>Accessory state</AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-2">
                {services.map((service) => (
                  <AccessoryServiceRow key={service.id} service={service} />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}
        {switchConfigs.length > 0 && (
          <AccordionItem value="switch-config">
            <AccordionTrigger>Switch input configuration</AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-2">
                {switchConfigs.map((config) => (
                  <SwitchConfigEditor
                    key={config.id}
                    config={config}
                    onSave={onSaveSwitchConfig}
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    )}
    </CardContent>
  </Card>
);

const AccessoryServiceRow = ({ service }: { service: HueAccessoryService }) => (
  <div className="rounded-lg bg-muted/45 px-3 py-2 text-sm">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{humanize(service.resourceType)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[service.value, service.updated].filter(Boolean).join(" · ") ||
            "No state reported"}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        {service.enabled !== null && (
          <Badge variant={service.enabled ? "secondary" : "outline"}>
            {service.enabled ? "Enabled" : "Disabled"}
          </Badge>
        )}
        <Badge variant={service.reachable ? "secondary" : "destructive"}>
          {service.reachable ? "Reachable" : "Offline"}
        </Badge>
      </div>
    </div>
  </div>
);

const SwitchConfigEditor = ({
  config,
  onSave,
}: {
  config: HueSwitchInputConfiguration;
  onSave: (id: string, body: Record<string, unknown>) => Promise<void>;
}) => {
  const [draft, setDraft] = useState(() =>
    JSON.stringify(writableSwitchConfig(config.raw), null, 2),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(JSON.stringify(writableSwitchConfig(config.raw), null, 2));
  }, [config.raw]);

  const save = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const parsed = JSON.parse(draft) as unknown;
      if (!isRecord(parsed)) {
        throw new Error("Configuration body must be a JSON object.");
      }
      await onSave(config.id, parsed);
    } catch (saveError) {
      setError(String(saveError) || "Unable to save switch configuration.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-lg bg-muted/45 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {config.mode ?? "Switch input configuration"}
          </p>
          <p className="truncate text-xs text-muted-foreground">{config.id}</p>
        </div>
        <Button
          type="button"
          size="sm"
          className="gap-2"
          disabled={isSaving}
          onClick={() => void save()}
        >
          {isSaving ? (
            <Loader2 className="animate-spin" />
          ) : (
            <SlidersHorizontal />
          )}
          Save
        </Button>
      </div>
      <textarea
        className="min-h-28 w-full resize-y rounded-xl border border-border bg-background/80 px-3 py-2 font-mono text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-label="Switch input configuration JSON"
        spellCheck={false}
      />
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
};

const sameIdSet = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
};

const resourceOptionMeta = (option: HueSettingsDevice | HueLight) => {
  if ("serviceTypes" in option) {
    return [option.productName, option.modelId, option.serviceTypes.join(", ")]
      .filter(Boolean)
      .join(" · ");
  }
  return [
    option.productName,
    option.modelId,
    option.reachable ? "Reachable" : "Offline",
  ]
    .filter(Boolean)
    .join(" · ");
};

const humanize = (value: string) =>
  value
    .split("_")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isBridgeDevice = (device: HueSettingsDevice) =>
  device.serviceTypes.includes("bridge") ||
  [device.name, device.productName, device.productArchetype]
    .filter(Boolean)
    .some((value) => value?.toLowerCase().includes("bridge"));

const writableSwitchConfig = (raw: unknown): Record<string, unknown> => {
  if (!isRecord(raw)) return {};
  const next = { ...raw };
  delete next.id;
  delete next.type;
  delete next.owner;
  delete next.metadata;
  return next;
};

const MetaRow = ({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) => (
  <div className="flex items-center justify-between gap-4">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="truncate text-right font-medium">{value ?? "Unknown"}</dd>
  </div>
);

/** A labelled value in the device detail grid; shows a dash when absent. */
const DeviceField = ({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) => (
  <div className="min-w-0">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd
      className={cn(
        "truncate text-sm font-medium",
        mono && "font-mono text-xs",
        !value && "text-muted-foreground",
      )}
    >
      {value || "—"}
    </dd>
  </div>
);

/** True when every search token appears in at least one of the given fields. */
const matchesQuery = (
  query: string,
  fields: Array<string | null | undefined>,
) => {
  if (!query) return true;
  const haystack = fields.filter(Boolean).join(" ").toLowerCase();
  return query.split(/\s+/).every((token) => haystack.includes(token));
};

const matchesStatus = (reachable: boolean, filter: DeviceStatusFilter) =>
  filter === "all" || (filter === "reachable" ? reachable : !reachable);

const EmptyText = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-xl bg-background/70 px-3 py-3 text-sm text-muted-foreground">
    {children}
  </p>
);
