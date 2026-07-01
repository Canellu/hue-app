import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getRoomZoneIcon } from "@/features/home-screen/components/room-zone-icons";
import { GroupPane } from "@/features/space-screen/components/GroupPane";
import { LightPane } from "@/features/space-screen/components/LightPane";
import { ScenePane } from "@/features/space-screen/components/ScenePane";
import { cn } from "@/lib/utils";
import {
  HueResourcesStoreEffects,
  useHueResourcesStore,
} from "@/stores/HueResourcesStore";
import type { HueLight, HueRoomZone, HueScene } from "@/types/hue";
import { useSyncBoxStore } from "@/stores/SyncBoxStore";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SyncBoxSession } from "@/types/sync-box";
import { Loader2, Tv } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

/** Whichever resource the inspector is currently showing. */
type InspectorContent =
  | { kind: "light"; id: string; light: HueLight }
  | { kind: "scene"; id: string; scene: HueScene }
  | { kind: "group"; id: string; roomZone: HueRoomZone; lights: HueLight[] };

const EMPTY_SYNCED_LIGHT_IDS: string[] = [];

const getInspectorPaneWidth = () => {
  const rootFontSize = Number.parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  );
  return Math.min(
    28 * rootFontSize,
    Math.max(20 * rootFontSize, innerWidth * 0.4),
  );
};

/**
 * The inspector's real flex width animates so it continuously pushes the main
 * content aside. The full-width panel translates in from beyond the right edge
 * in sync, giving it the same movement as a sheet without using an overlay.
 */
