import { SyncIndicator } from "@/components/SyncIndicator";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SyncBoxScreen } from "@/features/sync-box/SyncBoxScreen";
import { cn } from "@/lib/utils";
import { useEntertainmentStore } from "@/stores/EntertainmentStore";
import { useNavigate } from "@tanstack/react-router";
import { LampDesk, Loader2, Monitor, Tv, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { EnablePcSyncCard } from "./EnablePcSyncCard";
import { useHostSync } from "./useHostSync";

const SOURCE_STORAGE_KEY = "hue-sync-hub-source";

type SyncSource = "pc" | "box";

const storedSource = (): SyncSource =>
  localStorage.getItem(SOURCE_STORAGE_KEY) === "box" ? "box" : "pc";

/**
 * Unified sync hub: light sync driven by this PC or by the HDMI Sync Box,
 * with the last used source persisted.
 */
export const SyncHubScreen = () => {
  const [source, setSource] = useState<SyncSource>(storedSource);

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 pb-8">
      <Tabs
        value={source}
        onValueChange={(value) => {
          const next = value === "box" ? "box" : "pc";
          setSource(next);
          localStorage.setItem(SOURCE_STORAGE_KEY, next);
        }}
      >
        <TabsList size="xl" className="justify-self-center">
          <TabsTrigger value="pc">
            <Monitor data-icon="inline-start" />
            This PC
          </TabsTrigger>
          <TabsTrigger value="box">
            <Tv data-icon="inline-start" />
            Sync Box
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {source === "pc" ? <PcSyncHub /> : <SyncBoxScreen />}
    </div>
  );
};

/** Entertainment-area picker for PC-driven sync. */
const PcSyncHub = () => {
  const navigate = useNavigate();
  const {
    overview,
    status,
    isLoading,
    isUpdating,
    loadError,
    actionError,
    refresh,
    provisionCredentials,
  } = useHostSync();
  const liveAreas = useEntertainmentStore((store) => store.areas);

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading PC sync"
        className="flex min-h-64 items-center justify-center"
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
        className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive"
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
      <Card className="mx-auto w-full max-w-xl border-dashed">
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

  if (!overview.bridgeConfigured) {
    return (
      <Card className="mx-auto w-full max-w-xl border-dashed">
        <CardContent className="flex min-h-56 flex-col items-center justify-center text-center">
          <TriangleAlert className="mb-4 size-8 text-muted-foreground" />
          <p className="font-medium">No Hue Bridge connected</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Pair the app with your Hue Bridge before starting PC light sync.
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

  const areas = overview.areas.map((area) => {
    const live = liveAreas.find((candidate) => candidate.id === area.id);
    return { ...area, status: live?.status ?? area.status };
  });

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="font-heading text-2xl font-semibold">
          Entertainment areas
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose an area to sync with this PC's screen or audio.
        </p>
      </div>
      {overview.areasError && (
        <div
          role="alert"
          className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive"
        >
          {overview.areasError}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((area) => {
          const syncedByPc =
            status.areaId === area.id &&
            (status.state === "running" || status.state === "starting");
          const active = area.status === "active";
          return (
            <Card
              key={area.id}
              size="sm"
              role="button"
              tabIndex={0}
              onClick={() =>
                void navigate({
                  to: "/sync/pc/$areaId",
                  params: { areaId: area.id },
                })
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void navigate({
                    to: "/sync/pc/$areaId",
                    params: { areaId: area.id },
                  });
                }
              }}
              className="cursor-pointer justify-center gap-4 border border-tile-border bg-tile-off transition-colors hover:bg-accent"
            >
              <div className="flex items-center gap-4 px-(--card-spacing)">
                <span
                  className={cn(
                    "flex size-12 shrink-0 items-center justify-center",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <Monitor size={26} strokeWidth={2.5} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium">{area.name}</p>
                  {active ? (
                    <p
                      className={cn(
                        "truncate text-sm",
                        syncedByPc ? "text-primary" : "text-(--warn-text)",
                      )}
                    >
                      {syncedByPc
                        ? "Syncing with this PC"
                        : "Syncing with another app"}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {area.lightIds.length}{" "}
                      {area.lightIds.length === 1 ? "light" : "lights"}
                    </p>
                  )}
                </div>
                {active && (
                  <SyncIndicator
                    syncedCount={area.lightIds.length}
                    totalCount={area.lightIds.length}
                  />
                )}
              </div>
            </Card>
          );
        })}
      </div>
      {areas.length === 0 && (
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
              onClick={() => void refresh()}
            >
              Refresh
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
