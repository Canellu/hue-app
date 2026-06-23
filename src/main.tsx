import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toaster } from "./components/ui/sonner";
import { HueProvider } from "./context/HueContext";
import { ThemeProvider } from "./context/ThemeContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
        <HueProvider>
          <App />
          <Toaster />
        </HueProvider>
      </ErrorBoundary>
    </ThemeProvider>
  </React.StrictMode>,
);