const LightInspector: React.FC = () => {
  const {
    selectedLightId,
    selectedSceneId,
    selectedGroupId,
    inspectorPaneOpen,
    lights,
    scenes,
    roomZones,
    hueEventRevision,
    setInspectorPaneOpen,
    setLightState,
    setLightColor,
    setRoomZoneState,
  } = useHueResourcesStore(
    useShallow((state) => ({
      selectedLightId: state.selectedLightId,
      selectedSceneId: state.selectedSceneId,
      selectedGroupId: state.selectedGroupId,
      inspectorPaneOpen: state.inspectorPaneOpen,
      lights: state.lights,
      scenes: state.scenes,
      roomZones: state.roomZones,
      hueEventRevision: state.hueEventRevision,
      setInspectorPaneOpen: state.setInspectorPaneOpen,
      setLightState: state.setLightState,
      setLightColor: state.setLightColor,
      setRoomZoneState: state.setRoomZoneState,
    })),
  );
  const syncedLightIds = useSyncBoxStore((state) => {
    const target = state.state?.execution.hueTarget;
    if (!state.state?.execution.syncActive || !target) {
      return EMPTY_SYNCED_LIGHT_IDS;
    }
    return state.areaLightIds[target] ?? EMPTY_SYNCED_LIGHT_IDS;
  });

  // The inspector only opens from inside a space, so resolve which room/zone is
  // on screen — the light pane removes a light from *this* space specifically.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeSpace = useMemo<HueRoomZone | null>(() => {
    if (!pathname.startsWith("/space/")) return null;
    const id = decodeURIComponent(pathname.slice("/space/".length));
    return roomZones.find((roomZone) => roomZone.id === id) ?? null;
  }, [pathname, roomZones]);

  // Light and scene selection are mutually exclusive; resolve whichever is set
  // to a single content descriptor the panel renders.
  const current = useMemo<InspectorContent | null>(() => {
    if (selectedLightId) {
      const light = lights.find((l) => l.id === selectedLightId);
      return light ? { kind: "light", id: light.id, light } : null;
    }
    if (selectedGroupId) {
      const roomZone = roomZones.find((r) => r.id === selectedGroupId);
      if (!roomZone) return null;
      const ids = new Set(roomZone.lightIds);
      const syncedIds = new Set(syncedLightIds);
      const members = lights
        .filter((light) => ids.has(light.id) && !syncedIds.has(light.id))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { kind: "group", id: roomZone.id, roomZone, lights: members };
    }
    if (selectedSceneId) {
      const scene = scenes.find((s) => s.id === selectedSceneId);
      return scene ? { kind: "scene", id: scene.id, scene } : null;
    }
    return null;
  }, [
    selectedLightId,
    selectedGroupId,
    selectedSceneId,
    lights,
    scenes,
    roomZones,
    syncedLightIds,
  ]);

  const open = inspectorPaneOpen;
  const close = () => setInspectorPaneOpen(false);
  const reduceMotion = useReducedMotion();
  const [paneWidth, setPaneWidth] = useState(getInspectorPaneWidth);
  const transition = {
    duration: reduceMotion ? 0 : 0.3,
    ease: [0.4, 0, 0.2, 1] as const,
  };

  useEffect(() => {
    const updatePaneWidth = () => setPaneWidth(getInspectorPaneWidth());
    window.addEventListener("resize", updatePaneWidth);
    return () => window.removeEventListener("resize", updatePaneWidth);
  }, []);

  // Keep showing the last content while the panel animates closed, so it
  // doesn't blank out before it is fully clipped.
  const [shown, setShown] = useState<InspectorContent | null>(null);
  useEffect(() => {
    if (current) setShown(current);
  }, [current]);

  const content = current ?? (open ? null : shown);
  const contentKey = content ? `${content.kind}:${content.id}` : "empty";

  return (
    <motion.aside
      initial={false}
      animate={{ width: open ? paneWidth : 0 }}
      transition={transition}
      className="relative shrink-0"
      inert={!open}
      onAnimationComplete={() => {
        if (!open) setShown(null);
      }}
    >
      <motion.div
        initial={false}
        animate={{
          x: open ? 0 : paneWidth,
          opacity: open ? 1 : 0,
        }}
        transition={transition}
        className="absolute inset-y-0 right-0 h-full shrink-0 p-6 pl-0"
        style={{ width: paneWidth }}
      >
        <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card text-card-foreground">
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={contentKey}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: reduceMotion ? 0 : 0.18,
                ease: "easeOut",
              }}
              className="h-full"
            >
              {content ? (
                content.kind === "light" ? (
                  <LightPane
                    light={content.light}
                    space={activeSpace}
                    hueEventRevision={hueEventRevision}
                    onClose={close}
                    onLightToggle={(l, on) => setLightState(l, on, null)}
                    onLightBrightness={(l, pct, phase) =>
                      setLightState(l, pct > 0, pct, phase)
                    }
                    onLightColor={(l, change) => setLightColor(l, change)}
                  />
                ) : content.kind === "group" ? (
                  <GroupPane
                    roomZone={content.roomZone}
                    lights={content.lights}
                    hueEventRevision={hueEventRevision}
                    onClose={close}
                    onToggle={(g, on) => setRoomZoneState(g, on, null)}
                    onBrightness={(g, pct, phase) =>
                      setRoomZoneState(g, pct > 0, pct, phase)
                    }
                    onLightColor={(l, change) => setLightColor(l, change)}
                  />
                ) : (
                  <ScenePane scene={content.scene} onClose={close} />
                )
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
                  <p className="font-heading text-lg font-medium text-foreground">
                    Nothing selected
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Click a light or scene tile to show it here.
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.aside>
  );
};

