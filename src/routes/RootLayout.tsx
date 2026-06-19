import { AppHeader } from "@/components/AppHeader";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  HueResourcesStoreEffects,
  useHueResourcesStore,
} from "@/stores/HueResourcesStore";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
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
  const onDeviceDiscovery = pathname === "/settings/device-discovery";
  const title = onDeviceDiscovery
    ? "Add devices"
    : pathname === "/settings"
      ? "Settings"
      : activeSpace?.name;
  const description = onDeviceDiscovery
    ? "Discover and place Hue devices"
    : pathname === "/settings"
      ? "Bridge & app preferences"
      : activeSpace
        ? `${activeSpace.lightCount} ${
            activeSpace.lightCount === 1 ? "light" : "lights"
          } · ${activeSpace.anyOn ? "On" : "Off"}`
        : undefined;
  return (
    <AppHeader
      onBack={
        onHome
          ? undefined
          : () =>
              void (onDeviceDiscovery
                ? navigate({ to: "/settings", search: { tab: "devices" } })
                : navigate({ to: "/" }))
      }
      title={title}
      description={description}
      showSettings={onHome}
      onOpenSettings={() =>
        void navigate({ to: "/settings", search: { tab: undefined } })
      }
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
export const RootLayout: React.FC = () => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // The viewport is a single persistent element across route changes, so its
  // scroll offset would otherwise carry over to the next page. Reset to the top
  // whenever the route changes.
  useEffect(() => {
    viewportRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <>
      <HueResourcesStoreEffects />
      <div className="flex h-full flex-col">
        <ShellHeader />
        <ScrollArea
          fade
          hideScrollbar
          viewportRef={viewportRef}
          className="min-h-0 flex-1"
          viewportClassName="px-12 py-6"
        >
          <Outlet />
        </ScrollArea>
      </div>
    </>
  );
};
