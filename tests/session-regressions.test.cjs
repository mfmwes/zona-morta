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
