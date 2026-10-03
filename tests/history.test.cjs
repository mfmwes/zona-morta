/* eslint-disable @typescript-eslint/no-require-imports -- uses the existing Node test loader. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, path);
const { defaultState, initialSurvivor, content, addLog } = require('../lib/game.ts');
const { clearCampaignHistory, historyEntries } = require('../lib/history.ts');
const { createConflictScene, addThreatInstances, applyThreatDamage } = require('../lib/conflict.ts');
const { threatLibrary } = require('../lib/threats.ts');
const { projectPlayerGame, playerEditPayload, applyPlayerChange } = require('../lib/collaboration.ts');

function campaign() {
  const game = defaultState();
  const archetype = content.archetypes[0];
  game.survivors = [initialSurvivor({ name: 'Nina', origin: content.origins[0].name, past: '',
    archetype: archetype.name, specialty: archetype.specialties[0].name, freeExperience: 'Resgates', techniques: [],
    attributes: { Agilidade: 2, Força: 1, Finesse: 1, Instinto: 0, Presença: 0, Conhecimento: -1 },
    primary: 'Faca resistente', secondary: '', protection: 'Roupa reforçada', personal: 'Mochila urbana' })];
  game.log = [];
  for (const kind of ['cena', 'habilidade', 'inventário', 'evento futuro', 'chat', 'dados', 'dano', 'ameaça']) {
    addLog(game, kind, `Registro de ${kind}`, game.survivors[0].id);
  }
  return game;
}

test('limpar acontecimentos preserva o chat completo e todas as outras informações da campanha', () => {
  const game = campaign();
  const before = structuredClone(game);
  const chat = historyEntries(game, 'chat');
  assert.equal(clearCampaignHistory(game, 'events'), 4);
  assert.deepEqual(game, { ...before, log: chat });
  assert.deepEqual(historyEntries(game, 'events'), []);
  assert.equal(clearCampaignHistory(game, 'events'), 0);
});

test('limpar chat preserva acontecimentos, danos aplicados e proteção contra aplicação duplicada', () => {
  const game = campaign();
  game.conflict = createConflictScene({ name: 'Confronto', sceneNumber: 1, day: 1, time: '08:00' });
  const target = addThreatInstances(game.conflict, threatLibrary(game.threats).find(row => row.name === 'ERRANTE'), 1)[0];
  assert.equal(applyThreatDamage(game.conflict, target.id, 2, 'roll-1').ok, true);
  const before = structuredClone(game);
  const events = historyEntries(game, 'events');
  assert.equal(clearCampaignHistory(game, 'chat'), 4);
  assert.deepEqual(game, { ...before, log: events });
  assert.deepEqual(historyEntries(game, 'chat'), []);
  assert.equal(applyThreatDamage(game.conflict, target.id, 2, 'roll-1').reason, 'already-applied');
  assert.equal(target.hpMarked, 2);
});

test('as duas limpezas persistem em snapshots e projeções; novos registros continuam funcionando', () => {
  const game = campaign();
  clearCampaignHistory(game, 'chat');
  clearCampaignHistory(game, 'events');
  const reloaded = JSON.parse(JSON.stringify(game));
  assert.deepEqual(reloaded.log, []);
  assert.deepEqual(projectPlayerGame(reloaded, game.survivors[0].id).log, []);
  addLog(reloaded, 'chat', 'Nova mensagem');
  addLog(reloaded, 'expedição', 'Novo acontecimento');
  assert.deepEqual(historyEntries(reloaded, 'chat').map(entry => entry.text), ['Nova mensagem']);
  assert.deepEqual(historyEntries(reloaded, 'events').map(entry => entry.text), ['Novo acontecimento']);
});

test('o fluxo de edição do jogador não permite excluir registros compartilhados', () => {
  const game = campaign();
  const id = game.survivors[0].id;
  const before = projectPlayerGame(game, id);
  const after = structuredClone(before);
  after.log = [];
  const payload = playerEditPayload(before, after);
  assert.ok(payload);
  const saved = applyPlayerChange(game, id, payload.before, payload.after, payload.fearDelta, payload.logs,
    payload.noiseDelta, payload.shelterWorkActions);
  assert.ok(saved);
  assert.deepEqual(saved.log, game.log);
});
