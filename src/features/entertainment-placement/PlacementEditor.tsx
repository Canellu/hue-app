import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useEntertainmentStore } from "@/stores/EntertainmentStore";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type {
  HostSyncDisplay,
  HostSyncOverview,
  HostSyncStatus,
  StartColorTestRequest,
} from "@/types/host-sync";
import type {
  HueEntertainmentConfiguration,
  HueEntertainmentService,
  HueLight,
  HuePosition,
} from "@/types/hue";
import { invoke } from "@tauri-apps/api/core";
import {
  Cuboid,
  Loader2,
  Monitor,
  MoveVertical,
  RectangleHorizontal,
  Sparkles,
  TriangleAlert,
  Undo2,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  autoArrangePositions,
  CANVAS_ASPECT,
  clampAxis,
  testColor,
  type RoomView,
} from "./geometry";
import { DisplayCalibrationCanvas } from "./DisplayCalibrationCanvas";
import { RoomCanvas, type RoomPin } from "./RoomCanvas";

interface DraftLocation {
  serviceId: string;
  lightId: string | null;
  name: string;
  equalizationFactor: number | null;
  positions: HuePosition[];
}

type PlacementView = "display" | RoomView;

const positionKey = (serviceId: string, index: number) =>
  `${serviceId}:${index}`;

const selectedDisplaysFromOverview = (
  overview: HostSyncOverview | null,
): HostSyncDisplay[] => {
  if (!overview || overview.displays.length === 0) return [];
  if (
    overview.preferences.automaticDisplay ||
    overview.preferences.displayIds.length === 0
  ) {
    return [
      overview.displays.find((display) => display.isPrimary) ??
        overview.displays[0],
    ];
  }
  const selected = new Set(overview.preferences.displayIds);
  return overview.displays.filter((display) => selected.has(display.id));
};

const createDraftLocations = (
  area: HueEntertainmentConfiguration,
  services: HueEntertainmentService[],
  lights: HueLight[],
): DraftLocation[] => {
  const lightByServiceId = new Map(
    services.flatMap((service) =>
      service.renderer_reference?.rtype === "light"
        ? [[service.id, service.renderer_reference.rid] as const]
        : [],
    ),
  );
  const lightNameById = new Map(lights.map((light) => [light.id, light.name]));

  return area.locations.service_locations.map(
    (location, index): DraftLocation => {
      const lightId = lightByServiceId.get(location.service.rid) ?? null;
      return {
        serviceId: location.service.rid,
        lightId,
        name:
          (lightId ? lightNameById.get(lightId) : null) ?? `Light ${index + 1}`,
        equalizationFactor: location.equalization_factor ?? null,
        positions: location.positions.map((position) => ({ ...position })),
      };
    },
  );
};

/**
 * Placement editor for an existing entertainment area: drag lights around a
 * scene that matches the area type, check the result against the physical
 * room by streaming a distinct color to every light, and save the positions
 * back to the bridge.
 */
