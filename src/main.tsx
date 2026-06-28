import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toaster } from "./components/ui/sonner";
import { HueProvider } from "./context/HueContext";
import { ThemeProvider } from "./context/ThemeContext";
import { WidgetScreen } from "./features/widget-screen/WidgetScreen";
import { WidgetErrorScreen } from "./features/widget-screen/components/WidgetErrorScreen";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

const searchParams = new URLSearchParams(window.location.search);
const isWidgetUrl = searchParams.get("window") === "widget";

const currentWindowLabel = (() => {
  try {
    if (!("__TAURI_INTERNALS__" in window)) return "main";
    return getCurrentWindow().label;
  } catch {
    return "main";
  }
})();

const widgetId =
  searchParams.get("widgetId") ??
  (currentWindowLabel.startsWith("widget-")
    ? currentWindowLabel.slice("widget-".length)
    : undefined);

const isWidgetWindow = isWidgetUrl || Boolean(widgetId);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider manageDocument={!isWidgetWindow}>
      <ErrorBoundary
        fallback={
          isWidgetWindow
            ? ({ error, componentStack, onReset }) => (
                <WidgetErrorScreen
                  error={error}
                  componentStack={componentStack}
                  onReset={onReset}
                />
              )
            : undefined
        }
      >
        {isWidgetWindow ? (
          <>
            <WidgetScreen widgetId={widgetId ?? "main"} />
            <Toaster />
          </>
        ) : (
          <HueProvider>
            <App />
            <Toaster />
          </HueProvider>
        )}
      </ErrorBoundary>
    </ThemeProvider>
  </React.StrictMode>,
);
