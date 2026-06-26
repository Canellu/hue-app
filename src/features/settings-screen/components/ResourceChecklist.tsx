import { ScrollArea } from "@/components/ui/scroll-area";
import type { HueLight, HueSettingsDevice } from "@/types/hue";
import { EmptyText } from "./EmptyText";

const resourceOptionMeta = (option: HueSettingsDevice | HueLight) => {
  if ("serviceTypes" in option) {
    return [option.productName, option.modelId, option.serviceTypes.join(", ")]
      .filter(Boolean)
      .join(" · ");
  }
  return [
    option.productName,
    option.modelId,
    option.reachable ? "Reachable" : "Offline",
  ]
    .filter(Boolean)
    .join(" · ");
};

export const ResourceChecklist = ({
  options,
  selectedIds,
  emptyText,
  onToggle,
}: {
  options: Array<HueSettingsDevice | HueLight>;
  selectedIds: string[];
  emptyText: string;
  onToggle: (id: string) => void;
}) => {
  const selected = new Set(selectedIds);
  if (options.length === 0) return <EmptyText>{emptyText}</EmptyText>;

  return (
    <ScrollArea
      fade
      className="max-h-64 rounded-xl bg-background/60"
      viewportClassName="p-2"
    >
      <div className="grid gap-2">
        {options.map((option) => (
          <label
            key={option.id}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/60"
          >
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={selected.has(option.id)}
              onChange={() => onToggle(option.id)}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{option.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {resourceOptionMeta(option)}
              </span>
            </span>
          </label>
        ))}
      </div>
    </ScrollArea>
  );
};
