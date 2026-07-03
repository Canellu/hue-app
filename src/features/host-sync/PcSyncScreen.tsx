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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useEntertainmentStore } from "@/stores/EntertainmentStore";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import { useSyncBoxStore } from "@/stores/SyncBoxStore";
import type {
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
  Clapperboard,
  Gamepad2,
  Lightbulb,
  Loader2,
  Monitor,
  Move3d,
  Music2,
  Pause,
  Play,
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

      <Card className="overflow-hidden border-0 bg-gradient-to-br from-primary/15 via-card to-card shadow-sm">
        <CardContent className="grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="space-y-3">
            <div
              role="status"
              className="flex items-center gap-2 text-sm font-medium text-primary"
            >
              <span
                aria-hidden
                className={cn(
                  "size-2 rounded-full",
                  runningHere
                    ? "animate-pulse bg-primary"
                    : "bg-muted-foreground/40",
                )}
              />
              {runningHere
                ? status.state === "starting"
                  ? "Starting light sync…"
                  : "Lights are syncing with this PC"
                : "Ready to sync"}
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {area.name}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {area.channels.length}{" "}
                {area.channels.length === 1 ? "channel" : "channels"} ·{" "}
                {area.lightIds.length}{" "}
                {area.lightIds.length === 1 ? "light" : "lights"}
              </p>
            </div>
            <Button
              size="lg"
              className="min-w-44 gap-2 rounded-full"
              variant={runningHere ? "secondary" : "default"}
              disabled={busy || busyElsewhere || status.state === "stopping"}
              onClick={toggleSync}
            >
              {busy ? (
                <Loader2 className="animate-spin" />
              ) : runningHere ? (
                <Pause />
              ) : (
                <Play className="fill-current" />
              )}
              {runningHere ? "Stop light sync" : "Start light sync"}
            </Button>
            {busyElsewhere ? (
              <p className="text-sm text-muted-foreground">
                This PC is already syncing with {busyAreaName}. Stop it there
                first.
              </p>
            ) : externallyActive ? (
              <p className="flex items-start gap-2 text-sm text-(--warn-text)">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  {area.name} is syncing with {externalOwner}. Starting here
                  takes over the stream.
                </span>
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-background/60 p-4 backdrop-blur-sm">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Monitor className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="font-medium">This PC</p>
              <p className="text-xs text-muted-foreground">
                {prefs.automaticDisplay
                  ? "Following the primary display"
                  : `${Math.max(prefs.displayIds.length, 1)} ${prefs.displayIds.length === 1 ? "display" : "displays"} selected`}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-foreground/5 p-3 text-muted-foreground">
              <Move3d className="size-5" />
            </div>
            <div>
              <p className="font-medium">Light placement</p>
              <p className="text-sm text-muted-foreground">
                Colors showing on the wrong side? Adjust where each light sits
                and test the result on the real lights.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() =>
              void navigate({
                to: "/settings/entertainment-placement/$areaId",
                params: { areaId },
                search: { from: "pc" },
              })
            }
          >
            Adjust placement
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sync style</CardTitle>
          <CardDescription>
            Choose how the lights interpret your content.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {modeOptions.map(({ mode, label, description, icon: Icon }) => {
            const selected = prefs.mode === mode;
            return (
              <button
                key={mode}
                type="button"
                disabled={busy}
                aria-pressed={selected}
                onClick={() =>
                  void applyPreference({ mode }, { restart: true })
                }
                className={cn(
                  "rounded-2xl border p-4 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50",
                  selected && "border-primary bg-primary/8 ring-1 ring-primary",
                )}
              >
                <span
                  className={cn(
                    "mb-4 flex size-10 items-center justify-center rounded-xl",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted",
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <span className="block font-medium">{label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {description}
                </span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Intensity</CardTitle>
          <CardDescription>
            How quickly and dramatically colors change. Applies immediately,
            even while syncing.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {intensityOptions.map(({ intensity, label, description }) => {
            const selected = prefs.intensity === intensity;
            return (
              <button
                key={intensity}
                type="button"
                disabled={busy}
                aria-pressed={selected}
                onClick={() =>
                  void applyPreference({ intensity }, { live: { intensity } })
                }
                className={cn(
                  "rounded-2xl border p-4 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50",
                  selected && "border-primary bg-primary/8 ring-1 ring-primary",
                )}
              >
                <span className="block font-medium">{label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {description}
                </span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Light response</CardTitle>
          <CardDescription>
            Fine-tune the effect for the selected mode.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-3">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 font-medium">
                  <Lightbulb className="size-4" /> Effect brightness
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Caps how bright the synced lights get.
                </p>
              </div>
              <span className="rounded-lg bg-muted px-3 py-1.5 font-mono text-sm">
                {Math.round(prefs.brightness)}%
              </span>
            </div>
            <Slider
              aria-label="Effect brightness"
              min={0}
              max={100}
              step={1}
              value={[Math.round(prefs.brightness)]}
              disabled={busy}
              onValueCommitted={(value) => {
                const brightness = Array.isArray(value) ? value[0] : value;
                void applyPreference({ brightness }, { live: { brightness } });
              }}
            />
          </div>

          {prefs.mode === "video" && (
            <div className="flex items-center justify-between gap-6 border-t border-border pt-5">
              <div>
                <p className="flex items-center gap-2 font-medium">
                  <AudioLines className="size-4" /> Use audio for the effect
                </p>
                <p className="text-sm text-muted-foreground">
                  Emphasize brightness with your PC's sound while watching.
                </p>
              </div>
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
            </div>
          )}

          {prefs.mode === "music" && (
            <>
              <div className="flex items-center justify-between gap-6 border-t border-border pt-5">
                <div>
                  <p className="font-medium">Color palette</p>
                  <p className="text-sm text-muted-foreground">
                    Built-in palettes, or colors from one of your scenes.
                  </p>
                </div>
                <Select
                  value={paletteValue}
                  disabled={busy}
                  onValueChange={(value) => {
                    if (value == null) return;
                    const palette: MusicPaletteChoice = selectValueToPalette(
                      value,
                      musicScenes.find((scene) => `scene:${scene.id}` === value)
                        ?.name,
                    );
                    void applyPreference(
                      { musicPalette: palette },
                      { restart: true },
                    );
                  }}
                >
                  <SelectTrigger
                    aria-label="Music color palette"
                    className="w-56"
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
              </div>
              <div className="flex items-center justify-between gap-6 border-t border-border pt-5">
                <div>
                  <p className="font-medium">Light groups</p>
                  <p className="text-sm text-muted-foreground">
                    How many frequency bands spread across the area.
                  </p>
                </div>
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
                    className="w-56"
                  >
                    <SelectValue>
                      {() =>
                        channelCounts.find(
                          (option) => option.value === prefs.musicChannelCount,
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
              </div>
            </>
          )}
        </CardContent>
      </Card>

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
