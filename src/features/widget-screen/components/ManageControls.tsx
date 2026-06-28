import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getRoomZoneIcon } from "@/features/home-screen/components/room-zone-icons";
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronLeft,
  GripVertical,
  Lightbulb,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState, type ReactNode } from "react";
import { ControlPicker } from "../onboarding/ControlPicker";
import type { WidgetControl } from "../types";
import {
  SceneCardRail,
  SceneRailItem,
  SelectableSceneCard,
} from "./SceneCardRail";

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
  onDelete,
  onChange,
}: {
  control: WidgetControl;
  groupScenes: HueScene[];
  onDelete: () => void;
  onChange: (control: WidgetControl) => void;
}) => {
  const [open, setOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const display = useControlDisplay(control);
  const compact = control.compact ?? false;
  const sceneCount = control.sceneIds.length;
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
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 transition-colors hover:bg-[oklch(0.95_0_0)] dark:hover:bg-[oklch(0.30_0_0)]",
          open &&
            "bg-[oklch(0.97_0_0)] dark:bg-[oklch(0.28_0_0)]",
        )}
      >
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
        </button>
        {open ? (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-destructive hover:text-destructive"
                />
              }
            >
              <Trash2 size={15} />
              Remove
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove control?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes “{display.name}” from this widget. The room, zone,
                  or light itself isn't affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel size="xl">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  size="xl"
                  className="gap-2"
                  onClick={onDelete}
                >
                  <Trash2 size={15} />
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "Collapse control" : "Expand control"}
          aria-expanded={open}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground"
        >
          <ChevronDown
            size={16}
            className={cn(
              "shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="control-configuration"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: prefersReducedMotion ? 0 : 0.2,
              ease: [0.4, 0, 0.2, 1],
            }}
            className="overflow-hidden"
          >
            <div className="grid gap-3 border-t border-border/50 px-3 py-3">
          <label className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium">Compact mode</span>
              <span className="block truncate text-xs text-muted-foreground">
                Hide the brightness slider — keep just the toggle and scenes.
              </span>
            </span>
            <Switch
              checked={compact}
              onCheckedChange={(checked) =>
                onChange({ ...control, compact: checked })
              }
              aria-label="Compact mode"
            />
          </label>

          {control.target.kind !== "light" ? (
            <div className="grid gap-2">
              <p className="text-xs text-muted-foreground">
                {groupScenes.length === 0
                  ? "No scenes saved for this space yet."
                  : "Tap scenes to add them as quick buttons."}
              </p>
              {groupScenes.length > 0 ? (
                <SceneCardRail>
                  {groupScenes.map((scene) => {
                    const selected = control.sceneIds.includes(scene.id);
                    return (
                      <SceneRailItem key={scene.id}>
                        <SelectableSceneCard
                          scene={scene}
                          selected={selected}
                          disabled={false}
                          onToggle={() => toggleScene(scene.id)}
                        />
                      </SceneRailItem>
                    );
                  })}
                </SceneCardRail>
              ) : null}
            </div>
          ) : null}

            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

/**
 * A placeholder row shown while adding a control. It starts collapsed with a
 * "nothing selected" hint; expanding reveals the picker, and choosing a target
 * promotes it into a real control.
 */
const PendingControlRow = ({
  onSelect,
  onCancel,
}: {
  onSelect: (control: WidgetControl) => void;
  onCancel: () => void;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-card">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="flex size-8 shrink-0 items-center justify-center text-muted-foreground">
            <Plus size={18} strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">Nothing selected</p>
            <p className="truncate text-xs text-muted-foreground">
              Expand to choose a room, zone, or light.
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
        <IconTooltip label="Cancel">
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel adding control"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        </IconTooltip>
      </div>

      {open ? (
        <div className="border-t border-border/50 px-3 py-3">
          <ControlPicker onSelect={onSelect} />
        </div>
      ) : null}
    </div>
  );
};

export const ManageControls = ({
  controls,
  onClose,
  onChange,
}: {
  controls: WidgetControl[];
  onClose?: () => void;
  onChange: (next: WidgetControl[]) => void;
}) => {
  const scenes = useHueResourcesStore((state) => state.scenes);
  const [adding, setAdding] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const addControl = (control: WidgetControl) => {
    onChange([control, ...controls]);
    setAdding(false);
  };

  // Compact only hides the brightness slider; scenes still render as the rail in
  // both modes, so sceneIds are always preserved across a compact toggle.
  const updateControl = (next: WidgetControl) =>
    onChange(
      controls.map((control) => (control.id === next.id ? next : control)),
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
    <div className="grid gap-4 pt-8">
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
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => setAdding(true)}
          disabled={adding}
        >
          <Plus size={16} />
          Add control
        </Button>
      </div>

      {adding ? (
        <PendingControlRow
          onSelect={addControl}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      {controls.length === 0 ? (
        !adding ? (
          <p className="px-1 text-sm text-muted-foreground">
            No controls yet. Add one to start controlling your lights.
          </p>
        ) : null
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
                  onDelete={() => remove(control.id)}
                  onChange={updateControl}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
};
