import { PlacementEditor } from "@/features/entertainment-placement/PlacementEditor";
import { useParams } from "@tanstack/react-router";

export const EntertainmentPlacementRoute = () => {
  const { areaId } = useParams({
    from: "/settings/entertainment-placement/$areaId",
  });
  return <PlacementEditor areaId={areaId} />;
};
