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
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { HueSettingsBridge } from "@/types/hue";
import {
  Check,
  Copy,
  Eye,
  Loader2,
  Power,
  Router,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Panel } from "../components/Panel";

// Shared styling for the copyable Bridge Details rows. The rows sit in a
// `bg-background` well; on hover they lift to the surrounding card color
// (`bg-card`), which is a notch lighter than the well in both light and dark.
const ROW_CLASS =
  "group flex items-center justify-between gap-10 rounded-lg px-3 py-2 text-left transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70";

export const BridgeTab = ({
  bridge,
  connected,
  isLoadingSummary,
  fallbackBridgeId,
  fallbackBridgeIp,
  applicationKey,
  onResetSession,
}: {
  bridge: HueSettingsBridge | undefined;
  connected: boolean;
  isLoadingSummary: boolean;
  fallbackBridgeId: string | null | undefined;
  fallbackBridgeIp: string | null | undefined;
  applicationKey: string | null | undefined;
  onResetSession: () => void | Promise<void>;
}) => (
  <div className="space-y-10">
    <BridgeHeader
      connected={connected}
      productName={bridge?.productName}
      isLoading={isLoadingSummary}
    />
    <Panel title="Bridge Details">
      <div className="grid gap-0.5 rounded-2xl bg-background p-3 text-sm">
        <MetaRow label="Name" value={bridge?.name} />
        <MetaRow
          label="Bridge ID"
          value={bridge?.bridgeId ?? fallbackBridgeId}
        />
        <MetaRow
          label="IP address"
          value={bridge?.bridgeIp ?? fallbackBridgeIp}
        />
        <MetaRow label="Product" value={bridge?.productName} />
        <MetaRow label="Model ID" value={bridge?.modelId} />
        <MetaRow label="Firmware" value={bridge?.swVersion} />
        <Separator className="my-1" />
        <SecretRow
          label="Application key"
          value={applicationKey}
          saved={bridge?.applicationKeySaved}
        />
      </div>
    </Panel>

    <Panel title="Danger zone">
      <div className="flex items-start gap-3 rounded-2xl bg-destructive/5 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <TriangleAlert size={18} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="space-y-1">
            <p className="font-medium text-destructive">Remove bridge</p>
            <p className="text-sm text-destructive/80">
              Removes the saved bridge and its credentials (including the
              application key) from this device. Your lights and scenes on the
              bridge itself are untouched, but you'll need to pair again to
              control them from here.
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
              Remove bridge
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
                  onClick={() => void onResetSession()}
                >
                  <Power size={18} />
                  Remove bridge
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </Panel>
  </div>
);

const BridgeHeader = ({
  connected,
  productName,
  isLoading,
}: {
  connected: boolean;
  productName: string | null | undefined;
  isLoading: boolean;
}) => (
  <div className="flex items-center gap-3">
    <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
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
);

/**
 * A labelled value in the Bridge Details list. When the value is present the
 * whole row becomes a copy-to-clipboard button: hovering brightens it and
 * reveals a copy glyph (the affordance), and clicking copies the value and
 * flips to a transient "Copied" check. A toast confirms the copy. Rows with no
 * value (shown as "Unknown") stay inert — there's nothing to copy.
 */
const MetaRow = ({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) => {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<number | null>(null);
  const hasValue = value != null && value !== "";

  useEffect(
    () => () => {
      if (resetRef.current) window.clearTimeout(resetRef.current);
    },
    [],
  );

  const copy = async () => {
    if (!hasValue) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (resetRef.current) window.clearTimeout(resetRef.current);
      resetRef.current = window.setTimeout(() => setCopied(false), 1500);
      toast.success(`${label} copied`, { id: "bridge-detail-copy" });
    } catch {
      toast.error("Couldn't copy to clipboard", { id: "bridge-detail-copy" });
    }
  };

  if (!hasValue) {
    return (
      <div className="flex items-center justify-between gap-10 px-3 py-2">
        <dt className="shrink-0 text-muted-foreground">{label}</dt>
        <dd className="flex min-w-0 items-center justify-end gap-2 text-muted-foreground">
          <span className="truncate text-right font-medium">Unknown</span>
          {/* Reserve the copy-glyph slot so every row's value shares one right edge. */}
          <span className="size-3.5 shrink-0" aria-hidden />
        </dd>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`Copy ${label}`}
      className={ROW_CLASS}
    >
      <dt className="shrink-0 text-muted-foreground transition-colors group-hover:text-foreground">
        {label}
      </dt>
      <dd className="flex min-w-0 items-center justify-end gap-2">
        <span className="truncate text-right font-medium">{value}</span>
        <span className="relative inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">
          <Check
            size={14}
            className={cn(
              "absolute text-green-500 transition-all",
              copied ? "scale-100 opacity-100" : "scale-50 opacity-0",
            )}
          />
          <Copy
            size={14}
            className={cn(
              "absolute opacity-0 transition-opacity",
              !copied &&
                "group-hover:opacity-100 group-focus-visible:opacity-100",
            )}
          />
        </span>
      </dd>
    </button>
  );
};

