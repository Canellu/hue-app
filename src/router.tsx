import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { DeviceDiscoveryRoute } from "./routes/DeviceDiscoveryRoute";
import { HomeRoute } from "./routes/HomeRoute";
import { RoomZoneWizardRoute } from "./routes/RoomZoneWizardRoute";
import { RootLayout } from "./routes/RootLayout";
import { SettingsRoute } from "./routes/SettingsRoute";
import { SpaceRoute } from "./routes/SpaceRoute";
import { WidgetWizardRoute } from "./routes/WidgetWizardRoute";

// The desktop shell has no addressable URL bar, so an in-memory history keeps
// navigation state without touching the Tauri webview's location.
const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomeRoute,
});

const spaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/space/$spaceId",
  component: SpaceRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
    ...(typeof search.widgetId === "string"
      ? { widgetId: search.widgetId }
      : {}),
    ...(typeof search.widgetRequest === "number"
      ? { widgetRequest: search.widgetRequest }
      : {}),
  }),
  component: SettingsRoute,
});

const deviceDiscoveryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/device-discovery",
  component: DeviceDiscoveryRoute,
});

const widgetWizardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/widget-wizard",
  component: WidgetWizardRoute,
});

const roomZoneWizardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/spaces-wizard",
  component: RoomZoneWizardRoute,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  spaceRoute,
  settingsRoute,
  deviceDiscoveryRoute,
  widgetWizardRoute,
  roomZoneWizardRoute,
]);

export const router = createRouter({
  routeTree,
  history: createMemoryHistory({ initialEntries: ["/"] }),
  defaultPreload: "intent",
  defaultStaleTime: 5000,
  scrollRestoration: true,
  defaultViewTransition: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
