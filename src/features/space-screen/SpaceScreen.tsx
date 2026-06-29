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
import { CSS as DndCSS } from "@dnd-kit/utilities";
import {
  Copy,
  GripVertical,
  LoaderCircle,
  MoveRight,
  Pencil,
  Radar,
  Trash2,
  ToggleLeft,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SPACE_ARCHETYPES } from "@/features/settings-screen/constants";
import { getRoomZoneIcon } from "@/features/home-screen/components/room-zone-icons";
import type {
  HueAccessoryService,
  HueLight,
  HueRoomZone,
  HueScene,
} from "@/types/hue";
import { isSceneDynamicActive } from "@/features/space-screen/utils/scene-status";
import type { HueGalleryScenePreset } from "./data/hueSceneGallery";
import { AccessorySection } from "./components/AccessorySection";
import { GroupControls } from "./components/GroupControls";
import { LightsSection } from "./components/LightsSection";
import { ScenesSection } from "./components/ScenesSection";
import {
  executeSpaceEditOperations,
  type LightFunction,
  type SpaceEditOperation,
} from "./spaceEditActions";

type ControlCommitPhase = "live" | "final";
type EditCategory = "scenes" | "lights" | "switches" | "sensors";
type SectionId = EditCategory;

const DEFAULT_SECTION_ORDER: SectionId[] = [
  "scenes",
  "lights",
  "switches",
  "sensors",
];

const readSectionOrder = (key: string): SectionId[] => {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(stored) &&
      DEFAULT_SECTION_ORDER.every((id) => stored.includes(id))
      ? stored
      : DEFAULT_SECTION_ORDER;
  } catch {
    return DEFAULT_SECTION_ORDER;
  }
};

const EmptyEditSection: React.FC<{ title: string }> = ({ title }) => (
  <div className="flex flex-col gap-3">
    <p className="text-sm font-medium text-muted-foreground">
      {title} <span className="text-muted-foreground/60">0</span>
    </p>
    <div className="flex min-h-32 items-center justify-center rounded-2xl border-2 border-dashed border-border text-sm text-muted-foreground/70">
      No {title.toLowerCase()} in this space
    </div>
  </div>
);

const SortableSection: React.FC<{
  id: SectionId;
  editing: boolean;
  disabled: boolean;
  children: React.ReactNode;
  onPointerDownCapture: React.PointerEventHandler<HTMLDivElement>;
  onPointerMoveCapture: React.PointerEventHandler<HTMLDivElement>;
  onPointerUpCapture: React.PointerEventHandler<HTMLDivElement>;
  onClickCapture: React.MouseEventHandler<HTMLDivElement>;
}> = ({
  id,
  editing,
  disabled,
  children,
  onPointerDownCapture,
  onPointerMoveCapture,
  onPointerUpCapture,
  onClickCapture,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !editing });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: DndCSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : undefined,
      }}
      onPointerDownCapture={onPointerDownCapture}
      onPointerMoveCapture={onPointerMoveCapture}
      onPointerUpCapture={onPointerUpCapture}
      onClickCapture={onClickCapture}
      className={cn(
        "relative transition-opacity",
        disabled && "opacity-40",
      )}
    >
      {editing && (
        <button
          type="button"
          aria-label={`Reorder ${id}`}
          className="absolute -left-9 top-2 z-10 flex size-8 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground hover:bg-muted active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={18} />
        </button>
      )}
      {children}
    </div>
  );
};

