import { useNavigate } from "@tanstack/react-router";
import { useShallow } from "zustand/react/shallow";
import { HomeScreen } from "@/features/home-screen/HomeScreen";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";

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
  } = useHueResourcesStore(
    useShallow((state) => ({
      roomZones: state.roomZones,
      lights: state.lights,
      isLoading: state.isLoading,
      error: state.error,
      displayLayout: state.displayLayout,
      draftLayout: state.draftLayout,
      isEditLayoutMode: state.isEditLayoutMode,
      setDraftLayout: state.setDraftLayout,
      setRoomZoneState: state.setRoomZoneState,
      isCreatingSection: state.isCreatingSection,
      createLayoutSection: state.createLayoutSection,
      closeCreateSection: state.closeCreateSection,
      renameLayoutSection: state.renameLayoutSection,
    })),
  );
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
      onRoomZoneToggle={(roomZone, on) => setRoomZoneState(roomZone, on, null)}
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
