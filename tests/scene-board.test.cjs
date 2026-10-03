/* eslint-disable @typescript-eslint/no-require-imports -- uses the existing Node test loader. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, path);

const {
  createFixtureOnWall,
  createSceneBoardObject,
  createSceneBoardScene,
  createWallFromDrag,
  hydrateSceneBoardTokens,
  moveSceneObjects,
  projectPlayerSceneBoard,
  rotateWallWithFixtures,
  validSceneBoardState,
  wallEndpoints,
} = require('../lib/scene-board.ts');

test('cena visual começa privada, com grade e snap ativos', () => {
  const scene = createSceneBoardScene('Hospital');
  assert.equal(scene.name, 'Hospital');
  assert.equal(scene.visibleToPlayers, false);
  assert.equal(scene.showGrid, true);
  assert.equal(scene.snapToGrid, true);
  assert.equal(scene.objects.length, 0);
  assert.equal(validSceneBoardState({ scenes: [scene] }), true);
});

test('desenho de parede alinha e encaixa pontas próximas', () => {
  const first = createWallFromDrag({ x: 100, y: 100 }, { x: 300, y: 104 }, [], true);
  assert.ok(first);
  assert.equal(first.rotation, 0);
  const [a, b] = wallEndpoints(first);
  assert.deepEqual(a, { x: 100, y: 100 });
  assert.deepEqual(b, { x: 300, y: 100 });

  const second = createWallFromDrag({ x: 296, y: 105 }, { x: 302, y: 320 }, [first], true);
  assert.ok(second);
  const [start] = wallEndpoints(second);
  assert.deepEqual({ x: Math.round(start.x), y: Math.round(start.y) }, { x: 300, y: 100 });
  assert.equal(Math.round(Math.abs(second.rotation)), 90);
});

test('porta vinculada acompanha movimento e rotação da parede', () => {
  const scene = createSceneBoardScene('Corredor');
  const wall = createWallFromDrag({ x: 100, y: 100 }, { x: 400, y: 100 }, [], true);
  const door = createFixtureOnWall('door', wall, { x: 250, y: 100 });
  scene.objects.push(wall, door);
  const originalDoor = { x: door.x, y: door.y, rotation: door.rotation };

  moveSceneObjects(scene, [wall.id], 40, 60);
  assert.equal(door.x, originalDoor.x + 40);
  assert.equal(door.y, originalDoor.y + 60);

  assert.equal(rotateWallWithFixtures(scene, wall.id, 90), true);
  assert.equal(Math.round(door.rotation), 90);
  assert.equal(door.parentWallId, wall.id);
  assert.equal(validSceneBoardState({ scenes: [scene] }), true);
});

test('objeto bloqueado não é movido diretamente', () => {
  const scene = createSceneBoardScene('Sala');
  const crate = createSceneBoardObject('prop', 'Caixa', 'crate');
  crate.locked = true;
  scene.objects.push(crate);
  const before = { x: crate.x, y: crate.y };
  moveSceneObjects(scene, [crate.id], 200, 200);
  assert.deepEqual({ x: crate.x, y: crate.y }, before);
});

test('tokens podem receber retrato e estado públicos sem alterar a referência mecânica', () => {
  const scene = createSceneBoardScene('Encontro');
  scene.visibleToPlayers = true;
  const survivor = createSceneBoardObject('token', 'Nome antigo', 'survivor');
  survivor.tokenKind = 'survivor';
  survivor.refId = 'survivor-1';
  scene.objects.push(survivor);
  const hydrated = hydrateSceneBoardTokens({ scenes: [scene], activeSceneId: scene.id }, [{
    tokenKind: 'survivor',
    refId: 'survivor-1',
    label: 'Maitê',
    image: 'data:image/png;base64,abc',
    state: 'injured',
  }]);
  const token = hydrated.scenes[0].objects[0];
  assert.equal(token.refId, 'survivor-1');
  assert.equal(token.label, 'Maitê');
  assert.equal(token.tokenImage, 'data:image/png;base64,abc');
  assert.equal(token.tokenState, 'injured');
  assert.equal(validSceneBoardState(hydrated), true);
});

test('projeção pública envia somente cena ativa e não vaza peça de parede oculta', () => {
  const scene = createSceneBoardScene('Corredor');
  scene.visibleToPlayers = true;
  const wall = createWallFromDrag({ x: 100, y: 100 }, { x: 400, y: 100 }, [], true);
  const door = createFixtureOnWall('door', wall, { x: 250, y: 100 });
  wall.visibleToPlayers = false;
  door.visibleToPlayers = true;
  const marker = createSceneBoardObject('prop', 'Saída', 'marker');
  scene.objects.push(wall, door, marker);

  const hiddenScene = createSceneBoardScene('Sala do mestre');
  hiddenScene.visibleToPlayers = true;
  const projected = projectPlayerSceneBoard({ scenes: [scene, hiddenScene], activeSceneId: scene.id });
  assert.equal(projected.scenes.length, 1);
  assert.equal(projected.scenes[0].id, scene.id);
  assert.deepEqual(projected.scenes[0].objects.map(object => object.label), ['Saída']);
});

test('validação rejeita vínculo de porta com objeto que não é parede e cena ativa inexistente', () => {
  const scene = createSceneBoardScene('Teste');
  const crate = createSceneBoardObject('prop', 'Caixa', 'crate');
  const door = createSceneBoardObject('door', 'Porta');
  door.parentWallId = crate.id;
  scene.objects.push(crate, door);
  assert.equal(validSceneBoardState({ scenes: [scene] }), false);

  door.parentWallId = undefined;
  assert.equal(validSceneBoardState({ scenes: [scene], activeSceneId: 'nao-existe' }), false);
});
