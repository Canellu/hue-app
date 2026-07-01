import type { SyncBoxExecutionUpdate, SyncBoxState } from "@/types/sync-box";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

interface SyncBoxStore {
  state: SyncBoxState | null;
  /**
   * Failure applying a user action (start/stop/settings). Persists until the
   * next action starts — the background poll must not wipe it before the user
   * can read it.
   */
  error: string | null;
  /** Failure reading the box state; cleared by the next successful poll. */
  loadError: string | null;
  isLoading: boolean;
  isUpdating: boolean;
  areaLightIds: Record<string, string[]>;
  /**
   * Light ids in every entertainment area with an active stream — this box's
   * own sync session or one owned by another app (e.g. the official Hue Sync
   * app). These lights are controlled by the stream, so app controls should
   * treat them as sync-locked either way.
   */
  syncedLightIds: string[];
  refresh: () => Promise<void>;
  loadAreaLights: () => Promise<void>;
  updateExecution: (update: SyncBoxExecutionUpdate) => Promise<void>;
  /**
   * Starts light sync on `areaId`, taking over the bridge's entertainment
   * stream first when another app owns it. The box never steals the stream on
   * its own — it just fails with "invalid state" — so this stops the active
   * stream through the bridge (like the official apps do) and waits for the
   * box to notice before starting.
   */
  startSync: (areaId: string) => Promise<void>;
  clear: () => void;
}

const EMPTY_SYNCED_LIGHT_IDS: string[] = [];

const deriveSyncedLightIds = (
  state: SyncBoxState | null,
  areaLightIds: Record<string, string[]>,
): string[] => {
  if (!state) return EMPTY_SYNCED_LIGHT_IDS;
  const ids = new Set<string>();
  for (const [groupId, group] of Object.entries(state.hue.groups)) {
    const syncedByBox =
      state.execution.syncActive && state.execution.hueTarget === groupId;
    if (!group.active && !syncedByBox) continue;
    for (const id of areaLightIds[groupId] ?? []) ids.add(id);
  }
  return ids.size > 0 ? [...ids] : EMPTY_SYNCED_LIGHT_IDS;
};

/**
 * Recomputes the derived synced ids, keeping the previous array reference when
 * the contents are unchanged so zustand selectors don't re-render every poll.
 */
const nextSyncedLightIds = (
  previous: string[],
  state: SyncBoxState | null,
  areaLightIds: Record<string, string[]>,
): string[] => {
  const next = deriveSyncedLightIds(state, areaLightIds);
  const same =
    next.length === previous.length &&
    next.every((id, index) => id === previous[index]);
  return same ? previous : next;
};

let refreshInFlight: Promise<void> | null = null;

