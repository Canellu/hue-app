import { Input } from "@/components/ui/input";
import type { TvAspectRatio } from "./tv-display";

export const TvAspectRatioControl = ({
  value,
  onChange,
}: {
  value: TvAspectRatio;
  onChange: (value: TvAspectRatio) => void;
}) => {
  const update = (dimension: keyof TvAspectRatio, rawValue: string) => {
    const next = Number(rawValue);
    if (!Number.isFinite(next) || next <= 0) return;
    onChange({ ...value, [dimension]: Math.min(100, next) });
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className="mr-1 text-xs font-medium text-muted-foreground">
        TV aspect
      </span>
      <Input
        type="number"
        min={0.1}
        max={100}
        step={0.1}
        value={value.width}
        aria-label="TV aspect ratio width"
        onChange={(event) => update("width", event.target.value)}
        className="h-9 w-16 rounded-xl px-2 text-center"
      />
      <span className="text-sm text-muted-foreground">:</span>
      <Input
        type="number"
        min={0.1}
        max={100}
        step={0.1}
        value={value.height}
        aria-label="TV aspect ratio height"
        onChange={(event) => update("height", event.target.value)}
        className="h-9 w-16 rounded-xl px-2 text-center"
      />
    </div>
  );
};
