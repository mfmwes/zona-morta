/* eslint-disable @typescript-eslint/no-require-imports -- uses the existing Node test loader. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, path);
const { defaultState, communityCapabilities, initialSurvivor, content, shelterPopulation } = require('../lib/game.ts');
const { npcVisibleToPlayers, publicNpcs, npcPlayerView, normalizeNpcCapabilities, setNpcCapability } = require('../lib/npc-presentation.ts');
const { projectPlayerGame, playerEditPayload } = require('../lib/collaboration.ts');
const { createShelterProject, projectBaseOperational } = require('../lib/shelter-projects.ts');
const { eveningNeeds } = require('../lib/survival.ts');
const { preserveKnownSectors } = require('../lib/sectors.ts');
const { generateNpcDrafts } = require('../lib/npc-generator.ts');
function npc(id, options = {}) {
  return { id, name: id, role: 'Enfermeira', description: 'Descrição', notes: 'Segredo', publicNotes: 'Notas públicas',
    hex: '0,0', home: '0,0', status: 'Bem', infection: 'Saudável', disposition: 'Aliado', skills: ['Medicina'], active: true, ...options };
}
function campaign() {
  const game = defaultState({ withShelter: true });
  const archetype = content.archetypes[0];
  game.survivors = [initialSurvivor({ name: 'Nina', origin: content.origins[0].name, past: '', archetype: archetype.name,
    specialty: archetype.specialties[0].name, freeExperience: 'Resgates', techniques: [],
    attributes: { Agilidade: 2, Força: 1, Finesse: 1, Instinto: 0, Presença: 0, Conhecimento: -1 },
    primary: 'Faca resistente', secondary: '', protection: 'Roupa reforçada', personal: 'Mochila urbana' })];
  return game;
}

test('visibilidade preserva NPCs legados e remove inteiramente os ocultos da projeção pública e da prévia', () => {
  const game = campaign();
  game.npcs = [npc('legado'), npc('visivel', { visibleToPlayers: true }), npc('npc-reservado', { visibleToPlayers: false, portrait: 'https://example.com/reservado.png', immediateNeed: 'Necessidade secreta' })];
  const project = createShelterProject('infirmary');
  project.responsibleId = 'npc-reservado'; project.helperIds = ['npc-reservado'];
  project.workShift = { startDay: 1, startMinute: 480, durationMinutes: 60, workerIds: ['npc-reservado'] };
  game.shelter.projects.push(project);
  const before = structuredClone(game);
  const projected = projectPlayerGame(game, game.survivors[0].id);
  assert.deepEqual(projected.npcs.map(person => person.id), ['legado', 'visivel']);
  assert.ok(!JSON.stringify(projected).includes('npc-reservado'));
  assert.ok(!JSON.stringify(projected).includes('reservado.png'));
  assert.equal(projected.npcs[0].notes, undefined); assert.equal(projected.npcs[0].home, undefined);
  assert.deepEqual(npcPlayerView(game).npcs.map(person => person.id), ['legado', 'visivel']);
  assert.deepEqual(game, before);
  assert.equal(npcVisibleToPlayers(game.npcs[0]), true);
});

test('ocultar/revelar persiste no snapshot sem alterar consumo, posição, atividade ou capacidades de trabalho', () => {
  const game = campaign();
  const person = npc('medica'); game.npcs.push(person);
  const project = createShelterProject('infirmary'); project.state = 'Concluído'; project.responsibleId = person.id;
  game.shelter.projects.push(project);
  const needs = eveningNeeds(game), population = shelterPopulation(game), operational = projectBaseOperational(game, game.shelter, project);
  const initial = structuredClone(person);
  person.visibleToPlayers = false;
  assert.deepEqual(eveningNeeds(game), needs); assert.equal(shelterPopulation(game), population);
  assert.equal(projectBaseOperational(game, game.shelter, project), operational);
  const restored = preserveKnownSectors(JSON.parse(JSON.stringify(game)));
  assert.equal(restored.npcs[0].visibleToPlayers, false);
  assert.deepEqual(publicNpcs(restored.npcs), []);
  person.visibleToPlayers = true;
  assert.equal(projectPlayerGame(game, game.survivors[0].id).npcs[0].id, person.id);
  const revealed = structuredClone(person); delete revealed.visibleToPlayers;
  assert.deepEqual(revealed, initial);
});

test('jogadores não podem revelar, inserir nem alterar capacidades de NPCs', () => {
  const game = campaign(); game.npcs = [npc('publico'), npc('oculto', { visibleToPlayers: false })];
  const before = projectPlayerGame(game, game.survivors[0].id);
  for (const mutate of [draft => { draft.npcs[0].visibleToPlayers = false; }, draft => { draft.npcs.push(npc('oculto')); }, draft => { draft.npcs[0].skills = ['Mecânica']; }]) {
    const after = structuredClone(before); mutate(after);
    assert.equal(playerEditPayload(before, after, game.survivors[0].id), null);
  }
});

test('seleção reconhece grafias legadas, evita duplicação e mantém capacidades personalizadas', () => {
  const original = [' medicina ', 'MEDICINA', 'mecanica', ' Rádio   amador ', '', 'rádio amador'];
  const normalized = normalizeNpcCapabilities(original);
  assert.deepEqual(normalized, ['Medicina', 'Mecânica', 'Rádio amador']);
  assert.deepEqual(setNpcCapability(original, 'Medicina', true), normalized);
  assert.deepEqual(setNpcCapability(original, 'MEDICINA', false), ['Mecânica', 'Rádio amador']);
  assert.deepEqual(setNpcCapability(normalized, 'Cultivo', true), ['Medicina', 'Mecânica', 'Rádio amador', 'Cultivo']);
  assert.deepEqual(original, [' medicina ', 'MEDICINA', 'mecanica', ' Rádio   amador ', '', 'rádio amador']);
  const roundtrip = JSON.parse(JSON.stringify({ skills: normalized })).skills;
  assert.deepEqual(roundtrip, normalized);
  assert.ok(communityCapabilities.every(skill => setNpcCapability([], skill, true).includes(skill)));
});

test('rascunhos de encontros começam ocultos e mantêm suas capacidades pré-selecionadas', () => {
  const drafts = generateNpcDrafts({ quantity: 6, context: 'Hospitalar', tone: 'Aliado', hex: '0,0' }, () => .12);
  assert.ok(drafts.every(person => person.visibleToPlayers === false && person.skills.includes('Medicina')));
  for (const person of drafts) assert.deepEqual(normalizeNpcCapabilities(person.skills), person.skills);
});
