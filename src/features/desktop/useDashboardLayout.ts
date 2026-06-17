// Client-side dashboard layout: the Hue Bridge does not store custom visual
// layouts, so we persist a user-defined arrangement of rooms/zones into named
// groups in localStorage and reconcile it against the live room data on boot.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HueGroup } from "./types";

/** A user-defined dashboard category holding an ordered list of room/zone ids. */
export interface CustomGroup {
  id: string;
  name: string;
  /** Ordered Hue Room/Zone resource ids. */
  roomIds: string[];
}

/** Master persisted layout: an ordered list of custom groups. */
export type DashboardLayout = CustomGroup[];

const STORAGE_KEY = "hue-dashboard-layout";
const DEFAULT_GROUP_ID = "group-all-spaces";

/** Generates a reasonably-unique id for a freshly created group. */
export const newGroupId = (): string =>
  `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const readStored = (): DashboardLayout | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    // Defensive shape-check so a corrupt/legacy value can't crash the render.
    return parsed
      .filter(
        (g): g is CustomGroup =>
          g &&
          typeof g.id === "string" &&
          typeof g.name === "string" &&
          Array.isArray(g.roomIds),
      )
      .map((g) => ({
        id: g.id,
        name: g.name,
        roomIds: g.roomIds.filter((r): r is string => typeof r === "string"),
      }));
  } catch {
    return null;
  }
};

const writeStored = (layout: DashboardLayout): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Storage may be unavailable (private mode); layout simply won't persist.
  }
};

/**
 * Reconciles a stored layout against the set of live room ids:
 * - drops ids that no longer exist on the bridge
 * - appends rooms the bridge knows about but the layout has never placed
 * - falls back to a single "All Spaces" group when there is nothing stored
 *
 * The returned layout always references exactly the set of live ids, each once.
 */
export const reconcileLayout = (
  stored: DashboardLayout | null,
  liveRoomIds: string[],
): DashboardLayout => {
  const liveSet = new Set(liveRoomIds);

  if (!stored || stored.length === 0) {
    return [{ id: DEFAULT_GROUP_ID, name: "All Spaces", roomIds: liveRoomIds }];
  }

  const seen = new Set<string>();
  const groups = stored.map((group) => {
    const roomIds = group.roomIds.filter((id) => {
      if (!liveSet.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return { ...group, roomIds };
  });

  // Any newly-discovered rooms land in the first group so they're never lost.
  const missing = liveRoomIds.filter((id) => !seen.has(id));
  if (missing.length > 0) {
    if (groups.length === 0) {
      groups.push({ id: DEFAULT_GROUP_ID, name: "All Spaces", roomIds: [] });
    }
    groups[0] = { ...groups[0], roomIds: [...groups[0].roomIds, ...missing] };
  }

  return groups;
};

interface DashboardLayoutApi {
  /** The committed, reconciled layout currently shown on the dashboard. */
  layout: DashboardLayout;
  /** Overwrites the persisted layout (called on Save). */
  saveLayout: (next: DashboardLayout) => void;
}

/**
 * Owns the persisted dashboard layout and keeps it reconciled with the live
 * room/zone list. Edit-mode draft state is intentionally kept in the consuming
 * component so this hook only deals with the committed, on-disk layout.
 */
export const useDashboardLayout = (groups: HueGroup[]): DashboardLayoutApi => {
  const [stored, setStored] = useState<DashboardLayout | null>(readStored);

  // Stable signature so we only reconcile when the actual id set changes.
  const liveRoomIds = useMemo(() => groups.map((g) => g.id), [groups]);
  const liveKey = liveRoomIds.join(",");

  const layout = useMemo(
    () => reconcileLayout(stored, liveRoomIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stored, liveKey],
  );

  // Persist the reconciled layout once rooms have loaded so freshly-discovered
  // rooms and pruned ids survive the next boot.
  useEffect(() => {
    if (liveRoomIds.length > 0) writeStored(layout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey]);

  const saveLayout = useCallback((next: DashboardLayout) => {
    setStored(next);
    writeStored(next);
  }, []);

  return { layout, saveLayout };
};
