export const themeStorageKey = "zona-morta-theme";
/* Chave da antiga escolha de estilo visual. Não é mais lida: o app tem um único estilo (Refinado) e a
   inicialização apaga o valor que tiver ficado salvo no navegador. */
export const visualStyleStorageKey = "zona-morta-visual-style";

/* Único estilo visual. O atributo continua no <html> porque as regras do estilo dependem dele. */
export const visualStyle = "refinado";

// Executed before first paint. Only known values may reach the document attributes.
// O tema claro/noturno continua sendo uma preferência salva; o estilo é fixo.
export const appearanceBootstrapScript = `
try {
  const theme = localStorage.getItem(${JSON.stringify(themeStorageKey)});
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
} catch {}
document.documentElement.dataset.visualStyle = ${JSON.stringify(visualStyle)};
try { localStorage.removeItem(${JSON.stringify(visualStyleStorageKey)}); } catch {}
`;
