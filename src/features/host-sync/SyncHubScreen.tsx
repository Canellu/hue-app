import { SyncIndicator } from "@/components/SyncIndicator";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useEntertainmentStore } from "@/stores/EntertainmentStore";
import { useSyncBoxStore } from "@/stores/SyncBoxStore";
import { useNavigate } from "@tanstack/react-router";
import { LampDesk, Loader2, MonitorPlay } from "lucide-react";

/** One area picker shared by every entertainment sync source. */
export const SyncHubScreen = () => {
  const navigate = useNavigate();
  const areas = useEntertainmentStore((store) => store.areas);
  const hasLoaded = useEntertainmentStore((store) => store.hasLoaded);
  const pcStatus = useEntertainmentStore((store) => store.pcStatus);
  const loadAreas = useEntertainmentStore((store) => store.load);
  const boxState = useSyncBoxStore((store) => store.state);

  if (!hasLoaded) {
    return (
      <div
        role="status"
        aria-label="Loading entertainment areas"
        className="flex min-h-64 items-center justify-center"
      >
        <Loader2
          aria-hidden
          className="size-8 animate-spin text-muted-foreground"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 pb-8">
      <div>
        <h2 className="font-heading text-2xl font-semibold">
          Entertainment areas
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose an area, then decide whether this PC or the HDMI Sync Box
          drives its lights.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((area) => {
          const active = area.status === "active";
          const ownedByPc =
            pcStatus.areaId === area.id &&
            (pcStatus.state === "running" || pcStatus.state === "starting");
          const boxGroup = boxState
            ? Object.entries(boxState.hue.groups).find(
                ([id, group]) =>
                  (id === area.id ||
                    group.name.trim().toLocaleLowerCase() ===
                      area.name.trim().toLocaleLowerCase()) &&
                  boxState.execution.syncActive &&
                  boxState.execution.hueTarget === id,
              )
            : undefined;
          const externalOwner = boxState
            ? Object.values(boxState.hue.groups).find(
                (group) =>
                  group.active &&
                  group.name.trim().toLocaleLowerCase() ===
                    area.name.trim().toLocaleLowerCase(),
              )?.owner
            : undefined;
          const owner = ownedByPc
            ? "this PC"
            : boxGroup
              ? "the Sync Box"
              : (externalOwner ?? "another app");

          return (
            <Card
              key={area.id}
              size="sm"
              role="button"
              tabIndex={0}
              onClick={() =>
                void navigate({
                  to: "/sync/$areaId",
                  params: { areaId: area.id },
                })
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void navigate({
                    to: "/sync/$areaId",
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
                  <MonitorPlay size={26} strokeWidth={2.5} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium">{area.name}</p>
                  <p
                    className={cn(
                      "truncate text-sm",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {active
                      ? `Syncing with ${owner}`
                      : `${area.lightIds.length} ${
                          area.lightIds.length === 1 ? "light" : "lights"
                        }`}
                  </p>
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
              Create an entertainment area to choose its lights and placement.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <Button
                onClick={() =>
                  void navigate({
                    to: "/settings/entertainment-wizard",
                    search: { from: "sync" },
                  })
                }
              >
                Create area
              </Button>
              <Button variant="outline" onClick={() => void loadAreas()}>
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
