import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";

export interface WizardFinalAction {
  label: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}

export const SettingsWizardLayout = ({
  steps,
  step,
  maxUnlockedStep,
  onStepChange,
  canContinue,
  onContinue,
  finalAction,
  children,
}: {
  steps: readonly string[];
  step: number;
  maxUnlockedStep: number;
  onStepChange: (step: number) => void;
  canContinue: boolean;
  onContinue: () => void;
  finalAction: WizardFinalAction;
  children: React.ReactNode;
}) => (
  <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col text-foreground">
    <header className="mx-auto w-full max-w-2xl shrink-0 pt-2 pb-8">
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
        }}
      >
        {steps.map((label, index) => {
          const active = index === step;
          const clickable = index <= maxUnlockedStep;
          return (
            <button
              key={label}
              type="button"
              disabled={!clickable}
              onClick={() => onStepChange(index)}
              className={cn(
                "group flex flex-col items-center gap-2 text-center",
                clickable ? "cursor-pointer" : "cursor-default",
              )}
            >
              <span
                className={cn(
                  "block max-w-full truncate text-xs font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground",
                  clickable && !active && "group-hover:text-foreground/60",
                )}
              >
                {label}
              </span>
              <span
                className={cn(
                  "block h-1 w-full rounded-full transition-[opacity,background-color] duration-200 ease-out",
                  active
                    ? "bg-primary"
                    : index <= maxUnlockedStep
                      ? "bg-foreground"
                      : "bg-border",
                  clickable && "group-hover:opacity-60",
                )}
              />
            </button>
          );
        })}
      </div>
    </header>

    {children}

    <footer className="shrink-0 border-t border-foreground/10 pt-5">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4">
        {step > 0 ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onStepChange(Math.max(0, step - 1))}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft size={16} />
            Back
          </Button>
        ) : (
          <span />
        )}
        {step < steps.length - 1 ? (
          <Button
            type="button"
            size="lg"
            disabled={!canContinue}
            onClick={onContinue}
            className="rounded-full px-10"
          >
            Continue
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            disabled={finalAction.disabled}
            onClick={finalAction.onClick}
            className="rounded-full px-10"
          >
            {finalAction.label}
          </Button>
        )}
      </div>
    </footer>
  </div>
);

export const SettingsWizardContainedStep = ({
  children,
  className,
  contentClassName,
}: {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) => (
  <section
    className={cn(
      "mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col overflow-hidden",
      className,
    )}
  >
    <div
      className={cn(
        "flex min-h-0 w-full flex-1 flex-col gap-6 py-4",
        contentClassName,
      )}
    >
      {children}
    </div>
  </section>
);

export const SettingsWizardViewport = ({
  stepKey,
  contained,
  centerPage = true,
  children,
}: {
  stepKey: React.Key;
  /** True when a child such as ScrollArea owns scrolling for this step. */
  contained: boolean;
  centerPage?: boolean;
  children: React.ReactNode;
}) => (
  <main
    className={cn(
      "flex min-h-0 flex-1 flex-col",
      contained ? "overflow-hidden" : "overflow-y-auto",
    )}
  >
    <div
      key={stepKey}
      className={cn(
        "flex flex-1 flex-col animate-in fade-in",
        contained ? "min-h-0" : "min-h-full",
        !contained && centerPage && "justify-center",
      )}
      style={{
        animationDuration: "600ms",
        animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {children}
    </div>
  </main>
);
