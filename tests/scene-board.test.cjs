/* eslint-disable @typescript-eslint/no-require-imports -- uses the existing Node test loader. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, path);

const { createSceneBoardObject, createSceneBoardScene, projectPlayerSceneBoard, validSceneBoardState } = require('../lib/scene-board.ts');

test('cena visual começa privada e com dimensões válidas', () => {
  const scene = createSceneBoardScene('Hospital');
  assert.equal(scene.name, 'Hospital');
  assert.equal(scene.visibleToPlayers, false);
  assert.equal(scene.objects.length, 0);
  assert.equal(validSceneBoardState({ scenes: [scene] }), true);
});

test('projeção pública envia somente a cena ativa e objetos revelados', () => {
  const scene = createSceneBoardScene('Corredor');
  scene.visibleToPlayers = true;
  const door = createSceneBoardObject('door', 'Porta do arquivo');
  const secret = createSceneBoardObject('prop', 'Pista secreta', 'marker');
  secret.visibleToPlayers = false;
  scene.objects.push(door, secret);
  const hiddenScene = createSceneBoardScene('Sala do mestre');
  hiddenScene.visibleToPlayers = true;
  const projected = projectPlayerSceneBoard({ scenes: [scene, hiddenScene], activeSceneId: scene.id });
  assert.equal(projected.scenes.length, 1);
  assert.equal(projected.scenes[0].id, scene.id);
  assert.deepEqual(projected.scenes[0].objects.map(object => object.label), ['Porta do arquivo']);
});

test('validação rejeita objetos fora dos limites e cena ativa inexistente', () => {
  const scene = createSceneBoardScene('Teste');
  const wall = createSceneBoardObject('wall', 'Parede');
  wall.width = 99999;
  scene.objects.push(wall);
  assert.equal(validSceneBoardState({ scenes: [scene] }), false);
  scene.objects = [];
  assert.equal(validSceneBoardState({ scenes: [scene], activeSceneId: 'nao-existe' }), false);
});
