import { useNavigate } from "@tanstack/react-router";
import { useDashboard } from "../DashboardProvider";
import { HomeScreen } from "../HomeScreen";

export const HomeRoute: React.FC = () => {
  const {
    groups,
    lights,
    isLoading,
    error,
    layout,
    draftLayout,
    isEditLayoutMode,
    setDraftLayout,
    setGroupState,
    isCreatingGroup,
    createGroup,
    closeCreateGroup,
    renameGroup,
  } = useDashboard();
  const navigate = useNavigate();

  return (
    <HomeScreen
      groups={groups}
      lights={lights}
      isLoading={isLoading}
      error={error}
      layout={isEditLayoutMode ? draftLayout : layout}
      editing={isEditLayoutMode}
      onLayoutChange={setDraftLayout}
      onOpenRoom={(id) =>
        void navigate({ to: "/room/$roomId", params: { roomId: id } })
      }
      onGroupToggle={(group, on) => setGroupState(group, on, null)}
      onGroupBrightness={(group, pct) => setGroupState(group, pct > 0, pct)}
      isCreatingGroup={isCreatingGroup}
      onCreateGroup={createGroup}
      onCloseCreateGroup={closeCreateGroup}
      onRenameGroup={renameGroup}
    />
  );
};
