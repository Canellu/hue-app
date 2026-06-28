import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useWidgets } from "@/features/widget-screen/useWidgets";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueRoomZone, HueSettingsSummary } from "@/types/hue";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useHue } from "../../context/HueContext";
import type { ThemeMode } from "../../context/ThemeContext";
import { AddDevicesButton } from "./components/AddDevicesButton";
import { AddSpaceButton } from "./components/AddSpaceButton";
import { AddWidgetButton } from "./components/AddWidgetButton";
import { SettingsNav } from "./components/SettingsNav";
import { settingsTabs } from "./settingsTabs";
import { BridgeTab } from "./tabs/BridgeTab";
import { DevicesTab } from "./tabs/DevicesTab";
import { GeneralTab } from "./tabs/GeneralTab";
import { ScenesTab } from "./tabs/ScenesTab";
import { SpacesTab } from "./tabs/SpacesTab";
import { WidgetTab } from "./tabs/WidgetTab";
import type {
  AppSettings,
  CloseButtonBehavior,
  DeleteableResourceType,
  RenameableResourceType,
} from "./types";
import { humanize } from "./utils/format";

interface SettingsScreenProps {
  themeMode: ThemeMode;
  onThemeModeChange: (themeMode: ThemeMode) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  themeMode,
  onThemeModeChange,
}) => {
  const navigate = useNavigate();
  const search = useSearch({ from: "/settings" });
  const { bridgeId, bridgeIp, connected, applicationKey, resetSession } =
    useHue();
  const lights = useHueResourcesStore((state) => state.lights);
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const scenes = useHueResourcesStore((state) => state.scenes);
  const loadAll = useHueResourcesStore((state) => state.loadAll);
  const [summary, setSummary] = useState<HueSettingsSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [isLoadingAppSettings, setIsLoadingAppSettings] = useState(true);
  const [isSavingAppSettings, setIsSavingAppSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const {
    widgets,
    openWidget,
    closeWidget,
    removeWidget,
    setPinned: setWidgetPinned,
    setAlwaysOnTop: setWidgetAlwaysOnTop,
    previewConfig: previewWidgetConfig,
    setConfig: setWidgetConfig,
  } = useWidgets();

  // Surface a "scroll to top" affordance once the shared settings viewport has
  // been scrolled down past a threshold and still has room to scroll.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      setShowScrollTop(scrollTop > 240 && scrollHeight - clientHeight > 240);
    };
    update();
    viewport.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => {
      viewport.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  const scrollToTop = () => {
    viewportRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const activeTab = settingsTabs.some((tab) => tab.value === search.tab)
    ? search.tab!
    : "app";
  const activeTabDetails =
    settingsTabs.find((tab) => tab.value === activeTab) ?? settingsTabs[0];
  const openWidgetCount = widgets.filter((widget) => widget.enabled).length;
  const widgetLimitReached = openWidgetCount >= 3;

  const loadSettingsSummary = async () => {
    setSettingsError(null);
    try {
      const nextSummary = await invoke<HueSettingsSummary>(
        "get-hue-settings-summary",
      );
      setSummary(nextSummary);
    } catch (error) {
      setSettingsError(String(error) || "Unable to load bridge settings.");
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const loadAppSettings = async () => {
    try {
      const nextSettings = await invoke<AppSettings>("get-app-settings");
      setAppSettings(nextSettings);
    } catch (error) {
      setSettingsError(String(error) || "Unable to load app settings.");
    } finally {
      setIsLoadingAppSettings(false);
    }
  };

  useEffect(() => {
    void loadSettingsSummary();
    void loadAppSettings();
  }, []);

  const refreshSettings = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    await Promise.all([loadAll(), loadSettingsSummary()]);
    setIsRefreshing(false);
  };

  const renameResource = async (
    resourceType: RenameableResourceType,
    id: string,
    name: string,
  ) => {
    await invoke("rename-hue-resource", { resourceType, id, name });
    await refreshSettings();
    toast.success("Name updated");
  };

  const deleteResource = async (
    resourceType: DeleteableResourceType,
    id: string,
  ) => {
    await invoke("delete-hue-resource", { resourceType, id });
    await refreshSettings();
    toast.success(`${humanize(resourceType)} deleted`);
  };

  const updateMembers = async (roomZone: HueRoomZone, ids: string[]) => {
    if (roomZone.resourceType === "room") {
      await invoke("update-room-members", {
        roomId: roomZone.id,
        deviceIds: ids,
      });
    } else {
      await invoke("update-zone-members", {
        zoneId: roomZone.id,
        lightIds: ids,
      });
    }
    await refreshSettings();
    toast.success("Membership updated");
  };

  const createScene = async (name: string, space: HueRoomZone) => {
    setSettingsError(null);
    try {
      await invoke("create-hue-scene", {
        name,
        groupId: space.id,
        groupType: space.resourceType,
      });
      await refreshSettings();
      toast.success("Scene created from current light state");
    } catch (error) {
      setSettingsError(String(error) || "Unable to create scene.");
      throw error;
    }
  };

  const saveSwitchConfig = async (
    id: string,
    body: Record<string, unknown>,
  ) => {
    await invoke("set-switch-input-configuration", { id, body });
    await refreshSettings();
    toast.success("Switch input configuration updated");
  };

  const updateCloseButtonBehavior = async (behavior: CloseButtonBehavior) => {
    if (!appSettings || behavior === appSettings.closeButtonBehavior) return;
    setIsSavingAppSettings(true);
    setSettingsError(null);
    try {
      const nextSettings = await invoke<AppSettings>(
        "set-close-button-behavior",
        { behavior },
      );
      setAppSettings(nextSettings);
      toast.success("General settings updated");
    } catch (error) {
      setSettingsError(String(error) || "Unable to update close behavior.");
    } finally {
      setIsSavingAppSettings(false);
    }
  };

  const updateAutoStart = async (enabled: boolean) => {
    if (!appSettings || enabled === appSettings.autoStart) return;
    setIsSavingAppSettings(true);
    setSettingsError(null);
    try {
      const nextSettings = await invoke<AppSettings>("set-auto-start", {
        enabled,
      });
      setAppSettings(nextSettings);
      toast.success("General settings updated");
    } catch (error) {
      setSettingsError(String(error) || "Unable to update auto start.");
    } finally {
      setIsSavingAppSettings(false);
    }
  };

  return (
    <Tabs
      value={activeTab}
      onValueChange={(tab) =>
        void navigate({ to: "/settings", search: { tab } })
      }
      orientation="horizontal"
      className="@container flex min-h-0 w-full flex-1 flex-col gap-0"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <SettingsNav
          activeTab={activeTab}
          onSelect={(tab) =>
            void navigate({ to: "/settings", search: { tab } })
          }
        />
        <Card className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border p-0 shadow-none ring-0 dark:shadow-none">
          <ScrollArea
            fade
            className="min-h-0 flex-1"
            viewportClassName="p-6"
            viewportRef={viewportRef}
          >
            <div className="mx-auto w-full max-w-3xl pt-16">
              <div className="flex items-center justify-between gap-4 pb-10">
                <div className="min-w-0 space-y-2">
                  <h1 className="font-heading text-2xl font-semibold tracking-tight">
                    {activeTabDetails.label}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {activeTabDetails.description}
                  </p>
                  {settingsError && (
                    <p className="pt-2 text-sm text-destructive">
                      {settingsError}
                    </p>
                  )}
                </div>
                {activeTab === "devices" && (
                  <AddDevicesButton
                    disabled={!summary?.deviceDiscoverySupported}
                    onClick={() =>
                      void navigate({ to: "/settings/device-discovery" })
                    }
                  />
                )}
                {activeTab === "spaces" && (
                  <AddSpaceButton
                    disabled={!connected}
                    onClick={() =>
                      void navigate({ to: "/settings/spaces-wizard" })
                    }
                  />
                )}
                {activeTab === "widget" && (
                  <AddWidgetButton
                    disabled={widgetLimitReached}
                    disabledReason={
                      widgetLimitReached
                        ? "Maximum of 3 desktop widgets reached. Please close an open widget before creating a new one."
                        : undefined
                    }
                    onClick={() =>
                      void navigate({ to: "/settings/widget-wizard" })
                    }
                  />
                )}
              </div>

              <TabsContent value="bridge">
                <BridgeTab
                  bridge={summary?.bridge}
                  connected={connected}
                  isLoadingSummary={isLoadingSummary}
                  fallbackBridgeId={bridgeId}
                  fallbackBridgeIp={bridgeIp}
                  applicationKey={applicationKey}
                  onResetSession={resetSession}
                />
              </TabsContent>

              <TabsContent value="devices">
                <DevicesTab
                  summary={summary}
                  isLoadingSummary={isLoadingSummary}
                  lights={lights}
                  roomZones={roomZones}
                  onRename={renameResource}
                  onDelete={deleteResource}
                  onSaveSwitchConfig={saveSwitchConfig}
                />
              </TabsContent>

              <TabsContent value="spaces">
                <SpacesTab
                  lights={lights}
                  roomZones={roomZones}
                  devices={summary?.devices ?? []}
                  onRename={renameResource}
                  onDelete={deleteResource}
                  onUpdateMembers={updateMembers}
                />
              </TabsContent>

              <TabsContent value="scenes">
                <ScenesTab
                  roomZones={roomZones}
                  scenes={scenes}
                  onRename={renameResource}
                  onDelete={deleteResource}
                  onCreateScene={createScene}
                />
              </TabsContent>

              <TabsContent value="app">
                <GeneralTab
                  themeMode={themeMode}
                  onThemeModeChange={onThemeModeChange}
                  appSettings={appSettings}
                  isLoadingAppSettings={isLoadingAppSettings}
                  isSavingAppSettings={isSavingAppSettings}
                  onUpdateCloseButtonBehavior={(behavior) =>
                    void updateCloseButtonBehavior(behavior)
                  }
                  onUpdateAutoStart={(enabled) => void updateAutoStart(enabled)}
                />
              </TabsContent>

              <TabsContent value="widget">
                <WidgetTab
                  widgets={widgets}
                  focusedWidgetId={search.widgetId}
                  focusRequest={search.widgetRequest}
                  onReopen={(id) => void openWidget(id)}
                  onClose={(id) => void closeWidget(id)}
                  onRemove={removeWidget}
                  onSetPinned={(id, pinned) => void setWidgetPinned(id, pinned)}
                  onSetAlwaysOnTop={(id, alwaysOnTop) =>
                    void setWidgetAlwaysOnTop(id, alwaysOnTop)
                  }
                  onPreviewConfig={(id, config) =>
                    void previewWidgetConfig(id, config)
                  }
                  onSetConfig={(id, config) => void setWidgetConfig(id, config)}
                />
              </TabsContent>
            </div>
          </ScrollArea>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Scroll to top"
            onClick={scrollToTop}
            className={`absolute bottom-4 right-4 z-20 rounded-full shadow-md transition-all duration-200 ${
              showScrollTop
                ? "translate-y-0 opacity-100"
                : "pointer-events-none translate-y-2 opacity-0"
            }`}
          >
            <ArrowUp />
          </Button>
        </Card>
      </div>
    </Tabs>
  );
};