interface SpaceScreenProps {
  roomZone: HueRoomZone;
  roomZones: HueRoomZone[];
  allLights: HueLight[];
  allScenes: HueScene[];
  lights: HueLight[];
  scenes: HueScene[];
  /** Live accessory readings keyed by owning device id. */
  readingsByDevice: Map<string, HueAccessoryService[]>;
  activeSceneId: string | null;
  selectedLightId: string | null;
  error: string | null;
  hueEventRevision: number;
  onRoomZoneToggle: (roomZone: HueRoomZone, nextOn: boolean) => void;
  onRoomZoneBrightness: (
    roomZone: HueRoomZone,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
  onLightToggle: (light: HueLight, nextOn: boolean) => void;
  onLightBrightness: (
    light: HueLight,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
  /** Open the multi-light group pane for the whole room/zone. */
  onOpenGroup: (roomZone: HueRoomZone) => void;
  onSelectLight: (id: string) => void;
  /** Tapping a scene card: apply its stored colors to the room's lights. */
  onSceneApply: (scene: HueScene) => void;
  /** Open the side pane on a scene without applying it (the card's triple-dot button). */
  onSceneInspect: (scene: HueScene) => void;
  /** The card's play/stop button: start or stop the dynamic palette. */
  onSceneTogglePlay: (scene: HueScene) => void;
  /** Transient speed change for the scene that is currently playing. */
  onDynamicSpeedLive: (scene: HueScene, step: number) => void;
  onGallerySceneCreate: (preset: HueGalleryScenePreset) => Promise<void>;
  /** Apply a gallery preset to the room's lights once, without saving a scene. */
  onGallerySceneApplyOnce: (preset: HueGalleryScenePreset) => void;
  /** Live-preview a gallery preset on the room's real lights (no save). */
  onGalleryScenePreview: (preset: HueGalleryScenePreset) => void;
  /** Revert the live preview when the gallery is dismissed without adding. */
  onGalleryScenePreviewEnd: () => void;
  onRefresh: () => Promise<void>;
}

export const SpaceScreen: React.FC<SpaceScreenProps> = ({
  roomZone,
  roomZones,
  allLights,
  allScenes,
  lights,
  scenes,
  readingsByDevice,
  activeSceneId,
  selectedLightId,
  error,
  hueEventRevision,
  onRoomZoneToggle,
  onRoomZoneBrightness,
  onLightToggle,
  onLightBrightness,
  onOpenGroup,
  onSelectLight,
  onSceneApply,
  onSceneInspect,
  onSceneTogglePlay,
  onDynamicSpeedLive,
  onGallerySceneCreate,
  onGallerySceneApplyOnce,
  onGalleryScenePreview,
  onGalleryScenePreviewEnd,
  onRefresh,
}) => {
  const [editing, setEditing] = useState(false);
  const [selection, setSelection] = useState<{
    category: EditCategory;
    ids: Set<string>;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionDialog, setActionDialog] = useState<
    | "copy-scenes"
    | "move-lights"
    | "light-function"
    | "move-accessories"
    | "delete-scenes"
    | "remove-lights"
    | "unassign-accessories"
    | "space-name"
    | "space-icon"
    | null
  >(null);
  const [actionValue, setActionValue] = useState("");
  const [detailsName, setDetailsName] = useState(roomZone.name);
  const [detailsArchetype, setDetailsArchetype] = useState(roomZone.class);
  const sensorsForSections = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const pointerGesture = useRef({
    x: 0,
    y: 0,
    trackingTile: false,
    moved: false,
  });
  const storageKey = `hue-space-section-order:${roomZone.id}`;
  const [sectionOrder, setSectionOrder] = useState<SectionId[]>(() =>
    readSectionOrder(storageKey),
  );

  useEffect(() => {
    const startEditing = () => {
      setSectionOrder(readSectionOrder(storageKey));
      setEditing(true);
      setSaving(false);
      setSelection(null);
      window.dispatchEvent(
        new CustomEvent("hue-space-edit-state", { detail: true }),
      );
    };
    const finishEditing = () => {
      setEditing(false);
      setSaving(false);
      setSelection(null);
      window.dispatchEvent(
        new CustomEvent("hue-space-edit-state", { detail: false }),
      );
    };
    const editName = () => {
      setDetailsName(roomZone.name);
      setDetailsArchetype(roomZone.class);
      setActionDialog("space-name");
    };
    const editIcon = () => {
      setDetailsName(roomZone.name);
      setDetailsArchetype(roomZone.class);
      setActionDialog("space-icon");
    };
    window.addEventListener("hue-space-edit-request", startEditing);
    window.addEventListener("hue-space-edit-save", finishEditing);
    window.addEventListener("hue-space-edit-name", editName);
    window.addEventListener("hue-space-edit-icon", editIcon);
    return () => {
      window.removeEventListener("hue-space-edit-request", startEditing);
      window.removeEventListener("hue-space-edit-save", finishEditing);
      window.removeEventListener("hue-space-edit-name", editName);
      window.removeEventListener("hue-space-edit-icon", editIcon);
    };
  }, [roomZone.class, roomZone.name, storageKey]);

  useEffect(() => {
    if (!editing || actionDialog != null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      window.dispatchEvent(new CustomEvent("hue-space-edit-save"));
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actionDialog, editing]);

  useEffect(() => {
    document
      .querySelectorAll<HTMLElement>("[data-edit-selected]")
      .forEach((element) => element.removeAttribute("data-edit-selected"));
    for (const id of selection?.ids ?? []) {
      document
        .querySelectorAll<HTMLElement>(
          `[data-edit-id="${CSS.escape(id)}"]`,
        )
        .forEach((element) => element.setAttribute("data-edit-selected", ""));
    }
  }, [selection]);

  const switches = roomZone.accessories.filter((a) => a.kind === "switch");
  const sensors = roomZone.accessories.filter((a) => a.kind === "sensor");

  // The dynamic scene currently animating in this space, if any. Its live speed
  // slider lives inside the group controls' expandable panel.
  const playingScene = scenes.find(isSceneDynamicActive) ?? null;

  const showScenes = scenes.length > 0 || lights.length > 0;

  const selectFrom =
    (category: EditCategory) => (event: React.MouseEvent<HTMLDivElement>) => {
      if (!editing) return;
      event.preventDefault();
      event.stopPropagation();
      if (pointerGesture.current.moved) {
        pointerGesture.current.moved = false;
        pointerGesture.current.trackingTile = false;
        return;
      }
      pointerGesture.current.trackingTile = false;
      if (selection && selection.category !== category) return;
      const tile = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-edit-id]",
      );
      const id = tile?.dataset.editId;
      if (!id) return;
      setSelection((current) => {
        const ids = new Set(current?.ids ?? []);
        if (ids.has(id)) ids.delete(id);
        else ids.add(id);
        return ids.size > 0 ? { category, ids } : null;
      });
    };

  const handleSectionDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setSectionOrder((current) => {
      const from = current.indexOf(active.id as SectionId);
      const to = current.indexOf(over.id as SectionId);
      if (from < 0 || to < 0) return current;
      const next = arrayMove(current, from, to);
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  const runOperation = async (operation: SpaceEditOperation) => {
    setSaving(true);
    try {
      await executeSpaceEditOperations([operation], {
        activeSpace: roomZone,
        roomZones,
        lights: allLights,
        scenes: allScenes,
      });
      await onRefresh();
      setSelection(null);
      setActionDialog(null);
      setActionValue("");
      toast.success("Change saved");
    } catch (operationError) {
      toast.error(String(operationError) || "Unable to apply this change.");
    } finally {
      setSaving(false);
    }
  };

  const sectionContent: Record<SectionId, React.ReactNode> = {
    scenes: showScenes ? (
      <ScenesSection
        roomZoneName={roomZone.name}
        scenes={scenes}
        activeSceneId={activeSceneId}
        onSceneApply={onSceneApply}
        onSceneInspect={onSceneInspect}
        onSceneTogglePlay={onSceneTogglePlay}
        onGallerySceneCreate={onGallerySceneCreate}
        onGallerySceneApplyOnce={onGallerySceneApplyOnce}
        onGalleryScenePreview={onGalleryScenePreview}
        onGalleryScenePreviewEnd={onGalleryScenePreviewEnd}
      />
    ) : editing ? (
      <EmptyEditSection title="Scenes" />
    ) : null,
    lights: lights.length > 0 || !editing ? (
      <LightsSection
        lights={lights}
        selectedLightId={selectedLightId}
        hueEventRevision={hueEventRevision}
        onSelectLight={onSelectLight}
        onLightToggle={onLightToggle}
        onLightBrightness={onLightBrightness}
      />
    ) : (
      <EmptyEditSection title="Lights" />
    ),
    switches: switches.length > 0 ? (
      <AccessorySection
        title="Switches"
        icon={ToggleLeft}
        accessories={switches}
        readingsByDevice={readingsByDevice}
      />
    ) : editing ? (
      <EmptyEditSection title="Switches" />
    ) : null,
    sensors: sensors.length > 0 ? (
      <AccessorySection
        title="Sensors"
        icon={Radar}
        accessories={sensors}
        readingsByDevice={readingsByDevice}
      />
    ) : editing ? (
      <EmptyEditSection title="Sensors" />
    ) : null,
  };
  const destructiveDialog =
    actionDialog === "delete-scenes" ||
    actionDialog === "remove-lights" ||
    actionDialog === "unassign-accessories";

  return (
    <section
      inert={saving}
      aria-busy={saving}
      className={cn(
        "mx-auto flex w-full min-w-0 flex-col gap-6 transition-opacity",
        saving && "cursor-wait opacity-60",
      )}
    >
      {error && <p className="text-sm text-destructive">{error}</p>}
      {/* Keyed on the space so the expanded/collapsed state resets when the
          user enters or leaves a room/zone. */}
      <GroupControls
        key={roomZone.id}
        roomZone={roomZone}
        lights={lights}
        playingScene={playingScene}
        hueEventRevision={hueEventRevision}
        onToggle={onRoomZoneToggle}
        onBrightness={onRoomZoneBrightness}
        onOpen={onOpenGroup}
        onDynamicSpeedLive={onDynamicSpeedLive}
      />
      <DndContext
        sensors={sensorsForSections}
        collisionDetection={closestCenter}
        onDragEnd={handleSectionDragEnd}
      >
        <SortableContext
          items={sectionOrder}
          strategy={verticalListSortingStrategy}
          disabled={!editing}
        >
          {sectionOrder.map((sectionId) => {
            const content = sectionContent[sectionId];
            if (!content) return null;
            return (
              <SortableSection
                key={sectionId}
                id={sectionId}
                editing={editing}
                disabled={
                  editing &&
                  selection != null &&
                  selection.category !== sectionId
                }
                onPointerDownCapture={(event) => {
                  if (!editing) return;
                  pointerGesture.current = {
                    x: event.clientX,
                    y: event.clientY,
                    trackingTile:
                      (event.target as HTMLElement).closest("[data-edit-id]") !=
                      null,
                    moved: false,
                  };
                }}
                onPointerMoveCapture={(event) => {
                  const gesture = pointerGesture.current;
                  if (!editing || !gesture.trackingTile || gesture.moved) return;
                  if (
                    Math.hypot(
                      event.clientX - gesture.x,
                      event.clientY - gesture.y,
                    ) >= 5
                  )
                    gesture.moved = true;
                }}
                onPointerUpCapture={() => {
                  window.setTimeout(() => {
                    pointerGesture.current.moved = false;
                    pointerGesture.current.trackingTile = false;
                  }, 0);
                }}
                onClickCapture={selectFrom(sectionId)}
              >
                {content}
              </SortableSection>
            );
          })}
        </SortableContext>
      </DndContext>
      {editing && selection && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-xl">
          <span className="px-2 text-sm font-medium">
            {selection.ids.size} selected
          </span>
          {selection.category === "scenes" ? (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setActionValue("");
                  setActionDialog("copy-scenes");
                }}
              >
                <Copy /> Copy to…
              </Button>
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => setActionDialog("delete-scenes")}
              >
                <Trash2 /> Remove
              </Button>
            </>
          ) : selection.category === "lights" ? (
            <>
              {roomZone.resourceType === "room" && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setActionValue("");
                    setActionDialog("move-lights");
                  }}
                >
                  <MoveRight /> Move to…
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  setActionValue("");
                  setActionDialog("light-function");
                }}
              >
                <Pencil /> Edit function
              </Button>
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => setActionDialog("remove-lights")}
              >
                <Trash2 /> Remove
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setActionValue("");
                  setActionDialog("move-accessories");
                }}
              >
                <MoveRight /> Move to room…
              </Button>
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => setActionDialog("unassign-accessories")}
              >
                <Trash2 /> Unassign
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Clear selection"
            onClick={() => setSelection(null)}
          >
            <X />
          </Button>
        </div>
      )}
      <Dialog
        open={actionDialog != null}
        onOpenChange={(open) => {
          if (!open) {
            setActionDialog(null);
            setActionValue("");
          }
        }}
      >
        <DialogContent
          inert={saving}
          aria-busy={saving}
          className={cn(actionDialog === "space-icon" && "sm:max-w-lg")}
        >
          <DialogHeader>
            <DialogTitle>
              {actionDialog === "copy-scenes"
                ? "Copy scenes"
                : actionDialog === "move-lights"
                  ? "Move lights"
                  : actionDialog === "move-accessories"
                    ? "Move accessories"
                    : actionDialog === "delete-scenes"
                      ? "Delete selected scenes?"
                      : actionDialog === "remove-lights"
                        ? `Remove selected lights from ${roomZone.name}?`
                        : actionDialog === "unassign-accessories"
                          ? "Unassign selected accessories?"
                          : actionDialog === "space-name"
                            ? `Rename ${roomZone.resourceType}`
                            : actionDialog === "space-icon"
                              ? `Change ${roomZone.resourceType} icon`
                          : "Edit light function"}
            </DialogTitle>
            <DialogDescription>
              {actionDialog === "space-name" || actionDialog === "space-icon"
                ? "This change is saved immediately to the Hue Bridge."
                : destructiveDialog
                ? "This change is applied immediately and cannot be undone from this screen."
                : "This change will be applied immediately to the Hue Bridge."}
            </DialogDescription>
          </DialogHeader>
          {actionDialog === "space-name" ? (
            <Input
              value={detailsName}
              maxLength={32}
              autoFocus
              aria-label={`${roomZone.resourceType} name`}
              onChange={(event) => setDetailsName(event.target.value)}
            />
          ) : actionDialog === "space-icon" ? (
            <ScrollArea
              fade
              hideScrollbar
              className="h-80"
              viewportClassName="pr-1"
            >
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {SPACE_ARCHETYPES.map((option) => {
                  const Icon = getRoomZoneIcon(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setDetailsArchetype(option.value)}
                      className={cn(
                        "flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-border p-3 text-center text-xs text-muted-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        option.value === detailsArchetype &&
                          "border-primary bg-accent text-foreground ring-1 ring-primary",
                      )}
                    >
                      <Icon size={26} className="text-foreground" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          ) : !destructiveDialog && (
            <Select
              value={actionValue}
              onValueChange={(value) => setActionValue(value ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={
                    actionDialog === "light-function"
                      ? "Choose function"
                      : "Choose destination"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {actionDialog === "light-function" ? (
                  <>
                    <SelectItem value="functional">Task</SelectItem>
                    <SelectItem value="decorative">Decoration</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </>
                ) : (
                  roomZones
                    .filter((space) => {
                      if (space.id === roomZone.id) return false;
                      if (actionDialog === "move-accessories")
                        return space.resourceType === "room";
                      if (actionDialog === "move-lights")
                        return space.resourceType === roomZone.resourceType;
                      return true;
                    })
                    .map((space) => (
                      <SelectItem key={space.id} value={space.id}>
                        {space.name}
                      </SelectItem>
                    ))
                )}
              </SelectContent>
            </Select>
          )}
          <DialogFooter className="flex-row justify-end">
            <DialogClose render={<Button variant="outline" />}>
              Close
            </DialogClose>
            <Button
              variant={destructiveDialog ? "destructive" : "default"}
              disabled={
                saving ||
                (actionDialog === "space-name"
                  ? !detailsName.trim()
                  : actionDialog === "space-icon"
                    ? !detailsArchetype
                    : (!destructiveDialog && !actionValue) || !selection)
              }
              onClick={async () => {
                if (
                  actionDialog === "space-name" ||
                  actionDialog === "space-icon"
                ) {
                  await runOperation({
                    type: "update-space-metadata",
                    name: detailsName,
                    archetype: detailsArchetype,
                  });
                } else if (
                  !selection ||
                  (!destructiveDialog && !actionValue)
                ) {
                  return;
                } else if (actionDialog === "copy-scenes") {
                  await runOperation({
                    type: "copy-scenes",
                    sceneIds: [...selection.ids],
                    targetSpaceId: actionValue,
                  });
                } else if (actionDialog === "move-lights") {
                  await runOperation({
                    type: "place-lights",
                    lightIds: [...selection.ids],
                    targetSpaceId: actionValue,
                  });
                } else if (actionDialog === "move-accessories") {
                  await runOperation({
                    type: "place-accessories",
                    deviceIds: [...selection.ids],
                    targetRoomId: actionValue,
                  });
                } else if (actionDialog === "light-function") {
                  await runOperation({
                    type: "set-light-function",
                    lightIds: [...selection.ids],
                    value: actionValue as LightFunction,
                  });
                } else if (actionDialog === "delete-scenes") {
                  await runOperation({
                    type: "delete-scenes",
                    sceneIds: [...selection.ids],
                  });
                } else if (actionDialog === "remove-lights") {
                  await runOperation({
                    type: "place-lights",
                    lightIds: [...selection.ids],
                    targetSpaceId: null,
                  });
                } else if (actionDialog === "unassign-accessories") {
                  await runOperation({
                    type: "place-accessories",
                    deviceIds: [...selection.ids],
                    targetRoomId: null,
                  });
                }
              }}
            >
              {saving && <LoaderCircle className="animate-spin" />}
              {saving
                ? "Applying…"
                : destructiveDialog
                  ? "Confirm"
                  : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};
