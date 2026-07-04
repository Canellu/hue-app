import { EntertainmentAreaSyncScreen } from "@/features/host-sync/EntertainmentAreaSyncScreen";
import { useParams } from "@tanstack/react-router";

export const EntertainmentAreaSyncRoute = () => {
  const { areaId } = useParams({ from: "/sync/$areaId" });
  return <EntertainmentAreaSyncScreen areaId={areaId} />;
};
