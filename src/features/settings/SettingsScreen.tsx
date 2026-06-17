import { Moon, Power, RefreshCcw, Router, Sun } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useHue } from "../../context/HueContext";

type ThemeMode = "light" | "dark";

interface SettingsScreenProps {
  themeMode: ThemeMode;
  onToggleTheme: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  themeMode,
  onToggleTheme,
}) => {
  const { bridgeId, bridgeIp, connected, refreshSession, resetSession } =
    useHue();

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-foreground/10">
              <Router size={18} />
            </span>
            <div>
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

          <dl className="flex flex-col gap-2 text-sm">
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
            className="w-full justify-start gap-2"
            onClick={() => void refreshSession()}
          >
            <RefreshCcw size={18} />
            Reconnect to bridge
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={onToggleTheme}
          >
            {themeMode === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            {themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="destructive" className="w-full justify-start gap-2" />
              }
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
        </CardContent>
      </Card>
    </div>
  );
};
