import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Loader2, Pause, Play } from "lucide-react";

type IconComponent = React.ComponentType<{
  size?: number;
  className?: string;
}>;

/**
 * Banner card heading a sync surface: identity and live status on the left,
 * the primary controls on the right, with optional notice and extra rows
 * (e.g. a source picker) spanning the full width below.
 */
export const SyncHero = ({
  icon: Icon,
  title,
  active,
  statusLabel,
  meta,
  aside,
  notice,
  children,
}: {
  icon: IconComponent;
  title: string;
  /** Whether sync is running here — drives the pulsing status dot. */
  active: boolean;
  statusLabel: string;
  meta?: string;
  /** Right-hand control cluster: chips and the start/stop button. */
  aside?: React.ReactNode;
  /** Full-width note under the controls (conflicts, connection problems). */
  notice?: React.ReactNode;
  children?: React.ReactNode;
}) => (
  <Card className="overflow-hidden border-0 bg-linear-to-br from-primary/15 via-card to-card shadow-sm">
    <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <div className="flex min-w-0 flex-1 basis-64 items-center gap-4">
        <span className="flex size-13 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <Icon className="size-6" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-heading text-xl font-semibold tracking-tight">
            {title}
          </h1>
          <p
            role="status"
            className="mt-1 flex min-w-0 items-center gap-2 text-sm text-muted-foreground"
          >
            <span
              aria-hidden
              className={cn(
                "size-2 shrink-0 rounded-full",
                active ? "animate-pulse bg-primary" : "bg-muted-foreground/40",
              )}
            />
            <span className="truncate">
              <span className={cn(active && "font-medium text-primary")}>
                {statusLabel}
              </span>
              {meta ? ` · ${meta}` : null}
            </span>
          </p>
        </div>
      </div>
      {aside && (
        <div className="flex flex-wrap items-center gap-3">{aside}</div>
      )}
      {notice && <div className="min-w-0 basis-full">{notice}</div>}
      {children && (
        <div className="min-w-0 basis-full border-t border-foreground/8 pt-4">
          {children}
        </div>
      )}
    </CardContent>
  </Card>
);

/** The one primary action on a sync surface: start or stop light sync. */
export const SyncToggleButton = ({
  active,
  busy,
  disabled,
  onClick,
}: {
  active: boolean;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <Button
    size="xl"
    variant={active ? "secondary" : "default"}
    className="min-w-44 gap-2 rounded-full"
    disabled={disabled}
    onClick={onClick}
  >
    {busy ? (
      <Loader2 className="animate-spin" />
    ) : active ? (
      <Pause />
    ) : (
      <Play className="fill-current" />
    )}
    {active ? "Stop light sync" : "Start light sync"}
  </Button>
);

/** Compact pill in the hero for a secondary status or control (power, capture). */
export const SyncHeroChip = ({
  icon: Icon,
  label,
  caption,
  control,
}: {
  icon: IconComponent;
  label: string;
  caption: string;
  control?: React.ReactNode;
}) => (
  <div className="flex items-center gap-3 rounded-full bg-background/60 py-2 pl-2.5 pr-4 backdrop-blur-sm">
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Icon className="size-4.5" />
    </span>
    <div className="min-w-0">
      <p className="text-sm font-medium leading-tight">{label}</p>
      <p className="mt-0.5 text-xs leading-tight text-muted-foreground">
        {caption}
      </p>
    </div>
    {control}
  </div>
);

/** Selectable tile for a mutually exclusive choice (source, sync style). */
export const OptionTile = ({
  icon: Icon,
  label,
  caption,
  selected,
  disabled,
  vertical = false,
  onSelect,
}: {
  icon?: IconComponent;
  label: string;
  caption?: React.ReactNode;
  selected: boolean;
  disabled?: boolean;
  /** Icon above the text — reads square-ish; default puts the icon inline. */
  vertical?: boolean;
  onSelect: () => void;
}) => (
  <button
    type="button"
    aria-pressed={selected}
    disabled={disabled}
    onClick={onSelect}
    className={cn(
      "flex min-w-0 items-center gap-3 rounded-xl border border-foreground/8 bg-foreground/3 p-3 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
      vertical && "flex-col items-start gap-2.5",
      selected && "border-primary bg-primary/8 ring-1 ring-primary",
    )}
  >
    {Icon && (
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
          selected
            ? "bg-primary text-primary-foreground"
            : "bg-foreground/6 text-muted-foreground",
        )}
      >
        <Icon className="size-4.5" />
      </span>
    )}
    <span className="min-w-0 max-w-full flex-1">
      <span className="block truncate text-sm font-medium">{label}</span>
      {caption && (
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {caption}
        </span>
      )}
    </span>
  </button>
);

/** Text-only segmented pill for short enumerated settings (intensity). */
export function SegmentedOptions<T extends string>({
  value,
  onValueChange,
  options,
  disabled,
  ariaLabel,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex rounded-full bg-foreground/6 p-1 dark:bg-muted"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "h-8 rounded-full border border-transparent px-3.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
              selected &&
                "border-foreground/12 bg-background text-foreground shadow-sm dark:border-foreground/10 dark:bg-foreground/12",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Label + description on the left, its control on the right. */
export const SettingRow = ({
  icon: Icon,
  title,
  description,
  className,
  children,
}: {
  icon?: IconComponent;
  title: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
}) => (
  <div
    className={cn(
      "flex flex-wrap items-center justify-between gap-x-6 gap-y-3",
      className,
    )}
  >
    <div className="min-w-0 flex-1 basis-44">
      <p className="flex items-center gap-2 text-sm font-medium">
        {Icon && <Icon className="size-4 text-muted-foreground" />}
        {title}
      </p>
      {description && (
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      )}
    </div>
    {children}
  </div>
);
