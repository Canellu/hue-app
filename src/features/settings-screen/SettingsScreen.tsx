import { Monitor, Moon, Power, Router, Sun } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import { useHue } from "../../context/HueContext";
import type { ThemeMode } from "../../context/ThemeContext";

interface SettingsScreenProps {
  themeMode: ThemeMode;
  onThemeModeChange: (themeMode: ThemeMode) => void;
}

const themeOptions = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] satisfies Array<{
  value: ThemeMode;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}>;

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  themeMode,
  onThemeModeChange,
}) => {
  const { bridgeId, bridgeIp, connected, resetSession } = useHue();
  const lights = useHueResourcesStore((state) => state.lights);
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const scenes = useHueResourcesStore((state) => state.scenes);

  const roomCount = roomZones.filter(
    (roomZone) => roomZone.resourceType === "room",
  ).length;
  const zoneCount = roomZones.filter(
    (roomZone) => roomZone.resourceType === "zone",
  ).length;
  const unreachableLightCount = lights.filter(
    (light) => !light.reachable,
  ).length;

  const summaryItems = [
    { label: "Rooms", value: roomCount },
    { label: "Zones", value: zoneCount },
    { label: "Lights", value: lights.length },
    { label: "Scenes", value: scenes.length },
  ];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Theme
        </h2>
        <Tabs
          value={themeMode}
          onValueChange={(value) => onThemeModeChange(value as ThemeMode)}
        >
          <TabsList size="xl" aria-label="Theme mode">
            {themeOptions.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="gap-2">
                <Icon size={18} />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Bridge
        </h2>
        <div className="rounded-2xl bg-muted/45 p-5 dark:bg-muted/30">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-background text-muted-foreground">
              <Router size={20} />
            </span>
            <div className="min-w-0">
              <p className="font-medium">Hue Bridge</p>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    connected ? "bg-green-500" : "bg-destructive",
                  )}
                />
                {connected ? "Connected" : "Disconnected"}
              </p>
            </div>
          </div>

          <dl className="grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Bridge ID</dt>
              <dd className="truncate text-right font-medium">
                {bridgeId ?? "Unknown"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">IP address</dt>
              <dd className="truncate text-right font-medium">
                {bridgeIp ?? "Unknown"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Unreachable lights</dt>
              <dd className="truncate text-right font-medium">
                {unreachableLightCount}
              </dd>
            </div>
          </dl>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {summaryItems.map((item) => (
              <div
                key={item.label}
                className="rounded-xl bg-background/70 px-3 py-2"
              >
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="text-lg font-semibold">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Advanced
        </h2>
        <div className="flex flex-wrap gap-2">
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="destructive" size="xl" className="gap-2" />
              }
            >
              <Power size={18} />
              Remove bridge & reset
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove bridge?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the saved bridge and credentials from this
                  device. You'll need to pair again to control your lights.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel size="xl">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  size="xl"
                  className="gap-2"
                  onClick={() => void resetSession()}
                >
                  <Power size={18} />
                  Remove bridge
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </section>
    </div>
  );
};
