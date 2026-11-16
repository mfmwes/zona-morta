/* eslint-disable @typescript-eslint/no-require-imports -- Validates the stylesheets against the mobile shell breakpoint. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('o CSS de celular usa a mesma fronteira do shell móvel (767/768px)', () => {
  const hook = fs.readFileSync(path.join(__dirname, '../hooks/use-mobile-experience.ts'), 'utf8');
  assert.match(hook, /\(max-width: 767px\)/);
  const appDir = path.join(__dirname, '../app');
  const offenders = [];
  for (const file of fs.readdirSync(appDir).filter(name => name.endsWith('.css'))) {
    const css = fs.readFileSync(path.join(appDir, file), 'utf8');
    // Só consultas de mídia (largura da tela); @container e tamanhos de elementos podem usar 760px.
    for (const media of css.match(/@media[^{]*/g) ?? []) if (/(max-width:\s*760px|min-width:\s*761px)/.test(media)) offenders.push(`${file}: ${media.trim()}`);
  }
  // Entre 761 e 767px o app já usa o shell móvel; regras em 760/761px deixariam essa faixa com CSS de desktop.
  assert.deepEqual(offenders, []);
});
