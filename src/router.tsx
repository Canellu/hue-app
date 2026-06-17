import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { DesktopShell } from "./features/desktop/DesktopShell";
import { HomeRoute } from "./features/desktop/routes/HomeRoute";
import { RoomRoute } from "./features/desktop/routes/RoomRoute";
import { SettingsRoute } from "./features/desktop/routes/SettingsRoute";

// The desktop shell has no addressable URL bar, so an in-memory history keeps
// navigation state without touching the Tauri webview's location.
const rootRoute = createRootRoute({ component: DesktopShell });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomeRoute,
});

const roomRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/room/$roomId",
  component: RoomRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsRoute,
});

const routeTree = rootRoute.addChildren([indexRoute, roomRoute, settingsRoute]);

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
