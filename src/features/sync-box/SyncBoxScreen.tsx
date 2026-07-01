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
import { useSyncBoxStore } from "@/stores/SyncBoxStore";
import type {
  SyncBoxHdmiSource,
  SyncBoxIntensity,
  SyncBoxMode,
  SyncBoxSession,
} from "@/types/sync-box";
import { invoke } from "@tauri-apps/api/core";
import { Cable, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { SyncBoxOnboardingWizard } from "./SyncBoxOnboardingWizard";
import { useSyncBoxPolling } from "./hooks/useSyncBoxPolling";

// The Sync Box reports HDMI specs as a raw string like "3840 x 2160 @ 60000 - HDR",
// where the framerate is in fpks (thousandths of a frame per second). Convert it to
// a readable "60 fps" instead of showing the raw 60000.
const formatContentSpecs = (specs: string): string =>
  specs.replace(
    /@\s*(\d+)/,
    (_match, fpks: string) => `@ ${Number((Number(fpks) / 1000).toFixed(3))} fps`,
  );

export const SyncBoxScreen = () => {
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

  if (!session?.connected) {
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
      onReset={() => {
        void invoke("reset-sync-box-session").then(() =>
          setSession({
            configured: false,
            connected: false,
            syncBox: null,
            error: null,
          }),
        );
      }}
    />
  );
};

export const SyncBoxConnectedView = ({
  session,
  onReset,
}: {
  session: SyncBoxSession;
  onReset: () => void;
}) => {
  const syncBox = session.syncBox;
  const { state, error, isLoading, isUpdating, updateExecution, clear } =
    useSyncBoxStore();
  useSyncBoxPolling();

  if (isLoading && !state) {
    return (
      <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
        {error ?? "Unable to read Sync Box state."}
      </div>
    );
  }

  const execution = state.execution;
  const hueConnected = state.hue.connectionState === "connected";
  const currentIntensity =
    execution.mode === "video" ||
    execution.mode === "game" ||
    execution.mode === "music"
      ? state.execution[execution.mode]?.intensity
      : null;
  const sources = ["input1", "input2", "input3", "input4"] as const;

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4">
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
      <Card>
        <CardHeader>
          <CardTitle>{syncBox?.name ?? state.device.name}</CardTitle>
          <CardDescription>
            {state.hdmi.contentSpecs
              ? formatContentSpecs(state.hdmi.contentSpecs)
              : "No HDMI signal details"}{" "}
            ·{" "}
            {state.hue.connectionState}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <ControlRow label="Power">
            <Switch
              size="lg"
              checked={execution.hdmiActive}
              disabled={isUpdating}
              onCheckedChange={(checked) =>
                void updateExecution({ hdmiActive: checked })
              }
            />
          </ControlRow>
          <ControlRow label="Light sync">
            <Switch
              size="lg"
              checked={execution.syncActive}
              disabled={isUpdating || !hueConnected || !execution.hdmiActive}
              onCheckedChange={(checked) =>
                void updateExecution({ syncActive: checked })
              }
            />
          </ControlRow>
          {!hueConnected && (
            <p className="text-sm text-muted-foreground">
              Connect the Sync Box to its Hue Bridge before starting light sync.
            </p>
          )}
          <ControlRow label="HDMI source">
            <Select
              value={execution.hdmiSource}
              disabled={isUpdating}
              onValueChange={(value) =>
                void updateExecution({ hdmiSource: value as SyncBoxHdmiSource })
              }
            >
              <SelectTrigger className="w-52">
                <SelectValue>
                  {(value: string) =>
                    state.hdmi[value as SyncBoxHdmiSource]?.name ?? value
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {sources.map((source) => (
                  <SelectItem key={source} value={source}>
                    {state.hdmi[source].name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ControlRow>
          <ControlRow label="Mode">
            <div className="flex flex-wrap gap-2">
              {(["video", "game", "music", "ambient"] as SyncBoxMode[]).map(
                (mode) => (
                  <Button
                    key={mode}
                    variant={execution.mode === mode ? "default" : "outline"}
                    disabled={isUpdating || !hueConnected}
                    onClick={() => void updateExecution({ mode })}
                    className="capitalize"
                  >
                    {mode}
                  </Button>
                ),
              )}
            </div>
          </ControlRow>
          <ControlRow label={`Brightness (${execution.brightness})`}>
            <Slider
              min={0}
              max={200}
              step={1}
              value={[execution.brightness]}
              disabled={isUpdating}
              onValueCommitted={(value) =>
                void updateExecution({
                  brightness: Array.isArray(value) ? value[0] : value,
                })
              }
              className="w-64"
            />
          </ControlRow>
          {execution.syncActive && currentIntensity && (
            <ControlRow label="Intensity">
              <Select
                value={currentIntensity}
                disabled={isUpdating}
                onValueChange={(value) =>
                  void updateExecution({
                    intensity: value as SyncBoxIntensity,
                  })
                }
              >
                <SelectTrigger className="w-52">
                  <SelectValue>
                    {(value: string) => (
                      <span className="capitalize">{value}</span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(["subtle", "moderate", "high", "intense"] as const).map(
                    (intensity) => (
                      <SelectItem key={intensity} value={intensity}>
                        <span className="capitalize">{intensity}</span>
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </ControlRow>
          )}
          <ControlRow label="Entertainment area">
            <Select
              value={execution.hueTarget ?? ""}
              disabled={isUpdating || !hueConnected}
              onValueChange={(value) =>
                value && void updateExecution({ hueTarget: value })
              }
            >
              <SelectTrigger className="w-52">
                <SelectValue>
                  {(value: string) => {
                    const group = value ? state.hue.groups[value] : undefined;
                    return group
                      ? `${group.name} (${group.numLights})`
                      : "Select area";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(state.hue.groups)
                  // The backend returns groups from an unordered map, so sort by
                  // name to keep the list stable across polls (otherwise items
                  // shuffle every refresh).
                  .sort(([, a], [, b]) => a.name.localeCompare(b.name))
                  .map(([id, group]) => (
                    <SelectItem key={id} value={id}>
                      {group.name} ({group.numLights})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </ControlRow>
          <div className="flex items-center justify-between border-t border-border pt-5">
            <span className="text-sm text-muted-foreground">
              {state.hdmi.videoSyncSupported ? "Video sync supported" : "Video sync unavailable"} ·{" "}
              {state.hdmi.audioSyncSupported ? "Audio sync supported" : "Audio sync unavailable"}
            </span>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                clear();
                onReset();
              }}
            >
              <Cable size={16} />
              Set up another
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const ControlRow = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex min-h-11 items-center justify-between gap-6">
    <span className="font-medium">{label}</span>
    {children}
  </div>
);
