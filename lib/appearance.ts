export const themeStorageKey = "zona-morta-theme";
export const visualStyleStorageKey = "zona-morta-visual-style";

export const visualStyles = [
  { id: "refinado", label: "Refinado (padrão)", description: "Superfícies calmas, petróleo e âmbar, com as fontes IBM Plex." },
  { id: "current", label: "Visual clássico", description: "A aparência original do Zona Morta." },
] as const;

/* Estilo de quem nunca escolheu um. "current" (clássico) é a ausência do atributo e continua disponível.
   Escolhas salvas de estilos retirados (fiel, leitura, tecnico) são desconhecidas e caem no padrão. */
export const defaultVisualStyle = "refinado";

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
// Sem preferência salva (ou com armazenamento bloqueado), vale o estilo padrão; uma escolha salva é respeitada.
export const appearanceBootstrapScript = `
try {
  const theme = localStorage.getItem(${JSON.stringify(themeStorageKey)});
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
} catch {}
{
let visualStyle = ${JSON.stringify(defaultVisualStyle)};
try {
  const style = localStorage.getItem(${JSON.stringify(visualStyleStorageKey)});
  if (${JSON.stringify(visualStyles.map(style => style.id))}.includes(style)) visualStyle = style;
} catch {}
if (visualStyle === 'current') document.documentElement.removeAttribute('data-visual-style');
else document.documentElement.dataset.visualStyle = visualStyle;
}
`;
