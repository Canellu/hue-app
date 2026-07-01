import { PacedSlider } from "@/components/PacedSlider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { roomZoneTileColor } from "@/features/space-screen/utils/color-state";
import {
  activeTileTheme,
  TILE_BRIGHTNESS_SLIDER_CLASS,
  TILE_INTERACTION_TRANSITION_CLASS,
  TILE_POWER_SWITCH_CLASS,
} from "@/lib/tile-theme";
import { UI_EASE_MS } from "@/lib/transitions";
import { cn } from "@/lib/utils";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import { useSyncBoxStore } from "@/stores/SyncBoxStore";
import type { HueLight } from "@/types/hue";
import type { SyncBoxIntensity, SyncBoxMode, SyncBoxSession } from "@/types/sync-box";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "@tanstack/react-router";
import {
  Cable,
  Clapperboard,
  Gamepad2,
  HdmiPort,
  LampDesk,
  Lightbulb,
  Loader2,
  MonitorPlay,
  Music2,
  Pause,
  Play,
  Power,
  TriangleAlert,
  Tv,
} from "lucide-react";
import { useEffect, useState } from "react";
import { SyncBoxOnboardingWizard } from "./SyncBoxOnboardingWizard";
import { useSyncBoxPolling } from "./hooks/useSyncBoxPolling";

const formatContentSpecs = (specs: string): string =>
  specs.replace(
    /@\s*(\d+)/,
    (_match, fpks: string) => `@ ${Number((Number(fpks) / 1000).toFixed(3))} fps`,
  );

const modeOptions: {
  mode: SyncBoxMode;
  label: string;
  description: string;
  icon: typeof Clapperboard;
}[] = [
  { mode: "video", label: "Video", description: "Movies & TV", icon: Clapperboard },
  { mode: "game", label: "Game", description: "Fast reactions", icon: Gamepad2 },
  { mode: "music", label: "Music", description: "Follow the beat", icon: Music2 },
];

const sourceIcons: Record<string, typeof MonitorPlay> = {
  game: Gamepad2,
  xbox: Gamepad2,
  playstation: Gamepad2,
  nintendoswitch: Gamepad2,
  music: Music2,
  desktop: MonitorPlay,
  laptop: MonitorPlay,
};

export const SyncBoxScreen = ({ areaId }: { areaId?: string }) => {
  const [session, setSession] = useState<SyncBoxSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void invoke<SyncBoxSession>("get-sync-box-session")
      .then(setSession)
      .catch((error) => setLoadError(String(error)))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session?.configured || !session.syncBox) {
    return (
      <>
        {(loadError || session?.error) && (
          <div className="mx-auto flex max-w-2xl items-start gap-3 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p>{loadError ?? session?.error}</p>
          </div>
        )}
        <SyncBoxOnboardingWizard onComplete={setSession} />
      </>
    );
  }

  return (
    <SyncBoxConnectedView
      session={session}
      areaId={areaId}
      onReset={() => {
        void invoke("reset-sync-box-session").then(() =>
          setSession({ configured: false, connected: false, syncBox: null, error: null }),
        );
      }}
    />
  );
};

