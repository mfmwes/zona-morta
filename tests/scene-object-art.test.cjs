/* eslint-disable @typescript-eslint/no-require-imports -- The artwork registry is validated against the actual catalogue and local assets. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename);
const { sceneObjectArtFor } = require('../lib/scene-object-art.ts');
const registry = require('../lib/scene-object-art.json');

test('cada objeto físico da biblioteca tem arte própria, mantendo as ferramentas nativas', () => {
  const source = fs.readFileSync(path.join(__dirname, '../components/scene-board.tsx'), 'utf8');
  const catalogue = source.slice(source.indexOf('const libraryGroups'), source.indexOf('const visualSizes'));
  const variants = [...catalogue.matchAll(/variant: "([^"]+)"/g)].map(match => match[1]);
  const native = new Set(['room', 'marker', 'partition']);
  assert.equal(variants.length, 67); // The text tool has no variant.
  assert.equal(Object.keys(registry).length, 64);
  assert.deepEqual(variants.filter(variant => !native.has(variant) && !sceneObjectArtFor(variant)), []);
  assert.equal(new Set(Object.values(registry).map(art => [art.src, ...art.region].join(':'))).size, 64);
  assert.deepEqual(Object.keys(registry).filter(variant => !variants.includes(variant)), []);
});

test('todos os recortes ficam dentro de atlas WebP locais válidos', () => {
  const assets = new Set();
  for (const [variant, art] of Object.entries(registry)) {
    assert.match(art.src, /^\/scene-art\/[a-z-]+-v1\.webp$/);
    const asset = path.join(__dirname, '../public', art.src);
    const data = fs.readFileSync(asset);
    assert.equal(data.toString('ascii', 0, 4), 'RIFF');
    assert.equal(data.toString('ascii', 8, 12), 'WEBP');
    assets.add(asset);
    assert.equal(art.region.length, 4);
    const [x, y, width, height] = art.region;
    assert.ok([x, y, width, height].every(Number.isInteger), variant);
    assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0, variant);
    assert.ok(x + width <= art.width && y + height <= art.height, variant);
  }
  assert.equal(assets.size, 4);
});

test('variantes desconhecidas e ferramentas de construção continuam usando a representação existente', () => {
  for (const variant of [undefined, '', 'room', 'marker', 'partition', 'custom-old-object', '__proto__', 'constructor']) {
    assert.equal(sceneObjectArtFor(variant), undefined);
  }
});

test('orientação da arte dos veículos preserva os tamanhos e a rotação gravados na cena', () => {
  for (const variant of ['car', 'pickup', 'van', 'ambulance', 'bus', 'motorcycle', 'bicycle']) {
    assert.equal(sceneObjectArtFor(variant).rotate, 90);
  }
  assert.equal(sceneObjectArtFor('bed').rotate, undefined);
});

test('cada instância recorta só a própria arte, sem reutilizar IDs de máscara', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { SceneObjectArt } = require('../components/scene-object-art.tsx');
  const markup = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(SceneObjectArt, { art: sceneObjectArtFor('car'), compact: true }),
    React.createElement(SceneObjectArt, { art: sceneObjectArtFor('car') }),
  ));
  const ids = [...markup.matchAll(/<clipPath id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2);
  for (const id of ids) assert.ok(markup.includes(`clip-path="url(#${id})"`));
  assert.equal((markup.match(/href="\/scene-art\/street-v1.webp"/g) ?? []).length, 2);
  assert.equal((markup.match(/rotate\(90\)/g) ?? []).length, 2);
  assert.equal((markup.match(/preserveAspectRatio="xMidYMid meet"/g) ?? []).length, 2);
});
