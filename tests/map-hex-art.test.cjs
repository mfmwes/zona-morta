/* eslint-disable @typescript-eslint/no-require-imports -- The map artwork reference is validated against the local asset. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('o atlas dos hexes é um WebP local e leve, referenciado pelo mapa', () => {
  const source = fs.readFileSync(path.join(__dirname, '../components/map-hex-art.tsx'), 'utf8');
  const href = source.match(/href="([^"]+)"/)?.[1];
  assert.equal(href, '/map/sector-atlas.webp');
  const data = fs.readFileSync(path.join(__dirname, '../public', href));
  assert.equal(data.toString('ascii', 0, 4), 'RIFF');
  assert.equal(data.toString('ascii', 8, 12), 'WEBP');
  // O mapa é a tela mais usada: o atlas compartilhado por todos os hexes não deve voltar aos 3 MB do PNG.
  assert.ok(data.length < 600 * 1024, `atlas com ${Math.round(data.length / 1024)} KB`);
});
