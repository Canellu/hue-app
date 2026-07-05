import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { blinkableLightIds, useBlinkLights } from "@/hooks/useBlinkLights";
import { selectableVariants } from "@/lib/selection-styles";
import { cn } from "@/lib/utils";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
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
  const lights = useHueResourcesStore((state) => state.lights);
  const { blink } = useBlinkLights();
  const selected = new Set(selectedIds);
  if (options.length === 0) return <EmptyText>{emptyText}</EmptyText>;

  // Blink the physical light(s) when a row is checked so the user can confirm
  // they picked the right fixture. Deselecting stays silent.
  const toggle = (option: HueSettingsDevice | HueLight) => {
    if (!selected.has(option.id)) {
      void blink(option.id, blinkableLightIds(option, lights));
    }
    onToggle(option.id);
  };

  return (
    <ScrollArea
      fade
      className="max-h-64 w-full min-w-0 max-w-full overflow-hidden rounded-xl bg-background/60"
      viewportClassName="overflow-x-hidden p-2"
      contentClassName="w-full min-w-0 max-w-full overflow-hidden"
    >
      <div className="grid min-w-0 gap-2">
        {options.map((option) => (
          <label
            key={option.id}
            data-selected={selected.has(option.id) ? "" : undefined}
            className={cn(
              "flex min-w-0 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm",
              selectableVariants({ treatment: "row" }),
            )}
          >
            <Checkbox
              checked={selected.has(option.id)}
              onCheckedChange={() => toggle(option)}
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
