import { useTheme } from "@/context/ThemeContext";
import { SettingsScreen } from "@/features/settings-screen/SettingsScreen";

export const SettingsRoute: React.FC = () => {
  const { themeMode, setThemeMode } = useTheme();

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <SettingsScreen themeMode={themeMode} onThemeModeChange={setThemeMode} />
    </section>
  );
};
