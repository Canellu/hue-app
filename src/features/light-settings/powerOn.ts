import type { HueLight, HueLightPowerup, HuePowerupPreset } from "@/types/hue";

export interface PowerOnDraft {
  preset: HuePowerupPreset;
  brightness: number;
  mirek: number | null;
  xy: [number, number] | null;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const powerOnDraftFromLight = (light: HueLight): PowerOnDraft => {
  const powerup = light.powerup;
  const hasCustomColor = powerup?.xy != null;
  const mirek = hasCustomColor
    ? null
    : (powerup?.mirek ??
      (light.supportsCt
        ? (light.ct ??
          Math.round(((light.ctMin ?? 153) + (light.ctMax ?? 500)) / 2))
        : null));
  const xy = hasCustomColor
    ? powerup.xy
    : !light.supportsCt && light.supportsColor
      ? (light.xy ?? [0.3127, 0.329])
      : null;

  return {
    preset: powerup?.preset ?? "safety",
    brightness: clamp(
      Math.round(powerup?.brightness ?? light.brightness ?? 100),
      1,
      100,
    ),
    mirek,
    xy,
  };
};

export const samePowerOnDraft = (left: PowerOnDraft, right: PowerOnDraft) =>
  left.preset === right.preset &&
  (left.preset !== "custom" ||
    (left.brightness === right.brightness &&
      left.mirek === right.mirek &&
      left.xy?.[0] === right.xy?.[0] &&
      left.xy?.[1] === right.xy?.[1]));

export const buildPowerOnBody = (
  draft: PowerOnDraft,
): { powerup: Record<string, unknown> } => {
  if (draft.preset !== "custom") {
    return { powerup: { preset: draft.preset } };
  }

  const powerup: Record<string, unknown> = {
    preset: "custom",
    on: { mode: "on", on: { on: true } },
    dimming: {
      mode: "dimming",
      dimming: { brightness: clamp(draft.brightness, 1, 100) },
    },
  };
  if (draft.mirek != null) {
    powerup.color = {
      mode: "color_temperature",
      color_temperature: { mirek: draft.mirek },
    };
  } else if (draft.xy != null) {
    powerup.color = {
      mode: "color",
      color: { xy: { x: draft.xy[0], y: draft.xy[1] } },
    };
  }
  return { powerup };
};

export const powerupSummary = (powerup: HueLightPowerup | null) => {
  switch (powerup?.preset) {
    case "last_on_state":
      return "Last on";
    case "powerfail":
      return "Power loss recovery";
    case "custom":
      return "Custom";
    default:
      return "Default";
  }
};
