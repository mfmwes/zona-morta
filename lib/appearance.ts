export const themeStorageKey = "zona-morta-theme";
export const visualStyleStorageKey = "zona-morta-visual-style";

export const visualStyles = [
  { id: "current", label: "Visual atual", description: "A aparência original do Zona Morta." },
  { id: "fiel", label: "Refino fiel", description: "Petróleo e âmbar, com contrastes mais equilibrados." },
  { id: "leitura", label: "Leitura confortável", description: "Tons suaves e a fonte Source Sans 3." },
  { id: "tecnico", label: "Dossiê técnico", description: "Petróleo azulado e as fontes IBM Plex." },
] as const;

export type VisualStyle = typeof visualStyles[number]["id"];

export function isVisualStyle(value: unknown): value is VisualStyle {
  return visualStyles.some(style => style.id === value);
}

export function setVisualStyle(style: VisualStyle) {
  if (!isVisualStyle(style)) return;
  if (style === "current") document.documentElement.removeAttribute("data-visual-style");
  else document.documentElement.dataset.visualStyle = style;
  try { window.localStorage.setItem(visualStyleStorageKey, style); } catch { /* A preferência continua nesta aba. */ }
}

// Executed before first paint. Only known values may reach the document attributes.
// Keep the two preferences independent, including when storage is unavailable.
export const appearanceBootstrapScript = `
try {
  const theme = localStorage.getItem(${JSON.stringify(themeStorageKey)});
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
} catch {}
try {
  const style = localStorage.getItem(${JSON.stringify(visualStyleStorageKey)});
  if (${JSON.stringify(visualStyles.filter(style => style.id !== "current").map(style => style.id))}.includes(style)) document.documentElement.dataset.visualStyle = style;
  else document.documentElement.removeAttribute('data-visual-style');
} catch {}
`;
