import { selectableVariants } from "@/lib/selection-styles";
import { cn } from "@/lib/utils";
import { groupTabs, settingsGroups } from "../settingsTabs";

/**
 * Full-height settings navigation: a single left rail listing every leaf tab,
 * split into labelled sections (one per group). Selection is driven through the
 * same `search.tab` route as the content panels.
 *
 * The earlier folder-tab treatment lives on in `SettingsNav` (and the
 * `.notch-tab` styles in App.css) — kept for reuse elsewhere, not rendered here.
 */
export const SettingsSidebar = ({
  activeTab,
  onSelect,
}: {
  activeTab: string;
  onSelect: (tab: string) => void;
}) => {
  return (
    <div className="flex w-60 shrink-0 flex-col gap-8 overflow-y-auto border-r border-border p-4">
      {settingsGroups.map((group) => (
        <div key={group.value} className="flex flex-col">
          <p className="px-2.5 pb-1.5 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground/60 uppercase">
            {group.label}
          </p>
          <nav aria-label={group.label} className="flex flex-col gap-0.5">
            {groupTabs(group.value).map(({ value, label, icon: Icon }) => {
              const isActive = activeTab === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onSelect(value)}
                  className={cn(
                    "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-foreground/80",
                    selectableVariants({ treatment: "navigation" }),
                    isActive && "text-foreground",
                  )}
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      ))}
    </div>
  );
};
