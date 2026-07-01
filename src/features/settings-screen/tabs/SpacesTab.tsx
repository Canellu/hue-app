import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HueLight, HueRoomZone, HueSettingsDevice } from "@/types/hue";
import { Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { EditableResourceRow } from "../components/EditableResourceRow";
import { EmptyText } from "../components/EmptyText";
import { Panel } from "../components/Panel";
import { ResourceChecklist } from "../components/ResourceChecklist";
import {
  SETTINGS_EXPANDABLE_CARD,
  SETTINGS_EXPANDABLE_TRIGGER,
} from "../constants";
import type { DeleteResource, RenameResource } from "../types";

export const SpacesTab = ({
  lights,
  roomZones,
  devices,
  onRename,
  onDelete,
  onUpdateMembers,
}: {
  lights: HueLight[];
  roomZones: HueRoomZone[];
  devices: HueSettingsDevice[];
  onRename: RenameResource;
  onDelete: DeleteResource;
  onUpdateMembers: (roomZone: HueRoomZone, ids: string[]) => Promise<void>;
}) => {
  const rooms = roomZones.filter((space) => space.resourceType === "room");
  const zones = roomZones.filter((space) => space.resourceType === "zone");

  const renderSpaces = (spaces: HueRoomZone[], emptyText: string) => (
    <div className="grid min-w-0 gap-3">
      {spaces.map((roomZone) => (
        <SpaceManagementRow
          key={roomZone.id}
          roomZone={roomZone}
          devices={devices}
          lights={lights}
          onRename={onRename}
          onDelete={onDelete}
          onUpdateMembers={onUpdateMembers}
        />
      ))}
      {spaces.length === 0 && <EmptyText>{emptyText}</EmptyText>}
    </div>
  );

  return (
    <div className="space-y-5">
      <Panel title="Rooms" contentClassName="min-w-0 overflow-hidden">
        {renderSpaces(rooms, "No rooms yet.")}
      </Panel>
      <Panel title="Zones" contentClassName="min-w-0 overflow-hidden">
        {renderSpaces(zones, "No zones yet.")}
      </Panel>
    </div>
  );
};

const SpaceManagementRow = ({
  roomZone,
  devices,
  lights,
  onRename,
  onDelete,
  onUpdateMembers,
}: {
  roomZone: HueRoomZone;
  devices: HueSettingsDevice[];
  lights: HueLight[];
  onRename: RenameResource;
  onDelete: DeleteResource;
  onUpdateMembers: (roomZone: HueRoomZone, ids: string[]) => Promise<void>;
}) => {
  const memberOptions =
    roomZone.resourceType === "room"
      ? devices.filter((device) => !device.serviceTypes.includes("bridge"))
      : lights;
  const memberIds =
    roomZone.resourceType === "room" ? roomZone.deviceIds : roomZone.lightIds;

  return (
    <EditableResourceRow
      id={roomZone.id}
      resourceType={roomZone.resourceType}
      name={roomZone.name}
      eyebrow={roomZone.resourceType === "room" ? "Room" : "Zone"}
      meta={[
        `${roomZone.lightCount} ${roomZone.lightCount === 1 ? "light" : "lights"}`,
        roomZone.anyOn ? "On" : "Off",
        roomZone.class,
      ]}
      onRename={onRename}
      onDelete={onDelete}
      deleteDescription={`Delete ${roomZone.resourceType} "${roomZone.name}" from the bridge.`}
    >
      <MembershipEditor
        roomZone={roomZone}
        options={memberOptions}
        selectedIds={memberIds}
        onSave={(ids) => onUpdateMembers(roomZone, ids)}
      />
    </EditableResourceRow>
  );
};

const MembershipEditor = ({
  roomZone,
  options,
  selectedIds,
  onSave,
}: {
  roomZone: HueRoomZone;
  options: Array<HueSettingsDevice | HueLight>;
  selectedIds: string[];
  onSave: (ids: string[]) => Promise<void>;
}) => {
  const [draftIds, setDraftIds] = useState(selectedIds);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraftIds(selectedIds);
  }, [selectedIds]);

  const isDirty = !sameIdSet(draftIds, selectedIds);
  const toggle = (id: string) => {
    setDraftIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const save = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onSave(draftIds);
    } catch (saveError) {
      setError(String(saveError) || "Unable to update members.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Accordion
      className={cn(
        "mt-3 min-w-0 max-w-full",
        SETTINGS_EXPANDABLE_CARD,
      )}
    >
      <AccordionItem
        value="members"
        className="min-w-0 data-open:bg-transparent [&_[data-slot=accordion-content]]:border-t [&_[data-slot=accordion-content]]:border-border/60"
      >
        <AccordionTrigger
          className={cn(
            "min-w-0 p-4 hover:no-underline aria-expanded:bg-(--settings-control-open)",
            SETTINGS_EXPANDABLE_TRIGGER,
          )}
        >
          Edit {roomZone.resourceType === "room" ? "devices" : "lights"}
        </AccordionTrigger>
        <AccordionContent className="min-w-0 pt-4">
          <div className="grid min-w-0 gap-3">
            <ResourceChecklist
              emptyText={
                roomZone.resourceType === "room"
                  ? "No devices are loaded."
                  : "No lights are loaded."
              }
              options={options}
              selectedIds={draftIds}
              onToggle={toggle}
            />
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              {error ? (
                <p className="min-w-0 break-words text-sm text-destructive">
                  {error}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {draftIds.length} selected
                </p>
              )}
              <Button
                type="button"
                size="sm"
                className="gap-2"
                disabled={!isDirty || isSaving}
                onClick={() => void save()}
              >
                {isSaving ? <Loader2 className="animate-spin" /> : <Save />}
                Save members
              </Button>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

const sameIdSet = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
};
