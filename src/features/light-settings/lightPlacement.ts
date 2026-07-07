import type { HueLight, HueRoomZone } from "@/types/hue";
import { invoke } from "@tauri-apps/api/core";

export const roomForLight = (
  light: HueLight,
  roomZones: HueRoomZone[],
): string | null =>
  roomZones.find(
    (space) =>
      space.resourceType === "room" &&
      light.deviceId != null &&
      space.deviceIds.includes(light.deviceId),
  )?.id ?? null;

export const zonesForLight = (
  light: HueLight,
  roomZones: HueRoomZone[],
): string[] =>
  roomZones
    .filter(
      (space) =>
        space.resourceType === "zone" && space.lightIds.includes(light.id),
    )
    .map((space) => space.id);

export const updateRoomPlacement = async (
  light: HueLight,
  roomZones: HueRoomZone[],
  roomId: string | null,
) => {
  const deviceId = light.deviceId;
  if (!deviceId) return;

  await Promise.all(
    roomZones
      .filter(
        (space) =>
          space.resourceType === "room" &&
          space.id !== roomId &&
          space.deviceIds.includes(deviceId),
      )
      .map((space) =>
        invoke("update-room-members", {
          roomId: space.id,
          deviceIds: space.deviceIds.filter((id) => id !== deviceId),
        }),
      ),
  );

  if (roomId) {
    await invoke("assign-device-to-room", { deviceId, roomId });
  }
};

export const updateZonesPlacement = async (
  light: HueLight,
  roomZones: HueRoomZone[],
  zoneIds: string[],
) => {
  const deviceId = light.deviceId;
  if (!deviceId) return;

  const target = new Set(zoneIds);
  const current = roomZones.filter(
    (space) =>
      space.resourceType === "zone" && space.lightIds.includes(light.id),
  );
  const currentIds = new Set(current.map((space) => space.id));

  const removals = current
    .filter((space) => !target.has(space.id))
    .map((space) =>
      invoke("update-zone-members", {
        zoneId: space.id,
        lightIds: space.lightIds.filter((id) => id !== light.id),
      }),
    );

  const additions = zoneIds
    .filter((zoneId) => !currentIds.has(zoneId))
    .map((zoneId) => invoke("assign-device-to-zone", { deviceId, zoneId }));

  await Promise.all([...removals, ...additions]);
};

export const sameIds = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((id) => right.includes(id));
