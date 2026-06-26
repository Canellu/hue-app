import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Fragment } from "react";
import { useIconOnly } from "../hooks/useIconOnly";
import { settingsTabs } from "../settingsTabs";

/**
 * Settings section navigation: centered folder tabs above the content card.
 * Below the `@5xl` container width the labels collapse to icons, with the label
 * still available via tooltip.
 */
export const SettingsNav = ({
  activeTab,
  onSelect,
}: {
  activeTab: string;
  onSelect: (tab: string) => void;
}) => {
  // Below the `@5xl` container width the tabs collapse to icon-only (a container
  // query on the label span). Tooltips only earn their keep in that state —
  // with the label visible they'd just echo it — so gate them on whether the
  // label has actually collapsed to `display: none`.
  const { containerRef, labelRef, iconOnly } = useIconOnly<
    HTMLElement,
    HTMLSpanElement
  >();

  return (
    <TooltipProvider>
      <nav
        ref={containerRef}
        aria-label="Settings sections"
        className="relative z-10 -mb-px flex justify-center gap-2"
      >
        {settingsTabs.map(({ value, label, icon: Icon }, index) => {
          const isActive = activeTab === value;
          const isFirst = index === 0;
          const tab = (
            <button
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => onSelect(value)}
              className={cn(
                "flex h-11 items-center justify-center gap-2 rounded-t-xl border border-b-0 border-transparent px-6 text-base font-medium transition-colors",
                isActive
                  ? "notch-tab border-border bg-card text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon size={20} className="shrink-0" />
              <span
                ref={isFirst ? labelRef : undefined}
                className="hidden @5xl:inline"
              >
                {label}
              </span>
            </button>
          );

          if (!iconOnly) return <Fragment key={value}>{tab}</Fragment>;

          return (
            <Tooltip key={value}>
              <TooltipTrigger render={tab} />
              <TooltipContent side="bottom">{label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </TooltipProvider>
  );
};
