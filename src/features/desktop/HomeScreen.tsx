import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Loader2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GroupSection } from "./GroupSection";
import { RoomTile } from "./RoomTile";
import type { HueGroup, HueLight } from "./types";
import {
  newGroupId,
  type CustomGroup,
  type DashboardLayout,
} from "./useDashboardLayout";

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
}

/** Time-of-day greeting shown above the dashboard. */
const greeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
};

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
}) => {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

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
  const findContainer = (id: string): string | undefined => {
    if (layout.some((group) => group.id === id)) return id;
    return layout.find((group) => group.roomIds.includes(id))?.id;
  };

  const handleDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type === "room") {
      setActiveRoomId(String(event.active.id));
    }
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
    setActiveRoomId(null);
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
        return { ...group, roomIds: arrayMove(group.roomIds, oldIndex, newIndex) };
      }),
    );
  };

  const submitNewGroup = () => {
    const name = newName.trim();
    if (!name) {
      setCreating(false);
      return;
    }
    const group: CustomGroup = { id: newGroupId(), name, roomIds: [] };
    onLayoutChange([...layout, group]);
    setNewName("");
    setCreating(false);
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
        />
      ))}
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <h1 className="font-heading text-3xl font-semibold">{greeting()}</h1>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {groups.length === 0 && !isLoading ? (
        <p className="text-sm text-muted-foreground">No rooms found.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
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
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {editing &&
        (creating ? (
          <Input
            type="text"
            autoFocus
            className="max-w-xs"
            placeholder="Group name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={submitNewGroup}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitNewGroup();
              if (e.key === "Escape") {
                setNewName("");
                setCreating(false);
              }
            }}
          />
        ) : (
          <Button
            variant="outline"
            className="w-fit gap-2"
            onClick={() => setCreating(true)}
          >
            <Plus size={18} />
            Create New Group
          </Button>
        ))}
    </div>
  );
};
