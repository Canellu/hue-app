import type { HostSyncStatus } from "@/types/host-sync";
import type {
  HueEntertainmentConfiguration,
  HueEventUpdate,
} from "@/types/hue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { create } from "zustand";

/**
 * Shared entertainment state: which areas exist, which one is streaming and
 * who owns the stream (this PC, the Sync Box, or another application), and
 * which lights are locked by an active stream. Extracted from `SyncBoxStore`
 * so PC Sync and Sync Box views share one source of truth.
 */

export interface EntertainmentAreaSummary {
  id: string;
  name: string;
  configurationType: HueEntertainmentConfiguration["configuration_type"];
  /** "active" while an application streams to this area. */
  status: string;
  /** `auth/v1` application id of the current streamer, when active. */
  activeStreamerId: string | null;
  /** v2 light UUIDs that belong to the area (deduplicated). */
  lightIds: string[];
}

const IDLE_STATUS: HostSyncStatus = {
  state: "idle",
  areaId: null,
  error: null,
  warning: null,
};

interface EntertainmentStore {
  areas: EntertainmentAreaSummary[];
  hasLoaded: boolean;
  /** Lifecycle of this PC's own sync engine. */
  pcStatus: HostSyncStatus;
  /**
   * Light ids in every entertainment area with an active stream, regardless
   * of who owns it. These lights are driven by the stream, so manual controls
   * treat them as sync-locked.
   */
  syncedLightIds: string[];
  load: () => Promise<void>;
  applyHueEvents: (updates: HueEventUpdate[]) => void;
  setPcStatus: (status: HostSyncStatus) => void;
}

const EMPTY_SYNCED_LIGHT_IDS: string[] = [];

const deriveSyncedLightIds = (areas: EntertainmentAreaSummary[]): string[] => {
  const ids = new Set<string>();
  for (const area of areas) {
    if (area.status !== "active") continue;
    for (const id of area.lightIds) ids.add(id);
  }
  return ids.size > 0 ? [...ids] : EMPTY_SYNCED_LIGHT_IDS;
};

/**
 * Recomputes the derived synced ids, keeping the previous array reference when
 * the contents are unchanged so zustand selectors don't re-render every event.
 */
const nextSyncedLightIds = (
  previous: string[],
  areas: EntertainmentAreaSummary[],
): string[] => {
  const next = deriveSyncedLightIds(areas);
  const same =
    next.length === previous.length &&
    next.every((id, index) => id === previous[index]);
  return same ? previous : next;
};

let loadInFlight: Promise<void> | null = null;

