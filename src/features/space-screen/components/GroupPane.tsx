import { PacedSlider } from "@/components/PacedSlider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getRoomZoneIcon } from "@/features/home-screen/components/room-zone-icons";
import { roomZoneTileColor } from "@/features/space-screen/utils/color-state";
import { activeTileTheme } from "@/lib/tile-theme";
import { cn } from "@/lib/utils";
import type { LightColorChange } from "@/stores/HueResourcesStore";
import type { HueLight, HueRoomZone } from "@/types/hue";
import { useEffect, useMemo, useState } from "react";
import { MultiColorWheel } from "./MultiColorWheel";
import { MultiTemperatureWheel } from "./MultiTemperatureWheel";
import { SidePane } from "./SidePane";

type ControlCommitPhase = "live" | "final";

type Tab = "color" | "kelvin";

const TAB_LABELS: Record<Tab, string> = {
  color: "Color",
  kelvin: "White",
};

interface GroupPaneProps {
  roomZone: HueRoomZone;
  /** The room/zone's member lights — one thumb per light on the wheels. */
  lights: HueLight[];
  hueEventRevision: number;
  onClose: () => void;
  onToggle: (roomZone: HueRoomZone, nextOn: boolean) => void;
  onBrightness: (
    roomZone: HueRoomZone,
    pct: number,
    phase: ControlCommitPhase,
  ) => void;
  onLightColor: (light: HueLight, change: LightColorChange) => void;
}

/**
 * Group inspector: the room/zone counterpart to {@link LightPane}. The power
 * switch and brightness slider drive the whole space at once, while the color
 * and white wheels carry one thumb per member light so each can be tuned
 * individually without leaving the group view.
 */
export const GroupPane: React.FC<GroupPaneProps> = ({
  roomZone,
  lights,
  hueEventRevision,
  onClose,
  onToggle,
  onBrightness,
  onLightColor,
}) => {
  const colorLights = useMemo(
    () => lights.filter((light) => light.supportsColor),
    [lights],
  );
  const ctLights = useMemo(
    () => lights.filter((light) => light.supportsCt),
    [lights],
  );

  const availableTabs = useMemo<Tab[]>(() => {
    const tabs: Tab[] = [];
    if (colorLights.length > 0) tabs.push("color");
    if (ctLights.length > 0) tabs.push("kelvin");
    return tabs;
  }, [colorLights.length, ctLights.length]);

  const [tab, setTab] = useState<Tab>("color");
  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.includes(tab)) {
      setTab(availableTabs[0]);
    }
  }, [availableTabs, tab]);

  const brightnessPct = Math.round(roomZone.brightness ?? 0);
  const Icon = getRoomZoneIcon(roomZone.class);
  const tile = roomZoneTileColor(lights);
  const previewStyle =
    tile.active && tile.background
      ? activeTileTheme(tile.background, tile.glow ?? tile.background, brightnessPct)
      : undefined;

  const view = (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 pt-1">
        <span
          className={cn(
            "flex size-16 items-center justify-center rounded-2xl text-foreground",
            tile.active ? "shadow-sm" : "bg-muted",
          )}
          style={previewStyle}
        >
          <Icon size={32} strokeWidth={2.25} />
        </span>
        <h2 className="max-w-full truncate text-center font-heading text-lg font-medium text-foreground">
          {roomZone.name}
        </h2>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {roomZone.anyOn ? "On" : "Off"}
        </span>
        <Switch
          checked={roomZone.anyOn}
          disabled={!roomZone.groupedLightId}
          aria-label={`Toggle ${roomZone.name}`}
          onCheckedChange={(checked) => onToggle(roomZone, checked)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">
            Brightness
          </p>
          <span className="text-xs text-muted-foreground tabular-nums">
            {brightnessPct}%
          </span>
        </div>
        <PacedSlider
          value={roomZone.anyOn ? Math.max(1, brightnessPct) : 1}
          min={1}
          disabled={!roomZone.groupedLightId}
          ariaLabel={`${roomZone.name} brightness`}
          isGroup
          animateKey={hueEventRevision}
          onCommit={(value, phase) => onBrightness(roomZone, value, phase)}
        />
      </div>

      {availableTabs.length > 0 && (
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          {availableTabs.length > 1 && (
            <TabsList className="w-full">
              {availableTabs.map((id) => (
                <TabsTrigger key={id} value={id}>
                  {TAB_LABELS[id]}
                </TabsTrigger>
              ))}
            </TabsList>
          )}

          {colorLights.length > 0 && (
            <TabsContent value="color" className="flex w-full p-8">
              <MultiColorWheel
                lights={colorLights}
                onPick={(light, xy, vividHex) =>
                  onLightColor(light, { xy, vividHex })
                }
              />
            </TabsContent>
          )}

          {ctLights.length > 0 && (
            <TabsContent value="kelvin" className="flex w-full p-8">
              <MultiTemperatureWheel
                lights={ctLights}
                onPick={(light, value) => onLightColor(light, { ct: value })}
              />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );

  return (
    <SidePane
      eyebrow={roomZone.resourceType === "zone" ? "Zone" : "Room"}
      resetKey={roomZone.id}
      onClose={onClose}
      view={view}
    />
  );
};
