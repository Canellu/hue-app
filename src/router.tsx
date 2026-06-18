import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { HomeRoute } from "./routes/HomeRoute";
import { RootLayout } from "./routes/RootLayout";
import { SettingsRoute } from "./routes/SettingsRoute";
import { SpaceRoute } from "./routes/SpaceRoute";

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
  component: SettingsRoute,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  spaceRoute,
  settingsRoute,
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
