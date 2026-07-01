import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Fragment, useRef } from "react";
import { useIconOnly } from "../hooks/useIconOnly";
import {
  groupForTab,
  groupTabs,
  settingsGroups,
  type SettingsGroupValue,
} from "../settingsTabs";

/**
 * Top-level settings navigation: centered folder tabs (one per group) above the
 * content card. Selecting a group opens the leaf tab last visited within it, so
 * switching groups feels like returning where you left off. Below the `@5xl`
 * container width the labels collapse to icons, with the label kept in a tooltip.
 */
export const SettingsNav = ({
  activeTab,
  onSelect,
}: {
  activeTab: string;
  onSelect: (tab: string) => void;
}) => {
  const { containerRef, labelRef, iconOnly } = useIconOnly<
    HTMLElement,
    HTMLSpanElement
  >();

  const activeGroup = groupForTab(activeTab);

  // Remember the leaf tab most recently visited in each group so a group click
  // restores it instead of always snapping back to the first sub-tab.
  const lastByGroup = useRef<Partial<Record<SettingsGroupValue, string>>>({});
  lastByGroup.current[activeGroup] = activeTab;

  const selectGroup = (group: SettingsGroupValue) => {
    const target = lastByGroup.current[group] ?? groupTabs(group)[0]?.value;
    if (target) onSelect(target);
  };

  return (
    <TooltipProvider>
      <nav
        ref={containerRef}
        aria-label="Settings sections"
        className="relative z-10 -mb-px flex justify-center gap-2"
      >
        {settingsGroups.map(({ value, label, icon: Icon }, index) => {
          const isActive = activeGroup === value;
          const isFirst = index === 0;
          const tab = (
            <button
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => selectGroup(value)}
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
