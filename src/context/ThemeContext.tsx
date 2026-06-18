import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useGlobalKeyboardShortcut } from "@/hooks/useGlobalKeyboardShortcut";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedThemeMode = "light" | "dark";

export interface ThemeContextValue {
  themeMode: ThemeMode;
  resolvedThemeMode: ResolvedThemeMode;
  setThemeMode: (themeMode: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const getInitialTheme = (): ThemeMode => {
  const storedTheme = localStorage.getItem("themeMode");
  if (
    storedTheme === "light" ||
    storedTheme === "dark" ||
    storedTheme === "system"
  ) {
    return storedTheme;
  }

  return "system";
};

const getSystemTheme = (): ResolvedThemeMode =>
  window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";

/**
 * Owns theme state: the user's choice (light/dark/system), the resolved value
 * once "system" is applied, and the side effects that mirror it onto the
 * document (the `dark` class, `color-scheme`, and localStorage). Also wires the
 * Cmd/Ctrl+J toggle shortcut.
 */
export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme);
  const [systemThemeMode, setSystemThemeMode] =
    useState<ResolvedThemeMode>(getSystemTheme);
  const resolvedThemeMode =
    themeMode === "system" ? systemThemeMode : themeMode;

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setSystemThemeMode(getSystemTheme());

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (resolvedThemeMode === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    document.documentElement.style.colorScheme = resolvedThemeMode;
    localStorage.setItem("themeMode", themeMode);
  }, [resolvedThemeMode, themeMode]);

  const toggleTheme = useCallback(
    () => setThemeMode(resolvedThemeMode === "dark" ? "light" : "dark"),
    [resolvedThemeMode],
  );

  useGlobalKeyboardShortcut({ key: "j", mod: true }, toggleTheme);

  const value = useMemo(
    () => ({ themeMode, resolvedThemeMode, setThemeMode, toggleTheme }),
    [themeMode, resolvedThemeMode, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
