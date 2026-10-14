/* eslint-disable @typescript-eslint/no-require-imports -- CSS regression checks run directly in Node. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '../app/appearance.css'), 'utf8');
const optional = css.split('/* Appearance controls')[0].replace(/\/\*[\s\S]*?\*\//g, '');

test('todas as regras novas exigem um dos três estilos opcionais, inclusive as variáveis', () => {
  let depth = 0, start = 0, count = 0;
  for (let i = 0; i < optional.length; i++) {
    if (optional[i] === '{') {
      if (depth === 0) {
        const selector = optional.slice(start, i).trim();
        assert.match(selector, /^html(?::is\(|\[data-visual-style=)/, selector);
        assert.match(selector, /data-visual-style="(?:fiel|leitura|tecnico)"/, selector);
        assert.doesNotMatch(selector, /current|:root/, selector);
        count++;
      }
      depth++;
    } else if (optional[i] === '}') {
      depth--;
      assert.ok(depth >= 0);
      if (depth === 0) start = i + 1;
    }
  }
  assert.equal(depth, 0);
  assert.ok(count >= 9);
});

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels.reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
const palettes = [...optional.matchAll(/html\[data-visual-style="(fiel|leitura|tecnico)"\](\[data-theme="dark"\])?\s*\{([^{}]*)\}/g)];
test('texto, texto secundário, ações e campos mantêm contraste nas seis paletas', () => {
  assert.equal(palettes.length, 6);
  const light = new Map();
  for (const [, style, dark, body] of palettes) {
    const own = Object.fromEntries([...body.matchAll(/--style-([\w-]+):\s*(#[\da-f]{6})\s*;/g)].map(([, key, value]) => [key, value]));
    const palette = { ...light.get(style), ...own };
    if (!dark) light.set(style, palette);
    for (const [foreground, background] of [
      ['ink', 'background'], ['ink', 'paper'], ['ink', 'soft'],
      ['muted', 'paper'], ['muted', 'soft'], ['primary', 'paper'],
      ['on-primary', 'primary'], ['on-dark', 'quick-soft'], ['dark-muted', 'quick-soft'],
      ['highlight', 'hero-end'],
    ]) {
      const ratio = contrast(palette[foreground], palette[background]);
      assert.ok(ratio >= 4.5, `${style}/${dark ? 'dark' : 'light'} ${foreground}/${background}: ${ratio.toFixed(2)}`);
    }
    assert.ok(contrast(palette.input, palette.paper) >= 3, `${style}: input boundary`);
  }
});
