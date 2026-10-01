/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS tests load the TypeScript artwork registry through Node. */
const test = require('node:test');
const assert = require('node:assert/strict');
const content = require('../lib/content.json');
const fs = require('node:fs');
const { explicitItemArtFor, itemArtFor, itemArtUrl } = require('../lib/item-art.ts');

function visualKey(ref) {
  return [ref.sheet, ref.cell].join(':');
}

const excluded = new Set(['Consulta antes de sair e ao retornar', 'Suprimentos abstratos']);
const inventoryCatalog = content.catalog.filter(entry => !excluded.has(entry.category));

test('todo item real do catálogo possui curadoria explícita de arte', () => {
  const missing = inventoryCatalog.filter(entry => !explicitItemArtFor(entry.name)).map(entry => entry.name);
  assert.deepEqual(missing, []);
});

test('catálogo mantém diversidade visual mínima e evita uma imagem genérica dominante', () => {
  const groups = new Map();
  for (const entry of inventoryCatalog) {
    const key = visualKey(itemArtFor(entry.name, entry.category));
    groups.set(key, [...(groups.get(key) ?? []), entry.name]);
  }
  const uniqueRatio = groups.size / inventoryCatalog.length;
  const largest = [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  assert.ok(uniqueRatio >= 0.6, `Diversidade visual caiu para ${(uniqueRatio * 100).toFixed(1)}%`);
  assert.ok(largest.length <= 5, `Uma mesma aparência foi usada por ${largest.length} itens: ${largest.join(', ')}`);
});

test('munições possuem artes próprias e diferentes das armas que as disparam', () => {
  const names = [
    'Munição de Pistola', 'Munição de Espingarda', 'Munição de Carabina',
    'Munição de Flechas', 'Munição de Virotes', 'Munição de Chumbinhos', 'Munição de Outra',
  ];
  const refs = names.map(name => itemArtFor(name, 'Munição'));
  assert.ok(refs.every(ref => ref.sheet === 'custom-ammo'));
  assert.equal(new Set(refs.map(visualKey)).size, names.length);
  assert.notEqual(visualKey(itemArtFor('Munição de Pistola')), visualKey(itemArtFor('Pistola')));
  assert.notEqual(visualKey(itemArtFor('Munição de Espingarda')), visualKey(itemArtFor('Espingarda')));
  assert.notEqual(visualKey(itemArtFor('Munição de Carabina')), visualKey(itemArtFor('Carabina')));
});

test('itens antes confundidos por arte compartilhada agora são distinguíveis', () => {
  const pairs = [
    ['Lanterna pesada', 'Cano / bastão'],
    ['Kit de higiene', 'Kit médico de campo'],
    ['Filtro portátil', 'Soro fisiológico lacrado'],
    ['Pastilhas de purificação', 'Soro fisiológico lacrado'],
    ['Medicamento prescrito identificado', 'Antibiótico prescrito'],
    ['Documento ou crachá', 'Caderno e lápis'],
    ['Fotografias e cartas', 'Caderno e lápis'],
    ['Bebida isotônica lacrada', 'Garrafa de água lacrada'],
    ['Colete refletivo', 'Macacão industrial'],
  ];
  for (const [a, b] of pairs) {
    assert.notEqual(visualKey(itemArtFor(a)), visualKey(itemArtFor(b)), `${a} e ${b} continuam visualmente idênticos`);
  }
});

test('itens antes diferenciados por badge usam atlas próprios sem etiquetas', () => {
  const migrated = [
    'Kit de pilhas', 'Sinalizador de mão', 'Traje de bombeiro', 'Colete refletivo',
    'Uniforme de segurança', 'Roupa de trilha', 'Jaqueta de motociclista', 'Roupa térmica',
    'Mochila urbana', 'Mochila de trilha', 'Mochila cargueira', 'Lanterna pesada',
    'Lanterna frontal', 'Kit de higiene', 'Documento ou crachá', 'Fotografias e cartas',
    'Filtro portátil', 'Pastilhas de purificação', 'Medicamento prescrito identificado',
    'Antibiótico prescrito', 'Solução de limpeza lacrada', 'Soro fisiológico lacrado',
    'Água de torneira sem verificação', 'Garrafa sem rótulo', 'Bebida isotônica lacrada',
    'Bebida energética fechada', 'Cerveja ou vinho', 'Aveia', 'Leite em pó',
  ];
  for (const name of migrated) {
    const ref = itemArtFor(name);
    assert.ok(ref.sheet.startsWith('custom-'), `${name} ainda não usa arte própria`);
    assert.equal('badge' in ref, false, `${name} ainda depende de badge`);
  }
});

test('equipamentos substituídos carregam atlas pintados e munições conservam o SVG aprovado', () => {
  for (const sheet of ['custom-gear', 'custom-supplies']) {
    const image = fs.readFileSync(`public${itemArtUrl(sheet)}`);
    assert.equal(image.subarray(0, 4).toString(), 'RIFF');
    assert.equal(image.subarray(8, 12).toString(), 'WEBP');
  }
  const ammunition = fs.readFileSync(`public${itemArtUrl(itemArtFor('Munição de Pistola').sheet)}`, 'utf8');
  assert.match(ammunition, /<svg\b/);
  for (const name of ['Lanterna pesada', 'Kit de pilhas', 'Sinalizador de mão', 'Filtro portátil']) {
    assert.match(itemArtUrl(itemArtFor(name).sheet), /\.webp$/);
  }
});
