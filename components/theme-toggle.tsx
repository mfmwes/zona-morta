"use client";

import { useCampaignTheme } from "@/hooks/use-campaign-theme";
import { Moon, Sun } from "lucide-react";

const storageKey = "zona-morta-theme";

export function ThemeToggle({ placement = "global" }: { placement?: "global" | "campaign" } = {}) {
  const theme = useCampaignTheme();
  function toggleTheme() {
    const root = document.documentElement;
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = nextTheme;
    try { window.localStorage.setItem(storageKey, nextTheme); } catch { /* A preferência continua nesta aba. */ }
  }

  return <button className={`theme-toggle theme-toggle--${placement}`} type="button" onClick={toggleTheme}
    aria-pressed={theme === "dark"} aria-label="Alternar entre modo claro e modo noturno" title="Alternar tema">
    <Sun className="theme-toggle-sun" size={17} aria-hidden="true" />
    <Moon className="theme-toggle-moon" size={16} aria-hidden="true" />
    <span className="theme-label-dark">Modo noturno</span>
    <span className="theme-label-light">Modo claro</span>
  </button>;
}
