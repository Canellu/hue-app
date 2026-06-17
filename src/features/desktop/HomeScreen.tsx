import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  closestCorners,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GroupSection } from "./GroupSection";
import { RoomTile } from "./RoomTile";
import type { HueGroup, HueLight } from "./types";
import type { DashboardLayout } from "./useDashboardLayout";

interface HomeScreenProps {
  groups: HueGroup[];
  lights: HueLight[];
  isLoading: boolean;
  error: string | null;
  /** Layout to render — the live draft while editing, else the committed one. */
  layout: DashboardLayout;
  editing: boolean;
  onLayoutChange: (next: DashboardLayout) => void;
  onOpenRoom: (id: string) => void;
  onGroupToggle: (group: HueGroup, nextOn: boolean) => void;
  onGroupBrightness: (group: HueGroup, pct: number) => void;
  /** Create-group dialog state, lifted so the header can trigger it. */
  isCreatingGroup: boolean;
  onCreateGroup: (name: string) => void;
  onCloseCreateGroup: () => void;
  onRenameGroup: (groupId: string, name: string) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  groups,
  lights,
  isLoading,
  error,
  layout,
  editing,
  onLayoutChange,
  onOpenRoom,
  onGroupToggle,
  onGroupBrightness,
  isCreatingGroup,
  onCreateGroup,
  onCloseCreateGroup,
  onRenameGroup,
}) => {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  // Hysteresis for cross-container dragging: remember the last resolved target
  // and freeze re-evaluation for one frame right after a move. Without this the
  // pointer sitting on a group boundary makes the tile oscillate between groups.
  const lastOverId = useRef<string | null>(null);
  const recentlyMovedToNewContainer = useRef(false);

  const roomById = useMemo(() => {
    const map = new Map<string, HueGroup>();
    for (const group of groups) map.set(group.id, group);
    return map;
  }, [groups]);

  const membersOf = useMemo(() => {
    return (room: HueGroup): HueLight[] => {
      const ids = new Set(room.lightIds);
      return lights.filter((light) => ids.has(light.id));
    };
  }, [lights]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  /** Resolves which group container an id belongs to (group id or room id). */
  const findContainer = useCallback(
    (id: string): string | undefined => {
      if (layout.some((group) => group.id === id)) return id;
      return layout.find((group) => group.roomIds.includes(id))?.id;
    },
    [layout],
  );

  // Reset the "just moved" guard one frame after the layout settles.
  useEffect(() => {
    requestAnimationFrame(() => {
      recentlyMovedToNewContainer.current = false;
    });
  }, [layout]);

  // Stable multi-container detection (adapted from dnd-kit's example): pointer
  // first, narrowed to the closest tile inside the hovered group, with the
  // hysteresis guard so a tile won't ping-pong across a group boundary.
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      // Whole-group reordering only collides with other group sections.
      if (activeGroupId) {
        return closestCorners({
          ...args,
          droppableContainers: args.droppableContainers.filter((c) =>
            layout.some((group) => group.id === c.id),
          ),
        });
      }

      const pointer = pointerWithin(args);
      const intersections =
        pointer.length > 0 ? pointer : rectIntersection(args);
      let overId = getFirstCollision(intersections, "id");

      if (overId != null) {
        const container = layout.find((group) => group.id === overId);
        // Over a container: resolve to the nearest tile inside it for a stable
        // insertion point instead of the section edge.
        if (container && container.roomIds.length > 0) {
          const inner = closestCenter({
            ...args,
            droppableContainers: args.droppableContainers.filter(
              (c) =>
                c.id !== overId && container.roomIds.includes(String(c.id)),
            ),
          });
          if (inner.length > 0) overId = inner[0].id;
        }
        lastOverId.current = String(overId);
        return [{ id: overId }];
      }

      if (recentlyMovedToNewContainer.current) {
        lastOverId.current = activeRoomId;
      }
      return lastOverId.current ? [{ id: lastOverId.current }] : [];
    },
    [activeGroupId, activeRoomId, layout],
  );

  const handleDragStart = (event: DragStartEvent) => {
    const type = event.active.data.current?.type;
    if (type === "room") setActiveRoomId(String(event.active.id));
    if (type === "group") setActiveGroupId(String(event.active.id));
    lastOverId.current = String(event.active.id);
  };

  const clearActive = () => {
    setActiveRoomId(null);
    setActiveGroupId(null);
    lastOverId.current = null;
    recentlyMovedToNewContainer.current = false;
  };

  // Moves a tile between sections live as it is dragged over a new container.
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.data.current?.type !== "room") return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const from = findContainer(activeId);
    const to = findContainer(overId);
    if (!from || !to || from === to) return;

    // Freeze detection for the next frame so the post-move layout shift can't
    // immediately bounce the tile back to where it came from.
    recentlyMovedToNewContainer.current = true;

    onLayoutChange(
      layout.map((group) => {
        if (group.id === from) {
          return {
            ...group,
            roomIds: group.roomIds.filter((id) => id !== activeId),
          };
        }
        if (group.id === to) {
          // Insert at the hovered tile's position, or append for empty/header.
          const overIndex = group.roomIds.indexOf(overId);
          const next = [...group.roomIds];
          const insertAt = overIndex >= 0 ? overIndex : next.length;
          next.splice(insertAt, 0, activeId);
          return { ...group, roomIds: next };
        }
        return group;
      }),
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    clearActive();
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    // Whole-section reordering.
    if (active.data.current?.type === "group") {
      const oldIndex = layout.findIndex((g) => g.id === activeId);
      const newIndex = layout.findIndex((g) => g.id === overId);
      if (oldIndex >= 0 && newIndex >= 0) {
        onLayoutChange(arrayMove(layout, oldIndex, newIndex));
      }
      return;
    }

    // Intra-section sorting (cross-section moves already handled in dragOver).
    const container = findContainer(activeId);
    if (!container || container !== findContainer(overId)) return;
    onLayoutChange(
      layout.map((group) => {
        if (group.id !== container) return group;
        const oldIndex = group.roomIds.indexOf(activeId);
        const newIndex = group.roomIds.indexOf(overId);
        if (oldIndex < 0 || newIndex < 0) return group;
        return {
          ...group,
          roomIds: arrayMove(group.roomIds, oldIndex, newIndex),
        };
      }),
    );
  };

  const submitNewGroup = () => {
    const name = newName.trim();
    if (!name) return;
    onCreateGroup(name);
    setNewName("");
  };

  const closeCreate = () => {
    setNewName("");
    onCloseCreateGroup();
  };

  // A group can only be removed once it holds no spaces, so no room is orphaned.
  const handleDeleteGroup = (groupId: string) => {
    onLayoutChange(layout.filter((group) => group.id !== groupId));
  };

  if (isLoading && groups.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Resolve each group's live, ordered room data once for rendering.
  const sections = layout.map((group) => ({
    group,
    rooms: group.roomIds
      .map((id) => roomById.get(id))
      .filter((r): r is HueGroup => r !== undefined),
  }));

  const activeRoom = activeRoomId ? roomById.get(activeRoomId) : null;
  const activeGroup = activeGroupId
    ? sections.find(({ group }) => group.id === activeGroupId)
    : null;

  const dashboard = (
    <div className="flex flex-col gap-8">
      {sections.map(({ group, rooms }) => (
        <GroupSection
          key={group.id}
          group={group}
          rooms={rooms}
          lights={lights}
          editing={editing}
          onOpenRoom={onOpenRoom}
          onGroupToggle={onGroupToggle}
          onGroupBrightness={onGroupBrightness}
          onDeleteGroup={handleDeleteGroup}
          onRenameGroup={onRenameGroup}
        />
      ))}
    </div>
  );

  return (
    <div className="mx-auto flex w-full flex-col gap-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {groups.length === 0 && !isLoading ? (
        <p className="text-sm text-muted-foreground">No rooms found.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={clearActive}
        >
          <SortableContext
            items={layout.map((group) => group.id)}
            strategy={verticalListSortingStrategy}
            disabled={!editing}
          >
            {dashboard}
          </SortableContext>
          <DragOverlay>
            {editing && activeRoom ? (
              <RoomTile
                group={activeRoom}
                members={membersOf(activeRoom)}
                editing
                onOpenRoom={onOpenRoom}
                onGroupToggle={onGroupToggle}
                onGroupBrightness={onGroupBrightness}
              />
            ) : editing && activeGroup ? (
              // A lightweight, non-sortable clone so dropping a group doesn't
              // flash: the overlay carries the visual while the real section
              // stays put and reorders without a drop-animation jump.
              <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border bg-background/95 p-4 shadow-xl">
                <header className="flex items-center gap-2">
                  <h2 className="font-heading text-lg font-medium">
                    {activeGroup.group.name}
                  </h2>
                  <span className="text-sm text-muted-foreground">
                    {activeGroup.rooms.length}{" "}
                    {activeGroup.rooms.length === 1 ? "space" : "spaces"}
                  </span>
                </header>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
                  {activeGroup.rooms.length === 0 ? (
                    // Mirror GroupSection's empty placeholder so a dragged empty
                    // group looks identical to its resting state.
                    <div className="col-span-full flex min-h-36 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 text-sm text-muted-foreground">
                      Drag spaces here
                    </div>
                  ) : (
                    activeGroup.rooms.map((room) => (
                      <RoomTile
                        key={room.id}
                        group={room}
                        members={membersOf(room)}
                        editing
                        onOpenRoom={onOpenRoom}
                        onGroupToggle={onGroupToggle}
                        onGroupBrightness={onGroupBrightness}
                      />
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <Dialog
        open={isCreatingGroup}
        onOpenChange={(open) => {
          if (!open) closeCreate();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new group</DialogTitle>
            <DialogDescription>
              Groups organize your dashboard. Name a new group, then drag spaces
              into it from the layout editor.
            </DialogDescription>
          </DialogHeader>

          <form
            id="create-group-form"
            onSubmit={(e) => {
              e.preventDefault();
              submitNewGroup();
            }}
            className="flex flex-col gap-2"
          >
            <Label htmlFor="new-group-name">Group name</Label>
            <Input
              id="new-group-name"
              type="text"
              autoFocus
              placeholder="e.g. Upstairs, Outdoor, Favorites"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </form>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              form="create-group-form"
              disabled={!newName.trim()}
            >
              Create group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
