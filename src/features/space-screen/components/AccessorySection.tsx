import { Fragment } from "react";
import type { LucideIcon } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";

import { SensorReadingPill } from "@/components/SensorReadingPill";
import { Card } from "@/components/ui/card";
import type { HueAccessory, HueAccessoryService } from "@/types/hue";
import { SectionGrip } from "./SectionDragHandle";
import { SortableItem } from "./SortableItem";

export const AccessorySection: React.FC<{
  title: string;
  icon: LucideIcon;
  accessories: HueAccessory[];
  readingsByDevice: Map<string, HueAccessoryService[]>;
  /** Enables drag-and-drop ordering. False while selecting in Manage mode. */
  reordering?: boolean;
  /** Persist the new accessory order (full list of ids) after a reorder drag. */
  onReorder?: (orderedIds: string[]) => void;
}> = ({
  title,
  icon: Icon,
  accessories,
  readingsByDevice,
  reordering = false,
  onReorder,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  if (accessories.length === 0) return null;

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = accessories.map((accessory) => accessory.id);
    const from = ids.indexOf(active.id as string);
    const to = ids.indexOf(over.id as string);
    if (from < 0 || to < 0) return;
    onReorder?.(arrayMove(ids, from, to));
  };

  const renderCard = (accessory: HueAccessory) => {
    const readings = readingsByDevice.get(accessory.id) ?? [];
    return (
      <Card data-edit-id={accessory.id} className="gap-3 bg-tile px-4 py-3">
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
  };

  const grid = (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
      {accessories.map((accessory) =>
        reordering ? (
          <SortableItem key={accessory.id} id={accessory.id} editing>
            {renderCard(accessory)}
          </SortableItem>
        ) : (
          <Fragment key={accessory.id}>{renderCard(accessory)}</Fragment>
        ),
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-7 items-center">
        <SectionGrip />
        <p className="text-sm font-medium text-muted-foreground">
          {title}{" "}
          <span className="text-muted-foreground/60">{accessories.length}</span>
        </p>
      </div>
      {reordering ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={accessories.map((accessory) => accessory.id)}
            strategy={rectSortingStrategy}
          >
            {grid}
          </SortableContext>
        </DndContext>
      ) : (
        grid
      )}
    </div>
  );
};
