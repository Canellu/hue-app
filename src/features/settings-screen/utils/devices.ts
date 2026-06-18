import type { HueDeviceKind, HueSettingsDevice } from "@/types/hue";

/** Service types that identify a device as a switch/remote or a sensor. */
const SWITCH_SERVICES = ["button", "relative_rotary"];
const SENSOR_SERVICES = [
  "motion",
  "camera_motion",
  "temperature",
  "light_level",
  "contact",
  "tamper",
];

/**
 * Buckets a device by its v2 service types for grouped display, mirroring the
 * Rust `device_kind` helper. Lights win, then switches, then sensors; anything
 * else (e.g. the bridge itself) is uncategorised.
 */
export const classifyDevice = (
  device: HueSettingsDevice,
): HueDeviceKind | null => {
  const types = device.serviceTypes;
  if (types.includes("light")) return "light";
  if (types.some((type) => SWITCH_SERVICES.includes(type))) return "switch";
  if (types.some((type) => SENSOR_SERVICES.includes(type))) return "sensor";
  return null;
};
