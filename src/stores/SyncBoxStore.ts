import type {
  SyncBoxExecutionUpdate,
  SyncBoxState,
} from "@/types/sync-box";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

interface SyncBoxStore {
  state: SyncBoxState | null;
  error: string | null;
  isLoading: boolean;
  isUpdating: boolean;
  refresh: () => Promise<void>;
  updateExecution: (update: SyncBoxExecutionUpdate) => Promise<void>;
  clear: () => void;
}

let refreshInFlight: Promise<void> | null = null;

export const useSyncBoxStore = create<SyncBoxStore>((set) => ({
  state: null,
  error: null,
  isLoading: false,
  isUpdating: false,
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
  clear: () => set({ state: null, error: null, isLoading: false }),
}));

