/* eslint-disable @typescript-eslint/no-require-imports -- Exercise TypeScript validation and real API boundaries. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
require.extensions['.ts'] = (m, p) => m._compile(ts.transpileModule(fs.readFileSync(p, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, p);
const load = Module._load;
let stored, writes;
const db = { campaignOwnerId: async () => 'master', readCampaign: async () => ({ state: structuredClone(stored), revision: 1 }),
  writeCampaign: async (_, state) => { writes++; stored = structuredClone(state); return 2; },
  findPlayer: async () => ({ survivor_id: stored.survivors[0].id }) };
let user;
Module._load = function(name, parent, main) {
  if (name === '@/db/state') return db;
  if (name === '@/lib/auth') return { siteUser: async () => user, sameOrigin: () => true };
  return load.call(this, name.startsWith('@/') ? path.join(__dirname, '..', name.slice(2) + '.ts') : name, parent, main);
};
const { defaultState, initialSurvivor, content } = require('../lib/game.ts');
const { applyPlayerChange, projectPlayerGame } = require('../lib/collaboration.ts');
const { validState } = require('../lib/campaign-validation.ts');
const { expirePortionLots } = require('../lib/provisions.ts');
const { PUT, PATCH } = require('../app/api/campaign/route.ts');
Module._load = load;
function fixture() {
  const g = defaultState(), a = content.archetypes[0];
  g.survivors = [initialSurvivor({ name: 'Nina', origin: content.origins[1].name, past: '', archetype: a.name,
    specialty: a.specialties[0].name, freeExperience: 'Resgates', techniques: [],
    attributes: { Agilidade: 2, Força: 1, Finesse: 1, Instinto: 0, Presença: 0, Conhecimento: -1 },
    primary: '', secondary: '', protection: '', personal: '' })];
  return g;
}
const request = (method, body) => new Request('https://example.test/api/campaign?campanha=test', {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('player PATCH rejects malformed editable structures without writing', async () => {
  for (const patch of [{ provisionLots: {} }, { provisionLots: [null] }, { equippedItems: { primary: {} } },
    { kitCondition: { primary: {} } }, { primary: {} }, { portrait: {} }, { portrait: 'javascript:alert(1)' },
    { abilityUses: { 'ability': {} } }, { foodConsumedDay: 'tomorrow' }, { restPlan: { kind: 'short', choices: [null, null] } },
    { inventory: [{ id: 'bad', name: 'Item', qty: 1, load: 1, condition: {} }] }]) {
    stored = fixture(); writes = 0; user = { id: 'player', email: 'player@example.test' };
    const before = structuredClone(stored.survivors[0]), after = { ...before, ...patch };
    const original = structuredClone(stored);
    assert.equal((await PATCH(request('PATCH', { before, after, logs: [] }))).status, 409, JSON.stringify(patch));
    assert.equal(writes, 0); assert.deepEqual(stored, original);
  }
});

test('valid provision edit survives projection and daily expiration', () => {
  const g = fixture(), before = structuredClone(g.survivors[0]), after = structuredClone(before);
  after.provisionLots = [{ id: 'lot', resource: 'food', qty: 1, expiresDay: 2, label: 'Comida preparada' }];
  const next = applyPlayerChange(g, before.id, before, after, 0, []);
  assert.ok(next); assert.equal(validState(next), true);
  assert.doesNotThrow(() => projectPlayerGame(next, before.id));
  assert.equal(expirePortionLots(next.survivors[0], 2).length, 1);
});

test('unrelated player edits preserve legacy inventory and custom fields', () => {
  const g = fixture(); g.survivors[0].inventory = [{ id: 'legacy', name: 'Legado', qty: 0, load: 1 }];
  g.survivors[0].legacyTag = 'preserved';
  const before = structuredClone(g.survivors[0]), after = { ...before, hope: 1 };
  const next = applyPlayerChange(g, before.id, before, after, 0, []);
  assert.ok(next); assert.deepEqual(next.survivors[0].inventory, before.inventory);
  assert.equal(next.survivors[0].legacyTag, 'preserved'); assert.equal(validState(next), true);
});

test('whole-state PUT rejects incomplete or corrupt backups without replacing state', async () => {
  const mutations = [g => delete g.survivors[0].techniques, g => g.survivors[0].inventory = {},
    g => g.survivors[0] = null, g => g.log = [null], g => g.log = [{ id: 'bad', day: 1, time: '08:00', kind: 'chat', text: {} }],
    g => g.shelter.food = {}, g => g.shelter.provisionLots = {}, g => g.survivors[0].attributes = [],
    g => g.survivors[0].equippedItems = { primary: {} }, g => g.formerShelters = [{}],
    g => g.survivors.push(structuredClone(g.survivors[0]))];
  for (const mutate of mutations) {
    stored = fixture(); writes = 0; user = { id: 'master', email: 'master@example.test' };
    const before = structuredClone(stored), invalid = structuredClone(stored); mutate(invalid);
    assert.equal(validState(invalid), false);
    assert.equal((await PUT(request('PUT', { revision: 1, state: invalid }))).status, 400);
    assert.equal(writes, 0); assert.deepEqual(stored, before);
  }
});

test('valid legacy backup imports and projects without new optional fields', async () => {
  stored = fixture(); writes = 0; user = { id: 'master', email: 'master@example.test' };
  const backup = structuredClone(stored);
  for (const key of ['outfit', 'transport', 'level', 'proficiency', 'ammoSpentTypes']) delete backup.survivors[0][key];
  backup.survivors[0].inventory = [{ id: 'legacy', name: 'Item antigo', qty: 0, load: 1 }];
  assert.equal(validState(backup), true);
  assert.equal((await PUT(request('PUT', { revision: 1, state: backup }))).status, 200);
  assert.equal(writes, 1); assert.doesNotThrow(() => projectPlayerGame(stored, stored.survivors[0].id));
});

test('legacy missing inventory and transport slot migrate during import', async () => {
  stored = fixture(); writes = 0; user = { id: 'master', email: 'master@example.test' };
  const backup = structuredClone(stored), survivor = backup.survivors[0];
  delete survivor.inventory;
  survivor.transport = 'Carrinho dobrável'; survivor.kitCondition = { transport: 'Íntegro' };
  survivor.equippedItems = { transport: { id: 'cart', name: 'Carrinho dobrável', load: 1, qty: 1 } };
  assert.equal((await PUT(request('PUT', { revision: 1, state: backup }))).status, 200);
  assert.equal(stored.survivors[0].inventory[0].name, 'Carrinho dobrável');
  assert.equal(stored.survivors[0].transport, undefined);
  assert.doesNotThrow(() => projectPlayerGame(stored, survivor.id));
});
