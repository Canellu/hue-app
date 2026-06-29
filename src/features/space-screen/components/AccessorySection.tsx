import type { LucideIcon } from "lucide-react";

import { SensorReadingPill } from "@/components/SensorReadingPill";
import { Card } from "@/components/ui/card";
import type { HueAccessory, HueAccessoryService } from "@/types/hue";

export const AccessorySection: React.FC<{
  title: string;
  icon: LucideIcon;
  accessories: HueAccessory[];
  readingsByDevice: Map<string, HueAccessoryService[]>;
}> = ({ title, icon: Icon, accessories, readingsByDevice }) => {
  if (accessories.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-muted-foreground">
        {title}{" "}
        <span className="text-muted-foreground/60">{accessories.length}</span>
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {accessories.map((accessory) => {
          const readings = readingsByDevice.get(accessory.id) ?? [];
          return (
            <Card
              key={accessory.id}
              data-edit-id={accessory.id}
              className="gap-3 bg-tile px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{accessory.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {accessory.productName ??
                      (accessory.kind === "switch" ? "Switch" : "Sensor")}
                  </p>
                </div>
                {!accessory.reachable && (
                  <span className="shrink-0 text-xs font-medium text-destructive">
                    Offline
                  </span>
                )}
              </div>
              {readings.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {readings.map((service) => (
                    <SensorReadingPill key={service.id} service={service} />
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};
