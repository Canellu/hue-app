import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { HueProvider } from "./context/HueContext";
import { ThemeProvider } from "./context/ThemeContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <HueProvider>
        <App />
      </HueProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
