/* eslint-disable @typescript-eslint/no-require-imports -- run real campaign rules with the shared TypeScript loader. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), Module = require('node:module');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...args) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '..', name.slice(2)) : name, parent, ...args); };
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const { defaultState, initialSurvivor, content } = require('../lib/game.ts');
const { defaultDayClosePlan, inspectDayClosePlan, closeDayWithPlan, markDailyProvisionConsumed } = require('../lib/survival.ts');
const { advanceExpeditionTime } = require('../lib/expedition-clock.ts');
const { scheduleSurvivorTravel } = require('../lib/hex-actions.ts');
const { cancelActivity } = require('../lib/activity-timeline.ts');
const { planJourney } = require('../lib/journey.ts');
const { validState } = require('../lib/campaign-validation.ts');
const { requestTableRest, confirmTableRest, currentTableRest } = require('../lib/table-rest.ts');
const { beginScene } = require('../lib/abilities.ts');
const { groupReserves } = require('../lib/group-reserves.ts');
function fixture(count = 1) {
  const g = defaultState(), a = content.archetypes[0];
  g.minutes = 1410; g.npcs = []; g.shelter.residents = 0; g.shelter.water = 0; g.shelter.food = 0;
  g.survivors = Array.from({ length: count }, (_, i) => initialSurvivor({ name: `Pessoa ${i}`, origin: content.origins[0].name,
    past: '', archetype: a.name, specialty: a.specialties[0].name, freeExperience: '', techniques: [], attributes: {},
    primary: '', secondary: '', protection: '', personal: '' }));
  for (const h of Object.values(g.hexes)) { h.discovery = 'explorado'; h.events = []; h.routeHours = 1; }
  for (const p of g.survivors) { p.hex = '0,0'; p.food = 2; p.water = 2; }
  return g;
}
test('Calor: mixed water sources agree in inspection and midnight consumption, without double charging', () => {
  const g = fixture(), p = g.survivors[0]; p.water = 1; g.shelter.water = 1;
  p.conditions = [{ id: 'heat', kind: 'heat', level: 1 }];
  const before = structuredClone(g), plan = defaultDayClosePlan(g), inspection = inspectDayClosePlan(g, plan);
  assert.equal(plan.survivors[0].water, 'mixed'); assert.deepEqual(inspection.deprivations, []);
  assert.equal(inspection.shared.water.demand, 1); assert.deepEqual(g, before);
  advanceExpeditionTime(g, 60);
  assert.equal(p.water, 0); assert.equal(g.shelter.water, 0); assert.equal(p.stress, 0); assert.equal(g.day, 2);
  advanceExpeditionTime(g, 30); assert.equal(p.stress, 0); assert.equal(validState(g), true);
});
test('mixed sources never consume remote storage or suppress an actual shortage', () => {
  const g = fixture(), p = g.survivors[0]; p.conditions = [{ id: 'heat', kind: 'heat', level: 1 }];
  p.water = 0; g.shelter.water = 1;
  const plan = defaultDayClosePlan(g); plan.survivors[0].water = 'mixed';
  assert.equal(inspectDayClosePlan(g, plan).deprivations.length, 1);
  const closed = closeDayWithPlan(g, plan, 'midnight'); assert.equal(closed.deprivations.length, 1); assert.equal(p.stress, 1);
  const remote = fixture(), person = remote.survivors[0]; person.hex = '1,0'; remote.shelter.hex = '0,0'; remote.shelter.water = 5;
  const remotePlan = defaultDayClosePlan(remote); remotePlan.survivors[0].water = 'mixed';
  assert.equal(inspectDayClosePlan(remote, remotePlan).deprivations[0].reason, 'remote');
  assert.equal(closeDayWithPlan(remote, remotePlan).deprivations[0].reason, 'remote'); assert.equal(remote.shelter.water, 5);
});
test('field NPCs reserve different carriers after the survivors own daily consumption', () => {
  const g = fixture(2); g.shelter.hex = '0,0'; for (const p of g.survivors) p.hex = '1,0';
  g.npcs = ['Elias', 'Dora'].map((name, i) => ({ id: `npc-${i}`, name, active: true, hex: '1,0', status: 'Bem', skills: [] }));
  const before = structuredClone(g), plan = defaultDayClosePlan(g);
  assert.deepEqual(plan.npcs.map(n => n.foodCarrierId), g.survivors.map(p => p.id));
  assert.deepEqual(plan.npcs.map(n => n.waterCarrierId), g.survivors.map(p => p.id));
  assert.deepEqual(inspectDayClosePlan(g, plan).deprivations, []); assert.deepEqual(g, before);
  advanceExpeditionTime(g, 60);
  assert.ok(g.survivors.every(p => p.food === 0 && p.water === 0 && p.stress === 0));
  assert.ok(g.npcs.every(n => n.foodConsumedDay === 1 && n.waterConsumedDay === 1)); assert.equal(validState(g), true);
});
test('NPC allocation accounts for already consumed meals and does not invent stock', () => {
  const g = fixture(2); g.shelter.hex = '0,0'; for (const p of g.survivors) { p.hex = '1,0'; p.food = 1; }
  markDailyProvisionConsumed(g, g.survivors[0], 'food');
  g.npcs = [0, 1].map(i => ({ id: `npc-${i}`, name: `PNJ ${i}`, active: true, hex: '1,0', status: 'Bem', skills: [] }));
  const plan = defaultDayClosePlan(g);
  assert.equal(plan.npcs[0].foodCarrierId, g.survivors[0].id); assert.equal(plan.npcs[1].food, 'none');
  assert.deepEqual(inspectDayClosePlan(g, plan).deprivations.map(d => [d.npcId, d.resource]), [['npc-1', 'food']]);
});
test('interrupted travel keeps only elapsed march after serialization, without affecting old saves', () => {
  const g = fixture(2); g.minutes = 480; g.survivors[1].hex = '-1,0'; g.hexes['1,0'].routeHours = 2;
  const actor = g.survivors[0]; const started = scheduleSurvivorTravel(g, '1,0', [actor.id]); assert.equal(started.ok, true);
  advanceExpeditionTime(g, 60); assert.equal(cancelActivity(g, g.activities[0].id), true);
  assert.equal(g.activities[0].cancelledMinute, 540); assert.equal(g.activities[0].endMinute, 600);
  const restored = JSON.parse(JSON.stringify(g)); assert.equal(validState(restored), true);
  const input = { from: '0,0', to: '1,0', survivorIds: [actor.id], mode: 'any', dailyHours: 8, reserveDays: 0 };
  assert.equal(planJourney(restored, input).walkedToday, 60); assert.equal(g.minutes, 540); assert.equal(actor.hex, '0,0');
  restored.activities[0].cancelledMinute = 479; assert.equal(validState(restored), false);
  delete restored.activities[0].cancelledMinute; assert.equal(validState(restored), true); assert.equal(planJourney(restored, input).walkedToday, 0);
});
test('cancelling immediately adds zero march; completed trips keep their full march', () => {
  const g = fixture(2); g.minutes = 480; g.survivors[1].hex = '-1,0'; const actor = g.survivors[0];
  scheduleSurvivorTravel(g, '1,0', [actor.id]); cancelActivity(g, g.activities[0].id);
  const input = { from: '0,0', to: '1,0', survivorIds: [actor.id], mode: 'any', dailyHours: 8, reserveDays: 0 };
  assert.equal(planJourney(g, input).walkedToday, 0); assert.equal(validState(g), true);
  scheduleSurvivorTravel(g, '1,0', [actor.id]); advanceExpeditionTime(g, 60);
  assert.equal(planJourney(g, { ...input, from: '1,0', to: '2,0' }).walkedToday, 60);
});

test('scarce shared food serves the person without personal food in either survivor order', () => {
  for (const reverse of [false, true]) {
    const g = fixture(2), [equipped, empty] = g.survivors; equipped.food = 1; empty.food = 0; g.shelter.food = 1;
    if (reverse) g.survivors.reverse();
    const before = structuredClone(g), plan = defaultDayClosePlan(g);
    assert.deepEqual(inspectDayClosePlan(g, plan).deprivations, []); assert.deepEqual(g, before);
    advanceExpeditionTime(g, 60);
    assert.equal(equipped.food, 0); assert.equal(g.shelter.food, 0);
    assert.ok(g.survivors.every(p => p.stress === 0)); assert.equal(validState(g), true);
  }
});

test('all 180 water allocations agree between inspection and consumption; feasible cases have no deprivation', () => {
  let checked = 0, feasible = 0;
  for (let heatA = 0; heatA <= 1; heatA++) for (let heatB = 0; heatB <= 1; heatB++)
    for (let personalA = 0; personalA <= 2; personalA++) for (let personalB = 0; personalB <= 2; personalB++)
      for (let shared = 0; shared <= 4; shared++) {
        const g = fixture(2); g.shelter.water = shared;
        [personalA, personalB].forEach((water, i) => { g.survivors[i].water = water; });
        [heatA, heatB].forEach((heat, i) => { if (heat) g.survivors[i].conditions = [{ id: `heat-${i}`, kind: 'heat', level: 1 }]; });
        const plan = defaultDayClosePlan(g), preview = inspectDayClosePlan(g, plan);
        const closed = closeDayWithPlan(g, plan, 'midnight');
        assert.deepEqual(closed.deprivations, preview.deprivations);
        const possible = shared >= Math.max(0, 1 + heatA - personalA) + Math.max(0, 1 + heatB - personalB);
        if (possible) { feasible++; assert.deepEqual(closed.deprivations, [], JSON.stringify({ heatA, heatB, personalA, personalB, shared })); }
        const consumed = g.survivors.reduce((n, p) => n + (p.waterConsumedDay === 1 ? 1 : 0) + (p.extraWaterConsumedDay === 1 ? 1 : 0), 0);
        assert.equal(personalA + personalB + shared - g.shelter.water - g.survivors.reduce((n, p) => n + p.water, 0), consumed);
        assert.equal(validState(g), true); checked++;
      }
  assert.equal(checked, 180); assert.equal(feasible, 132);
});

test('abundant shared supplies and residents retain their normal default allocation', () => {
  const g = fixture(2); g.shelter.residents = 1; g.shelter.food = 3; g.shelter.water = 3;
  const plan = defaultDayClosePlan(g); assert.ok(plan.survivors.every(p => p.food === 'shared' && p.water === 'shared'));
  const result = closeDayWithPlan(g, plan); assert.deepEqual(result.deprivations, []);
  assert.equal(g.shelter.food, 0); assert.equal(g.shelter.water, 0); assert.ok(g.survivors.every(p => p.food === 2 && p.water === 2));
});

test('new scene cancels unstarted rest and partial choices without recovery, then accepts a new request', () => {
  for (const kind of ['short', 'long']) {
    const g = fixture(2); g.minutes = 480; const person = g.survivors[0]; person.hp = 3; person.stress = 2;
    assert.equal(requestTableRest(g, kind), null); const op = currentTableRest(g);
    const choices = [{ action: kind === 'short' ? 'hp' : 'hp-full', targetId: person.id }, { action: 'fiction', targetId: person.id }];
    assert.equal(confirmTableRest(g, person.id, op.id, choices), null); assert.ok(person.restPlan);
    beginScene(g);
    assert.equal(op.status, 'cancelled'); assert.equal(person.restPlan, undefined); assert.equal(currentTableRest(g), undefined);
    assert.equal(person.hp, 3); assert.equal(person.stress, 2); assert.equal(g.minutes, 480);
    const restored = JSON.parse(JSON.stringify(g)); assert.equal(requestTableRest(restored, kind), null);
    assert.equal(currentTableRest(restored).scene, restored.scene); assert.equal(validState(restored), true);
  }
});

test('requesting rest repairs an old orphaned scene request but preserves a live same-scene request', () => {
  const g = fixture(2); g.minutes = 480; requestTableRest(g, 'short'); const old = currentTableRest(g);
  g.scene = (g.scene ?? 1) + 1; // State saved before the scene cleanup existed.
  assert.equal(requestTableRest(g, 'short'), null); assert.equal(old.status, 'cancelled');
  const before = structuredClone(g); assert.match(requestTableRest(g, 'long'), /Já há um descanso/); assert.deepEqual(g, before);
});

test('scene change keeps an already scheduled subgroup rest and its selections until completion', () => {
  const g = fixture(2); g.minutes = 480; g.survivors[1].hex = '-1,0'; const person = g.survivors[0]; person.hp = 3;
  requestTableRest(g, 'short', person.id, [person.id]); const op = currentTableRest(g);
  confirmTableRest(g, person.id, op.id, [{ action: 'hp', targetId: person.id }, { action: 'fiction', targetId: person.id }], () => 1);
  assert.equal(op.status, 'scheduled'); beginScene(g); assert.equal(op.status, 'scheduled'); assert.ok(person.restPlan);
  advanceExpeditionTime(g, 60); assert.equal(g.activities[0].status, 'completed'); assert.equal(g.playerActions.operations[0].status, 'done');
  assert.equal(g.survivors[0].restPlan, undefined); assert.equal(validState(g), true);
});

test('confirmed overnight rest awaiting day close is still unstarted and grants no recovery on scene change', () => {
  const g = fixture(2); g.minutes = 1410; requestTableRest(g, 'long'); const op = currentTableRest(g);
  for (const person of g.survivors) {
    person.hp = 3;
    assert.equal(confirmTableRest(g, person.id, op.id, [{ action: 'hp-full', targetId: person.id }, { action: 'fiction', targetId: person.id }]), null);
  }
  assert.equal(op.awaitingNight, true); beginScene(g);
  assert.equal(op.status, 'cancelled'); assert.ok(g.survivors.every(p => p.hp === 3 && p.restPlan === undefined));
  assert.equal(requestTableRest(g, 'long'), null); assert.equal(validState(g), true);
});

test('player commands also clean partial choices from orphaned legacy requests without mutating the original', () => {
  const { applyPlayerAction } = require('../lib/player-actions.ts');
  const g = fixture(2); g.minutes = 480; requestTableRest(g, 'short'); const op = currentTableRest(g), person = g.survivors[0];
  confirmTableRest(g, person.id, op.id, [{ action: 'hp', targetId: person.id }, { action: 'fiction', targetId: person.id }]);
  g.scene = (g.scene ?? 1) + 1; const before = structuredClone(g);
  const result = applyPlayerAction(g, person.id, { id: 'renew-rest', type: 'request-rest', day: g.day, kind: 'short' });
  assert.equal(result.ok, true, result.error); assert.deepEqual(g, before);
  assert.equal(result.state.survivors[0].restPlan, undefined); assert.equal(currentTableRest(result.state).scene, 2);
  assert.equal(validState(result.state), true);
});

test('map reserves include ready items and only selected-group backpacks and co-located storage', () => {
  const g = fixture(2); g.shelter.hex = '0,0'; g.shelter.food = 3; g.shelter.water = 4; g.shelter.parts = 6;
  g.survivors[1].hex = '1,0'; g.survivors[1].food = 7; g.survivors[1].water = 5;
  g.survivors[0].inventory = [{ id: 'ready', name: 'Ração de exemplo', qty: 1, provisionResource: 'food', portionsPerUnit: 4, prepared: true, condition: 'Íntegro' }];
  const before = structuredClone(g), local = groupReserves(g, '0,0'), remote = groupReserves(g, '1,0');
  assert.deepEqual(local.total, { food: 9, water: 6, parts: 6 });
  assert.deepEqual(local.personal, { food: 6, water: 2 });
  assert.deepEqual(remote.total, { food: 7, water: 5, parts: 0 }); assert.deepEqual(remote.remote, { food: 3, water: 4, parts: 6 });
  assert.deepEqual(g, before);
});

test('map reserves exclude spoiled, unprepared and expired items and loose expired lots', () => {
  const g = fixture(); g.day = 2;
  g.survivors[0].provisionLots = [{ id: 'lot', resource: 'food', label: 'Ontem', qty: 1, expiresDay: 2 }];
  const item = { name: 'Comida de exemplo', qty: 1, provisionResource: 'food', portionsPerUnit: 4, prepared: true, condition: 'Íntegro' };
  g.survivors[0].inventory = [{ ...item, id: 'expired', expiresDay: 2 }, { ...item, id: 'spoiled', condition: 'Estragado' }, { ...item, id: 'raw', prepared: false }];
  assert.equal(groupReserves(g).total.food, 1);
});
