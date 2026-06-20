import { Lightbulb } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { PacedSlider } from "@/components/PacedSlider";
import { LIGHT_THEME } from "@/lib/tile-theme";
import { UI_EASE_MS } from "@/lib/transitions";
import { lightColorHex } from "@/features/space-screen/utils/color-state";
import type { HueLight } from "@/types/hue";

type ControlCommitPhase = "live" | "final";

interface LightCardProps {
  light: HueLight;
  selected: boolean;
  onSelect: (id: string) => void;
  onToggle: (light: HueLight, nextOn: boolean) => void;
  onBrightness: (
    light: HueLight,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
}

export const LightCard: React.FC<LightCardProps> = ({
  light,
  selected,
  onSelect,
  onToggle,
  onBrightness,
}) => {
  const pct = Math.round(light.brightness ?? 0);
  // When the light is on, tint the whole card with its live color (mirrors the
  // Home room/zone tiles); off or color-less lights stay on the muted surface.
  const color = light.isOn ? lightColorHex(light) : null;
  const active = color != null;
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
        "cursor-pointer justify-center gap-6 outline-none transition-colors duration-(--tile-ease) ease-out focus-visible:ring-2 focus-visible:ring-ring",
        !active && "hover:bg-accent/70",
        selected && "ring-2 ring-primary",
        unreachable && "opacity-50",
      )}
      style={
        {
          ...LIGHT_THEME,
          "--tile-ease": `${UI_EASE_MS.tileBackground}ms`,
          ...(active && color ? { background: color } : null),
        } as React.CSSProperties
      }
    >
      <div className="flex items-center gap-4 px-(--card-spacing)">
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <Lightbulb size={26} strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium" title={light.name}>
            {light.name}
          </p>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <Switch
            size="xl"
            className="dark:data-checked:bg-foreground/35 dark:data-unchecked:bg-input dark:**:data-[slot=switch-thumb]:data-unchecked:bg-background"
            checked={light.isOn}
            disabled={unreachable}
            aria-label={`Toggle ${light.name}`}
            onCheckedChange={(checked) => onToggle(light, checked)}
          />
        </div>
      </div>

      <div className="px-(--card-spacing)" onClick={(e) => e.stopPropagation()}>
        <PacedSlider
          value={light.isOn ? Math.max(1, pct) : 1}
          min={1}
          disabled={unreachable}
          ariaLabel={`${light.name} brightness`}
          className="w-full **:data-[slot=slider-thumb]:size-5 **:data-[slot=slider-track]:bg-foreground/35 **:data-[slot=slider-range]:bg-transparent **:data-[slot=slider-range]:bg-linear-to-r **:data-[slot=slider-range]:from-white/50 **:data-[slot=slider-range]:to-white/90"
          size="default"
          isGroup={false}
          onCommit={(value, phase) => onBrightness(light, value, phase)}
        />
      </div>
    </Card>
  );
};
