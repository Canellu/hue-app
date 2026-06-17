import { AppHeader } from "@/components/AppHeader";
import {
  HueResourcesStoreEffects,
  useHueResourcesStore,
} from "@/stores/HueResourcesStore";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useShallow } from "zustand/react/shallow";

/** Header wired to the Hue resources store; split out so it can read the data layer. */
const ShellHeader: React.FC = () => {
  const {
    roomZones,
    isEditLayoutMode,
    groupingMode,
    setGroupingMode,
    enterEditLayout,
    cancelEditLayout,
    saveEditLayout,
    openCreateSection,
  } = useHueResourcesStore(
    useShallow((state) => ({
      roomZones: state.roomZones,
      isEditLayoutMode: state.isEditLayoutMode,
      groupingMode: state.groupingMode,
      setGroupingMode: state.setGroupingMode,
      enterEditLayout: state.enterEditLayout,
      cancelEditLayout: state.cancelEditLayout,
      saveEditLayout: state.saveEditLayout,
      openCreateSection: state.openCreateSection,
    })),
  );
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Layout editing and Settings are Home-only; Space/Settings use Back instead.
  const onHome = pathname === "/";
  const activeSpaceId = pathname.startsWith("/space/")
    ? decodeURIComponent(pathname.slice("/space/".length))
    : null;
  const activeSpace = activeSpaceId
    ? roomZones.find((roomZone) => roomZone.id === activeSpaceId)
    : null;
  const title = pathname === "/settings" ? "Settings" : activeSpace?.name;
  const description =
    pathname === "/settings"
      ? "Bridge & app preferences"
      : activeSpace
        ? `${activeSpace.lightCount} ${
            activeSpace.lightCount === 1 ? "light" : "lights"
          } · ${activeSpace.anyOn ? "On" : "Off"}`
        : undefined;

  return (
    <AppHeader
      onBack={onHome ? undefined : () => void navigate({ to: "/" })}
      title={title}
      description={description}
      showSettings={onHome}
      onOpenSettings={() => void navigate({ to: "/settings" })}
      showEditLayout={onHome}
      groupingMode={groupingMode}
      onGroupingModeChange={setGroupingMode}
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
  <>
    <HueResourcesStoreEffects />
    <div className="flex h-full flex-col">
      <ShellHeader />
      {/* Named so route changes animate as a slide (see App.css). */}
      <div className="flex-1 overflow-y-auto px-12 py-6 [view-transition-name:page]">
        <Outlet />
      </div>
    </div>
  </>
);
