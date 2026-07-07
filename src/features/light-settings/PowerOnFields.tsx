import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  rgbToHex,
  rgbToXy,
  xyBriToRgb,
} from "@/features/space-screen/utils/color";
import type { HueLight, HuePowerupPreset } from "@/types/hue";
import type { PowerOnDraft } from "./powerOn";

const PRESET_ITEMS: Record<HuePowerupPreset, string> = {
  safety: "Default",
  last_on_state: "Last on",
  powerfail: "Power loss recovery",
  custom: "Custom",
};

const PRESET_HELP: Record<HuePowerupPreset, string> = {
  safety: "Turns on at full brightness with a warm white color.",
  last_on_state: "Turns on using the color and brightness last used while on.",
  powerfail:
    "Restores the state from before power was lost, including staying off.",
  custom: "Turns on with the brightness and color selected below.",
};

const parseHex = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

export const PowerOnFields = ({
  light,
  value,
  onChange,
  disabled,
}: {
  light: HueLight;
  value: PowerOnDraft;
  onChange: (value: PowerOnDraft) => void;
  disabled?: boolean;
}) => {
  if (!light.powerup) {
    return (
      <div className="grid gap-1">
        <Label>Power on</Label>
        <p className="text-xs text-muted-foreground">
          Power-on behavior is not available for this light.
        </p>
      </div>
    );
  }

  const supportsColorChoice = light.supportsColor && light.supportsCt;
  const colorMode = value.xy != null ? "color" : "temperature";
  const ctMin = light.ctMin ?? 153;
  const ctMax = light.ctMax ?? 500;
  const kelvinMin = Math.round(1_000_000 / ctMax);
  const kelvinMax = Math.round(1_000_000 / ctMin);
  const kelvin = Math.round(1_000_000 / (value.mirek ?? ctMin));
  const colorHex = value.xy
    ? rgbToHex(xyBriToRgb(value.xy[0], value.xy[1]))
    : "#ffffff";

  return (
    <div className="grid gap-2">
      <Label>Power on</Label>
      <Select
        items={PRESET_ITEMS}
        value={value.preset}
        onValueChange={(preset) =>
          onChange({ ...value, preset: preset as HuePowerupPreset })
        }
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(PRESET_ITEMS).map(([preset, label]) => (
            <SelectItem key={preset} value={preset}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {PRESET_HELP[value.preset]}
      </p>

      {value.preset === "custom" && (
        <div className="mt-1 grid gap-3 rounded-xl bg-muted/45 p-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`power-on-brightness-${light.id}`}>
              Brightness
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id={`power-on-brightness-${light.id}`}
                type="number"
                min={1}
                max={100}
                value={value.brightness}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...value,
                    brightness: Math.min(
                      100,
                      Math.max(1, Number(event.target.value) || 1),
                    ),
                  })
                }
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>

          {supportsColorChoice && (
            <div className="grid gap-1.5">
              <Label>Color type</Label>
              <Select
                items={{ temperature: "White", color: "Color" }}
                value={colorMode}
                disabled={disabled}
                onValueChange={(mode) =>
                  onChange(
                    mode === "color"
                      ? {
                          ...value,
                          mirek: null,
                          xy: light.xy ?? [0.3127, 0.329],
                        }
                      : {
                          ...value,
                          mirek: light.ct ?? Math.round((ctMin + ctMax) / 2),
                          xy: null,
                        },
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="temperature">White</SelectItem>
                  <SelectItem value="color">Color</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {value.mirek != null && light.supportsCt && (
            <div className="grid gap-1.5">
              <Label htmlFor={`power-on-temperature-${light.id}`}>
                Color temperature
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`power-on-temperature-${light.id}`}
                  type="number"
                  min={kelvinMin}
                  max={kelvinMax}
                  value={kelvin}
                  disabled={disabled}
                  onChange={(event) => {
                    const nextKelvin = Math.min(
                      kelvinMax,
                      Math.max(
                        kelvinMin,
                        Number(event.target.value) || kelvinMin,
                      ),
                    );
                    onChange({
                      ...value,
                      mirek: Math.round(1_000_000 / nextKelvin),
                      xy: null,
                    });
                  }}
                />
                <span className="text-sm text-muted-foreground">K</span>
              </div>
            </div>
          )}

          {value.xy != null && light.supportsColor && (
            <div className="grid gap-1.5">
              <Label htmlFor={`power-on-color-${light.id}`}>Color</Label>
              <Input
                id={`power-on-color-${light.id}`}
                type="color"
                value={colorHex}
                disabled={disabled}
                className="h-10 cursor-pointer p-1"
                onChange={(event) => {
                  const [r, g, b] = parseHex(event.target.value);
                  onChange({
                    ...value,
                    mirek: null,
                    xy: rgbToXy(r, g, b, light.gamut),
                  });
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
