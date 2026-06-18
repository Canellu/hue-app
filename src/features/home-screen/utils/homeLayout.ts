// Client-side Home layout: the Hue Bridge does not store custom visual layouts,
// so we persist a user-defined arrangement of rooms/zones into named sections
// in localStorage and reconcile it against live room/zone data on boot.

import type { HomeGroupingMode, HomeLayout } from "@/types/app-layout";
import type { HueRoomZone } from "@/types/hue";

interface StoredHomeLayoutSection {
  id: string;
  name: string;
  spaceIds?: unknown[];
  roomIds?: unknown[];
}

const STORAGE_KEY = "hue-dashboard-layout";
const MODE_STORAGE_KEY = "hue-dashboard-grouping-mode";
const DEFAULT_SECTION_ID = "group-all-spaces";
const DEFAULT_GROUPING_MODE: HomeGroupingMode = "rooms-first";

/** Generates a reasonably-unique id for a freshly created group. */
export const newLayoutSectionId = (): string =>
  `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const readStoredHomeLayout = (): HomeLayout | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    // Defensive shape-check so a corrupt/legacy value can't crash the render.
    return parsed
      .filter(
        (g): g is StoredHomeLayoutSection =>
          Boolean(g) &&
          typeof g.id === "string" &&
          typeof g.name === "string" &&
          (Array.isArray(g.spaceIds) || Array.isArray(g.roomIds)),
      )
      .map((g) => ({
        id: g.id,
        name: g.name,
        spaceIds: (Array.isArray(g.spaceIds)
          ? g.spaceIds
          : (g.roomIds ?? [])
        ).filter((r: unknown): r is string => typeof r === "string"),
      }));
  } catch {
    return null;
  }
};

const isGroupingMode = (value: string | null): value is HomeGroupingMode =>
  value === "rooms-first" || value === "zones-first" || value === "custom";

export const readStoredGroupingMode = (): HomeGroupingMode => {
  try {
    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    return isGroupingMode(stored) ? stored : DEFAULT_GROUPING_MODE;
  } catch {
    return DEFAULT_GROUPING_MODE;
  }
};

export const writeStoredGroupingMode = (mode: HomeGroupingMode): void => {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // Storage may be unavailable; the app can still use the in-memory mode.
  }
};

export const writeStoredHomeLayout = (layout: HomeLayout): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Storage may be unavailable (private mode); layout simply won't persist.
  }
};

/**
 * Reconciles a stored layout against the set of live room/zone ids:
 * - drops ids that no longer exist on the bridge
 * - appends rooms/zones the bridge knows about but the layout has never placed
 * - falls back to a single "All" section when there is nothing stored
 *
 * The returned layout always references exactly the set of live ids, each once.
 */
export const reconcileLayout = (
  stored: HomeLayout | null,
  liveSpaceIds: string[],
): HomeLayout => {
  const liveSet = new Set(liveSpaceIds);

  if (!stored || stored.length === 0) {
    return [{ id: DEFAULT_SECTION_ID, name: "All", spaceIds: liveSpaceIds }];
  }

  const seen = new Set<string>();
  const sections = stored.map((section) => {
    const spaceIds = section.spaceIds.filter((id) => {
      if (!liveSet.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return { ...section, spaceIds };
  });

  // Any newly-discovered rooms/zones land in the first section so they're never lost.
  const missing = liveSpaceIds.filter((id) => !seen.has(id));
  if (missing.length > 0) {
    if (sections.length === 0) {
      sections.push({ id: DEFAULT_SECTION_ID, name: "All", spaceIds: [] });
    }
    sections[0] = {
      ...sections[0],
      spaceIds: [...sections[0].spaceIds, ...missing],
    };
  }

  return sections;
};

export const deriveGroupedLayout = (
  roomZones: HueRoomZone[],
  mode: Exclude<HomeGroupingMode, "custom">,
): HomeLayout => {
  const rooms = roomZones
    .filter((space) => space.resourceType === "room")
    .map((space) => space.id);
  const zones = roomZones
    .filter((space) => space.resourceType === "zone")
    .map((space) => space.id);
  const roomSection = {
    id: "hue-section-rooms",
    name: "Rooms",
    spaceIds: rooms,
  };
  const zoneSection = {
    id: "hue-section-zones",
    name: "Zones",
    spaceIds: zones,
  };
  const ordered =
    mode === "rooms-first"
      ? [roomSection, zoneSection]
      : [zoneSection, roomSection];

  return ordered.filter((section) => section.spaceIds.length > 0);
};
