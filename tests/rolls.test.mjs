import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWeaponDamage, resolveActionRoll, resolveRollResources, resolveWeaponDamage } from '../lib/rolls.ts';

const base = { trait: 0, experience: 0, other: 0, symptom: 0, edge: 'none' };

test('dados iguais vencem automaticamente e geram recurso apenas em ação', () => {
  const outcome = resolveActionRoll({ ...base, hopeDie: 2, fearDie: 2, difficulty: 40 });
  assert.equal(outcome.critical, true);
  assert.equal(outcome.success, true);
  assert.equal(outcome.with, 'Hope');
  assert.deepEqual(resolveRollResources({ hope: 2, stress: 3, fear: 1, experienceCost: 0, reaction: false, outcome }),
    { hope: 3, stress: 2, fear: 1 });
  assert.deepEqual(resolveRollResources({ hope: 2, stress: 3, fear: 1, experienceCost: 1, reaction: true, outcome }),
    { hope: 1, stress: 3, fear: 1 });
});

test('Experience é custo prévio; Hope ganho na ação não o substitui', () => {
  const outcome = resolveActionRoll({ ...base, hopeDie: 8, fearDie: 3, trait: 1, experience: 2, difficulty: 13 });
  assert.equal(outcome.total, 14);
  assert.equal(outcome.success, true);
  assert.deepEqual(resolveRollResources({ hope: 1, stress: 0, fear: 0, experienceCost: 1, reaction: false, outcome }),
    { hope: 1, stress: 0, fear: 0 });
});

test('dificuldade oculta deixa o resultado pendente e reação com Fear não gera recurso', () => {
  const outcome = resolveActionRoll({ ...base, hopeDie: 2, fearDie: 7, difficulty: null, edge: 'disadvantage', edgeDie: 4 });
  assert.equal(outcome.total, 5);
  assert.equal(outcome.success, null);
  assert.deepEqual(resolveRollResources({ hope: 4, stress: 2, fear: 11, experienceCost: 0, reaction: true, outcome }),
    { hope: 4, stress: 2, fear: 11 });
  assert.equal(resolveRollResources({ hope: 4, stress: 2, fear: 12, experienceCost: 0, reaction: false, outcome }).fear, 12);
});

test('proficiência multiplica só os dados, e crítico soma o máximo de cada dado', () => {
  assert.deepEqual(parseWeaponDamage('d8+2'), { die: 8, flat: 2 });
  assert.deepEqual(parseWeaponDamage('d6 físico'), { die: 6, flat: 0 });
  assert.deepEqual(resolveWeaponDamage([3, 7], 8, 2, 1, true),
    { dice: [3, 7], flat: 2, extra: 1, criticalBonus: 16, total: 29 });
});
