const test = require('node:test');
const assert = require('node:assert/strict');
const content = require('../lib/content.json');
const { explicitItemArtFor, itemArtFor } = require('../lib/item-art.ts');

function visualKey(ref) {
  return [ref.sheet, ref.cell, ref.badge ?? ''].join(':');
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

test('munições possuem leitura visual própria por categoria', () => {
  const names = [
    'Munição de Pistola', 'Munição de Espingarda', 'Munição de Carabina',
    'Munição de Flechas', 'Munição de Virotes', 'Munição de Chumbinhos', 'Munição de Outra',
  ];
  const keys = names.map(name => visualKey(itemArtFor(name, 'Munição')));
  assert.equal(new Set(keys).size, names.length);
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
