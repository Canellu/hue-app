export const HUE_DYNAMIC_SPEED_STEPS = [
  0.3730158, 0.4365079, 0.4841269, 0.5, 0.5396825, 0.563492, 0.6031746,
  0.6269841, 0.7301587, 0.7539682, 0.8174603, 0.8809523,
] as const;

export const HUE_DYNAMIC_SPEED_MIN_STEP = 1;
export const HUE_DYNAMIC_SPEED_MAX_STEP = HUE_DYNAMIC_SPEED_STEPS.length;

export const hueDynamicSpeedStepToValue = (step: number): number => {
  const index =
    Math.min(
      HUE_DYNAMIC_SPEED_MAX_STEP,
      Math.max(HUE_DYNAMIC_SPEED_MIN_STEP, Math.round(step)),
    ) - 1;
  return HUE_DYNAMIC_SPEED_STEPS[index];
};

export const hueDynamicSpeedValueToStep = (
  speed: number | null | undefined,
): number => {
  const value = speed ?? hueDynamicSpeedStepToValue(4);
  let closestStep = HUE_DYNAMIC_SPEED_MIN_STEP;
  let closestDistance = Number.POSITIVE_INFINITY;

  HUE_DYNAMIC_SPEED_STEPS.forEach((candidate, index) => {
    const distance = Math.abs(candidate - value);
    if (distance < closestDistance) {
      closestStep = index + 1;
      closestDistance = distance;
    }
  });

  return closestStep;
};