export const useSyncBoxStore = create<SyncBoxStore>((set, get) => ({
  state: null,
  error: null,
  loadError: null,
  isLoading: false,
  isUpdating: false,
  areaLightIds: {},
  syncedLightIds: EMPTY_SYNCED_LIGHT_IDS,
  refresh: () => {
    if (refreshInFlight) return refreshInFlight;
    set((current) => ({ isLoading: current.state == null }));
    refreshInFlight = invoke<SyncBoxState>("get-sync-box-state")
      .then((state) =>
        set((current) => ({
          state,
          loadError: null,
          syncedLightIds: nextSyncedLightIds(
            current.syncedLightIds,
            state,
            current.areaLightIds,
          ),
        })),
      )
      .catch((error) => set({ loadError: String(error) }))
      .finally(() => {
        refreshInFlight = null;
        set({ isLoading: false });
      });
    return refreshInFlight;
  },
  loadAreaLights: async () => {
    type Ref = { rid?: string; rtype?: string };
    type Configuration = {
      id?: string;
      id_v1?: string;
      name?: string;
      metadata?: { name?: string };
      light_services?: Ref[];
      locations?: { service_locations?: { service?: Ref }[] };
      channels?: { members?: { service?: Ref }[] }[];
    };
    type Entertainment = {
      id?: string;
      renderer_reference?: Ref;
    };
    try {
      const [configurations, services] = await Promise.all([
        invoke<Configuration[]>("get-hue-resource", {
          resourceType: "entertainment_configuration",
          id: null,
        }),
        invoke<Entertainment[]>("get-hue-resource", {
          resourceType: "entertainment",
          id: null,
        }),
      ]);
      const lightByService = new Map(
        services.flatMap((service) =>
          service.id &&
          service.renderer_reference?.rtype === "light" &&
          service.renderer_reference.rid
            ? [[service.id, service.renderer_reference.rid] as const]
            : [],
        ),
      );
      const syncGroups: SyncBoxState["hue"]["groups"] =
        get().state?.hue.groups ?? {};
      const entries: [string, string[]][] = [];
      for (const configuration of configurations) {
        if (!configuration.id) continue;
        const direct = (configuration.light_services ?? []).flatMap(
          (reference) =>
            reference.rtype === "light" && reference.rid ? [reference.rid] : [],
        );
        const resolved = (
          configuration.locations?.service_locations ?? []
        ).flatMap(({ service }) => {
          if (!service?.rid) return [];
          if (service.rtype === "light") return [service.rid];
          const lightId = lightByService.get(service.rid);
          return lightId ? [lightId] : [];
        });
        const channelLights = (configuration.channels ?? []).flatMap(
          (channel) =>
            (channel.members ?? []).flatMap(({ service }) => {
              if (!service?.rid) return [];
              if (service.rtype === "light") return [service.rid];
              const lightId = lightByService.get(service.rid);
              return lightId ? [lightId] : [];
            }),
        );
        const lightIds = [
          ...new Set([...direct, ...resolved, ...channelLights]),
        ];
        const aliases = new Set([configuration.id]);
        if (configuration.id_v1) {
          aliases.add(configuration.id_v1);
          const v1Id = configuration.id_v1.match(/\/groups\/([^/]+)$/)?.[1];
          if (v1Id) aliases.add(v1Id);
        }
        const configurationName = (
          configuration.metadata?.name ??
          configuration.name ??
          ""
        )
          .trim()
          .toLocaleLowerCase();
        for (const [groupId, group] of Object.entries(syncGroups)) {
          if (
            configurationName &&
            group.name.trim().toLocaleLowerCase() === configurationName
          ) {
            aliases.add(groupId);
          }
        }
        aliases.forEach((alias) => entries.push([alias, lightIds]));
      }
      const areaLightIds = Object.fromEntries(entries);
      set((current) => ({
        areaLightIds,
        syncedLightIds: nextSyncedLightIds(
          current.syncedLightIds,
          current.state,
          areaLightIds,
        ),
      }));
    } catch {
      set({ areaLightIds: {}, syncedLightIds: EMPTY_SYNCED_LIGHT_IDS });
    }
  },
  updateExecution: async (update) => {
    set({ isUpdating: true, error: null });
    try {
      const state = await invoke<SyncBoxState>("set-sync-box-execution", {
        update,
      });
      set((current) => ({
        state,
        syncedLightIds: nextSyncedLightIds(
          current.syncedLightIds,
          state,
          current.areaLightIds,
        ),
      }));
    } catch (error) {
      set({ error: String(error) });
    } finally {
      set({ isUpdating: false });
    }
  },
  startSync: async (areaId) => {
    set({ isUpdating: true, error: null });
    try {
      const boxState = get().state;
      const conflict =
        boxState != null &&
        (boxState.hue.connectionState === "busy" ||
          Object.entries(boxState.hue.groups).some(
            ([id, group]) =>
              group.active &&
              !(
                boxState.execution.syncActive &&
                boxState.execution.hueTarget === id
              ),
          ));
      if (conflict) {
        // Stop whatever is streaming through the bridge (we're paired with it
        // too), since the box can't free the bridge itself.
        type Configuration = { id?: string; status?: string };
        const configurations = await invoke<Configuration[]>(
          "get-hue-resource",
          { resourceType: "entertainment_configuration", id: null },
        );
        for (const configuration of configurations) {
          if (configuration.status === "active" && configuration.id) {
            await invoke("update-hue-resource", {
              resourceType: "entertainment_configuration",
              id: configuration.id,
              body: { action: "stop" },
            });
          }
        }
        // The box only learns the bridge is free on its own poll; starting
        // while it still reports "busy" fails with the same invalid-state
        // error the takeover is meant to avoid.
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
          await get().refresh();
          if (get().state?.hue.connectionState !== "busy") break;
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      let state = get().state;
      if (state?.execution.hueTarget !== areaId) {
        state = await invoke<SyncBoxState>("set-sync-box-execution", {
          update: { hueTarget: areaId },
        });
      }
      if (!state?.execution.hdmiActive) {
        state = await invoke<SyncBoxState>("set-sync-box-execution", {
          update: { hdmiActive: true },
        });
      }
      state = await invoke<SyncBoxState>("set-sync-box-execution", {
        update: { syncActive: true },
      });
      set((current) => ({
        state,
        syncedLightIds: nextSyncedLightIds(
          current.syncedLightIds,
          state,
          current.areaLightIds,
        ),
      }));
    } catch (error) {
      set({ error: String(error) });
    } finally {
      set({ isUpdating: false });
    }
  },
  clear: () =>
    set({
      state: null,
      error: null,
      loadError: null,
      isLoading: false,
      areaLightIds: {},
      syncedLightIds: EMPTY_SYNCED_LIGHT_IDS,
    }),
}));
