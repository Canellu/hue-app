import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { HueProvider } from "./context/HueContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HueProvider>
      <App />
    </HueProvider>
  </React.StrictMode>,
);