/** Header wired to the Hue resources store; split out so it can read the data layer. */
const ShellHeader: React.FC = () => {
  const [spaceEditMode, setSpaceEditMode] = useState<
    "customize" | "manage" | null
  >(null);
  const {
    roomZones,
    homeName,
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
      homeName: state.homeName,
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
  const syncBoxState = useSyncBoxStore((state) => state.state);

  useEffect(() => {
    const update = (event: Event) =>
      setSpaceEditMode(
        (event as CustomEvent<"customize" | "manage" | null>).detail,
      );
    window.addEventListener("hue-space-edit-state", update);
    return () => window.removeEventListener("hue-space-edit-state", update);
  }, []);

  useEffect(() => {
    setSpaceEditMode(null);
  }, [pathname]);

  // Layout editing and Settings are Home-only; Space/Settings use Back instead.
  const onHome = pathname === "/";
  const activeSpaceId = pathname.startsWith("/space/")
    ? decodeURIComponent(pathname.slice("/space/".length))
    : null;
  const activeSpace = activeSpaceId
    ? roomZones.find((roomZone) => roomZone.id === activeSpaceId)
    : null;
  const ActiveSpaceIcon = activeSpace
    ? getRoomZoneIcon(activeSpace.class)
    : null;
  const onDeviceDiscovery = pathname === "/settings/device-discovery";
  const onWidgetWizard = pathname === "/settings/widget-wizard";
  const onSpacesWizard = pathname === "/settings/spaces-wizard";
  const onSync = pathname === "/sync";
  const activeSyncAreaId = pathname.startsWith("/sync/")
    ? decodeURIComponent(pathname.slice("/sync/".length))
    : null;
  const activeSyncArea = activeSyncAreaId
    ? syncBoxState?.hue.groups[activeSyncAreaId]
    : null;
  const title = onDeviceDiscovery
    ? "Add devices"
    : onWidgetWizard
      ? "Create widget"
      : onSpacesWizard
        ? "Create room or zone"
        : activeSyncArea
          ? activeSyncArea.name
          : onSync
            ? "Sync"
            : pathname === "/settings"
              ? "Settings"
              : activeSpace?.name;
  const description = onDeviceDiscovery
    ? "Discover and place Hue devices"
    : onWidgetWizard
      ? "Build a pinned desktop widget"
      : onSpacesWizard
        ? "Group your devices and lights"
        : activeSyncArea
          ? "Entertainment area"
          : onSync
            ? "Philips Hue HDMI Sync Box"
            : pathname === "/settings"
              ? "Bridge & app preferences"
              : undefined;
  return (
    <AppHeader
      onBack={
        onHome
          ? undefined
          : () =>
              void (onDeviceDiscovery
                ? navigate({ to: "/settings", search: { tab: "devices" } })
                : activeSyncArea
                  ? navigate({ to: "/sync" })
                  : onWidgetWizard
                    ? navigate({ to: "/settings", search: { tab: "widget" } })
                    : onSpacesWizard
                      ? navigate({ to: "/settings", search: { tab: "spaces" } })
                      : navigate({ to: "/" }))
      }
      title={title}
      description={description}
      titleIcon={
        ActiveSpaceIcon ? (
          <ActiveSpaceIcon size={24} strokeWidth={2.25} />
        ) : undefined
      }
      onTitleRename={(name) =>
        window.dispatchEvent(
          new CustomEvent("hue-space-rename", { detail: name }),
        )
      }
      onTitleIconClick={() =>
        window.dispatchEvent(new CustomEvent("hue-space-edit-icon"))
      }
      titleActionLabel={
        activeSpace
          ? `Edit ${activeSpace.resourceType === "room" ? "room" : "zone"}`
          : undefined
      }
      onTitleAction={() =>
        window.dispatchEvent(new CustomEvent("hue-space-edit-request"))
      }
      onTitleManage={() =>
        window.dispatchEvent(new CustomEvent("hue-space-manage-request"))
      }
      titleEditing={activeSpace != null && spaceEditMode === "customize"}
      titleManaging={activeSpace != null && spaceEditMode === "manage"}
      onCancelTitleEdit={() =>
        window.dispatchEvent(new CustomEvent("hue-space-edit-cancel"))
      }
      onSaveTitleEdit={() =>
        window.dispatchEvent(new CustomEvent("hue-space-edit-save"))
      }
      homeName={homeName}
      showSettings={onHome}
      onOpenSettings={() =>
        void navigate({ to: "/settings", search: { tab: undefined } })
      }
      showSync={onHome}
      onOpenSync={() => void navigate({ to: "/sync" })}
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
  const routeOwnsScroll = pathname === "/settings";
  const navigate = useNavigate();
  const inspectorPaneOpen = useHueResourcesStore(
    (state) => state.inspectorPaneOpen,
  );
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const syncState = useSyncBoxStore((state) => state.state);
  const activeSyncedLightIds = useSyncBoxStore((state) => {
    const target = state.state?.execution.hueTarget;
    if (!state.state?.execution.syncActive || !target) {
      return EMPTY_SYNCED_LIGHT_IDS;
    }
    return state.areaLightIds[target] ?? EMPTY_SYNCED_LIGHT_IDS;
  });
  const syncUpdating = useSyncBoxStore((state) => state.isUpdating);
  const refreshSync = useSyncBoxStore((state) => state.refresh);
  const loadAreaLights = useSyncBoxStore((state) => state.loadAreaLights);
  const updateSync = useSyncBoxStore((state) => state.updateExecution);
  const activeSyncArea = syncState?.execution.hueTarget
    ? syncState.hue.groups[syncState.execution.hueTarget]
    : null;
  const activeSpace = pathname.startsWith("/space/")
    ? roomZones.find(
        (roomZone) =>
          roomZone.id === decodeURIComponent(pathname.slice("/space/".length)),
      )
    : null;
  const activeSpaceSyncedLightCount = activeSpace
    ? activeSpace.lightIds.filter((id) => activeSyncedLightIds.includes(id))
        .length
    : 0;
  const showSyncBanner = pathname === "/" || activeSpaceSyncedLightCount > 0;

  useEffect(() => {
    let interval: number | undefined;
    void invoke<SyncBoxSession>("get-sync-box-session").then((session) => {
      if (!session.configured) return;
      void refreshSync().then(loadAreaLights);
      interval = window.setInterval(() => void refreshSync(), 1500);
    });
    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [loadAreaLights, refreshSync]);

  // The viewport is a single persistent element across route changes, so its
  // scroll offset would otherwise carry over to the next page. Reset to the top
  // whenever the route changes.
  useEffect(() => {
    viewportRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => {
    const unlisten = listen<{ widgetId: string }>(
      "open-widget-settings",
      (event) => {
        void navigate({
          to: "/settings",
          search: {
            tab: "widget",
            widgetId: event.payload.widgetId,
            widgetRequest: Date.now(),
          },
        });
      },
    );
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, [navigate]);

  return (
    <>
      <HueResourcesStoreEffects />
      <div className="flex h-full flex-col">
        <ShellHeader />
        {showSyncBanner &&
          syncState?.execution.syncActive &&
          activeSyncArea && (
            <div className="mx-12 mb-2 flex items-center gap-4 rounded-2xl border border-primary/25 bg-primary/10 px-5 py-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Tv size={21} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">Light sync is active</p>
                <p className="truncate text-sm text-muted-foreground">
                  {activeSpace && activeSpaceSyncedLightCount > 0
                    ? `${activeSpaceSyncedLightCount} ${activeSpaceSyncedLightCount === 1 ? "light" : "lights"} in ${activeSpace.name} ${activeSpaceSyncedLightCount === 1 ? "is" : "are"} controlled by the Sync Box.`
                    : `${activeSyncArea.name} is controlled by the Sync Box.`}{" "}
                  Stop sync to control those lights normally.
                </p>
              </div>
              <Button
                variant="outline"
                disabled={syncUpdating}
                onClick={() => void updateSync({ syncActive: false })}
              >
                {syncUpdating && <Loader2 className="animate-spin" />}
                Stop sync
              </Button>
            </div>
          )}
        <div className="flex min-h-0 flex-1">
          <ScrollArea
            fade
            hideScrollbar
            viewportRef={viewportRef}
            viewportProps={
              routeOwnsScroll ? { style: { overflowY: "hidden" } } : undefined
            }
            className="min-h-0 min-w-0 flex-1"
            viewportClassName={cn(
              "py-6 pl-12 transition-[padding] duration-300 ease-out motion-reduce:transition-none",
              inspectorPaneOpen ? "pr-2" : "pr-12",
            )}
            contentClassName={cn(
              "min-w-0!",
              routeOwnsScroll ? "h-full" : "min-h-full",
            )}
          >
            <Outlet />
          </ScrollArea>
          <LightInspector />
        </div>
      </div>
    </>
  );
};
