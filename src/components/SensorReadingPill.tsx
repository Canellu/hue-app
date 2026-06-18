import { cn } from "@/lib/utils";
import type { HueAccessoryService } from "@/types/hue";

/** Friendlier labels for the v2 service resource types shown on sensor pills. */
const SENSOR_READING_LABELS: Record<string, string> = {
  motion: "Motion",
  camera_motion: "Motion",
  temperature: "Temperature",
  light_level: "Light level",
  contact: "Contact",
  tamper: "Tamper",
  device_power: "Battery",
  button: "Button",
  relative_rotary: "Dial",
  zigbee_connectivity: "Zigbee",
};

const humanize = (value: string) =>
  value
    .split("_")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");

/** Compact label + live value chip for a single accessory/sensor reading. */
export const SensorReadingPill = ({
  service,
}: {
  service: HueAccessoryService;
}) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
      service.reachable ? "bg-muted/60" : "bg-destructive/10 text-destructive",
    )}
  >
    <span className="text-muted-foreground">
      {SENSOR_READING_LABELS[service.resourceType] ??
        humanize(service.resourceType)}
    </span>
    <span className="font-medium">{service.value}</span>
  </span>
);
