import { SyncHubScreen } from "@/features/host-sync/SyncHubScreen";
import { useSearch } from "@tanstack/react-router";

export const SyncHubRoute = () => {
  const { source } = useSearch({ from: "/sync" });

  return <SyncHubScreen source={source} />;
};
