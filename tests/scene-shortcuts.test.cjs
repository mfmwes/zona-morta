/* eslint-disable @typescript-eslint/no-require-imports -- uses the existing Node test loader. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, path);
const { sceneShortcut } = require('../lib/scene-shortcuts.ts');
const { createSceneBoardObject, createSceneBoardScene, rotateWallWithFixtures, createFixtureOnWall } = require('../lib/scene-board.ts');
const context = { readonly: false, preparing: true, fogEnabled: true, blocked: false, interacting: false };

test('atalhos respeitam campos, diálogos, jogadores, composição e combinações do navegador', () => {
  for (const key of ['v', 'h', 'w', 'd', 'j', 'e', 'o', 's', 'r', 'l', 'g', 'm', 'f', '+', '-', 'Escape']) {
    for (const flag of ['ctrlKey', 'metaKey', 'altKey', 'isComposing', 'repeat']) {
      assert.equal(sceneShortcut({ key, [flag]: true }, context), null, `${flag} + ${key}`);
    }
    assert.equal(sceneShortcut({ key }, { ...context, readonly: true }), null);
    assert.equal(sceneShortcut({ key }, { ...context, blocked: true }), null);
  }
});

test('atalhos não ativam construção na sessão nem ferramentas de névoa quando desativada', () => {
  for (const key of ['w', 'd', 'j', 's']) assert.equal(sceneShortcut({ key }, { ...context, preparing: false }), null);
  for (const key of ['e', 'o']) assert.equal(sceneShortcut({ key }, { ...context, fogEnabled: false }), null);
  assert.deepEqual(sceneShortcut({ key: 'h' }, { ...context, preparing: false }), { action: 'tool', tool: 'pan' });
});

test('gestos só podem ser interrompidos pelo Escape', () => {
  const dragging = { ...context, interacting: true };
  for (const key of ['v', 'w', 's', 'r', 'g', 'l']) assert.equal(sceneShortcut({ key }, dragging), null);
  assert.deepEqual(sceneShortcut({ key: 'Escape' }, dragging), { action: 'cancel' });
});

test('girar pelo teclado preserva vínculos e bloqueio de parede', () => {
  const scene = createSceneBoardScene();
  const wall = createSceneBoardObject('wall', 'Parede');
  const door = createFixtureOnWall('door', wall, { x: 300, y: 180 });
  scene.objects.push(wall, door);
  const forward = sceneShortcut({ key: 'r' }, context);
  const backward = sceneShortcut({ key: 'R', shiftKey: true }, context);
  assert.equal(forward.delta, 15);
  assert.equal(backward.delta, -15);
  rotateWallWithFixtures(scene, wall.id, forward.delta);
  assert.equal(wall.rotation, 15);
  assert.equal(door.rotation, 15);
  rotateWallWithFixtures(scene, wall.id, backward.delta);
  assert.equal(wall.rotation, 0);
  assert.equal(door.rotation, 0);
  wall.locked = true;
  assert.equal(rotateWallWithFixtures(scene, wall.id, forward.delta), false);
  assert.equal(wall.rotation, 0);
  assert.equal(door.rotation, 0);
});
