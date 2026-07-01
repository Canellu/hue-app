import { useSyncBoxStore } from "@/stores/SyncBoxStore";
import { useEffect } from "react";

const POLL_INTERVAL_MS = 1500;

export const useSyncBoxPolling = () => {
  const refresh = useSyncBoxStore((store) => store.refresh);

  useEffect(() => {
    const poll = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    poll();
    const interval = window.setInterval(poll, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [refresh]);
};

