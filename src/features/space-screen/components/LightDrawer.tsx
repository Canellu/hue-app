import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DebouncedSlider } from "@/components/DebouncedSlider";
import type { LightColorChange } from "@/stores/HueResourcesStore";
import { miredToKelvin } from "@/features/space-screen/utils/color";
import type { HueLight } from "@/types/hue";
import { ColorWheel } from "./ColorWheel";

type Tab = "color" | "kelvin" | "effects";

interface LightDrawerProps {
  light: HueLight;
  onClose: () => void;
  onLightToggle: (light: HueLight, nextOn: boolean) => void;
  onLightBrightness: (light: HueLight, pct: number) => void;
  onLightColor: (light: HueLight, change: LightColorChange) => void;
}

// Friendly labels for the v2 effect identifiers a fixture may report.
const EFFECT_LABELS: Record<string, string> = {
  no_effect: "None",
  candle: "Candle",
  fire: "Fireplace",
  sparkle: "Sparkle",
  prism: "Prism",
  glisten: "Glisten",
  opal: "Opal",
  underwater: "Underwater",
  cosmos: "Cosmos",
  sunbeam: "Sunbeam",
  enchant: "Enchant",
};

const TAB_LABELS: Record<Tab, string> = {
  color: "Color",
  kelvin: "White",
  effects: "Effects",
};

const effectLabel = (id: string): string =>
  EFFECT_LABELS[id] ??
  id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const LightDrawer: React.FC<LightDrawerProps> = ({
  light,
  onClose,
  onLightToggle,
  onLightBrightness,
  onLightColor,
}) => {
  const hasEffects = useMemo(
    () => (light.effects ?? []).some((e) => e !== "no_effect"),
    [light.effects],
  );

  const availableTabs = useMemo<Tab[]>(() => {
    const tabs: Tab[] = [];
    if (light.supportsColor) tabs.push("color");
    if (light.supportsCt) tabs.push("kelvin");
    if (hasEffects) tabs.push("effects");
    return tabs;
  }, [light.supportsColor, light.supportsCt, hasEffects]);

  const [tab, setTab] = useState<Tab>("color");

  // Keep the active tab valid as the selected light changes.
  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.includes(tab)) {
      setTab(availableTabs[0]);
    }
  }, [availableTabs, tab]);

  const brightnessPct = Math.round(light.brightness ?? 0);
  const ctMin = light.ctMin ?? 153;
  const ctMax = light.ctMax ?? 500;
  const ct = light.ct ?? Math.round((ctMin + ctMax) / 2);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{light.name}</SheetTitle>
          <SheetDescription>
            {light.productName ?? light.typeName ?? "Hue light"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 p-6 pt-0">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {light.isOn ? "On" : "Off"}
            </span>
            <Switch
              checked={light.isOn}
              disabled={!light.reachable}
              aria-label={`Toggle ${light.name}`}
              onCheckedChange={(checked) => onLightToggle(light, checked)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">Brightness</p>
            <DebouncedSlider
              value={brightnessPct}
              disabled={!light.reachable}
              ariaLabel={`${light.name} brightness`}
              debounceMs={150}
              onCommit={(value) => onLightBrightness(light, value)}
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

              {light.supportsColor && (
                <TabsContent value="color" className="flex justify-center py-4">
                  <ColorWheel
                    xy={light.xy}
                    onPick={(xy) => onLightColor(light, { xy })}
                  />
                </TabsContent>
              )}

              {light.supportsCt && (
                <TabsContent value="kelvin" className="flex flex-col gap-3 py-4">
                  <div className="text-center font-heading text-2xl font-medium">
                    {miredToKelvin(ct)}K
                  </div>
                  <DebouncedSlider
                    value={ct}
                    min={ctMin}
                    max={ctMax}
                    ariaLabel="Color temperature"
                    debounceMs={180}
                    onCommit={(value) => onLightColor(light, { ct: value })}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Cool</span>
                    <span>Warm</span>
                  </div>
                </TabsContent>
              )}

              {hasEffects && (
                <TabsContent value="effects" className="py-4">
                  <div className="grid grid-cols-2 gap-2">
                    {light.effects.map((effect) => (
                      <Button
                        key={effect}
                        variant={light.effect === effect ? "default" : "outline"}
                        className="justify-start gap-2"
                        onClick={() => onLightColor(light, { effect })}
                      >
                        <Sparkles size={16} />
                        {effectLabel(effect)}
                      </Button>
                    ))}
                  </div>
                </TabsContent>
              )}
            </Tabs>
          )}

          <Accordion>
            <AccordionItem value="device-info">
              <AccordionTrigger>Device information</AccordionTrigger>
              <AccordionContent>
                <dl className="flex flex-col gap-2 text-sm">
                  <MetaRow label="Type" value={light.typeName} />
                  <MetaRow label="Product" value={light.productName} />
                  <MetaRow label="Model ID" value={light.modelId} />
                  <MetaRow label="Firmware" value={light.swVersion} />
                  <MetaRow
                    label="Connection"
                    value={light.reachable ? "Reachable" : "Unreachable"}
                  />
                  <MetaRow label="Zigbee MAC" value={light.uniqueId} />
                </dl>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </SheetContent>
    </Sheet>
  );
};

const MetaRow: React.FC<{ label: string; value: string | null }> = ({
  label,
  value,
}) =>
  value ? (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium">{value}</dd>
    </div>
  ) : null;
