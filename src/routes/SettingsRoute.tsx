import { useTheme } from "@/context/ThemeContext";
import { SettingsScreen } from "@/features/settings-screen/SettingsScreen";

export const SettingsRoute: React.FC = () => {
  const { themeMode, setThemeMode } = useTheme();

  return (
    <section className="flex h-full min-h-0 w-full flex-col gap-6">
      <SettingsScreen themeMode={themeMode} onThemeModeChange={setThemeMode} />
    </section>
  );
};
