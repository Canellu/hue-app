import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SyncBoxSession } from "@/types/sync-box";
import { invoke } from "@tauri-apps/api/core";
import { Cable, CircleCheck, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { SyncBoxOnboardingWizard } from "./SyncBoxOnboardingWizard";

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
  return (
    <div className="mx-auto flex min-h-[calc(100vh-12rem)] w-full max-w-3xl items-center justify-center">
      <Card className="w-full">
        <CardContent className="flex flex-col items-center gap-6 py-12 text-center">
          <span className="flex size-20 items-center justify-center rounded-3xl bg-green-500/10 text-green-600">
            <CircleCheck size={40} />
          </span>
          <div className="space-y-2">
            <h1 className="font-heading text-3xl font-semibold">
              {syncBox?.name ?? "Hue Sync Box"}
            </h1>
            <p className="text-muted-foreground">
              Connected at {syncBox?.ipAddress ?? "the local network"}
            </p>
          </div>
          <div className="grid w-full max-w-md gap-2 rounded-2xl bg-background p-4 text-left text-sm">
            <Detail label="Unique ID" value={syncBox?.uniqueId} />
            <Detail label="Firmware" value={syncBox?.firmwareVersion} />
            <Detail label="API level" value={syncBox?.apiLevel.toString()} />
          </div>
          <Button variant="outline" className="gap-2" onClick={onReset}>
            <Cable size={16} />
            Set up another Sync Box
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

const Detail = ({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) => (
  <div className="flex justify-between gap-6">
    <span className="text-muted-foreground">{label}</span>
    <span className="truncate font-medium">{value ?? "Unknown"}</span>
  </div>
);
