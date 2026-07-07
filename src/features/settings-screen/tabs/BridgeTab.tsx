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
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { BridgeListItem } from "@/context/HueContext";
import { cn } from "@/lib/utils";
import type { HueSettingsBridge } from "@/types/hue";
import {
  ArrowLeftRight,
  Check,
  Copy,
  Eye,
  Loader2,
  Pencil,
  Power,
  Router,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MetaRow, ROW_CLASS } from "../components/MetaRow";
import { Panel } from "../components/Panel";

export const BridgeTab = ({
  bridge,
  connected,
  isLoadingSummary,
  fallbackBridgeId,
  fallbackBridgeIp,
  applicationKey,
  bridges,
  onSwitchBridge,
  onRemoveBridge,
  onRenameBridge,
}: {
  bridge: HueSettingsBridge | undefined;
  connected: boolean;
  isLoadingSummary: boolean;
  fallbackBridgeId: string | null | undefined;
  fallbackBridgeIp: string | null | undefined;
  applicationKey: string | null | undefined;
  bridges: BridgeListItem[];
  onSwitchBridge: (bridgeId: string) => void | Promise<void>;
  onRemoveBridge: (bridgeId: string) => void | Promise<void>;
  onRenameBridge: (name: string) => Promise<string>;
}) => (
  <div className="space-y-10">
    <BridgeHeader
      connected={connected}
      productName={bridge?.productName}
      isLoading={isLoadingSummary}
    />

    <Panel title="Bridges">
      <p className="mb-3 text-sm text-muted-foreground">
        Switch between paired bridges, rename the active one, or pair another.
      </p>
      <div className="flex flex-col gap-1">
        {bridges.map((item) => (
          <BridgeRow
            key={item.bridgeId}
            bridge={item}
            canRemove={bridges.length > 1 || item.active}
            onSwitch={() => void onSwitchBridge(item.bridgeId)}
            onRemove={() => void onRemoveBridge(item.bridgeId)}
            onRename={onRenameBridge}
          />
        ))}
      </div>
    </Panel>

    <Panel title="Bridge Details">
      <div className="grid gap-0.5 text-sm">
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
  </div>
);

/** A stable label for a bridge that hasn't cached its name yet. */
const bridgeItemLabel = (bridge: BridgeListItem) =>
  bridge.name ?? `Bridge ${bridge.bridgeId.slice(-4).toUpperCase()}`;

/**
 * One row in the Bridges panel. The active bridge can be renamed inline (the
 * name is written to the bridge itself); others show a Switch action. Every
 * bridge can be removed, with a confirmation.
 */
const BridgeRow = ({
  bridge,
  canRemove,
  onSwitch,
  onRemove,
  onRename,
}: {
  bridge: BridgeListItem;
  canRemove: boolean;
  onSwitch: () => void;
  onRemove: () => void;
  onRename: (name: string) => Promise<string>;
}) => {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(bridge.name ?? "");
  const [busy, setBusy] = useState(false);

  const startRename = () => {
    setDraft(bridge.name ?? "");
    setRenaming(true);
  };

  const commitRename = async () => {
    const next = draft.trim();
    if (!next || next === bridge.name) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    try {
      await onRename(next);
      setRenaming(false);
    } catch (error) {
      toast.error(String(error) || "Couldn't rename the bridge.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          bridge.active
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Router size={18} />
      </span>

      <div className="min-w-0 flex-1">
        {renaming ? (
          <Input
            autoFocus
            value={draft}
            maxLength={32}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) => event.target.select()}
            onKeyDown={(event) => {
              if (event.key === "Enter") void commitRename();
              if (event.key === "Escape") setRenaming(false);
            }}
            aria-label="Bridge name"
            className="h-8"
          />
        ) : (
          <>
            <p className="truncate font-medium">{bridgeItemLabel(bridge)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {bridge.active ? "Active" : bridge.bridgeIp}
            </p>
          </>
        )}
      </div>

      {renaming ? (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cancel rename"
            disabled={busy}
            onClick={() => setRenaming(false)}
          >
            <X size={16} />
          </Button>
          <Button
            size="icon"
            aria-label="Save name"
            disabled={busy}
            onClick={() => void commitRename()}
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Check size={16} />
            )}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          {bridge.active ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Rename bridge"
              onClick={startRename}
            >
              <Pencil size={16} />
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={onSwitch}
            >
              <ArrowLeftRight size={15} />
              Switch
            </Button>
          )}
          {canRemove && (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove bridge"
                    className="text-muted-foreground hover:text-(--destructive-text)"
                  />
                }
              >
                <Trash2 size={16} />
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Remove {bridgeItemLabel(bridge)}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the bridge and its credentials (including the
                    application key) from this device. Your lights and scenes on
                    the bridge itself are untouched, but you'll need to pair
                    again to control them from here.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel size="xl">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    size="xl"
                    className="gap-2"
                    onClick={onRemove}
                  >
                    <Power size={18} />
                    Remove bridge
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}
    </div>
  );
};

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
