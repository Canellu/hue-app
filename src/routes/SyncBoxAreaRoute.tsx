import { SyncBoxScreen } from "@/features/sync-box/SyncBoxScreen";
import { useParams } from "@tanstack/react-router";

export const SyncBoxAreaRoute: React.FC = () => {
  const { areaId } = useParams({ from: "/sync/box/$areaId" });
  return <SyncBoxScreen areaId={areaId} />;
};