export const SyncBoxConnectedView = ({
  session,
  areaId,
  onReset,
}: {
  session: SyncBoxSession;
  areaId?: string;
  onReset: () => void;
}) => {
  const navigate = useNavigate();
  const lights = useHueResourcesStore((store) => store.lights);
  const hueEventRevision = useHueResourcesStore(
    (store) => store.hueEventRevision,
  );
  const setLightState = useHueResourcesStore((store) => store.setLightState);
  const syncBox = session.syncBox;
  const {
    state,
    error,
    isLoading,
    isUpdating,
    areaLightIds,
    refresh,
    loadAreaLights,
    updateExecution,
    clear,
  } = useSyncBoxStore();
  useSyncBoxPolling();
  const hasState = state !== null;

  useEffect(() => {
    if (hasState) void loadAreaLights();
  }, [hasState, loadAreaLights]);

  if (isLoading && !state) {
    return (
      <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
        <span>{error ?? session.error ?? "Unable to read Sync Box state."}</span>
        <Button variant="outline" disabled={isLoading} onClick={() => void refresh()}>
          {isLoading && <Loader2 className="animate-spin" />}
          Retry
        </Button>
      </div>
    );
  }

  const execution = state.execution;
  const hueConnected =
    state.hue.connectionState === "connected" ||
    state.hue.connectionState === "streaming";
  const currentIntensity =
    execution.mode === "video" ||
    execution.mode === "game" ||
    execution.mode === "music"
      ? state.execution[execution.mode]?.intensity
      : null;
  const sources = ["input1", "input2", "input3", "input4"] as const;
  const groups = Object.entries(state.hue.groups).sort(([, a], [, b]) =>
    a.name.localeCompare(b.name),
  );
  const selectedGroup = areaId
    ? state.hue.groups[areaId]
    : execution.hueTarget
      ? state.hue.groups[execution.hueTarget]
      : undefined;
  const brightnessPercent = Math.round(execution.brightness / 2);

  if (!areaId) {
    return (
      <div className="mx-auto grid w-full max-w-5xl gap-6 pb-8">
        {error && (
          <div className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}
        <div>
          <h2 className="font-heading text-2xl font-semibold">
            Entertainment areas
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose an area to configure and start light sync.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map(([id, group]) => {
            const memberIds = new Set(areaLightIds[id] ?? []);
            const members = lights.filter((light) => memberIds.has(light.id));
            const onMembers = members.filter((light) => light.isOn);
            const anyOn = onMembers.length > 0;
            const brightness =
              onMembers.length > 0
                ? onMembers.reduce(
                    (total, light) => total + (light.brightness ?? 0),
                    0,
                  ) / onMembers.length
                : 0;
            const tile = roomZoneTileColor(members);
            const controlsDisabled =
              isUpdating || !hueConnected || members.length === 0;
            return (
              <Card
                key={id}
                size="sm"
                role="button"
                tabIndex={0}
                onClick={() =>
                  void navigate({
                    to: "/sync/$areaId",
                    params: { areaId: id },
                  })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    void navigate({
                      to: "/sync/$areaId",
                      params: { areaId: id },
                    });
                  }
                }}
                className={cn(
                  "justify-center gap-6 border border-tile-border bg-tile-off",
                  TILE_INTERACTION_TRANSITION_CLASS,
                  "cursor-pointer",
                  tile.active && "ring-transparent",
                )}
                style={
                  {
                    "--tile-ease": `${UI_EASE_MS.tileBackground}ms`,
                    ...(tile.active && tile.background
                      ? activeTileTheme(
                          tile.background,
                          tile.glow ?? tile.background,
                          brightness,
                        )
                      : null),
                  } as React.CSSProperties
                }
              >
                <div className="flex items-center gap-4 px-(--card-spacing)">
                  <span
                    className={cn(
                      "flex size-12 shrink-0 items-center justify-center",
                      tile.active
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <Tv size={26} strokeWidth={2.5} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium">{group.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {group.numLights} {group.numLights === 1 ? "light" : "lights"}
                    </p>
                  </div>
                  <div onClick={(event) => event.stopPropagation()}>
                    <Switch
                      size="xl"
                      className={TILE_POWER_SWITCH_CLASS}
                      checked={anyOn}
                      disabled={controlsDisabled}
                      aria-label={`Toggle ${group.name} lights`}
                      onCheckedChange={(checked) => {
                        members.forEach((light) =>
                          setLightState(light, checked, null),
                        );
                      }}
                    />
                  </div>
                </div>
                <div
                  className="px-(--card-spacing)"
                  onClick={(event) => event.stopPropagation()}
                >
                  <PacedSlider
                    value={anyOn ? Math.max(1, brightness) : 1}
                    min={1}
                    disabled={controlsDisabled}
                    ariaLabel={`${group.name} light brightness`}
                    className={cn(
                      TILE_BRIGHTNESS_SLIDER_CLASS,
                      !anyOn && "tile-brightness-slider-off",
                    )}
                    size="default"
                    isGroup
                    animateKey={hueEventRevision}
                    onCommit={(value, phase) => {
                      members.forEach((light: HueLight) =>
                        setLightState(
                          light,
                          value > 0,
                          value,
                          phase,
                        ),
                      );
                    }}
                  />
                </div>
              </Card>
            );
          })}
        </div>
        {groups.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex min-h-48 flex-col items-center justify-center text-center">
              <LampDesk className="mb-4 size-8 text-muted-foreground" />
              <p className="font-medium">No entertainment areas found</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Create an entertainment area in the Philips Hue app, then refresh.
              </p>
              <Button
                variant="outline"
                className="mt-5"
                disabled={isLoading}
                onClick={() => void refresh()}
              >
                {isLoading && <Loader2 className="animate-spin" />}
                Refresh
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (!state.hue.groups[areaId]) {
    return (
      <Card className="mx-auto max-w-xl border-dashed">
        <CardContent className="flex min-h-56 flex-col items-center justify-center text-center">
          <TriangleAlert className="mb-4 size-8 text-muted-foreground" />
          <p className="font-medium">Entertainment area not found</p>
          <Button
            variant="outline"
            className="mt-5"
            onClick={() => void navigate({ to: "/sync" })}
          >
            Back to entertainment areas
          </Button>
        </CardContent>
      </Card>
    );
  }

  const toggleSync = async () => {
    if (execution.syncActive) {
      await updateExecution({ syncActive: false });
      return;
    }
    if (areaId && execution.hueTarget !== areaId) {
      await updateExecution({ hueTarget: areaId });
    }
    if (!execution.hdmiActive) await updateExecution({ hdmiActive: true });
    await updateExecution({ syncActive: true });
  };

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-5 pb-8">
      {(state.device.overheating || state.device.undervolt) && (
        <div className="flex items-start gap-3 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            {state.device.overheating
              ? "The Sync Box is overheating. Turn it off and check its ventilation."
              : "The Sync Box reports insufficient power. Check its power supply."}
          </p>
        </div>
      )}
      {error && (
        <div className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card className="overflow-hidden border-0 bg-gradient-to-br from-primary/15 via-card to-card shadow-sm">
        <CardContent className="grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <span className={cn("size-2 rounded-full", execution.syncActive ? "bg-primary animate-pulse" : "bg-muted-foreground/40")} />
              {execution.syncActive ? "Lights are syncing" : "Ready to sync"}
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {syncBox?.name ?? state.device.name}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {state.hdmi.contentSpecs
                  ? formatContentSpecs(state.hdmi.contentSpecs)
                  : "Waiting for an HDMI signal"}
                {selectedGroup ? ` · ${selectedGroup.name}` : ""}
              </p>
            </div>
            <Button
              size="lg"
              className="min-w-44 gap-2 rounded-full"
              variant={execution.syncActive ? "secondary" : "default"}
              disabled={
                isUpdating ||
                (!execution.syncActive && (!hueConnected || !areaId))
              }
              onClick={() => void toggleSync()}
            >
              {isUpdating ? (
                <Loader2 className="animate-spin" />
              ) : execution.syncActive ? (
                <Pause />
              ) : (
                <Play className="fill-current" />
              )}
              {execution.syncActive ? "Stop light sync" : "Start light sync"}
            </Button>
            {!hueConnected && (
              <p className="text-sm text-destructive">
                Connect the Sync Box to its Hue Bridge to start syncing.
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-background/60 p-4 backdrop-blur-sm">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Power className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="font-medium">Picture and sound to TV</p>
              <p className="text-xs text-muted-foreground">
                HDMI passthrough {execution.hdmiActive ? "is on" : "is off"}
              </p>
            </div>
            <Switch
              size="lg"
              aria-label="Send HDMI picture and sound to the TV"
              checked={execution.hdmiActive}
              disabled={isUpdating}
              onCheckedChange={(checked) => void updateExecution({ hdmiActive: checked })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Choose a source</CardTitle>
          <CardDescription>Select the device whose picture and sound should drive the lights.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {sources.map((source) => {
            const input = state.hdmi[source];
            const selected = execution.hdmiSource === source;
            const SourceIcon = sourceIcons[input.type ?? ""] ?? HdmiPort;
            return (
              <button
                key={source}
                type="button"
                disabled={isUpdating}
                onClick={() => void updateExecution({ hdmiSource: source })}
                className={cn(
                  "group rounded-2xl border p-4 text-left transition-colors hover:bg-accent disabled:opacity-50",
                  selected && "border-primary bg-primary/8 ring-1 ring-primary",
                )}
              >
                <SourceIcon className={cn("mb-4 size-6", selected ? "text-primary" : "text-muted-foreground")} />
                <span className="block truncate font-medium">{input.name}</span>
                <span className="mt-1 block text-xs capitalize text-muted-foreground">
                  {input.status ?? `HDMI ${source.slice(-1)}`}
                </span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sync style</CardTitle>
          <CardDescription>
            Choose how the lights interpret your content. Start light sync first to change mode.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {modeOptions.map(({ mode, label, description, icon: Icon }) => {
            const selected = execution.mode === mode;
            return (
              <button
                key={mode}
                type="button"
                disabled={isUpdating || !hueConnected || !execution.syncActive}
                onClick={() => void updateExecution({ mode })}
                className={cn(
                  "rounded-2xl border p-4 text-left transition-colors hover:bg-accent disabled:opacity-50",
                  selected && "border-primary bg-primary/8 ring-1 ring-primary",
                )}
              >
                <span className={cn("mb-4 flex size-10 items-center justify-center rounded-xl", selected ? "bg-primary text-primary-foreground" : "bg-muted")}>
                  <Icon className="size-5" />
                </span>
                <span className="block font-medium">{label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Light response</CardTitle>
          <CardDescription>Fine-tune how strongly the entertainment lights react.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-3">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 font-medium">
                  <Lightbulb className="size-4" /> Effect brightness
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  50% is neutral; higher values boost the light effect.
                </p>
              </div>
              <span className="rounded-lg bg-muted px-3 py-1.5 font-mono text-sm">
                {brightnessPercent}%
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[brightnessPercent]}
              disabled={isUpdating}
              onValueCommitted={(value) =>
                void updateExecution({
                  brightness: (Array.isArray(value) ? value[0] : value) * 2,
                })
              }
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Dimmer · 0%</span>
              <span>Neutral · 50%</span>
              <span>Boost · 100%</span>
            </div>
          </div>
          {currentIntensity && (
            <div className="flex items-center justify-between gap-6 border-t border-border pt-5">
              <div>
                <p className="font-medium">Intensity</p>
                <p className="text-sm text-muted-foreground">How quickly and dramatically colors change.</p>
              </div>
              <Select
                value={currentIntensity}
                disabled={isUpdating}
                onValueChange={(value) => void updateExecution({ intensity: value as SyncBoxIntensity })}
              >
                <SelectTrigger className="w-40">
                  <SelectValue>{(value: string) => <span className="capitalize">{value}</span>}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(["subtle", "moderate", "high", "intense"] as const).map((intensity) => (
                    <SelectItem key={intensity} value={intensity}>
                      <span className="capitalize">{intensity}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-4 px-1">
        <span className="text-sm text-muted-foreground">
          {state.hdmi.videoSyncSupported ? "Video ready" : "Video sync unavailable"} ·{" "}
          {state.hdmi.audioSyncSupported ? "Audio ready" : "Audio sync unavailable"}
        </span>
        <Button
          variant="ghost"
          className="gap-2"
          onClick={() => {
            clear();
            onReset();
          }}
        >
          <Cable size={16} />
          Set up another Sync Box
        </Button>
      </div>
    </div>
  );
};
