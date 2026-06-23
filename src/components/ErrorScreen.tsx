import { StatusScreen } from "@/components/StatusScreen";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, RotateCcw, TriangleAlert } from "lucide-react";

interface ErrorScreenProps {
  /** The error that tripped the boundary. */
  error: Error;
  /** React component stack from componentDidCatch, shown in the details panel. */
  componentStack?: string | null;
  /** Resets the boundary so the app subtree re-mounts. Omit to hide "Try again". */
  onReset?: () => void;
}

/** The destructive-tinted alert badge, matching BridgeStatus' glow + ring style. */
const ErrorVisual = () => (
  <div className="relative flex items-center justify-center">
    <div className="pointer-events-none absolute size-40 rounded-full bg-red-500/60 blur-2xl dark:bg-red-500/25" />
    <div className="relative flex size-28 items-center justify-center rounded-full bg-background shadow-md ring-1 ring-border">
      <TriangleAlert className="size-14 text-red-600 dark:text-red-500" />
    </div>
  </div>
);

/**
 * Friendly full-screen fallback for an unrecoverable render error. Leads with a
 * reassuring message and recovery actions, and tucks the raw error + component
 * stack behind a "Technical details" disclosure for debugging. Presentational
 * only — the catching lives in ErrorBoundary; this is also rendered standalone
 * by the dev toolbar so the look can be inspected without crashing the app.
 */
export const ErrorScreen = ({
  error,
  componentStack,
  onReset,
}: ErrorScreenProps) => {
  const stack = error.stack ?? `${error.name}: ${error.message}`;
  const details = componentStack
    ? `${stack}\n\nComponent stack:${componentStack}`
    : stack;

  return (
    <StatusScreen
      visual={<ErrorVisual />}
      title="Something went wrong"
      description="The app hit an unexpected error and couldn't continue. Try again, or reload if the problem keeps coming back."
      actions={
        <div className="flex w-full flex-col items-center gap-5">
          <div className="flex gap-3">
            {onReset ? (
              <Button size="xl" variant="outline" onClick={onReset}>
                <RotateCcw />
                Try again
              </Button>
            ) : null}
            <Button size="xl" onClick={() => window.location.reload()}>
              Reload app
            </Button>
          </div>

          <Collapsible className="w-full max-w-xl">
            <div className="flex justify-center">
              <CollapsibleTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground [&[data-panel-open]>svg]:rotate-180"
                  >
                    <ChevronDown className="transition-transform" />
                    Technical details
                  </Button>
                }
              />
            </div>
            <CollapsibleContent>
              <div className="mt-3 overflow-hidden rounded-2xl border border-border/60 bg-card/60 text-left">
                <p
                  className="px-4 pt-3 text-sm font-medium"
                  style={{ color: "var(--destructive-text)" }}
                >
                  {error.name}: {error.message}
                </p>
                <ScrollArea className="max-h-56" fade>
                  <pre className="px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
                    {details}
                  </pre>
                </ScrollArea>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      }
    />
  );
};
