import { useNavigate } from "@tanstack/react-router";
import { useHueResources } from "@/context/HueResourcesContext";
import { HomeScreen } from "@/features/home-screen/HomeScreen";

export const HomeRoute: React.FC = () => {
  const {
    roomZones,
    lights,
    isLoading,
    error,
    displayLayout,
    draftLayout,
    isEditLayoutMode,
    setDraftLayout,
    setRoomZoneState,
    isCreatingSection,
    createLayoutSection,
    closeCreateSection,
    renameLayoutSection,
  } = useHueResources();
  const navigate = useNavigate();

  return (
    <HomeScreen
      roomZones={roomZones}
      lights={lights}
      isLoading={isLoading}
      error={error}
      layout={isEditLayoutMode ? draftLayout : displayLayout}
      editing={isEditLayoutMode}
      onLayoutChange={setDraftLayout}
      onOpenSpace={(id) =>
        void navigate({ to: "/space/$spaceId", params: { spaceId: id } })
      }
      onRoomZoneToggle={(roomZone, on) =>
        setRoomZoneState(roomZone, on, null)
      }
      onRoomZoneBrightness={(roomZone, pct) =>
        setRoomZoneState(roomZone, pct > 0, pct)
      }
      isCreatingSection={isCreatingSection}
      onCreateSection={createLayoutSection}
      onCloseCreateSection={closeCreateSection}
      onRenameSection={renameLayoutSection}
    />
  );
};
