"use client";

import { useCampaignTheme } from "@/hooks/use-campaign-theme";
import { useVisualStyle } from "@/hooks/use-visual-style";
import { setVisualStyle, themeStorageKey, visualStyles } from "@/lib/appearance";
import { useId, useState } from "react";
import { Moon, Palette, Sun, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function ThemeToggle({ placement = "global" }: { placement?: "global" | "campaign" } = {}) {
  const theme = useCampaignTheme();
  const style = useVisualStyle();
  const [open, setOpen] = useState(false);
  const headingId = useId();
  function toggleTheme() {
    const root = document.documentElement;
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = nextTheme;
    try { window.localStorage.setItem(themeStorageKey, nextTheme); } catch { /* A preferência continua nesta aba. */ }
  }

  return <div className={`theme-controls theme-controls--${placement}`}>
    <button className={`theme-toggle theme-toggle--${placement}`} type="button" onClick={toggleTheme}
    aria-pressed={theme === "dark"} aria-label="Alternar entre modo claro e modo noturno" title="Alternar tema">
    <Sun className="theme-toggle-sun" size={17} aria-hidden="true" />
    <Moon className="theme-toggle-moon" size={16} aria-hidden="true" />
    <span className="theme-label-dark">Modo noturno</span>
    <span className="theme-label-light">Modo claro</span>
    </button>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={`theme-toggle theme-toggle--${placement} appearance-trigger`} type="button" aria-label="Escolher estilo visual" title="Escolher estilo visual">
          <Palette size={17} aria-hidden="true" /><span className="appearance-label">Estilo</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="appearance-picker" side="top" align="start" sideOffset={10} collisionPadding={12} aria-labelledby={headingId}>
        <div className="appearance-heading"><h2 id={headingId}>Aparência</h2><button type="button" className="appearance-close" aria-label="Fechar aparência" onClick={() => setOpen(false)}><X size={18} aria-hidden="true" /></button></div>
        <fieldset className="appearance-options">
          <legend>Estilo visual</legend>
          {visualStyles.map(option => <label key={option.id} className="appearance-option">
            <input type="radio" name={`visual-style-${headingId}`} value={option.id} checked={style === option.id} onChange={() => setVisualStyle(option.id)} />
            <span className={`appearance-swatch appearance-swatch--${option.id}`} aria-hidden="true"><i /><i /><i /></span>
            <span className="appearance-option-copy"><strong>{option.label}</strong><small>{option.description}</small></span>
          </label>)}
        </fieldset>
        <p className="appearance-note">Salvo neste navegador. O modo claro ou noturno é escolhido separadamente.</p>
      </PopoverContent>
    </Popover>
  </div>;
}
