/* eslint-disable @typescript-eslint/no-require-imports -- uses the existing Node test loader. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, path);
const { defaultState, initialSurvivor, content } = require('../lib/game.ts');
const { expansionHexes, expandWorld, validWorld, parseHex, worldFrontier, MAX_WORLD_HEXES, mapBounds, worldHexes, terrainDetails, terrains } = require('../lib/world.ts');
const { revealSector, redrawSector, preserveKnownSectors, sectorProfiles } = require('../lib/sectors.ts');
const { performHexAction, moveSurvivors, movementSources } = require('../lib/hex-actions.ts');
const { projectPlayerGame, playerEditPayload } = require('../lib/collaboration.ts');
const expansion = (overrides = {}) => ({ origin: '2,0', mode: 'neighbor', direction: 1, length: 3, terrain: 'forest', passage: 'road', ...overrides });
function person(name, hex) {
  const archetype = content.archetypes[0];
  const survivor = initialSurvivor({ name, origin: content.origins[0].name, past: '', archetype: archetype.name,
    specialty: archetype.specialties[0].name, freeExperience: 'Resgates', techniques: [],
    attributes: { Agilidade: 2, Força: 1, Finesse: 1, Instinto: 0, Presença: 0, Conhecimento: -1 },
    primary: 'Faca resistente', secondary: '', protection: 'Roupa reforçada', personal: 'Mochila urbana' });
  survivor.hex = hex;
  return survivor;
}

test('expansão preserva integralmente o mapa anterior, começa desconhecida e pode continuar indefinidamente por etapas', () => {
  const game = defaultState();
  const before = structuredClone(game);
  const added = expandWorld(game, expansion());
  assert.deepEqual(added, ['3,0']);
  for (const [id, hex] of Object.entries(before.hexes)) assert.deepEqual(game.hexes[id], hex);
  const other = structuredClone(game); delete other.hexes['3,0'];
  assert.deepEqual(other, before);
  assert.deepEqual(game.hexes['3,0'], { sector: null, discovery: 'desconhecido', infestation: null,
    terrain: 'forest', passage: 'road', routeHours: 2, signs: '', notes: '', points: [], events: [] });
  assert.deepEqual(expandWorld(game, expansion()), []);
  assert.deepEqual(expandWorld(game, expansion({ origin: '3,0', mode: 'direction', length: 12 })),
    Array.from({ length: 12 }, (_, i) => `${i + 4},0`));
});

test('mapa novo distribui identidades de terreno e aplica travessia-base coerente', () => {
  const game = defaultState();
  const present = new Set(Object.values(game.hexes).map(hex => hex.terrain));
  assert.ok(present.size >= 5, `terrenos distintos no mapa inicial: ${[...present].join(', ')}`);
  assert.equal(game.hexes['0,0'].terrain, 'urban');
  for (const hex of Object.values(game.hexes)) {
    assert.ok(Object.hasOwn(terrains, hex.terrain));
    assert.equal(hex.routeHours, terrainDetails[hex.terrain].travelHours);
  }
  assert.equal(terrainDetails.industrial.travelHours, 1);
  assert.equal(terrainDetails.forest.travelHours, 2);
  assert.equal(terrainDetails.roadway.travelHours, 1);
});

test('campanha legada sem terrain recebe identidade sem reescrever setor estabelecido', () => {
  const game = defaultState();
  const originalSector = structuredClone(game.hexes['0,0'].sector);
  for (const hex of Object.values(game.hexes)) delete hex.terrain;
  game.hexes['0,0'].sector = { id:'custom-old', name:'Distrito industrial antigo', border:'galpões e pátios', invites:[] };
  const restored = preserveKnownSectors(game);
  assert.equal(restored.hexes['0,0'].sector.id, 'custom-old');
  assert.equal(restored.hexes['0,0'].terrain, 'industrial');
  assert.ok(Object.values(restored.hexes).every(hex => Object.hasOwn(terrains, hex.terrain)));
  assert.ok(originalSector);
});

test('mapa renderiza legenda, textura e cartão de identidade do terreno', () => {
  const explorer = fs.readFileSync(require.resolve('../components/hex-explorer.tsx'), 'utf8');
  const css = fs.readFileSync(require.resolve('../app/world-map.css'), 'utf8');
  assert.match(explorer,/map-terrain-legend/);
  assert.match(explorer,/terrainPatternMark/);
  assert.match(explorer,/hex-terrain-summary/);
  assert.match(explorer,/terrainDetails\[terrainKey\]\.code/);
  assert.match(css,/Terrain identity prototype/);
  assert.match(css,/\.hex-terrain-summary/);
});

test('anéis seguem a borda atual: 19, 37, 61; direções pulam hexes existentes sem reescrevê-los', () => {
  const game = defaultState();
  assert.equal(worldFrontier(game.hexes).length, 18);
  assert.equal(expandWorld(game, expansion({ mode: 'ring' })).length, 18);
  assert.equal(Object.keys(game.hexes).length, 37);
  assert.equal(expandWorld(game, expansion({ mode: 'ring' })).length, 24);
  assert.equal(Object.keys(game.hexes).length, 61);
  const previous = structuredClone(game.hexes);
  assert.deepEqual(expandWorld(game, expansion({ origin: '0,0', mode: 'direction', length: 6 })), ['5,0', '6,0']);
  for (const [id, hex] of Object.entries(previous)) assert.deepEqual(game.hexes[id], hex);
  assert.ok(mapBounds(worldHexes(game.hexes)).width > 600);
});

test('validação rejeita coordenadas inválidas, entradas malformadas e expansão acima da capacidade', () => {
  const game = defaultState();
  assert.equal(validWorld(game.hexes), true);
  for (const value of ['0,00', '-0,0', '1.5,2', '__proto__', '10001,0']) assert.equal(parseHex(value), null);
  for (const options of [{ direction: -1 }, { length: 13 }, { length: NaN }, { origin: '30,0' }, { mode: 'invalid' }])
    assert.deepEqual(expansionHexes(game.hexes, expansion(options)), []);
  assert.deepEqual(expandWorld(game, expansion({ terrain: 'invalid' })), []);
  assert.equal(validWorld({ ...game.hexes, '3,0': { ...game.hexes['0,0'], terrain: 'invalid' } }), false);
  for (let i = 3; Object.keys(game.hexes).length < MAX_WORLD_HEXES; i++) game.hexes[`${i},0`] = structuredClone(game.hexes['0,0']);
  const before = JSON.stringify(game);
  assert.deepEqual(expandWorld(game, expansion({ mode: 'ring' })), []);
  assert.equal(JSON.stringify(game), before);
});

test('avistamento, travessia, subgrupos, PNJs e abrigo funcionam fora das 19 áreas sem criar vizinhos automaticamente', () => {
  const game = defaultState();
  expandWorld(game, expansion({ mode: 'direction' }));
  game.partyHex = '2,0'; game.hexes['2,0'].discovery = 'explorado';
  const ana = person('Ana', '2,0'), bia = person('Bia', '2,0');
  game.survivors = [ana, bia];
  game.npcs = [{ id: 'npc', name: 'Guia', hex: '2,0', active: true, status: 'Bem', accompaniesSurvivorIds: [ana.id] }];
  assert.equal(moveSurvivors(game, '3,0', [ana.id]).ok, false);
  assert.equal(performHexAction(game, '3,0', { type: 'observe' }).ok, true);
  assert.equal(game.minutes, 480);
  assert.equal(movementSources(game, '3,0').length, 1);
  assert.equal(moveSurvivors(game, '3,0', [ana.id]).ok, true);
  assert.equal(game.minutes, 540);
  assert.equal(bia.hex, '2,0'); assert.equal(game.partyHex, '2,0'); assert.equal(game.npcs[0].hex, '3,0');
  assert.equal(game.hexes['3,0'].discovery, 'explorado');
  assert.equal(game.hexes['4,0'].discovery, 'avistado');
  assert.equal(game.hexes['5,0'].discovery, 'desconhecido');
  assert.equal(performHexAction(game, '3,0', { type: 'establish' }).ok, true);
  assert.equal(game.shelter.hex, '3,0');
  assert.equal(moveSurvivors(game, '4,0', [ana.id]).ok, true);
  assert.equal(moveSurvivors(game, '5,0', [ana.id]).ok, true);
  assert.equal(game.hexes['6,0'], undefined);
  const restored = preserveKnownSectors(JSON.parse(JSON.stringify(game)));
  assert.deepEqual(restored.hexes, game.hexes);
  assert.equal(restored.shelter.hex, '3,0');
  assert.equal(validWorld(restored.hexes), true);
});

test('revelação não esgota o catálogo urbano; terrenos geram setores próprios com identidades persistentes', () => {
  const game = defaultState();
  for (let i = 0; i < 4; i++) expandWorld(game, expansion({ mode: 'ring', terrain: 'urban', passage: 'none' }));
  for (const id of Object.keys(game.hexes)) revealSector(game, id);
  const ids = Object.values(game.hexes).map(hex => hex.sector.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.some(id => id.startsWith('generated-')));
  const procedural = ids.filter(id => sectorProfiles.some(profile => profile.id === id));
  assert.equal(new Set(procedural).size, sectorProfiles.length);
  const key = Object.keys(game.hexes).at(-1);
  assert.ok(redrawSector(game, key));
  let origin = '6,0';
  for (const terrain of ['suburban', 'industrial', 'forest', 'rural', 'open', 'roadway', 'mountain', 'swamp']) {
    const added = expandWorld(game, expansion({ origin, terrain }));
    assert.equal(added.length, 1);
    const sector = revealSector(game, added[0]);
    assert.match(sector.id, /^generated-/);
    assert.ok(!sectorProfiles.some(profile => profile.name === sector.name));
    assert.deepEqual(revealSector(game, added[0]), sector);
    game.hexes[added[0]].notes = 'Persistente';
    const redraw = redrawSector(game, added[0]);
    assert.notEqual(redraw.id, sector.id); assert.equal(game.hexes[added[0]].notes, 'Persistente');
    origin = added[0];
  }
});

test('jogadores recebem áreas novas sem terreno/via secretos e não podem expandir ou editar o mundo', () => {
  const game = defaultState(); const survivor = person('Nina', '0,0'); game.survivors = [survivor];
  expandWorld(game, expansion());
  const projected = projectPlayerGame(game, survivor.id);
  assert.equal(projected.hexes['3,0'].terrain, undefined);
  assert.equal(projected.hexes['3,0'].passage, undefined);
  const changed = structuredClone(projected);
  expandWorld(changed, expansion({ origin: '3,0' }));
  assert.equal(playerEditPayload(projected, changed, survivor.id), null);
  const modified = structuredClone(projected); modified.hexes['3,0'].terrain = 'rural';
  assert.equal(playerEditPayload(projected, modified, survivor.id), null);
  revealSector(game, '3,0'); game.hexes['3,0'].discovery = 'avistado';
  const visible = projectPlayerGame(game, survivor.id);
  assert.equal(visible.hexes['3,0'].terrain, 'forest'); assert.equal(visible.hexes['3,0'].passage, 'road');
});
