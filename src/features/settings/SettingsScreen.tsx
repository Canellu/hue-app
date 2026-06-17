import { Monitor, Moon, Power, RefreshCcw, Router, Sun } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useHue } from "../../context/HueContext";
import type { ThemeMode } from "../../context/ThemeContext";

interface SettingsScreenProps {
  themeMode: ThemeMode;
  onThemeModeChange: (themeMode: ThemeMode) => void;
}

const themeOptions = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] satisfies Array<{
  value: ThemeMode;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}>;

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  themeMode,
  onThemeModeChange,
}) => {
  const { bridgeId, bridgeIp, connected, refreshSession, resetSession } =
    useHue();

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Theme
        </h2>
        <div className="inline-flex w-fit rounded-full bg-muted p-1">
          {themeOptions.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              variant={themeMode === value ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "gap-2 px-4",
                themeMode === value && "bg-background shadow-sm",
              )}
              onClick={() => onThemeModeChange(value)}
            >
              <Icon size={16} />
              {label}
            </Button>
          ))}
        </div>
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

          <dl className="mb-5 grid gap-2 text-sm">
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
          </dl>

          <Button
            variant="outline"
            className="gap-2"
            onClick={() => void refreshSession()}
          >
            <RefreshCcw size={18} />
            Reconnect to bridge
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Advanced
        </h2>
        <div className="flex flex-wrap gap-2">
          <AlertDialog>
            <AlertDialogTrigger
              render={<Button variant="destructive" className="gap-2" />}
            >
              <Power size={18} />
              Remove bridge & reset
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove bridge?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the saved bridge and credentials from this device.
                  You'll need to pair again to control your lights.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
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
