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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StoredSyncBoxInfo } from "@/types/sync-box";
import { Cable, Loader2, Power, Tv, TriangleAlert } from "lucide-react";
import { MetaRow } from "../components/MetaRow";
import { Panel } from "../components/Panel";

export const SyncBoxTab = ({
  syncBox,
  configured,
  connected,
  isLoadingSession,
  onSetUp,
  onResetSession,
}: {
  syncBox: StoredSyncBoxInfo | null | undefined;
  configured: boolean;
  connected: boolean;
  isLoadingSession: boolean;
  onSetUp: () => void;
  onResetSession: () => void | Promise<void>;
}) => {
  // Nothing paired yet: mirror the Sync Box screen's empty state with a prompt
  // to run the onboarding wizard instead of an all-"Unknown" details table.
  if (!configured && !isLoadingSession) {
    return (
      <div className="space-y-10">
        <SyncBoxHeader
          connected={connected}
          name={syncBox?.name}
          isLoading={isLoadingSession}
        />
        <Panel title="Sync Box Details">
          <div className="flex flex-col items-center gap-4 py-7 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Tv size={24} />
            </span>
            <div className="space-y-1">
              <p className="font-medium">No Sync Box connected</p>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                Pair your Hue Play HDMI Sync Box to control entertainment
                lighting from here.
              </p>
            </div>
            <Button className="gap-2" onClick={onSetUp}>
              <Cable size={16} />
              Set up Sync Box
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <SyncBoxHeader
        connected={connected}
        name={syncBox?.name}
        isLoading={isLoadingSession}
      />
      <Panel title="Sync Box Details">
        <div className="grid gap-0.5 text-sm">
          <MetaRow label="Name" value={syncBox?.name} />
          <MetaRow label="Unique ID" value={syncBox?.uniqueId} />
          <MetaRow label="IP address" value={syncBox?.ipAddress} />
          <MetaRow label="Device type" value={syncBox?.deviceType} />
          <MetaRow label="Firmware" value={syncBox?.firmwareVersion} />
          <MetaRow
            label="API level"
            value={
              syncBox?.apiLevel != null ? String(syncBox.apiLevel) : undefined
            }
          />
        </div>
      </Panel>

      <Panel title="Danger zone" contentClassName="bg-(--destructive-surface)">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-(--destructive-soft)">
            <TriangleAlert size={18} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="space-y-1">
              <p className="font-medium text-(--destructive-text)">Remove Sync Box</p>
              <p className="text-sm text-(--destructive-text)">
                Removes the saved Sync Box and its credentials from this device.
                The Sync Box itself is untouched, but you'll need to pair again
                to control it from here.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    variant="destructive"
                    className="self-end gap-2"
                  />
                }
              >
                <Power size={16} />
                Remove Sync Box
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove Sync Box?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the saved Sync Box and credentials from this
                    device. You'll need to pair again to control it.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel size="xl">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    size="xl"
                    className="gap-2"
                    onClick={() => void onResetSession()}
                  >
                    <Power size={18} />
                    Remove Sync Box
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </Panel>
    </div>
  );
};

const SyncBoxHeader = ({
  connected,
  name,
  isLoading,
}: {
  connected: boolean;
  name: string | null | undefined;
  isLoading: boolean;
}) => (
  <div className="flex items-center gap-3">
    <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Tv size={20} />
    </span>
    <div className="min-w-0 flex-1">
      <p className="font-medium">{name ?? "Hue Sync Box"}</p>
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
);
