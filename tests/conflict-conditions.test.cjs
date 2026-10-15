/* eslint-disable @typescript-eslint/no-require-imports -- exercises the real projection and rendered conflict screens. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename);
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...args) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '..', name.slice(2)) : name, parent, ...args); };
const { defaultState, initialSurvivor, content } = require('../lib/game.ts');
const { createConflictScene, publicConflictScene, addThreatInstances } = require('../lib/conflict.ts');
const { projectPlayerGame } = require('../lib/collaboration.ts');
const { applySurvivorCondition, removeSurvivorCondition, setFractureImmobilized } = require('../lib/survivor-conditions.ts');
const { threatLibrary } = require('../lib/threats.ts');
const { ConflictSceneManager, PlayerConflictScene } = require('../components/conflict-scene-manager.tsx');

function fixture() {
  const game = defaultState(), archetype = content.archetypes[0];
  const make = name => initialSurvivor({ name, origin: content.origins[0].name, archetype: archetype.name, specialty: archetype.specialties[0].name, past: '', freeExperience: '', techniques: [], attributes: {}, primary: '', secondary: '', protection: '', personal: '' });
  game.survivors = [make('Ana'), make('Bia')];
  const [ana, bia] = game.survivors;
  game.conflict = createConflictScene({ name: 'Confronto', sceneNumber: 1, day: game.day, time: '08:00', survivorIds: [ana.id, bia.id] });
  applySurvivorCondition(game, ana.id, 'cold', { level: 2, source: 'segredo de Ana' });
  applySurvivorCondition(game, bia.id, 'fracture', { bodyRegion: 'left-leg', source: 'segredo de Bia' });
  Object.assign(bia.conditions[0], { exposureAdvantageSource: 'apoio privado', recoveryAdvantageSource: 'tratamento privado', futurePrivateField: 'campo privado futuro' });
  return { game, ana, bia };
}

test('projeção pública compartilha apenas estado das condições e preserva a ficha privada', () => {
  const { game, ana, bia } = fixture(), before = structuredClone(game);
  const view = projectPlayerGame(game, ana.id);
  assert.deepEqual(view.survivors.map(person => person.id), [ana.id]);
  const condition = view.publicConflict.survivors.find(person => person.id === bia.id).conditions[0];
  assert.deepEqual(Object.keys(condition).sort(), ['id', 'kind', 'bodyRegion', 'recovery'].sort());
  assert.equal(condition.kind, 'fracture');
  assert.equal(condition.bodyRegion, 'left-leg');
  const json = JSON.stringify(view.publicConflict);
  for (const secret of ['segredo de Ana', 'segredo de Bia', 'apoio privado', 'tratamento privado', 'campo privado futuro', 'appliedDay', 'appliedMinute']) assert.equal(json.includes(secret), false, secret);
  assert.equal(view.survivors[0].conditions[0].source, 'segredo de Ana');
  condition.recovery = 4;
  assert.deepEqual(game, before);
});

test('alteração e remoção na ficha chegam à projeção sem guardar condições duplicadas no conflito', () => {
  const { game, ana, bia } = fixture();
  setFractureImmobilized(game, bia.id, bia.conditions[0].id, true);
  assert.equal(projectPlayerGame(game, ana.id).publicConflict.survivors[1].conditions[0].immobilized, true);
  removeSurvivorCondition(game, bia.id, bia.conditions[0].id);
  assert.deepEqual(projectPlayerGame(game, ana.id).publicConflict.survivors[1].conditions, []);
  assert.equal(game.conflict.conditions, undefined);
  assert.deepEqual(publicConflictScene(game.conflict, [{ id: ana.id, name: ana.name }]).survivors[0].conditions, []);
});

test('mestre gerencia condições por participante; jogadores consultam todos e só usam a própria ficha', () => {
  const { game, ana } = fixture();
  addThreatInstances(game.conflict, threatLibrary(game.threats)[0]);
  game.conflict.threats[0].conditions = ['Em chamas'];
  const before = structuredClone(game);
  const master = renderToStaticMarkup(React.createElement(ConflictSceneManager, { game, edit() { assert.fail('Render não edita'); } }));
  assert.match(master, /Aplicar condição a Ana/);
  assert.match(master, /Aplicar condição a Bia/);
  assert.match(master, /Frio 2/);
  assert.match(master, /Fratura/);
  assert.match(master, /conflict-trail-condition-count/);
  assert.match(master, /Em chamas/);
  const player = renderToStaticMarkup(React.createElement(PlayerConflictScene, { game: projectPlayerGame(game, ana.id), selfId: ana.id, edit() { assert.fail('Render não edita'); } }));
  assert.match(player, /Condições de Ana/);
  assert.match(player, /Condições de Bia/);
  assert.match(player, /Frio 2/);
  assert.match(player, /Fratura/);
  assert.doesNotMatch(player, /Aplicar condição a|segredo de Bia|apoio privado|tratamento privado/);
  assert.deepEqual(game, before);
});