export const useEntertainmentStore = create<EntertainmentStore>((set, get) => ({
  areas: [],
  hasLoaded: false,
  pcStatus: IDLE_STATUS,
  syncedLightIds: EMPTY_SYNCED_LIGHT_IDS,

  load: () => {
    if (loadInFlight) return loadInFlight;
    type Ref = { rid?: string; rtype?: string };
    type Configuration = {
      id?: string;
      name?: string;
      metadata?: { name?: string };
      configuration_type?: HueEntertainmentConfiguration["configuration_type"];
      status?: string;
      active_streamer?: Ref;
      light_services?: Ref[];
      locations?: { service_locations?: { service?: Ref }[] };
      channels?: { members?: { service?: Ref }[] }[];
    };
    type Entertainment = { id?: string; renderer_reference?: Ref };
    loadInFlight = Promise.all([
      invoke<Configuration[]>("get-hue-resource", {
        resourceType: "entertainment_configuration",
        id: null,
      }),
      invoke<Entertainment[]>("get-hue-resource", {
        resourceType: "entertainment",
        id: null,
      }),
    ])
      .then(([configurations, services]) => {
        const lightByService = new Map(
          services.flatMap((service) =>
            service.id &&
            service.renderer_reference?.rtype === "light" &&
            service.renderer_reference.rid
              ? [[service.id, service.renderer_reference.rid] as const]
              : [],
          ),
        );
        const resolveLight = ({ service }: { service?: Ref }): string[] => {
          if (!service?.rid) return [];
          if (service.rtype === "light") return [service.rid];
          const lightId = lightByService.get(service.rid);
          return lightId ? [lightId] : [];
        };
        const areas: EntertainmentAreaSummary[] = configurations.flatMap(
          (configuration) => {
            if (!configuration.id) return [];
            const direct = (configuration.light_services ?? []).flatMap(
              (reference) =>
                reference.rtype === "light" && reference.rid
                  ? [reference.rid]
                  : [],
            );
            const located = (
              configuration.locations?.service_locations ?? []
            ).flatMap(resolveLight);
            const channelled = (configuration.channels ?? []).flatMap(
              (channel) => (channel.members ?? []).flatMap(resolveLight),
            );
            return [
              {
                id: configuration.id,
                name:
                  configuration.metadata?.name ??
                  configuration.name ??
                  "Entertainment area",
                configurationType:
                  configuration.configuration_type ?? "other",
                status: configuration.status ?? "inactive",
                activeStreamerId: configuration.active_streamer?.rid ?? null,
                lightIds: [...new Set([...direct, ...located, ...channelled])],
              },
            ];
          },
        );
        set((current) => ({
          areas,
          hasLoaded: true,
          syncedLightIds: nextSyncedLightIds(current.syncedLightIds, areas),
        }));
      })
      .catch(() => {
        // Non-fatal: manual controls just won't sync-lock. Retried on the
        // next explicit load.
      })
      .finally(() => {
        loadInFlight = null;
      });
    return loadInFlight;
  },

  applyHueEvents: (updates) => {
    const relevant = updates.filter(
      (update) => update.type === "entertainment_configuration" && update.id,
    );
    if (relevant.length === 0) return;
    const known = new Set(get().areas.map((area) => area.id));
    if (
      get().hasLoaded &&
      relevant.some(
        (update) =>
          update.eventType === "add" ||
          update.eventType === "delete" ||
          !known.has(update.id as string),
      )
    ) {
      // Membership changed; refetch the full topology.
      void get().load();
      return;
    }
    set((current) => {
      const areas = current.areas.map((area) => {
        const update = relevant.find((candidate) => candidate.id === area.id);
        if (!update) return area;
        return {
          ...area,
          status: update.status ?? area.status,
          // An area going inactive drops its streamer even when the event
          // omits the field.
          activeStreamerId:
            update.status === "inactive"
              ? null
              : (update.activeStreamerId ?? area.activeStreamerId),
        };
      });
      return {
        areas,
        syncedLightIds: nextSyncedLightIds(current.syncedLightIds, areas),
      };
    });
  },

  setPcStatus: (status) => set({ pcStatus: status }),
}));

/**
 * Mount once per window that needs entertainment state. Loads the topology,
 * then keeps it fresh from the bridge event stream and the PC engine's
 * status events.
 */
export const EntertainmentStoreEffects: React.FC = () => {
  useEffect(() => {
    const store = useEntertainmentStore.getState();
    if (!store.hasLoaded) void store.load();
    void invoke<HostSyncStatus>("get-host-sync-status")
      .then((status) => useEntertainmentStore.getState().setPcStatus(status))
      .catch(() => {
        // Older backends without PC sync: stay idle.
      });
  }, []);

  useEffect(() => {
    const unlistenEvents = listen<HueEventUpdate[]>("hue-event", (event) => {
      useEntertainmentStore.getState().applyHueEvents(event.payload);
    });
    const unlistenStatus = listen<HostSyncStatus>(
      "host-sync-status",
      (event) => {
        useEntertainmentStore.getState().setPcStatus(event.payload);
      },
    );
    return () => {
      void unlistenEvents.then((dispose) => dispose());
      void unlistenStatus.then((dispose) => dispose());
    };
  }, []);

  return null;
};
