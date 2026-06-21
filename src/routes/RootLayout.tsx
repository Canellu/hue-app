import { AppHeader } from "@/components/AppHeader";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LightPane } from "@/features/space-screen/components/LightPane";
import { ScenePane } from "@/features/space-screen/components/ScenePane";
import { cn } from "@/lib/utils";
import {
  HueResourcesStoreEffects,
  useHueResourcesStore,
} from "@/stores/HueResourcesStore";
import type { HueLight, HueRoomZone, HueScene } from "@/types/hue";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

/** Whichever resource the inspector is currently showing. */
type InspectorContent =
  | { kind: "light"; id: string; light: HueLight }
  | { kind: "scene"; id: string; scene: HueScene };

/**
 * Width of the inspector column; the floating card matches it. Caps at 28rem on
 * wide windows but is allowed to shrink (down to 20rem) on narrow ones so it
 * doesn't crowd out the light grid.
 */
const PANE_WIDTH = "clamp(20rem, 40vw, 28rem)";

/**
 * The light inspector. The `<aside>` reserves its width in a single step (no CSS
 * width transition) so the reflow happens inside the same React commit that
 * toggles `inspectorPaneOpen` — that lets `motion`'s `layout` FLIP the light
 * grid cards smoothly as the column opens and closes. The width must collapse
 * on the *same* commit the cards re-render, otherwise the reflow has no
 * snapshot to animate from and snaps.
 *
 * The panel itself is a floating, rounded, fully-bordered card inset from the
 * edges, revealed by an inner right-anchored clip frame whose width animates:
 * on open the card wipes in from the right (plus a slight slide + fade), on
 * close it wipes away from the left. That clip frame is `absolute` (out of
 * flow) so its width animation doesn't disturb the grid. The last selected
 * content is kept mounted (`shown`) through the exit transition so the card
 * doesn't blank out mid-fade. On close the spacer collapses immediately (cards
 * FLIP back) while the clip frame wipes the card out over the reclaimed space.
 */
const LightInspector: React.FC = () => {
  const {
    selectedLightId,
    selectedSceneId,
    inspectorPaneOpen,
    lights,
    scenes,
    roomZones,
    hueEventRevision,
    setInspectorPaneOpen,
    setLightState,
    setLightColor,
  } = useHueResourcesStore(
    useShallow((state) => ({
      selectedLightId: state.selectedLightId,
      selectedSceneId: state.selectedSceneId,
      inspectorPaneOpen: state.inspectorPaneOpen,
      lights: state.lights,
      scenes: state.scenes,
      roomZones: state.roomZones,
      hueEventRevision: state.hueEventRevision,
      setInspectorPaneOpen: state.setInspectorPaneOpen,
      setLightState: state.setLightState,
      setLightColor: state.setLightColor,
    })),
  );

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
    if (selectedSceneId) {
      const scene = scenes.find((s) => s.id === selectedSceneId);
      return scene ? { kind: "scene", id: scene.id, scene } : null;
    }
    return null;
  }, [selectedLightId, selectedSceneId, lights, scenes]);

  const open = inspectorPaneOpen;
  const close = () => setInspectorPaneOpen(false);

  // Keep showing the last content while the panel animates closed, so it
  // doesn't blank out before the fade finishes.
  const [shown, setShown] = useState<InspectorContent | null>(null);
  useEffect(() => {
    if (current) setShown(current);
  }, [current]);

  // Drive the enter transition: mount in the hidden state, then flip to visible
  // on the next frame so the browser animates from one to the other.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!open) {
      setVisible(false);
      return;
    }
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  const content = current ?? (open ? null : shown);

  return (
    <aside
      className="relative shrink-0"
      style={{ width: open ? PANE_WIDTH : 0 }}
      inert={!open}
    >
      {/*
        Clip frame: a right-anchored, overflow-hidden box whose width animates
        0 -> PANE_WIDTH, revealing the fixed-width card from the right on open
        and clipping it away from the left on close (the real width-reveal the
        old version had). It's `absolute`, so it's out of flow and its width
        animation never affects the light grid — the grid's FLIP reflow is
        driven only by the spacer <aside> above, whose width is instant.
      */}
      <div
        className="absolute inset-y-0 right-0 flex justify-end overflow-hidden transition-[width] duration-300 ease-out"
        style={{ width: visible ? PANE_WIDTH : 0 }}
      >
        <div className="h-full shrink-0 p-6 pl-0" style={{ width: PANE_WIDTH }}>
          <div
            className={cn(
              "flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-popover text-popover-foreground transition-[opacity,transform] duration-300 ease-out",
              visible ? "translate-x-0 opacity-100" : "translate-x-2 opacity-0",
            )}
            onTransitionEnd={() => {
              if (!open) setShown(null);
            }}
          >
            {content ? (
              content.kind === "light" ? (
                <LightPane
                  key={content.id}
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
              ) : (
                <ScenePane
                  key={content.id}
                  scene={content.scene}
                  onClose={close}
                />
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
          </div>
        </div>
      </div>
    </aside>
  );
};

/** Header wired to the Hue resources store; split out so it can read the data layer. */
const ShellHeader: React.FC = () => {
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
      homeName={homeName}
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
        <div className="flex min-h-0 flex-1">
          <ScrollArea
            fade
            hideScrollbar
            viewportRef={viewportRef}
            className="min-h-0 min-w-0 flex-1"
            viewportClassName="px-12 py-6"
          >
            <Outlet />
          </ScrollArea>
          <LightInspector />
        </div>
      </div>
    </>
  );
};
