import { test, expect } from '@playwright/test';

// Textos visíveis com contraste efetivo abaixo de 3:1 contra o fundo real (camadas, transparências e gradientes).
// Cobre os quatro estilos visuais nos dois temas: trocar a paleta já deixou cabeçalhos escuros com texto ilegível.
const lowContrastTexts = () => {
  const parseRgb = (c: string): number[][] => Array.from(c.matchAll(/rgba?\(([^)]+)\)/g)).map(m => { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; });
  // color-mix() é devolvido como color(srgb r g b / a), com canais de 0 a 1.
  const parseSrgb = (c: string): number[][] => Array.from(c.matchAll(/color\(srgb ([^)]+)\)/g)).map(m => { const p = m[1].split(/[ /]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1]; });
  const parse = (c: string): number[][] => [...parseRgb(c), ...parseSrgb(c)];
  const blend = (top: number[], bottom: number[]) => { const a = top[3]; return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1]; };
  const lum = (c: number[]) => { const [r, g, b] = c.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  // Fundos possíveis do elemento: cada camada pode ter cor e/ou gradiente.
  const backgrounds = (el: Element): number[][] => {
    const layers: number[][][] = [];
    for (let n: Element | null = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      // Tons semitransparentes de gradientes são brilhos decorativos sobre um gradiente opaco; contam só os opacos.
      const grad = cs.backgroundImage.includes('gradient') ? parse(cs.backgroundImage).filter(c => c[3] >= 0.95) : [];
      const col = parse(cs.backgroundColor)[0];
      const opts = [...grad, ...(col && col[3] > 0 ? [col] : [])];
      if (opts.length) layers.push(opts);
      if ((col && col[3] >= 0.95) || (grad.length && grad.every(g => g[3] >= 0.95))) break;
    }
    let result: number[][] = [[255, 255, 255, 1]];
    for (const layer of layers.reverse()) result = layer.flatMap(top => result.map(bottom => blend(top, bottom)));
    return result;
  };
  const out: { text: string; ratio: number; fg: string; bg: string; path: string }[] = [];
  for (const el of Array.from(document.querySelectorAll('body *')) as HTMLElement[]) {
    if (!Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent!.trim())) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || el.closest('[aria-hidden="true"], .sr-only, svg, .qa-controls, [disabled], .scene-viewport')) continue;
    let op = 1; for (let n: Element | null = el; n; n = n.parentElement) op *= Number(getComputedStyle(n).opacity); if (op < 0.6) continue;
    const fg = parse(cs.color)[0]; if (!fg) continue;
    const bgs = backgrounds(el);
    const worst = Math.min(...bgs.map(bg => ratio(blend(fg, bg), bg)));
    if (worst < 3) {
      const parts: string[] = [];
      for (let x: Element | null = el; x && parts.length < 4; x = x.parentElement) { const c = (x.className as string).toString().split(' ').filter(s => s && !s.includes(':') && !s.includes('[')).slice(0, 2).join('.'); parts.unshift(x.tagName.toLowerCase() + (c ? '.' + c : '')); }
      out.push({ text: el.textContent!.trim().slice(0, 32), ratio: Math.round(worst * 100) / 100, fg: cs.color, bg: `rgb(${bgs[0].slice(0, 3).map(Math.round).join(',')})`, path: parts.join(' > ') });
    }
  }
  return out;
};

for (const style of ['current', 'fiel', 'leitura', 'tecnico']) for (const theme of ['light', 'dark']) test(`text contrast stays readable in ${style} / ${theme}`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const failures: string[] = [];
  for (const screen of ['overview', 'sheet', 'map', 'shelter', 'shelter-plan']) {
    const shelter = screen.startsWith('shelter');
    await page.goto(`/?screen=sheet&style=${style}${shelter ? '&base=1' : ''}`);
    await page.getByRole('combobox', { name: 'Tela', exact: true }).selectOption(shelter ? 'shelter' : screen);
    await page.getByRole('combobox', { name: 'Tema', exact: true }).selectOption(theme);
    await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
    if (screen === 'shelter-plan') {
      // Estado das capturas do usuário: sala escolhida na planta, com "Cancelar" no cabeçalho escuro.
      await page.getByRole('tab', { name: 'Construção' }).click();
      await page.locator('.architectural-slot.is-empty:not([disabled])').first().click();
      await page.getByRole('button', { name: 'Cancelar', exact: true }).waitFor();
    }
    await page.waitForTimeout(300);
    for (const item of await page.evaluate(lowContrastTexts)) failures.push(`${screen}: "${item.text}" ${item.ratio}:1 (${item.fg} sobre ${item.bg}) em ${item.path}`);
  }
  expect(failures).toEqual([]);
});
