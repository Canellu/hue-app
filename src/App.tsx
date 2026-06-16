import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import "./App.css";
import { TitleBar } from "./components/TitleBar";
import { useHue } from "./context/HueContext";
import { HueDeviceList } from "./features/hue/HueDeviceList";
import { WizardContainer } from "./features/wizard/WizardContainer";

type ThemeMode = "light" | "dark";

const getInitialTheme = (): ThemeMode => {
  const storedTheme = localStorage.getItem("themeMode");
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
};

function App() {
  const {
    bridgeId,
    bridgeIp,
    configured,
    connected,
    error,
    isLoading,
    refreshSession,
    resetSession,
  } = useHue();
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    if (themeMode === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    document.documentElement.style.colorScheme = themeMode;
    localStorage.setItem("themeMode", themeMode);
  }, [themeMode]);

  return (
    <main className="app-shell">
      <TitleBar />
      <div className="window-content flex flex-col items-stretch justify-start overflow-y-auto">
        {isLoading ? (
          <div className="glass-panel w-full p-10 text-center">
            <div className="neutral-spinner mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4"></div>
            <h1 className="mb-2 text-3xl font-bold">Checking connection</h1>
            <p className="text-secondary">
              Restoring your saved Hue Bridge session...
            </p>
          </div>
        ) : configured && connected ? (
          <div className="w-full px-6 py-6">
            <HueDeviceList />
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => void resetSession()}
                className="ghost-button px-4 py-3 font-semibold"
              >
                Reset setup
              </button>
            </div>
          </div>
        ) : configured ? (
          <div className="glass-panel w-full p-10 text-center">
            <h1 className="mb-4 text-4xl font-bold">Bridge unavailable</h1>
            <p className="text-secondary mb-2">
              Saved bridge ID: {bridgeId ?? "Unknown"}
            </p>
            <p className="text-muted mb-8 text-sm">
              {error ?? "The saved bridge could not be reached."}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => void refreshSession()}
                className="accent-button px-4 py-3 font-semibold"
              >
                Retry connection
              </button>
              <button
                type="button"
                onClick={() => void resetSession()}
                className="ghost-button px-4 py-3 font-semibold"
              >
                Start over
              </button>
            </div>
          </div>
        ) : (
          <WizardContainer />
        )}
      </div>
      <button
        type="button"
        aria-label={`Switch to ${themeMode === "dark" ? "light" : "dark"} mode`}
        onClick={() =>
          setThemeMode((currentTheme) =>
            currentTheme === "dark" ? "light" : "dark",
          )
        }
        className="theme-toggle"
      >
        {themeMode === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </main>
  );
}

export default App;
