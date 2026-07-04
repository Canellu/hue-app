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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  OptionTile,
  SegmentedOptions,
  SettingRow,
  SyncHero,
  SyncHeroChip,
  SyncToggleButton,
} from "@/components/sync/SyncControls";
import { useEntertainmentStore } from "@/stores/EntertainmentStore";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import { useSyncBoxStore } from "@/stores/SyncBoxStore";
import type {
  HostSyncDisplay,
  HostSyncIntensity,
  HostSyncMode,
  HostSyncPreferences,
  HostSyncStatus,
  MusicPaletteChoice,
  UpdateHostSyncRequest,
} from "@/types/host-sync";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "@tanstack/react-router";
import {
  AudioLines,
  Check,
  ChevronDown,
  Clapperboard,
  Gamepad2,
  Lightbulb,
  Loader2,
  Monitor,
  MonitorPlay,
  Music2,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import {
  builtinPalettes,
  channelCounts,
  paletteToSelectValue,
  selectValueToPalette,
} from "./constants";
import { EnablePcSyncCard } from "./EnablePcSyncCard";
import { useHostSync } from "./useHostSync";

const modeOptions: {
  mode: HostSyncMode;
  label: string;
  description: string;
  icon: typeof Clapperboard;
}[] = [
  {
    mode: "video",
    label: "Video",
    description: "Movies & TV",
    icon: Clapperboard,
  },
  {
    mode: "game",
    label: "Games",
    description: "Fast reactions",
    icon: Gamepad2,
  },
  {
    mode: "music",
    label: "Music",
    description: "Follow the beat",
    icon: Music2,
  },
];

const intensityOptions: {
  intensity: HostSyncIntensity;
  label: string;
  description: string;
}[] = [
  { intensity: "subtle", label: "Subtle", description: "Slow, gentle shifts" },
  {
    intensity: "moderate",
    label: "Moderate",
    description: "Balanced response",
  },
  { intensity: "high", label: "High", description: "Fast, vivid colors" },
  { intensity: "extreme", label: "Extreme", description: "Instant response" },
];

/** Waits for the engine to settle after a stop so a restart can begin. */
const waitForIdle = async () => {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const status = await invoke<HostSyncStatus>("get-host-sync-status");
    if (status.state === "idle" || status.state === "error") return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
};

export const PcSyncScreen = ({ areaId }: { areaId: string }) => {
  const navigate = useNavigate();
  const {
    overview,
    status,
    isLoading,
    isUpdating,
    loadError,
    actionError,
    refresh,
    savePreferences,
    start,
    stop,
    updateLive,
    provisionCredentials,
  } = useHostSync();
  const liveAreas = useEntertainmentStore((store) => store.areas);
  const boxState = useSyncBoxStore((store) => store.state);
  const scenes = useHueResourcesStore((store) => store.scenes);
  const [takeoverOpen, setTakeoverOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading PC sync"
        className="flex min-h-[calc(100vh-12rem)] items-center justify-center"
      >
        <Loader2
          aria-hidden
          className="size-8 animate-spin text-muted-foreground"
        />
      </div>
    );
  }

  if (loadError || !overview) {
    return (
      <div
        role="alert"
        className="mx-auto flex max-w-2xl items-center justify-between gap-4 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive"
      >
        <span>{loadError ?? "Unable to read PC sync state."}</span>
        <Button variant="outline" onClick={() => void refresh()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!overview.captureSupported) {
    return (
      <Card className="mx-auto max-w-xl border-dashed">
        <CardContent className="flex min-h-56 flex-col items-center justify-center text-center">
          <Monitor className="mb-4 size-8 text-muted-foreground" />
          <p className="font-medium">PC sync is not available here</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Screen and audio capture for PC light sync currently requires
            Windows.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!overview.credentials.hasClientKey) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <EnablePcSyncCard
          isUpdating={isUpdating}
          error={actionError}
          onProvision={provisionCredentials}
        />
      </div>
    );
  }

  const area = overview.areas.find((candidate) => candidate.id === areaId);
  if (!area) {
    return (
      <Card className="mx-auto max-w-xl border-dashed">
        <CardContent className="flex min-h-56 flex-col items-center justify-center text-center">
          <TriangleAlert className="mb-4 size-8 text-muted-foreground" />
          <p className="font-medium">Entertainment area not found</p>
          {overview.areasError && (
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {overview.areasError}
            </p>
          )}
          <Button
            variant="outline"
            className="mt-5"
            onClick={() => void navigate({ to: "/sync" })}
          >
            Back to sync
          </Button>
        </CardContent>
      </Card>
    );
  }

  const prefs = overview.preferences;
  const running = status.state === "running" || status.state === "starting";
  const runningHere = running && status.areaId === areaId;
  const busyElsewhere = running && status.areaId !== areaId;
  const busyAreaName = busyElsewhere
    ? (liveAreas.find((candidate) => candidate.id === status.areaId)?.name ??
      "another area")
    : null;
  // The event stream keeps the store's copy fresher than the overview.
  const liveArea = liveAreas.find((candidate) => candidate.id === areaId);
  const areaActive = (liveArea?.status ?? area.status) === "active";
  const externallyActive = areaActive && !runningHere;
  const externalOwner = externallyActive
    ? (Object.values(boxState?.hue.groups ?? {}).find((group) => group.active)
        ?.owner ?? "another app")
    : null;
  const busy = isUpdating || restarting;

  const beginSync = (confirmTakeover: boolean) =>
    start({ areaId, confirmTakeover });

  const toggleSync = () => {
    if (runningHere) {
      void stop();
    } else if (externallyActive) {
      setTakeoverOpen(true);
    } else {
      void beginSync(false);
    }
  };

  /** Stop, wait out the teardown, and start again with the saved settings. */
  const restartSession = async () => {
    setRestarting(true);
    try {
      await stop();
      await waitForIdle();
      await beginSync(true);
    } finally {
      setRestarting(false);
    }
  };

  /**
   * Persists a setting; brightness/intensity apply to a running session live,
   * anything else needs the capture pipeline rebuilt.
   */
  const applyPreference = async (
    update: Partial<HostSyncPreferences>,
    apply?: { live?: UpdateHostSyncRequest; restart?: boolean },
  ) => {
    await savePreferences(update);
    if (!runningHere) return;
    if (apply?.live) void updateLive(apply.live);
    else if (apply?.restart) await restartSession();
  };

  const musicScenes = scenes.filter(
    (scene) => scene.resourceType === "scene" && scene.colors.length > 0,
  );
  const paletteValue = paletteToSelectValue(prefs.musicPalette);
  const paletteLabel =
    typeof prefs.musicPalette === "string"
      ? (builtinPalettes.find((option) => option.value === prefs.musicPalette)
          ?.label ?? prefs.musicPalette)
      : (musicScenes.find(
          (scene) =>
            typeof prefs.musicPalette !== "string" &&
            scene.id === prefs.musicPalette.sceneId,
        )?.name ??
        (typeof prefs.musicPalette !== "string"
          ? (prefs.musicPalette.sceneName ?? "Scene")
          : "Scene"));

  // Music captures audio, not the screen — surface which output it listens to.
  // For the default, name the actual device so a virtual router routing apps
  // elsewhere (e.g. SteelSeries Sonar) is visible instead of a bare "Default".
  const defaultOutput = overview.audioOutputs.find((output) => output.isDefault);
  const selectedOutputName = overview.audioOutputs.find(
    (output) => output.id === prefs.audioDeviceId,
  )?.name;
  const audioSourceCaption =
    prefs.audioDeviceId == null
      ? `Default · ${defaultOutput?.name ?? "system output"}`
      : (selectedOutputName ?? "Unavailable device");

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-5 pb-8">
      {(actionError ?? status.error) && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>{actionError ?? status.error}</p>
        </div>
      )}
      {runningHere && status.warning && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl bg-(--warn-surface) p-4 text-sm text-(--warn-text)"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>{status.warning}</p>
        </div>
      )}

      <SyncHero
        icon={MonitorPlay}
        title="Sync with this PC"
        active={runningHere}
        statusLabel={
          runningHere
            ? status.state === "starting"
              ? "Starting light sync…"
              : "Lights are syncing with this PC"
            : "Ready to sync"
        }
        meta={`${area.channels.length} ${
          area.channels.length === 1 ? "channel" : "channels"
        } · ${area.lightIds.length} ${
          area.lightIds.length === 1 ? "light" : "lights"
        }`}
        aside={
          <>
            {prefs.mode === "music" ? (
              <SyncHeroChip
                icon={AudioLines}
                label="Audio input"
                caption={audioSourceCaption}
              />
            ) : (
              <DisplayCaptureChip
                displays={overview.displays}
                automaticDisplay={prefs.automaticDisplay}
                selectedIds={prefs.displayIds}
                disabled={busy || busyElsewhere}
                onChange={(update) =>
                  void applyPreference(update, { restart: true })
                }
              />
            )}
            <SyncToggleButton
              active={runningHere}
              busy={busy}
              disabled={busy || busyElsewhere || status.state === "stopping"}
              onClick={toggleSync}
            />
          </>
        }
        notice={
          busyElsewhere ? (
            <p className="text-sm text-muted-foreground">
              This PC is already syncing with {busyAreaName}. Stop it there
              first.
            </p>
          ) : externallyActive ? (
            <p className="flex items-start gap-2 text-sm text-(--warn-text)">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                {area.name} is syncing with {externalOwner}. Starting here takes
                over the stream.
              </span>
            </p>
          ) : null
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sync style</CardTitle>
            <CardDescription>
              How the lights interpret your content.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid grid-cols-3 gap-2.5">
              {modeOptions.map(({ mode, label, description, icon: Icon }) => (
                <OptionTile
                  key={mode}
                  vertical
                  icon={Icon}
                  label={label}
                  caption={description}
                  selected={prefs.mode === mode}
                  disabled={busy}
                  onSelect={() =>
                    void applyPreference({ mode }, { restart: true })
                  }
                />
              ))}
            </div>
            <SettingRow
              title="Intensity"
              description={
                intensityOptions.find(
                  (option) => option.intensity === prefs.intensity,
                )?.description ?? "How quickly and dramatically colors change."
              }
              className="border-t border-border pt-4"
            >
              <SegmentedOptions
                ariaLabel="Sync intensity"
                value={prefs.intensity}
                disabled={busy}
                options={intensityOptions.map(({ intensity, label }) => ({
                  value: intensity,
                  label,
                }))}
                onValueChange={(intensity) =>
                  void applyPreference({ intensity }, { live: { intensity } })
                }
              />
            </SettingRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Light response</CardTitle>
            <CardDescription>
              Fine-tune the effect for the selected style.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-3">
              <SettingRow
                icon={Lightbulb}
                title="Effect brightness"
                description="Caps how bright the synced lights get."
              >
                <span className="rounded-lg bg-muted px-2.5 py-1 font-mono text-sm">
                  {Math.round(prefs.brightness)}%
                </span>
              </SettingRow>
              <Slider
                aria-label="Effect brightness"
                min={0}
                max={100}
                step={1}
                value={[Math.round(prefs.brightness)]}
                disabled={busy}
                onValueCommitted={(value) => {
                  const brightness = Array.isArray(value) ? value[0] : value;
                  void applyPreference(
                    { brightness },
                    { live: { brightness } },
                  );
                }}
              />
            </div>

            {prefs.mode === "video" && (
              <SettingRow
                icon={AudioLines}
                title="Use audio for the effect"
                description="Emphasize brightness with your PC's sound while watching."
                className="border-t border-border pt-4"
              >
                <Switch
                  size="lg"
                  aria-label="Toggle audio-driven brightness for Video"
                  checked={prefs.videoAudioReactive}
                  disabled={busy}
                  onCheckedChange={(checked) =>
                    void applyPreference(
                      { videoAudioReactive: checked },
                      { restart: true },
                    )
                  }
                />
              </SettingRow>
            )}

            {prefs.mode === "music" && (
              <>
                <SettingRow
                  icon={AudioLines}
                  title="Audio input"
                  description="The output Music listens to. Pick your speakers or headphones if the default isn't heard."
                  className="border-t border-border pt-4"
                >
                  <Select
                    value={prefs.audioDeviceId ?? "default"}
                    disabled={busy || overview.audioOutputs.length === 0}
                    onValueChange={(value) =>
                      void applyPreference(
                        { audioDeviceId: value === "default" ? null : value },
                        { restart: true },
                      )
                    }
                  >
                    <SelectTrigger
                      aria-label="Audio input device"
                      className="w-56"
                    >
                      <SelectValue>
                        {() =>
                          prefs.audioDeviceId == null
                            ? "Default output"
                            : (selectedOutputName ?? "Unavailable device")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="w-auto max-w-80 min-w-(--anchor-width)">
                      <SelectItem value="default">Default output</SelectItem>
                      {overview.audioOutputs.map((output) => (
                        <SelectItem
                          key={output.id}
                          value={output.id}
                          className="[&>div:first-child]:whitespace-normal [&>div:first-child]:line-clamp-2"
                        >
                          {output.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingRow>
                <SettingRow
                  title="Color palette"
                  description="Built-in palettes, or colors from one of your scenes."
                  className="border-t border-border pt-4"
                >
                  <Select
                    value={paletteValue}
                    disabled={busy}
                    onValueChange={(value) => {
                      if (value == null) return;
                      const palette: MusicPaletteChoice = selectValueToPalette(
                        value,
                        musicScenes.find(
                          (scene) => `scene:${scene.id}` === value,
                        )?.name,
                      );
                      void applyPreference(
                        { musicPalette: palette },
                        { restart: true },
                      );
                    }}
                  >
                    <SelectTrigger
                      aria-label="Music color palette"
                      className="w-48"
                    >
                      <SelectValue>{() => paletteLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {builtinPalettes.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                      {musicScenes.map((scene) => (
                        <SelectItem key={scene.id} value={`scene:${scene.id}`}>
                          {scene.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingRow>
                <SettingRow
                  title="Light groups"
                  description="How many frequency bands spread across the area."
                  className="border-t border-border pt-4"
                >
                  <Select
                    value={prefs.musicChannelCount}
                    disabled={busy}
                    onValueChange={(value) =>
                      void applyPreference(
                        {
                          musicChannelCount:
                            value as HostSyncPreferences["musicChannelCount"],
                        },
                        { restart: true },
                      )
                    }
                  >
                    <SelectTrigger
                      aria-label="Music light groups"
                      className="w-48"
                    >
                      <SelectValue>
                        {() =>
                          channelCounts.find(
                            (option) =>
                              option.value === prefs.musicChannelCount,
                          )?.label
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {channelCounts.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingRow>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={takeoverOpen} onOpenChange={setTakeoverOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Take over light sync?</AlertDialogTitle>
            <AlertDialogDescription>
              Lights will stop syncing with{" "}
              <span className="font-medium text-foreground">
                {externalOwner ?? "another app"}
              </span>{" "}
              if you start light sync from this PC.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              size="xl"
              onClick={() => {
                setTakeoverOpen(false);
                void beginSync(true);
              }}
            >
              Start anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

/** Square checkbox box matching the rooms/zones multiselect indicator. */
const CaptureCheck = ({ checked }: { checked: boolean }) => (
  <span className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input bg-background">
    {checked && <Check className="size-3.5" strokeWidth={3} />}
  </span>
);

/**
 * Interactive version of the "Display capture" hero chip: opens a menu to
 * switch the capture source without a trip to Settings. Picking a specific
 * display turns off primary-tracking; choosing "Follow primary display"
 * turns it back on. At least one display always stays captured.
 */
const DisplayCaptureChip = ({
  displays,
  automaticDisplay,
  selectedIds,
  disabled,
  onChange,
}: {
  displays: HostSyncDisplay[];
  automaticDisplay: boolean;
  selectedIds: string[];
  disabled?: boolean;
  onChange: (update: {
    automaticDisplay: boolean;
    displayIds: string[];
  }) => void;
}) => {
  const selected = new Set(selectedIds);
  const isCaptured = (display: HostSyncDisplay) =>
    automaticDisplay ? display.isPrimary : selected.has(display.id);

  const capturedNames = displays
    .filter(isCaptured)
    .map((display) => display.name);
  const caption = automaticDisplay
    ? "Following the primary display"
    : capturedNames.length === 0
      ? "No display selected"
      : capturedNames.length === 1
        ? capturedNames[0]
        : `${capturedNames.length} displays`;

  const chooseAutomatic = () => {
    if (automaticDisplay) return;
    onChange({ automaticDisplay: true, displayIds: selectedIds });
  };

  const toggleDisplay = (id: string) => {
    // Switching to a specific display drops out of primary-tracking; seed the
    // manual set from what's currently captured so the primary isn't lost.
    const next = new Set(
      automaticDisplay
        ? displays.filter((display) => display.isPrimary).map((d) => d.id)
        : selected,
    );
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (next.size === 0) return; // keep at least one display captured
    onChange({ automaticDisplay: false, displayIds: [...next] });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        render={
          <button
            type="button"
            aria-label="Change display capture"
            className="flex items-center gap-3 rounded-full bg-background/60 py-2 pr-3 pl-2.5 backdrop-blur-sm transition-colors outline-none hover:bg-background/85 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60"
          />
        }
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Monitor className="size-4.5" />
        </span>
        <span className="min-w-0 text-left">
          <span className="block text-sm leading-tight font-medium">
            Display capture
          </span>
          <span className="mt-0.5 block max-w-40 truncate text-xs leading-tight text-muted-foreground">
            {caption}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Capture source</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuItem closeOnClick={false} onClick={chooseAutomatic}>
          <CaptureCheck checked={automaticDisplay} />
          Follow primary display
        </DropdownMenuItem>
        {displays.length > 0 && <DropdownMenuSeparator />}
        {displays.map((display) => (
          <DropdownMenuItem
            key={display.id}
            closeOnClick={false}
            onClick={() => toggleDisplay(display.id)}
          >
            <CaptureCheck checked={isCaptured(display)} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{display.name}</span>
              <span className="text-xs text-muted-foreground">
                {display.width}×{display.height}
                {display.isPrimary ? " · Primary" : ""}
                {display.hdrEnabled ? " · HDR" : ""}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
