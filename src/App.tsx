import { RouterProvider } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TitleBar } from "./components/TitleBar";
import { useHue } from "./context/HueContext";
import {
  ThemeContext,
  type ResolvedThemeMode,
  type ThemeMode,
} from "./context/ThemeContext";
import { router } from "./router";
import { WizardContainer } from "./features/wizard/WizardContainer";
import { useGlobalKeyboardShortcut } from "./hooks/useGlobalKeyboardShortcut";

const getInitialTheme = (): ThemeMode => {
  const storedTheme = localStorage.getItem("themeMode");
  if (
    storedTheme === "light" ||
    storedTheme === "dark" ||
    storedTheme === "system"
  ) {
    return storedTheme;
  }

  return "system";
};

const getSystemTheme = (): ResolvedThemeMode =>
  window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";

function App() {
  const { configured, connected, error, isLoading, refreshSession } = useHue();
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme);
  const [systemThemeMode, setSystemThemeMode] =
    useState<ResolvedThemeMode>(getSystemTheme);
  const resolvedThemeMode =
    themeMode === "system" ? systemThemeMode : themeMode;

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setSystemThemeMode(getSystemTheme());

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (resolvedThemeMode === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    document.documentElement.style.colorScheme = resolvedThemeMode;
    localStorage.setItem("themeMode", themeMode);
  }, [resolvedThemeMode, themeMode]);

  const toggleTheme = () =>
    setThemeMode(resolvedThemeMode === "dark" ? "light" : "dark");

  useGlobalKeyboardShortcut({ key: "j", mod: true }, () => {
    toggleTheme();
  });

  const themeValue = useMemo(
    () => ({ themeMode, resolvedThemeMode, setThemeMode, toggleTheme }),
    [themeMode, resolvedThemeMode],
  );

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex h-full items-center justify-center p-6">
          <Card className="w-full max-w-md">
            <CardContent className="flex flex-col items-center gap-4 py-6 text-center">
              <Loader2 className="size-10 animate-spin text-muted-foreground" />
              <h1 className="font-heading text-2xl font-semibold">
                Checking connection
              </h1>
              <p className="text-muted-foreground">
                Restoring your saved Hue Bridge session...
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (configured && connected) {
      return (
        <div className="h-full">
          <ThemeContext.Provider value={themeValue}>
            <RouterProvider router={router} />
          </ThemeContext.Provider>
        </div>
      );
    }

    if (configured) {
      return (
        <div className="flex h-full items-center justify-center p-6">
          <Card className="w-full max-w-md">
            <CardContent className="flex flex-col items-center gap-4 py-6 text-center">
              <h1 className="font-heading text-2xl font-semibold">
                Bridge unavailable
              </h1>
              <p className="text-sm text-muted-foreground">
                {error ?? "The saved bridge could not be reached."}
              </p>
              <Button onClick={() => void refreshSession()}>
                Retry connection
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="flex h-full items-center justify-center p-6">
        <WizardContainer />
      </div>
    );
  };

  return (
    <main className="h-screen overflow-hidden bg-background pt-10 text-foreground">
      <TitleBar />
      {renderContent()}
    </main>
  );
}

export default App;
