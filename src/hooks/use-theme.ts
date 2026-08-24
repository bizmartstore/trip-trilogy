import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "sunset" | "ocean" | "dark";

export const THEMES: { value: Theme; label: string; icon: string }[] = [
  { value: "light", label: "Daybreak", icon: "sun" },
  { value: "sunset", label: "Sunset", icon: "sunset" },
  { value: "ocean", label: "Ocean", icon: "waves" },
  { value: "dark", label: "Midnight", icon: "moon" },
];

const KEY = "nexora-theme";
const ORDER: Theme[] = ["light", "sunset", "ocean", "dark"];

const THEME_COLORS: Record<Theme, string> = {
  light: "#0b2b2b",
  sunset: "#7a3418",
  ocean: "#122a3d",
  dark: "#0b2b2b",
};

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("sunset", theme === "sunset");
  root.classList.toggle("ocean", theme === "ocean");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLORS[theme]);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(KEY) as Theme | null;
    const initial: Theme =
      stored && ORDER.includes(stored)
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setThemeState(initial);
    apply(initial);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    window.localStorage.setItem(KEY, next);
    apply(next);
    setThemeState(next);
  }, []);

  /** Cycles light → sunset → ocean → dark → light. */
  const cycleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = ORDER[(ORDER.indexOf(prev) + 1) % ORDER.length];
      window.localStorage.setItem(KEY, next);
      apply(next);
      return next;
    });
  }, []);

  return { theme, setTheme, cycleTheme, toggle: cycleTheme };
}
