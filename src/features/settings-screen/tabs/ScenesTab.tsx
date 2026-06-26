import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { hueDynamicSpeedValueToStep } from "@/lib/hue-speed";
import type { HueRoomZone, HueScene } from "@/types/hue";
import { Loader2, Plus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { EditableResourceRow } from "../components/EditableResourceRow";
import { EmptyText } from "../components/EmptyText";
import { Panel } from "../components/Panel";
import type { DeleteResource, RenameResource } from "../types";

export const ScenesTab = ({
  roomZones,
  scenes,
  onRename,
  onDelete,
  onCreateScene,
}: {
  roomZones: HueRoomZone[];
  scenes: HueScene[];
  onRename: RenameResource;
  onDelete: DeleteResource;
  onCreateScene: (name: string, space: HueRoomZone) => Promise<void>;
}) => {
  const spacesById = useMemo(
    () => new Map(roomZones.map((roomZone) => [roomZone.id, roomZone])),
    [roomZones],
  );

  return (
    <div className="space-y-5">
      <Panel title="Create Scene">
        <CreateSceneForm roomZones={roomZones} onCreateScene={onCreateScene} />
      </Panel>
      <Panel title="Scenes">
        <div className="grid gap-3">
          {scenes.map((scene) => (
            <EditableSceneRow
              key={scene.id}
              scene={scene}
              space={scene.group ? spacesById.get(scene.group) : undefined}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
          {scenes.length === 0 && <EmptyText>No scenes loaded.</EmptyText>}
        </div>
      </Panel>
    </div>
  );
};

const CreateSceneForm = ({
  roomZones,
  onCreateScene,
}: {
  roomZones: HueRoomZone[];
  onCreateScene: (name: string, space: HueRoomZone) => Promise<void>;
}) => {
  const [name, setName] = useState("");
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const items = useMemo(() => {
    const map: Record<string, string> = {};
    for (const space of roomZones) {
      map[space.id] =
        `${space.resourceType === "room" ? "Room" : "Zone"} · ${space.name}`;
    }
    return map;
  }, [roomZones]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    const space = roomZones.find(
      (candidate) => candidate.id === selectedSpaceId,
    );
    if (!trimmed || !space || isSaving) return;
    setIsSaving(true);
    try {
      await onCreateScene(trimmed, space);
      setName("");
      setSelectedSpaceId(null);
    } catch {
      // Surfaced by the orchestrator in the shared settings error banner.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_auto_auto]"
      onSubmit={(event) => void submit(event)}
    >
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Scene name"
        aria-label="Scene name"
        disabled={isSaving}
      />
      <Select
        items={items}
        value={selectedSpaceId}
        onValueChange={(value) => setSelectedSpaceId(value as string | null)}
      >
        <SelectTrigger className="w-full sm:w-56">
          <SelectValue placeholder="Target space" />
        </SelectTrigger>
        <SelectContent>
          {roomZones.map((space) => (
            <SelectItem key={space.id} value={space.id}>
              {space.resourceType === "room" ? "Room" : "Zone"} · {space.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="submit"
        className="gap-2"
        disabled={!name.trim() || !selectedSpaceId || isSaving}
      >
        {isSaving ? <Loader2 className="animate-spin" /> : <Plus />}
        Save scene
      </Button>
    </form>
  );
};

const EditableSceneRow = ({
  scene,
  space,
  onRename,
  onDelete,
}: {
  scene: HueScene;
  space?: HueRoomZone;
  onRename: RenameResource;
  onDelete: DeleteResource;
}) => (
  <EditableResourceRow
    id={scene.id}
    resourceType={scene.resourceType}
    name={scene.name}
    eyebrow={`${scene.smart ? "Smart scene" : "Scene"} · ${space?.name ?? "No space"}`}
    meta={[
      scene.status,
      scene.dynamic
        ? scene.speed != null
          ? `Scene speed ${hueDynamicSpeedValueToStep(scene.speed)}`
          : "Dynamic"
        : null,
      `${scene.colors.length} ${scene.colors.length === 1 ? "color" : "colors"}`,
    ]}
    onRename={onRename}
    onDelete={onDelete}
    deleteDescription={`Remove scene "${scene.name}" from room/zone.`}
  />
);
