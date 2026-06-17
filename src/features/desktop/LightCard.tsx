import { Lightbulb } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { lightColorHex } from "./colorState";
import { DebouncedSlider } from "./DebouncedSlider";
import type { HueLight } from "./types";

interface LightCardProps {
  light: HueLight;
  selected: boolean;
  onSelect: (id: string) => void;
  onToggle: (light: HueLight, nextOn: boolean) => void;
  onBrightness: (light: HueLight, pct: number) => void;
}

/** Resolves the small swatch color shown on each card from the light's state. */
const lightSwatchCss = (light: HueLight): string | null =>
  light.isOn ? lightColorHex(light) : null;

export const LightCard: React.FC<LightCardProps> = ({
  light,
  selected,
  onSelect,
  onToggle,
  onBrightness,
}) => {
  const pct = Math.round(light.brightness ?? 0);
  const swatch = lightSwatchCss(light);
  const unreachable = !light.reachable;

  return (
    <Card
      size="sm"
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onSelect(light.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(light.id);
        }
      }}
      className={cn(
        "cursor-pointer gap-3 outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring",
        selected && "ring-2 ring-primary",
        unreachable && "opacity-50",
      )}
    >
      <div className="flex items-center gap-3 px-4">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-foreground/10"
          style={swatch ? { background: swatch } : undefined}
        >
          {!swatch && <Lightbulb size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={light.name}>
            {light.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {unreachable ? "Unreachable" : light.isOn ? "On" : "Off"}
          </p>
        </div>
        <Switch
          checked={light.isOn}
          disabled={unreachable}
          aria-label={`Toggle ${light.name}`}
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={(checked) => onToggle(light, checked)}
        />
      </div>

      <div className="px-4" onClick={(e) => e.stopPropagation()}>
        <DebouncedSlider
          value={light.isOn ? pct : 0}
          disabled={unreachable}
          ariaLabel={`${light.name} brightness`}
          debounceMs={150}
          onCommit={(value) => onBrightness(light, value)}
        />
      </div>
    </Card>
  );
};
