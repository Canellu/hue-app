import {
  Flame,
  Lamp,
  LampCeiling,
  LampDesk,
  LampFloor,
  Lightbulb,
  type LucideIcon,
  Spotlight,
} from "lucide-react";

export const LIGHT_ICON_OPTIONS: {
  value: string;
  label: string;
  Icon: LucideIcon;
}[] = [
  { value: "classic_bulb", label: "Classic bulb", Icon: Lightbulb },
  { value: "sultan_bulb", label: "Bulb", Icon: Lightbulb },
  { value: "candle_bulb", label: "Candle bulb", Icon: Flame },
  { value: "spot_bulb", label: "Spot bulb", Icon: Spotlight },
  { value: "recessed_ceiling", label: "Recessed ceiling", Icon: LampCeiling },
  { value: "ceiling_round", label: "Round ceiling", Icon: LampCeiling },
  { value: "ceiling_square", label: "Square ceiling", Icon: LampCeiling },
  { value: "pendant_round", label: "Pendant", Icon: Lamp },
  { value: "floor_shade", label: "Floor lamp", Icon: LampFloor },
  { value: "table_shade", label: "Table lamp", Icon: LampDesk },
  { value: "light_strip", label: "Light strip", Icon: Lightbulb },
  { value: "hue_go", label: "Hue Go", Icon: Lightbulb },
];

// Resolves a fixture's v2 archetype (e.g. "table_shade") to its icon, falling
// back to a generic bulb for anything unmapped.
export const getLightIcon = (archetype: string | null): LucideIcon =>
  LIGHT_ICON_OPTIONS.find((option) => option.value === archetype)?.Icon ??
  Lightbulb;
