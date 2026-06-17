import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { AppHeader } from "./AppHeader";
import { DashboardProvider, useDashboard } from "./DashboardProvider";

/** Header wired to the dashboard context; split out so it can read the data layer. */
const ShellHeader: React.FC = () => {
  const {
    isEditLayoutMode,
    enterEditLayout,
    cancelEditLayout,
    saveEditLayout,
    openCreateGroup,
  } = useDashboard();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Layout editing and Settings are Home-only; Room/Settings use Back instead.
  const onHome = pathname === "/";

  return (
    <AppHeader
      onBack={onHome ? undefined : () => void navigate({ to: "/" })}
      showSettings={onHome}
      onOpenSettings={() => void navigate({ to: "/settings" })}
      showEditLayout={onHome}
      isEditLayoutMode={isEditLayoutMode}
      onEditLayout={enterEditLayout}
      onCancelEditLayout={cancelEditLayout}
      onSaveEditLayout={saveEditLayout}
      onCreateGroup={openCreateGroup}
    />
  );
};

/**
 * Router root layout: hosts the shared data layer and the global header, and
 * renders the active route (Home / Room / Settings) into the content area.
 */
export const DesktopShell: React.FC = () => (
  <DashboardProvider>
    <div className="flex h-full flex-col">
      <ShellHeader />
      {/* Named so route changes animate as a slide (see App.css). */}
      <div className="flex-1 overflow-y-auto p-12 [view-transition-name:page]">
        <Outlet />
      </div>
    </div>
  </DashboardProvider>
);