/**
 * A bridge-detail row for a sensitive value (e.g. the application key). The
 * value is rendered in full but blurred into an unreadable smear. Hovering does
 * NOT reveal it: the first click unblurs it, and a second click (while revealed)
 * copies it. The reveal lapses back to blurred a short moment after attention
 * leaves the row, so the secret doesn't linger on screen. Copy affordance (hover
 * glyph + toast) mirrors the plain MetaRow above it.
 */
const SecretRow = ({
  label,
  value,
  saved,
}: {
  label: string;
  value: string | null | undefined;
  saved?: boolean;
}) => {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const reblurRef = useRef<number | null>(null);
  const copyResetRef = useRef<number | null>(null);
  const hasValue = value != null && value !== "";

  useEffect(
    () => () => {
      if (reblurRef.current) window.clearTimeout(reblurRef.current);
      if (copyResetRef.current) window.clearTimeout(copyResetRef.current);
    },
    [],
  );

  // Cancel any pending re-blur and reveal the value.
  const reveal = () => {
    if (reblurRef.current) {
      window.clearTimeout(reblurRef.current);
      reblurRef.current = null;
    }
    setRevealed(true);
  };

  // Re-blur the secret a short moment after attention leaves the row.
  const scheduleReblur = () => {
    if (reblurRef.current) window.clearTimeout(reblurRef.current);
    reblurRef.current = window.setTimeout(() => setRevealed(false), 500);
  };

  // First click unblurs; a second click (while revealed) copies.
  const handleClick = () => {
    if (!revealed) {
      reveal();
      return;
    }
    void copy();
  };

  const copy = async () => {
    if (!hasValue) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (copyResetRef.current) window.clearTimeout(copyResetRef.current);
      copyResetRef.current = window.setTimeout(() => setCopied(false), 1500);
      toast.success(`${label} copied`, { id: "bridge-detail-copy" });
    } catch {
      toast.error("Couldn't copy to clipboard", { id: "bridge-detail-copy" });
    }
  };

  // No value available: fall back to the same "saved/unknown" text MetaRow
  // would have shown, with the copy slot reserved for a shared right edge.
  if (!hasValue) {
    return (
      <div className="flex items-center justify-between gap-10 px-3 py-2">
        <dt className="shrink-0 text-muted-foreground">{label}</dt>
        <dd className="flex min-w-0 items-center justify-end gap-2 text-muted-foreground">
          <span className="truncate text-right font-medium">
            {saved ? "Saved on this device" : "Unknown"}
          </span>
          <span className="size-3.5 shrink-0" aria-hidden />
        </dd>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerLeave={scheduleReblur}
      onBlur={scheduleReblur}
      aria-label={revealed ? `Copy ${label}` : `Reveal ${label}`}
      className={cn(ROW_CLASS, "min-h-14")}
    >
      <dt className="shrink-0 text-muted-foreground transition-colors group-hover:text-foreground">
        {label}
      </dt>
      <dd className="flex min-w-0 items-center justify-end gap-2">
        <span
          className={cn(
            "min-w-0 break-all text-right font-mono font-medium transition-[filter] duration-200",
            !revealed && "select-none blur-[5px]",
          )}
        >
          {value}
        </span>
        <span className="relative inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">
          <Check
            size={14}
            className={cn(
              "absolute text-green-500 transition-all",
              copied ? "scale-100 opacity-100" : "scale-50 opacity-0",
            )}
          />
          <Eye
            size={14}
            className={cn(
              "absolute opacity-0 transition-opacity",
              !copied &&
                !revealed &&
                "group-hover:opacity-100 group-focus-visible:opacity-100",
            )}
          />
          <Copy
            size={14}
            className={cn(
              "absolute opacity-0 transition-opacity",
              !copied &&
                revealed &&
                "group-hover:opacity-100 group-focus-visible:opacity-100",
            )}
          />
        </span>
      </dd>
    </button>
  );
};
