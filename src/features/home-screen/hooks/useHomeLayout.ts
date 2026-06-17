// Client-side Home layout: the Hue Bridge does not store custom visual layouts,
// so we persist a user-defined arrangement of rooms/zones into named sections
// in localStorage and reconcile it against live room/zone data on boot.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HomeLayout } from "@/types/app-layout";
import type { HueRoomZone } from "@/types/hue";

interface StoredHomeLayoutSection {
  id: string;
  name: string;
  spaceIds?: unknown[];
  roomIds?: unknown[];
}

const STORAGE_KEY = "hue-dashboard-layout";
const DEFAULT_SECTION_ID = "group-all-spaces";

/** Generates a reasonably-unique id for a freshly created group. */
export const newLayoutSectionId = (): string =>
  `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const readStored = (): HomeLayout | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    // Defensive shape-check so a corrupt/legacy value can't crash the render.
    return parsed
      .filter(
        (g): g is StoredHomeLayoutSection =>
          g &&
          typeof g.id === "string" &&
          typeof g.name === "string" &&
          Array.isArray(g.spaceIds) || Array.isArray(g.roomIds),
      )
      .map((g) => ({
        id: g.id,
        name: g.name,
        spaceIds: (Array.isArray(g.spaceIds) ? g.spaceIds : g.roomIds ?? [])
          .filter((r: unknown): r is string => typeof r === "string"),
      }));
  } catch {
    return null;
  }
};

const writeStored = (layout: HomeLayout): void => {
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
 * - falls back to a single "All Spaces" section when there is nothing stored
 *
 * The returned layout always references exactly the set of live ids, each once.
 */
export const reconcileLayout = (
  stored: HomeLayout | null,
  liveSpaceIds: string[],
): HomeLayout => {
  const liveSet = new Set(liveSpaceIds);

  if (!stored || stored.length === 0) {
    return [{ id: DEFAULT_SECTION_ID, name: "All Spaces", spaceIds: liveSpaceIds }];
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
      sections.push({ id: DEFAULT_SECTION_ID, name: "All Spaces", spaceIds: [] });
    }
    sections[0] = {
      ...sections[0],
      spaceIds: [...sections[0].spaceIds, ...missing],
    };
  }

  return sections;
};

interface HomeLayoutApi {
  /** The committed, reconciled layout currently shown on Home. */
  layout: HomeLayout;
  /** Overwrites the persisted layout (called on Save). */
  saveLayout: (next: HomeLayout) => void;
}

/**
 * Owns the persisted Home layout and keeps it reconciled with the live
 * room/zone list. Edit-mode draft state is intentionally kept in the consuming
 * component so this hook only deals with the committed, on-disk layout.
 */
export const useHomeLayout = (roomZones: HueRoomZone[]): HomeLayoutApi => {
  const [stored, setStored] = useState<HomeLayout | null>(readStored);

  // Stable signature so we only reconcile when the actual id set changes.
  const liveSpaceIds = useMemo(() => roomZones.map((g) => g.id), [roomZones]);
  const liveKey = liveSpaceIds.join(",");

  const layout = useMemo(
    () => reconcileLayout(stored, liveSpaceIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stored, liveKey],
  );

  // Persist the reconciled layout once rooms/zones have loaded so freshly
  // discovered and pruned ids survive the next boot.
  useEffect(() => {
    if (liveSpaceIds.length > 0) writeStored(layout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey]);

  const saveLayout = useCallback((next: HomeLayout) => {
    setStored(next);
    writeStored(next);
  }, []);

  return { layout, saveLayout };
};
