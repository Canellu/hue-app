import { cn } from "@/lib/utils";
import { router } from "@/router";
import { useSyncExternalStore } from "react";

/**
 * Where the dev URL bar anchors along the bottom edge. Driven by
 * `VITE_DEV_TOOL_PATH`; anything outside this set (or unset) hides the bar.
 */
type DevToolPath = "left" | "center" | "right";

const alignment: Record<DevToolPath, string> = {
  left: "left-2 text-left",
  center: "left-1/2 -translate-x-1/2 text-center",
  right: "right-2 text-right",
};

const resolvePath = (): DevToolPath | null => {
  const raw = import.meta.env.VITE_DEV_TOOL_PATH?.trim().toLowerCase();
  return raw === "left" || raw === "center" || raw === "right" ? raw : null;
};

/**
 * A tiny fixed readout pinned to the bottom of the window that shows the current
 * router URL (path + search). Purely a development aid: it renders nothing
 * unless `VITE_DEV_TOOL_PATH` is set to `left`, `center`, or `right`, which also
 * picks where along the bottom edge it sits.
 *
 * It subscribes to the exported `router` singleton rather than `useRouterState`
 * so it can live at the app root — outside the `RouterProvider` that only the
 * home/space/settings views mount — and still report the URL on every screen.
 */
export const DevUrlBar: React.FC = () => {
  const path = resolvePath();
  const url = useSyncExternalStore(
    (onChange) => router.subscribe("onResolved", onChange),
    () => router.state.location.href,
  );

  if (!path) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-2 z-9999 max-w-[90vw] truncate rounded-md bg-popover/90 px-2.5 py-1 font-mono text-xs text-popover-foreground shadow-md ring-1 ring-border backdrop-blur",
        alignment[path],
      )}
    >
      {url}
    </div>
  );
};
