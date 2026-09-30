"use client";

import { Moon, Sun } from "lucide-react";

const storageKey = "zona-morta-theme";

export function ThemeToggle() {
  function toggleTheme() {
    const root = document.documentElement;
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = nextTheme;
    try { window.localStorage.setItem(storageKey, nextTheme); } catch { /* A preferência continua nesta aba. */ }
  }

  return <button className="theme-toggle" type="button" onClick={toggleTheme}
    aria-label="Alternar entre modo claro e modo noturno" title="Alternar modo noturno">
    <Sun className="theme-toggle-sun" size={17} aria-hidden="true" />
    <Moon className="theme-toggle-moon" size={16} aria-hidden="true" />
    <span>Modo noturno</span>
  </button>;
}
