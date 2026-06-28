import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ChevronDown, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { resolveWidgetTheme, widgetShellStyle } from "../widgetShell";

interface WidgetErrorScreenProps {
  /** The error that tripped the boundary. */
  error: Error;
  /** React component stack from componentDidCatch, shown in the details panel. */
  componentStack?: string | null;
  /** Resets the boundary so the widget subtree re-mounts. */
  onReset?: () => void;
}

/**
 * Compact error fallback sized for the small widget window. The generic
 * full-screen ErrorScreen is far too large here (oversized type, xl buttons),
 * and — because the boundary replaces the whole tree including the widget shell
 * — it would render over the window's transparent backdrop. This paints the
 * widget's *unpinned* shell look (solid tint + border) itself so a crashed
 * widget stays visible and grabbable instead of vanishing into transparency.
 *
 * Theme is resolved from the system preference rather than the widget's stored
 * theme: the error may originate in the very hook that loads that setting, so we
 * can't rely on it being available.
 */
export const WidgetErrorScreen = ({
  error,
  componentStack,
  onReset,
}: WidgetErrorScreenProps) => {
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const theme = resolveWidgetTheme("system", systemDark);

  // Mirror WidgetScreen: drive the document's `.dark` class and color-scheme so
  // Tailwind `dark:` variants resolve while the inline shell tokens override the
  // token values for this subtree.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }, [theme]);

  const shellStyle = useMemo(() => widgetShellStyle(theme), [theme]);

  const stack = error.stack ?? `${error.name}: ${error.message}`;
  const details = componentStack
    ? `${stack}\n\nComponent stack:${componentStack}`
    : stack;

  return (
    <main
      className={cn(
        "relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden",
        "border border-border/20 text-foreground shadow-2xl",
      )}
      style={shellStyle}
    >
      <ScrollArea className="h-full w-full">
        <div className="flex min-h-screen w-full flex-col items-center justify-center gap-3 px-5 py-6 text-center">
          <div className="relative flex items-center justify-center">
            <div className="pointer-events-none absolute size-16 rounded-full bg-red-500/50 blur-xl dark:bg-red-500/20" />
            <div className="relative flex size-12 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border">
              <TriangleAlert className="size-6 text-red-600 dark:text-red-500" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-base font-semibold">
              Widget crashed
            </h1>
            <p className="text-xs text-muted-foreground">
              This widget hit an unexpected error. Try again, or reload if it
              keeps happening.
            </p>
          </div>

          <div className="flex gap-2">
            {onReset ? (
              <Button size="sm" variant="outline" onClick={onReset}>
                <RotateCcw />
                Try again
              </Button>
            ) : null}
            <Button size="sm" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>

          <Collapsible className="w-full max-w-full">
            <div className="flex justify-center">
              <CollapsibleTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground [&[data-panel-open]>svg]:rotate-180"
                  >
                    <ChevronDown className="transition-transform" />
                    Technical details
                  </Button>
                }
              />
            </div>
            <CollapsibleContent>
              <div className="mt-2 overflow-hidden rounded-xl border border-border/60 bg-card/60 text-left">
                <p
                  className="px-3 pt-2 text-xs font-medium"
                  style={{ color: "var(--destructive-text)" }}
                >
                  {error.name}: {error.message}
                </p>
                <ScrollArea className="max-h-40" fade>
                  <pre className="px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                    {details}
                  </pre>
                </ScrollArea>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>
    </main>
  );
};
