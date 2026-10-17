/* eslint-disable @typescript-eslint/no-require-imports -- use the shared TypeScript test loader. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
const Module = require('node:module');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...args) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '..', name.slice(2)) : name, parent, ...args); };
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const { defaultState, initialSurvivor, content, absoluteMinutes } = require('../lib/game.ts');
const { advanceExpeditionTime } = require('../lib/expedition-clock.ts');
const { advanceCampaignTime } = require('../lib/time.ts');
const { scheduleActivity } = require('../lib/activity-timeline.ts');
const { validState } = require('../lib/campaign-validation.ts');
const { assignCustomSector } = require('../lib/sectors.ts');
require('../lib/hex-actions.ts');
const { markDailyProvisionConsumed } = require('../lib/survival.ts');
const { requestTableRest } = require('../lib/table-rest.ts');
function fixture() {
  const game = defaultState(); const archetype = content.archetypes[0];
  game.survivors = [initialSurvivor({ name: 'Vigia', origin: content.origins[0].name, past: '', archetype: archetype.name,
    specialty: archetype.specialties[0].name, freeExperience: 'Resgates', techniques: [], attributes: { Agilidade: 2, Força: 1, Finesse: 1, Instinto: 0, Presença: 0, Conhecimento: -1 }, primary: '', secondary: '', protection: '', personal: '' })];
  game.minutes = 1410; game.noise = 3; game.scene = 4;
  game.survivors[0].food = 2; game.survivors[0].water = 2;
  game.survivors[0].hp = 2; game.survivors[0].stress = 4;
  return game;
}
test('manual time crosses midnight at the exact minute without rest, new scene or duplicate provisions', () => {
  const game = fixture(); const person = game.survivors[0];
  assert.equal(advanceExpeditionTime(game, 60).ok, true);
  assert.equal(game.day, 2); assert.equal(game.minutes, 30);
  assert.equal(game.noise, 3); assert.equal(game.scene, 4);
  assert.equal(person.hp, 2); assert.equal(person.stress, 4);
  assert.equal(person.food, 1); assert.equal(person.water, 1);
  advanceExpeditionTime(game, 60);
  assert.equal(game.minutes, 90); assert.equal(person.food, 1); assert.equal(person.water, 1);
  assert.equal(validState(game), true);
});
test('exact midnight applies daily shortages without granting recovery', () => {
  const game = fixture(); const person = game.survivors[0]; person.food = 0; person.water = 0;
  assert.equal(advanceExpeditionTime(game, 30).ok, true);
  assert.equal(game.day, 2); assert.equal(game.minutes, 0);
  assert.equal(person.stress, 6); assert.equal(person.hp, 2);
});
test('clock validates input and conflict without mutation; immediate actions still cannot span days', () => {
  const game = fixture(); const before = structuredClone(game);
  for (const value of [-1, 1.5, NaN, Infinity, 10081]) assert.equal(advanceExpeditionTime(game, value).ok, false);
  assert.equal(advanceCampaignTime(game, 60).ok, false); assert.deepEqual(game, before);
  game.conflict = { active: true };
  const conflict = structuredClone(game); assert.equal(advanceExpeditionTime(game, 60).ok, false); assert.deepEqual(game, conflict);
});
test('pending night events stop a multi-day clock advance before crossing midnight', () => {
  const game = fixture(); game.minutes = 1050;
  game.hexes['0,0'].events = [{ id: 'night', text: 'Ruídos na noite', triggerType: 'night', status: 'pending', revealed: true }];
  const result = advanceExpeditionTime(game, 600);
  assert.equal(result.ok, true); assert.match(result.issue, /Anoiteceu/);
  assert.equal(game.day, 1); assert.equal(game.minutes, 1080); assert.equal(game.survivors[0].food, 2);
});
test('an event countdown due at midnight expires once and stops the remaining time', () => {
  const game = fixture();
  game.hexes['0,0'].events = [{ id: 'deadline', text: 'Portão', status: 'active', revealed: true,
    clock: { status: 'active', dueAbsoluteMinute: 1440, noise: 1, label: 'Portão fecha', consequence: 'O portão fechou.' } }];
  const result = advanceExpeditionTime(game, 60);
  assert.match(result.issue, /prazo venceu/); assert.equal(absoluteMinutes(game), 1440);
  assert.equal(game.noise, 4); assert.equal(game.hexes['0,0'].events[0].clock.status, 'expired');
  advanceExpeditionTime(game, 30); assert.equal(game.noise, 4); assert.equal(game.minutes, 30);
});
test('scheduled arrival is completed before midnight and unperformed rest choices do not carry over', () => {
  const game = fixture(); const person = game.survivors[0];
  assignCustomSector(game, '1,0', 'Destino conhecido', 'explorado');
  const travel = scheduleActivity(game, { type: 'travel', destination: '1,0' }, [person.id], 10, 'Travessia');
  assert.equal(travel.ok, true);
  person.restPlan = { kind: 'long', choices: [] };
  const result = advanceExpeditionTime(game, 60);
  assert.equal(result.ok, true); assert.equal(result.issue, undefined); assert.equal(game.day, 2);
  assert.equal(game.activities[0].status, 'completed'); assert.equal(game.survivors[0].restPlan, undefined);
});
test('already consumed provisions are not charged twice, and pending rest is cancelled without recovery', () => {
  const game = fixture(); const person = game.survivors[0];
  markDailyProvisionConsumed(game, person, 'food', 1); markDailyProvisionConsumed(game, person, 'water', 1);
  assert.equal(requestTableRest(game, 'long', person.id), null);
  person.restPlan = { kind: 'long', choices: [] };
  assert.equal(advanceExpeditionTime(game, 60).ok, true);
  assert.equal(person.food, 2); assert.equal(person.water, 2); assert.equal(person.hp, 2); assert.equal(person.stress, 4);
  assert.equal(person.restPlan, undefined); assert.equal(game.playerActions.operations[0].status, 'cancelled');
});
test('each crossed day settles exactly one day of provisions and keeps the remainder of the clock', () => {
  const game = fixture(); const person = game.survivors[0]; person.food = 10; person.water = 10;
  assert.equal(advanceExpeditionTime(game, 2 * 1440 + 60).ok, true);
  assert.equal(game.day, 4); assert.equal(game.minutes, 30);
  assert.equal(person.food, 7); assert.equal(person.water, 7); assert.equal(person.stress, 4);
});
