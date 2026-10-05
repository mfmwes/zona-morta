/* eslint-disable @typescript-eslint/no-require-imports -- uses the existing Node test loader. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, path);
const { defaultState, initialSurvivor, content } = require('../lib/game.ts');
const { assignCustomSector } = require('../lib/sectors.ts');
const { searchAreaLabel, searchAreaError, searchAvailabilityError, searchError, recordSearch } = require('../lib/exploration.ts');
const { projectPlayerGame } = require('../lib/collaboration.ts');

function campaign() {
  const game = defaultState();
  const archetype = content.archetypes[0];
  game.survivors = [initialSurvivor({ name: 'Nina', origin: content.origins[0].name, past: '', archetype: archetype.name,
    specialty: archetype.specialties[0].name, freeExperience: 'Resgates', techniques: [],
    attributes: { Agilidade: 2, Força: 1, Finesse: 1, Instinto: 0, Presença: 0, Conhecimento: -1 },
    primary: 'Faca resistente', secondary: '', protection: 'Roupa reforçada', personal: 'Mochila urbana' })];
  game.survivors[0].hex = '0,0';
  assignCustomSector(game, '0,0', 'Bairro residencial', 'explorado');
  game.hexes['0,0'].points = ['Mercado', 'Farmácia'].map((name, index) => ({ id: String(index), name, kind: 'comércio',
    signal: 'Porta aberta', access: 'SEGREDO: alarme', notes: 'SEGREDO: vigia', revealed: true, searches: [] }));
  return game;
}
function input(changes = {}) {
  return { hex: '0,0', pointId: '0', sector: 'Depósito dos fundos', mode: 'specific', what: 'Comida para a viagem',
    result: 'Duas latas intactas', minutes: 30, ...changes };
}

test('área interna e setor do mapa permanecem independentes ao salvar e reabrir', () => {
  const game = campaign();
  const sector = structuredClone(game.hexes['0,0'].sector);
  assert.equal(recordSearch(game, input()), true);
  const restored = JSON.parse(JSON.stringify(game));
  assert.deepEqual(restored.hexes['0,0'].sector, sector);
  assert.equal(restored.hexes['0,0'].points[0].searches[0].sector, 'Depósito dos fundos');
  assert.equal(searchAreaError(restored.hexes['0,0'].points[0], ' depósito  dos FUNDOS '),
    'Esta área interna já foi vasculhada. Escolha outra área que exista neste local.');
});

test('duplicação é bloqueada por área e local, permitindo depósitos em locais diferentes', () => {
  const game = campaign();
  assert.equal(recordSearch(game, input()), true);
  const before = structuredClone(game);
  assert.equal(recordSearch(game, input({ sector: ' DEPÓSITO   dos fundos ' })), false);
  assert.deepEqual(game, before);
  assert.equal(recordSearch(game, input({ pointId: '1' })), true);
  assert.equal(game.minutes, 540);
});

test('buscas antigas com nome do local aparecem como área principal sem alterar dados', () => {
  const game = campaign();
  const point = game.hexes['0,0'].points[0];
  point.searches.push({ id: 'old', sector: '  MERCADO ', what: 'Comida', why: '', minutes: 30, result: 'Nada' });
  const before = structuredClone(game);
  assert.equal(searchAreaLabel(point, point.searches[0].sector), 'Área principal');
  assert.equal(searchAreaLabel(point, 'Cozinha'), 'Cozinha');
  assert.match(searchAreaError(point, point.name), /já foi vasculhada/);
  assert.equal(searchAreaError(point, 'Cozinha'), null);
  assert.deepEqual(game, before);
});

test('busca exige área, objetivo ou d12 e aceita resultado sem achados', () => {
  const game = campaign();
  assert.match(searchError(game, input({ sector: ' ' })), /área interna/);
  assert.match(searchError(game, input({ result: '' })), /inclusive quando nada/);
  assert.match(searchError(game, input({ what: '' })), /objetivo/);
  assert.match(searchError(game, input({ mode: 'open' })), /Role/);
  assert.equal(recordSearch(game, input({ result: 'Nada foi encontrado' })), true);
  assert.equal(recordSearch(game, input({ sector: 'Balcão', mode: 'open', what: '',
    table: content.lootTables[0].name, roll: 12 })), true);
  assert.equal(game.hexes['0,0'].points[0].searches[1].roll, 12);
});

test('saída do grupo, remoção do local e fim do dia recusam busca sem consequências', () => {
  for (const mutate of [game => { game.survivors[0].hex = '1,0'; },
    game => { game.hexes['0,0'].points = []; }, game => { game.minutes = 1430; },
    game => { game.hexes['0,0'].discovery = 'avistado'; }]) {
    const game = campaign();
    assert.equal(searchError(game, input()), null);
    mutate(game);
    const before = structuredClone(game);
    assert.notEqual(searchError(game, input()), null);
    assert.equal(recordSearch(game, input()), false);
    assert.deepEqual(game, before);
  }
  const game = campaign();
  assert.equal(searchAvailabilityError(game, '0,0', '0'), null);
});

test('áreas, resultados e orientação do mestre permanecem fora da projeção dos jogadores', () => {
  const game = campaign();
  assert.equal(recordSearch(game, input()), true);
  const player = projectPlayerGame(game);
  assert.equal(player.hexes['0,0'].points[0].name, 'Mercado');
  assert.deepEqual(player.hexes['0,0'].points[0].searches, []);
  assert.equal(player.hexes['0,0'].points[0].access, '');
  assert.equal(player.hexes['0,0'].points[0].notes, '');
});
