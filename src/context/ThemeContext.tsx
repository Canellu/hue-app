import { createContext, useContext } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedThemeMode = "light" | "dark";

export interface ThemeContextValue {
  themeMode: ThemeMode;
  resolvedThemeMode: ResolvedThemeMode;
  setThemeMode: (themeMode: ThemeMode) => void;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(
  undefined,
);

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeContext provider");
  }
  return context;
};
