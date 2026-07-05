import { Switch } from "@/components/ui/switch";
import { selectableVariants } from "@/lib/selection-styles";
import { cn } from "@/lib/utils";
import { Minus, Monitor, Moon, Sun, X } from "lucide-react";
import type { ThemeMode } from "../../../context/ThemeContext";
import {
  SegmentedControl,
  type SegmentIcon,
} from "../components/SegmentedControl";
import {
  SettingsRow,
  SettingsSection,
  SettingsStack,
} from "../components/SettingsList";
import type { AppSettings, CloseButtonBehavior } from "../types";

const themeOptions = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] satisfies Array<{ value: ThemeMode; label: string; icon: SegmentIcon }>;

const closeButtonOptions = [
  {
    value: "exit",
    label: "Close app",
    icon: X,
    summary: "Close Hue fully when the window is dismissed.",
    closeNote: "Quit Hue Desktop",
    minimizeNote: "Keep running in tray",
  },
  {
    value: "minimizeToTray",
    label: "Minimize to tray",
    icon: Minus,
    summary: "Keep Hue available when the window is dismissed.",
    closeNote: "Hide to tray",
    minimizeNote: "Send to taskbar",
  },
] satisfies Array<{
  value: CloseButtonBehavior;
  label: string;
  icon: SegmentIcon;
  summary: string;
  closeNote: string;
  minimizeNote: string;
}>;

function CloseButtonChoiceList({
  value,
  onValueChange,
  disabled,
}: {
  value: CloseButtonBehavior;
  onValueChange: (value: CloseButtonBehavior) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Minimize and close button behavior"
      className="grid grid-cols-1 gap-3 @2xl:grid-cols-2"
    >
      {closeButtonOptions.map(
        ({ value: optionValue, label, summary, closeNote, minimizeNote }) => {
          const selected = value === optionValue;

          return (
            <button
              key={optionValue}
              type="button"
              role="radio"
              aria-checked={selected}
              data-selected={selected ? "" : undefined}
              disabled={disabled}
              onClick={() => onValueChange(optionValue)}
              className={cn(
                "relative grid content-start gap-4 rounded-xl p-4 text-left",
                selectableVariants(),
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              <span className="grid min-h-14 min-w-0 content-start gap-1">
                <span className="text-sm font-semibold text-foreground">
                  {label}
                </span>
                <span className="min-h-10 text-xs leading-5 text-muted-foreground">
                  {summary}
                </span>
              </span>

              <dl className="grid gap-2 text-sm">
                <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-3 rounded-lg bg-background/80 px-3 py-2">
                  <dt className="flex size-8 items-center justify-center rounded-md bg-foreground/6 text-muted-foreground">
                    <X size={15} aria-label="Close button" />
                  </dt>
                  <dd className="min-w-0 font-medium text-foreground">
                    {closeNote}
                  </dd>
                </div>
                <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-3 rounded-lg bg-background/80 px-3 py-2">
                  <dt className="flex size-8 items-center justify-center rounded-md bg-foreground/6 text-muted-foreground">
                    <Minus size={15} aria-label="Minimize button" />
                  </dt>
                  <dd className="min-w-0 font-medium text-foreground">
                    {minimizeNote}
                  </dd>
                </div>
              </dl>
            </button>
          );
        },
      )}
    </div>
  );
}

export const GeneralTab = ({
  themeMode,
  onThemeModeChange,
  appSettings,
  isLoadingAppSettings,
  isSavingAppSettings,
  onUpdateCloseButtonBehavior,
  onUpdateAutoStart,
}: {
  themeMode: ThemeMode;
  onThemeModeChange: (themeMode: ThemeMode) => void;
  appSettings: AppSettings | null;
  isLoadingAppSettings: boolean;
  isSavingAppSettings: boolean;
  onUpdateCloseButtonBehavior: (behavior: CloseButtonBehavior) => void;
  onUpdateAutoStart: (enabled: boolean) => void;
}) => {
  return (
    <div>
      <SettingsStack>
        <SettingsSection title="Preferences">
          <SettingsRow title="Appearance">
            <SegmentedControl
              value={themeMode}
              onValueChange={onThemeModeChange}
              ariaLabel="Theme mode"
              options={themeOptions}
              layoutId="app-theme-mode-pill"
            />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Window">
          <div className="grid gap-3">
            <p className="text-sm font-medium text-foreground">
              Minimize &amp; close button behavior
            </p>
            <CloseButtonChoiceList
              value={appSettings?.closeButtonBehavior ?? "exit"}
              onValueChange={onUpdateCloseButtonBehavior}
              disabled={isLoadingAppSettings || isSavingAppSettings}
            />
          </div>

          <SettingsRow
            title="Start on login"
            description="Launch Hue Desktop when you sign in to Windows."
            alignControlWithDescription
          >
            <Switch
              aria-label="Start Hue Desktop on login"
              checked={appSettings?.autoStart ?? false}
              disabled={
                isLoadingAppSettings ||
                isSavingAppSettings ||
                !appSettings?.autoStartSupported
              }
              onCheckedChange={(checked) => onUpdateAutoStart(checked)}
            />
          </SettingsRow>
        </SettingsSection>
      </SettingsStack>
    </div>
  );
};
