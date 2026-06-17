import { useTheme } from "../../../context/ThemeContext";
import { SettingsScreen } from "../../settings/SettingsScreen";

export const SettingsRoute: React.FC = () => {
  const { themeMode, setThemeMode } = useTheme();

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Bridge &amp; app preferences</p>
      </div>

      <SettingsScreen themeMode={themeMode} onThemeModeChange={setThemeMode} />
    </section>
  );
};
