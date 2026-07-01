import type { SyncBoxExecutionUpdate, SyncBoxState } from "@/types/sync-box";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

interface SyncBoxStore {
  state: SyncBoxState | null;
  error: string | null;
  isLoading: boolean;
  isUpdating: boolean;
  areaLightIds: Record<string, string[]>;
  refresh: () => Promise<void>;
  loadAreaLights: () => Promise<void>;
  updateExecution: (update: SyncBoxExecutionUpdate) => Promise<void>;
  clear: () => void;
}

let refreshInFlight: Promise<void> | null = null;

export const useSyncBoxStore = create<SyncBoxStore>((set, get) => ({
  state: null,
  error: null,
  isLoading: false,
  isUpdating: false,
  areaLightIds: {},
  refresh: () => {
    if (refreshInFlight) return refreshInFlight;
    set((current) => ({ isLoading: current.state == null }));
    refreshInFlight = invoke<SyncBoxState>("get-sync-box-state")
      .then((state) => set({ state, error: null }))
      .catch((error) => set({ error: String(error) }))
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
      const syncGroups: Record<
        string,
        { name: string; numLights: number; active: boolean }
      > = get().state?.hue.groups ?? {};
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
      set({ areaLightIds: Object.fromEntries(entries) });
    } catch {
      set({ areaLightIds: {} });
    }
  },
  updateExecution: async (update) => {
    set({ isUpdating: true, error: null });
    try {
      const state = await invoke<SyncBoxState>("set-sync-box-execution", {
        update,
      });
      set({ state });
    } catch (error) {
      set({ error: String(error) });
    } finally {
      set({ isUpdating: false });
    }
  },
  clear: () =>
    set({ state: null, error: null, isLoading: false, areaLightIds: {} }),
}));
