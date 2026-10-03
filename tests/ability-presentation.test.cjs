/* eslint-disable @typescript-eslint/no-require-imports -- uses the existing Node test loader. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, path);
const { defaultState, initialSurvivor, content } = require('../lib/game.ts');
const { beginScene, beginExpedition, registerRest, recordAbilityUse } = require('../lib/abilities.ts');
const { abilityUseOptions, abilityUseState } = require('../lib/ability-presentation.ts');

function campaign() {
  const game = defaultState();
  const archetype = content.archetypes[0];
  game.survivors = [initialSurvivor({ name: 'Nina', origin: content.origins[0].name, past: '',
    archetype: archetype.name, specialty: archetype.specialties[0].name, freeExperience: 'Resgates', techniques: [],
    attributes: { Agilidade: 2, Força: 1, Finesse: 1, Instinto: 0, Presença: 0, Conhecimento: -1 },
    primary: 'Faca resistente', secondary: '', protection: 'Roupa reforçada', personal: 'Mochila urbana' })];
  return game;
}

test('o estado visual acompanha uso e renovação de todos os limites globais sem mutar a campanha', () => {
  for (const [limit, label, renew] of [
    ['cena', 'Usada nesta cena', beginScene],
    ['dia', 'Usada hoje', game => game.day++],
    ['expedição', 'Usada nesta expedição', beginExpedition],
    ['descanso curto', 'Usada neste descanso curto', game => registerRest(game, 'short')],
    ['descanso longo', 'Usada neste descanso longo', game => registerRest(game, 'long')],
    ['descanso', 'Usada neste descanso', game => registerRest(game, 'short')],
  ]) {
    const game = campaign(), id = game.survivors[0].id;
    const effect = `Uma vez por ${limit}, examine os arredores.`;
    assert.equal(abilityUseState(game, id, 'test', effect).used, false);
    assert.equal(recordAbilityUse(game, id, 'test', 'Teste', effect, 'free'), true);
    const before = structuredClone(game);
    assert.equal(abilityUseState(game, id, 'test', effect).label, label);
    assert.deepEqual(game, before);
    renew(game);
    assert.equal(abilityUseState(game, id, 'test', effect).used, false);
  }
});

test('passivas e falta de recurso ou paciente não são apresentadas como consumidas', () => {
  const game = campaign(), person = game.survivors[0];
  person.hope = 0;
  assert.equal(abilityUseState(game, person.id, 'cost', 'Gaste 3 Hope para ajudar.').used, false);
  assert.equal(abilityUseState(game, person.id, 'passive', 'Você recebe +1 em testes.').used, false);
  const state = abilityUseState(game, person.id, 'care', 'Uma vez por paciente, cuide de alguém.');
  assert.equal(state.available, false);
  assert.equal(state.used, false);
  assert.equal(state.label, null);
});

test('uso por local acompanha o hex do sobrevivente e permite consultar outro local', () => {
  const game = campaign(), id = game.survivors[0].id;
  const effect = 'Uma vez por local, examine as tubulações.';
  const state = abilityUseState(game, id, 'local', effect);
  assert.equal(recordAbilityUse(game, id, 'local', 'Tubulações', effect, 'free', state.target), true);
  assert.equal(abilityUseState(game, id, 'local', effect).used, true);
  assert.match(abilityUseState(game, id, 'local', effect).label, /Usada neste local · hex /);
  assert.equal(abilityUseState(game, id, 'local', effect, 'Mercado').used, false);
  game.survivors[0].hex = '1,0';
  assert.equal(abilityUseState(game, id, 'local', effect).used, false);
});

test('Mãos firmes mantém usos de cena e descanso independentes por paciente', () => {
  const game = campaign(), id = game.survivors[0].id;
  game.survivors[0].hope = 2;
  const effect = content.techniques.find(a => a.name === 'Mãos firmes').effect;
  const [scene, rest] = abilityUseOptions('technique:Mãos firmes', 'Mãos firmes', effect);
  assert.equal(recordAbilityUse(game, id, scene.abilityId, scene.name, scene.effect, 'hope1', 'Bia'), true);
  assert.equal(abilityUseState(game, id, scene.abilityId, scene.effect, 'Bia').used, true);
  assert.equal(abilityUseState(game, id, scene.abilityId, scene.effect, 'Ana').used, false);
  assert.equal(abilityUseState(game, id, rest.abilityId, rest.effect, 'Bia').used, false);
  assert.equal(recordAbilityUse(game, id, rest.abilityId, rest.name, rest.effect, 'free', 'Bia'), true);
  registerRest(game, 'short');
  assert.equal(abilityUseState(game, id, scene.abilityId, scene.effect, 'Bia').used, true);
  assert.equal(abilityUseState(game, id, rest.abilityId, rest.effect, 'Bia').used, false);
  beginScene(game);
  assert.equal(abilityUseState(game, id, scene.abilityId, scene.effect, 'Bia').used, false);
});
