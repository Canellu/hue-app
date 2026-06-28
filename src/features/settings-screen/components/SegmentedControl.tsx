import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "motion/react";

export type SegmentIcon = React.ComponentType<{
  size?: number;
  className?: string;
}>;

export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  ariaLabel,
  options,
  disabled,
  layoutId = "segmented-control-pill",
}: {
  value: T;
  onValueChange: (value: T) => void;
  ariaLabel: string;
  options: ReadonlyArray<{ value: T; label: string; icon: SegmentIcon }>;
  disabled?: boolean;
  /**
   * Distinguishes the sliding pill's shared-layout animation. Each rendered
   * SegmentedControl must use a unique id, otherwise the pill animates between
   * separate controls mounted at the same time.
   */
  layoutId?: string;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      orientation="horizontal"
    >
      <TabsList
        aria-label={ariaLabel}
        className="rounded-full bg-foreground/6 p-1 data-[orientation=horizontal]:h-auto dark:bg-muted"
      >
        {options.map(({ value: optionValue, label, icon: Icon }) => {
          const selected = value === optionValue;

          return (
            <TabsTrigger
              key={optionValue}
              value={optionValue}
              aria-label={label}
              disabled={disabled}
              className="h-8 min-w-8 flex-none gap-1.5 rounded-full px-3 text-sm data-active:border-transparent data-active:bg-transparent data-active:shadow-none group-data-[variant=default]/tabs-list:data-active:shadow-none dark:data-active:border-transparent dark:data-active:bg-transparent"
            >
              {selected && (
                <motion.span
                  layoutId={layoutId}
                  className="absolute inset-0 rounded-full border border-foreground/12 bg-background dark:border-foreground/10 dark:bg-foreground/12"
                  transition={{ type: "spring", stiffness: 520, damping: 42 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                <Icon size={17} />
                <span>{label}</span>
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
