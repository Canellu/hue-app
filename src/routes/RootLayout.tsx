import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import {
  HueResourcesProvider,
  useHueResources,
} from "@/context/HueResourcesContext";

/** Header wired to the Hue resources context; split out so it can read the data layer. */
const ShellHeader: React.FC = () => {
  const {
    isEditLayoutMode,
    enterEditLayout,
    cancelEditLayout,
    saveEditLayout,
    openCreateSection,
  } = useHueResources();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Layout editing and Settings are Home-only; Space/Settings use Back instead.
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
      onCreateSection={openCreateSection}
    />
  );
};

/**
 * Router root layout: hosts the shared data layer and the global header, and
 * renders the active route (Home / Space / Settings) into the content area.
 */
export const RootLayout: React.FC = () => (
  <HueResourcesProvider>
    <div className="flex h-full flex-col">
      <ShellHeader />
      {/* Named so route changes animate as a slide (see App.css). */}
      <div className="flex-1 overflow-y-auto p-12 [view-transition-name:page]">
        <Outlet />
      </div>
    </div>
  </HueResourcesProvider>
);
