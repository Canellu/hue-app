import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getRoomZoneIcon } from "@/features/home-screen/components/room-zone-icons";
import { sceneBubbleCss } from "@/features/space-screen/utils/color-state";
import { cn } from "@/lib/utils";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueScene } from "@/types/hue";
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
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  GripVertical,
  Lightbulb,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type { WidgetControl } from "../types";
import { MAX_CONTROL_SCENES } from "../types";

const IconTooltip = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger
        render={<span className="inline-flex">{children}</span>}
      />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

const useControlDisplay = (control: WidgetControl) => {
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const lights = useHueResourcesStore((state) => state.lights);

  if (control.target.kind === "light") {
    const light = lights.find(
      (candidate) => candidate.id === control.target.id,
    );
    return {
      name: control.label ?? light?.name ?? "Unavailable light",
      icon: <Lightbulb size={18} strokeWidth={2.5} />,
      available: light != null,
    };
  }

  const roomZone = roomZones.find(
    (candidate) => candidate.id === control.target.id,
  );
  const Icon = getRoomZoneIcon(roomZone?.class ?? "");
  return {
    name: control.label ?? roomZone?.name ?? "Unavailable space",
    icon: <Icon size={18} strokeWidth={2.5} />,
    available: roomZone != null,
  };
};

const ControlRow = ({
  control,
  groupScenes,
  onEdit,
  onDelete,
  onChange,
}: {
  control: WidgetControl;
  groupScenes: HueScene[];
  onEdit: () => void;
  onDelete: () => void;
  onChange: (control: WidgetControl) => void;
}) => {
  const [open, setOpen] = useState(false);
  const display = useControlDisplay(control);
  const compact = control.compact ?? false;
  const sceneCount = control.sceneIds.length;
  const atSceneLimit = sceneCount >= MAX_CONTROL_SCENES;
  const meta = [
    control.target.kind,
    control.showBrightness ? "dimmer" : null,
    compact ? "compact" : "full",
    sceneCount > 0 ? `${sceneCount} scene${sceneCount > 1 ? "s" : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: control.id });

  const toggleScene = (sceneId: string) => {
    const selected = control.sceneIds.includes(sceneId);
    if (selected) {
      onChange({
        ...control,
        sceneIds: control.sceneIds.filter((id) => id !== sceneId),
      });
      return;
    }
    if (atSceneLimit) return;
    onChange({ ...control, sceneIds: [...control.sceneIds, sceneId] });
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.65 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
      className="rounded-lg border border-border/60 bg-card"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <IconTooltip label="Drag to reorder">
          <button
            type="button"
            className="flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
            aria-label="Drag control"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} />
          </button>
        </IconTooltip>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center",
              display.available ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {display.icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{display.name}</p>
            <p className="truncate text-xs text-muted-foreground capitalize">
              {meta}
            </p>
          </div>
          <ChevronDown
            size={16}
            className={cn(
              "shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </div>

      {open ? (
      <div className="grid gap-3 border-t border-border/50 px-3 py-3">
        <label className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-medium">Compact control</span>
            <span className="block truncate text-xs text-muted-foreground">
              Hide the slider and quick scene buttons.
            </span>
          </span>
          <Switch
            checked={compact}
            onCheckedChange={(checked) =>
              onChange({ ...control, compact: checked })
            }
            aria-label="Compact control"
          />
        </label>

        {control.target.kind !== "light" && !compact ? (
          <div className="grid gap-2">
            <p className="text-xs text-muted-foreground">
              {groupScenes.length === 0
                ? "No scenes saved for this space yet."
                : `Quick scenes, up to ${MAX_CONTROL_SCENES}.`}
            </p>
            {groupScenes.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {groupScenes.map((scene) => {
                  const selected = control.sceneIds.includes(scene.id);
                  const disabled = !selected && atSceneLimit;
                  const bubble = sceneBubbleCss(scene);
                  return (
                    <button
                      key={scene.id}
                      type="button"
                      onClick={() => toggleScene(scene.id)}
                      disabled={disabled}
                      aria-pressed={selected}
                      className={cn(
                        "flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        selected
                          ? "border-foreground/30 bg-foreground/10"
                          : "border-border/60 hover:bg-muted/40",
                        disabled && "opacity-40",
                      )}
                    >
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full ring-1 ring-border/60"
                        style={{ background: bubble ?? "var(--muted)" }}
                      />
                      <span className="truncate">{scene.name}</span>
                      {selected ? <Check size={12} /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-1 border-t border-border/50 pt-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onEdit}
          >
            <Pencil size={15} />
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 size={15} />
            Delete
          </Button>
        </div>
      </div>
      ) : null}
    </div>
  );
};

export const ManageControls = ({
  controls,
  onClose,
  onAdd,
  onEdit,
  onChange,
}: {
  controls: WidgetControl[];
  onClose?: () => void;
  onAdd: () => void;
  onEdit: (control: WidgetControl) => void;
  onChange: (next: WidgetControl[]) => void;
}) => {
  const scenes = useHueResourcesStore((state) => state.scenes);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const updateControl = (next: WidgetControl) =>
    onChange(
      controls.map((control) =>
        control.id === next.id
          ? {
              ...next,
              sceneIds: next.compact ? [] : next.sceneIds,
            }
          : control,
      ),
    );

  const remove = (id: string) =>
    onChange(controls.filter((control) => control.id !== id));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = controls.findIndex((control) => control.id === active.id);
    const to = controls.findIndex((control) => control.id === over.id);
    if (from === -1 || to === -1) return;
    onChange(arrayMove(controls, from, to));
  };

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        {onClose ? (
          <IconTooltip label="Back">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Back"
              onClick={onClose}
            >
              <ChevronLeft size={18} />
            </Button>
          </IconTooltip>
        ) : null}
        <p className="text-base font-semibold">Controls</p>
      </div>

      {controls.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">
          No controls yet. Add one to start controlling your lights.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={controls.map((control) => control.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid gap-1.5">
              {controls.map((control) => (
                <ControlRow
                  key={control.id}
                  control={control}
                  groupScenes={
                    control.target.kind === "light"
                      ? []
                      : scenes.filter(
                          (scene) => scene.group === control.target.id,
                        )
                  }
                  onEdit={() => onEdit(control)}
                  onDelete={() => remove(control.id)}
                  onChange={updateControl}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={onAdd}
        className="w-full"
      >
        <Plus size={16} />
        Add control
      </Button>
    </div>
  );
};