export const PlacementEditor = ({ areaId }: { areaId: string }) => {
  const lights = useHueResourcesStore((store) => store.lights);
  const pcStatus = useEntertainmentStore((store) => store.pcStatus);
  const liveAreas = useEntertainmentStore((store) => store.areas);

  const [area, setArea] = useState<HueEntertainmentConfiguration | null>(null);
  const [locations, setLocations] = useState<DraftLocation[]>([]);
  const [displays, setDisplays] = useState<HostSyncDisplay[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [view, setView] = useState<PlacementView>("room");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [testActive, setTestActive] = useState(false);
  const [flashingServiceId, setFlashingServiceId] = useState<string | null>(
    null,
  );
  const [takeoverOpen, setTakeoverOpen] = useState(false);
  // True while this editor owns the bridge stream (test or flash).
  const ownsStreamRef = useRef(false);
  const flashTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setLoadError(null);
    Promise.all([
      invoke<HueEntertainmentConfiguration[]>("get-hue-resource", {
        resourceType: "entertainment_configuration",
        id: null,
      }),
      invoke<HueEntertainmentService[]>("get-hue-resource", {
        resourceType: "entertainment",
        id: null,
      }),
      invoke<HostSyncOverview>("get-host-sync-overview").catch(() => null),
    ])
      .then(([configurations, nextServices, overview]) => {
        if (!active) return;
        const configuration = configurations.find(
          (candidate) => candidate.id === areaId,
        );
        if (!configuration) {
          setLoadError("Entertainment area not found.");
          return;
        }
        const draft = createDraftLocations(
          configuration,
          nextServices,
          useHueResourcesStore.getState().lights,
        );
        setArea(configuration);
        setLocations(draft);
        const selectedDisplays = selectedDisplaysFromOverview(overview);
        setDisplays(selectedDisplays);
        if (
          selectedDisplays.length > 0 &&
          (configuration.configuration_type === "screen" ||
            configuration.configuration_type === "monitor")
        ) {
          setView("display");
        }
        setSavedSnapshot(JSON.stringify(draft.map((entry) => entry.positions)));
        setActiveKey(draft[0] ? positionKey(draft[0].serviceId, 0) : null);
      })
      .catch((error) => {
        if (active) setLoadError(String(error));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [areaId]);

  // Light events replace the store's lights array. Refresh display names
  // without rebuilding the placement draft from stale bridge coordinates.
  useEffect(() => {
    const lightNameById = new Map(
      lights.map((light) => [light.id, light.name]),
    );
    setLocations((current) => {
      let changed = false;
      const next = current.map((location) => {
        const name = location.lightId
          ? lightNameById.get(location.lightId)
          : null;
        if (!name || name === location.name) return location;
        changed = true;
        return { ...location, name };
      });
      return changed ? next : current;
    });
  }, [lights]);

  const pins: RoomPin[] = useMemo(
    () =>
      locations.flatMap((location, locationIndex) =>
        location.positions.map((position, positionIndex) => ({
          key: positionKey(location.serviceId, positionIndex),
          label:
            location.positions.length > 1
              ? `${locationIndex + 1}${String.fromCharCode(97 + positionIndex)}`
              : `${locationIndex + 1}`,
          name: location.name,
          position,
          color:
            testActive || flashingServiceId === location.serviceId
              ? flashingServiceId
                ? flashingServiceId === location.serviceId
                  ? "#ffffff"
                  : null
                : testColor(locationIndex).hex
              : null,
        })),
      ),
    [locations, testActive, flashingServiceId],
  );

  const activePin = pins.find((pin) => pin.key === activeKey) ?? null;
  const activeLocationIndex = activePin
    ? locations.findIndex((location) =>
        activePin.key.startsWith(`${location.serviceId}:`),
      )
    : -1;

  const isDirty =
    JSON.stringify(locations.map((entry) => entry.positions)) !== savedSnapshot;

  const liveArea = liveAreas.find((candidate) => candidate.id === areaId);
  const engineBusy =
    pcStatus.state === "starting" || pcStatus.state === "stopping";
  const syncRunning = pcStatus.state === "running" && !ownsStreamRef.current;
  const externallyActive =
    liveArea?.status === "active" && pcStatus.state === "idle";
  const channels = area?.channels ?? [];
  const testSupported = channels.length > 0;

  const updatePosition = (key: string, update: Partial<HuePosition>) => {
    setLocations((current) =>
      current.map((location) => ({
        ...location,
        positions: location.positions.map((position, index) =>
          positionKey(location.serviceId, index) === key
            ? { ...position, ...update }
            : position,
        ),
      })),
    );
  };

  const autoArrange = () => {
    const arranged = autoArrangePositions(
      area?.configuration_type ?? null,
      pins.length,
    );
    let cursor = 0;
    setLocations((current) =>
      current.map((location) => ({
        ...location,
        positions: location.positions.map(
          (position) => arranged[cursor++] ?? position,
        ),
      })),
    );
  };

  const resetPositions = () => {
    if (!area) return;
    setLocations((current) => {
      const original = area.locations.service_locations;
      return current.map((location, index) => ({
        ...location,
        positions: (original[index]?.positions ?? location.positions).map(
          (position) => ({ ...position }),
        ),
      }));
    });
  };

  const save = async () => {
    const submittedLocations = locations.map((location) => ({
      service: { rid: location.serviceId, rtype: "entertainment" as const },
      positions: location.positions.map((position) => ({
        x: clampAxis(position.x),
        y: clampAxis(position.y),
        z: clampAxis(position.z),
      })),
      ...(location.equalizationFactor != null
        ? { equalization_factor: location.equalizationFactor }
        : {}),
    }));
    const submittedSnapshot = JSON.stringify(
      submittedLocations.map((entry) => entry.positions),
    );

    setIsSaving(true);
    try {
      await invoke("update-hue-resource", {
        resourceType: "entertainment_configuration",
        id: areaId,
        body: {
          locations: {
            service_locations: submittedLocations,
          },
        },
      });
      setSavedSnapshot(submittedSnapshot);
      setArea((current) =>
        current
          ? {
              ...current,
              locations: { service_locations: submittedLocations },
            }
          : current,
      );
      toast.success("Light positions saved");
      if (liveArea?.status === "active") {
        toast.info("Positions apply the next time light sync starts.");
      }
    } catch (error) {
      toast.error(String(error) || "Unable to save light positions.");
    } finally {
      setIsSaving(false);
    }
  };

  // ---- Position check streaming -------------------------------------------

  const channelColorsFor = (
    highlightServiceId: string | null,
  ): StartColorTestRequest["channelColors"] => {
    const colorByServiceId = new Map(
      locations.map((location, index) => [
        location.serviceId,
        testColor(index).rgb,
      ]),
    );
    return channels.map((channel) => {
      const serviceId = channel.members?.[0]?.service.rid ?? null;
      const rgb: [number, number, number] = highlightServiceId
        ? serviceId === highlightServiceId
          ? [255, 255, 255]
          : [10, 10, 10]
        : ((serviceId ? colorByServiceId.get(serviceId) : null) ?? [
            120, 120, 120,
          ]);
      return { channelId: channel.channel_id, rgb };
    });
  };

  const startStream = async (
    highlightServiceId: string | null,
    confirmTakeover: boolean,
  ) => {
    const request: StartColorTestRequest = {
      areaId,
      rgb: [120, 120, 120],
      channelColors: channelColorsFor(highlightServiceId),
      confirmTakeover,
    };
    await invoke("start-host-sync-color-test", { request });
    ownsStreamRef.current = true;
  };

  const stopStream = async () => {
    if (!ownsStreamRef.current) return;
    ownsStreamRef.current = false;
    try {
      await invoke("stop-host-sync");
    } catch {
      // The session already ended; nothing to clean up.
    }
  };

  /** Waits out the engine teardown so a follow-up start can begin. */
  const waitForIdle = async () => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const status = await invoke<HostSyncStatus>("get-host-sync-status");
      if (status.state === "idle" || status.state === "error") return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  };

  /** Replaces the current stream (if this editor owns one) with a new one. */
  const restartStream = async (
    highlightServiceId: string | null,
    confirmTakeover: boolean,
  ) => {
    if (ownsStreamRef.current) {
      await stopStream();
      await waitForIdle();
      // Restarting right after our own stop never needs a takeover prompt.
      confirmTakeover = true;
    }
    await startStream(highlightServiceId, confirmTakeover);
  };

  const toggleTest = async (checked: boolean, confirmTakeover = false) => {
    if (!checked) {
      setTestActive(false);
      await stopStream();
      return;
    }
    if (externallyActive && !confirmTakeover) {
      setTakeoverOpen(true);
      return;
    }
    try {
      await startStream(null, confirmTakeover);
      setTestActive(true);
    } catch (error) {
      toast.error(String(error) || "Unable to start the position check.");
    }
  };

  const flash = async (serviceId: string) => {
    if (flashingServiceId) return;
    try {
      await restartStream(serviceId, false);
      setFlashingServiceId(serviceId);
      flashTimerRef.current = window.setTimeout(() => {
        flashTimerRef.current = null;
        setFlashingServiceId(null);
        void (testActive
          ? restartStream(null, true).catch(() => stopStream())
          : stopStream());
      }, 3000);
    } catch (error) {
      toast.error(String(error) || "Unable to flash the light.");
    }
  };

  // Stop any stream this editor started when leaving the screen.
  useEffect(
    () => () => {
      if (flashTimerRef.current != null) {
        window.clearTimeout(flashTimerRef.current);
      }
      if (ownsStreamRef.current) {
        ownsStreamRef.current = false;
        void invoke("stop-host-sync").catch(() => undefined);
      }
    },
    [],
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError || !area) {
    return (
      <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
        <TriangleAlert className="size-4 shrink-0" />
        <span>{loadError ?? "Unable to load the entertainment area."}</span>
      </div>
    );
  }

  return (
    <div className="mx-auto h-full min-h-0 w-full max-w-7xl">
      <Card className="h-full min-h-0">
        <CardHeader className="shrink-0 flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>{area.metadata.name}</CardTitle>
            <CardDescription>
              {view === "display"
                ? "Drag each light over the part of the selected displays it should follow."
                : "Drag each light to where it sits in your room. In the 3D room, drag empty space to look from a different angle."}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isDirty && (
              <Button
                variant="ghost"
                disabled={isSaving}
                onClick={resetPositions}
              >
                <Undo2 /> Reset
              </Button>
            )}
            <Button disabled={!isDirty || isSaving} onClick={() => void save()}>
              {isSaving ? <Loader2 className="animate-spin" /> : null}
              Save positions
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-full border border-foreground/12 p-1">
              {(
                [
                  ...(displays.length > 0
                    ? [
                        {
                          value: "display",
                          label: "Displays",
                          icon: Monitor,
                        } as const,
                      ]
                    : []),
                  { value: "flat", label: "Flat", icon: RectangleHorizontal },
                  { value: "room", label: "3D room", icon: Cuboid },
                ] as const
              ).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                    view === value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium">Position check</p>
                <p className="text-xs text-muted-foreground">
                  {view === "display"
                    ? "Each light shows its sampling window's color."
                    : "Each light shows its pin's color."}
                </p>
              </div>
              <Switch
                aria-label="Toggle the light position check"
                checked={testActive}
                disabled={
                  !testSupported ||
                  engineBusy ||
                  syncRunning ||
                  flashingServiceId != null
                }
                onCheckedChange={(checked) => void toggleTest(checked)}
              />
            </div>
          </div>

          {syncRunning && (
            <p className="flex items-start gap-2 rounded-xl bg-(--warn-surface) p-3 text-sm text-(--warn-text)">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              Light sync is running from this PC. Stop it to use the position
              check; position changes apply on the next start.
            </p>
          )}

          <div className="flex min-h-0 flex-1 items-center justify-center [container-type:size]">
            {view === "display" ? (
              <DisplayCalibrationCanvas
                displays={displays}
                pins={pins}
                activeKey={activeKey}
                onActivate={setActiveKey}
                onMove={updatePosition}
              />
            ) : (
              <RoomCanvas
                view={view}
                configurationType={area.configuration_type}
                pins={pins}
                activeKey={activeKey}
                onActivate={setActiveKey}
                onMove={updatePosition}
                className={cn("w-[min(100cqw,160cqh)] shrink-0", CANVAS_ASPECT)}
              />
            )}
          </div>

          <div className="flex shrink-0 gap-2 overflow-x-auto pb-1">
            {locations.map((location, index) => {
              const key = positionKey(location.serviceId, 0);
              const selected = activePin?.key.startsWith(
                `${location.serviceId}:`,
              );
              return (
                <div
                  key={location.serviceId}
                  className={cn(
                    "flex min-w-44 shrink-0 items-center gap-2 rounded-xl border px-3 py-2",
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-foreground/12",
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => setActiveKey(key)}
                  >
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground/7 text-xs font-semibold"
                      style={
                        testActive
                          ? {
                              backgroundColor: testColor(index).hex,
                              color: "white",
                            }
                          : undefined
                      }
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 truncate text-sm font-medium">
                      {location.name}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Flash ${location.name}`}
                    title="Flash this light in the room"
                    disabled={
                      !testSupported ||
                      engineBusy ||
                      syncRunning ||
                      flashingServiceId != null ||
                      (externallyActive && !testActive)
                    }
                    onClick={() => void flash(location.serviceId)}
                  >
                    <Zap
                      className={cn(
                        flashingServiceId === location.serviceId &&
                          "animate-pulse text-primary",
                      )}
                    />
                  </Button>
                </div>
              );
            })}
          </div>

          {activePin && activeLocationIndex >= 0 && (
            <div className="grid shrink-0 gap-4 rounded-2xl bg-foreground/4 px-4 py-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <div className="flex items-center justify-between text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <MoveVertical className="size-4" /> Height
                  </p>
                  <span className="text-xs text-muted-foreground">
                    Floor → Ceiling
                  </span>
                </div>
                <Slider
                  min={-1}
                  max={1}
                  step={0.05}
                  value={[activePin.position.z]}
                  aria-label={`${activePin.name} height`}
                  onValueChange={(value) =>
                    updatePosition(activePin.key, {
                      z: Array.isArray(value) ? value[0] : value,
                    })
                  }
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between text-sm">
                  <p className="font-medium">Depth</p>
                  <span className="text-xs text-muted-foreground">
                    {view === "display"
                      ? "Saved for 3D effects · not used by PC Sync"
                      : "Behind you → Screen wall"}
                  </span>
                </div>
                <Slider
                  min={-1}
                  max={1}
                  step={0.05}
                  value={[activePin.position.y]}
                  aria-label={`${activePin.name} depth`}
                  onPointerDown={() => setView("room")}
                  onValueChange={(value) =>
                    updatePosition(activePin.key, {
                      y: Array.isArray(value) ? value[0] : value,
                    })
                  }
                />
              </div>
            </div>
          )}

          <div className="flex shrink-0 items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={autoArrange}
              disabled={pins.length === 0}
            >
              <Sparkles /> Auto-arrange for{" "}
              {formatConfigurationType(area.configuration_type)}
            </Button>
            <p className="text-xs text-muted-foreground">
              {pins.length} {pins.length === 1 ? "light" : "lights"} placed
            </p>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={takeoverOpen} onOpenChange={setTakeoverOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Interrupt the current sync?</AlertDialogTitle>
            <AlertDialogDescription>
              Another app is streaming to this area. The position check takes
              over the lights until you switch it off.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              size="xl"
              onClick={() => {
                setTakeoverOpen(false);
                void toggleTest(true, true);
              }}
            >
              Start position check
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const formatConfigurationType = (type: string | null) => {
  switch (type) {
    case "screen":
      return "TV";
    case "monitor":
      return "Monitor";
    case "music":
      return "Music";
    case "3dspace":
      return "3D space";
    default:
      return "this area";
  }
};
