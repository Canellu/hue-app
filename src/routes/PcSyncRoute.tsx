import { PcSyncScreen } from "@/features/host-sync/PcSyncScreen";
import { useParams } from "@tanstack/react-router";

export const PcSyncRoute = () => {
  const { areaId } = useParams({ from: "/sync/pc/$areaId" });
  return <PcSyncScreen areaId={areaId} />;
};
