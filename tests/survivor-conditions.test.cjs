/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner loads TS through the existing CommonJS hook. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, path);

const { defaultState, initialSurvivor, survivorStats, content } = require('../lib/game.ts');
const conditions = require('../lib/survivor-conditions.ts');
const survival = require('../lib/survival.ts');
const { eventMovementIssue } = require('../lib/event-conditions.ts');
const { scheduleSurvivorTravel } = require('../lib/hex-actions.ts');
const { revealSector } = require('../lib/sectors.ts');

function person(name='Ana') {
  const archetype=content.archetypes[0];
  const survivor=initialSurvivor({
    name, origin:content.origins[0].name, past:'', archetype:archetype.name,
    specialty:archetype.specialties[0].name, freeExperience:'Sobrevivência', techniques:[],
    attributes:{Agilidade:2,Força:1,Finesse:1,Instinto:0,Presença:0,Conhecimento:-1},
    primary:'Faca resistente', secondary:'', protection:'Roupa reforçada', personal:'Mochila urbana'
  });
  survivor.hex='0,0';
  return survivor;
}
function gameWith(personValue=person()) {
  const game=defaultState();
  game.survivors=[personValue];
  game.partyHex='0,0';
  game.hexes['0,0'].discovery='explorado';
  return game;
}
function apply(game, survivor, kind, options={}) {
  const result=conditions.applySurvivorCondition(game,survivor.id,kind,options);
  assert.equal(result.ok,true,result.message);
  return result.condition;
}

test('Frio progride por falha, Molhado acelera somente a primeira piora e Falha com Medo marca Estresse',()=>{
  const survivor=person(), game=gameWith(survivor);
  const cold=apply(game,survivor,'cold',{level:1,source:'chuva gelada'});
  const wet=apply(game,survivor,'wet');
  const first=conditions.resolveExposureRoll(game,survivor.id,cold.id,'failure-hope');
  assert.equal(first.ok,true);
  assert.equal(cold.level,3);
  assert.equal(wet.wetColdBoostUsed,true);
  cold.level=1;
  const stressBefore=survivor.stress;
  const second=conditions.resolveExposureRoll(game,survivor.id,cold.id,'failure-fear');
  assert.equal(second.ok,true);
  assert.equal(cold.level,2);
  assert.equal(survivor.stress,stressBefore+1);
});

test('Frio/Calor grave cobram PV somente quando o gatilho grave é resolvido',()=>{
  const survivor=person(), game=gameWith(survivor);
  const cold=apply(game,survivor,'cold',{level:3});
  const max=survivorStats(survivor).hp;
  assert.equal(survivor.hp,0);
  assert.equal(conditions.severeExposureTrigger(game,survivor.id,cold.id),true);
  assert.equal(survivor.hp,1);
  survivor.hp=max;
  conditions.severeExposureTrigger(game,survivor.id,cold.id);
  assert.equal(survivor.hp,max);
});

test('Calor exige duas porções de Água e o encerramento do dia cobra a necessidade restante',()=>{
  const survivor=person(), game=gameWith(survivor);
  survivor.water=2;
  apply(game,survivor,'heat',{level:1});
  assert.equal(conditions.dailyExtraWater(survivor),1);
  assert.equal(survival.requiredDailyProvision(survivor,'water'),2);
  assert.equal(survival.remainingDailyProvisionPortions(game,survivor,'water'),2);
  assert.equal(survival.consumeDailyProvision(game,survivor.id,'water'),true);
  assert.equal(survival.provisionConsumedToday(game,survivor,'water'),false);
  assert.equal(survival.remainingDailyProvisionPortions(game,survivor,'water'),1);
  assert.equal(survival.consumeDailyProvision(game,survivor.id,'water'),true);
  assert.equal(survival.provisionConsumedToday(game,survivor,'water'),true);
  assert.equal(survivor.water,0);
});

test('Calor incompleto no fim do dia gera uma única privação de hidratação e +1 Estresse',()=>{
  const survivor=person(), game=gameWith(survivor);
  survivor.water=1;
  apply(game,survivor,'heat',{level:2});
  survivor.foodConsumedDay=game.day;
  const plan=survival.defaultDayClosePlan(game);
  const entry=plan.survivors.find(row=>row.survivorId===survivor.id);
  entry.water='personal';
  const before=survivor.stress;
  const result=survival.closeDayWithPlan(game,plan);
  assert.equal(result.ok,true);
  assert.equal(result.deprivations.filter(row=>row.survivorId===survivor.id&&row.resource==='water').length,1);
  assert.equal(survivor.stress,before+1);
});

test('Restringido impede viagem e Fratura de perna aumenta em 50% o tempo de deslocamento',()=>{
  const survivor=person(), game=gameWith(survivor);
  revealSector(game,'1,0'); game.hexes['1,0'].discovery='avistado'; game.hexes['1,0'].routeHours=1;
  const restrained=apply(game,survivor,'restrained');
  assert.match(eventMovementIssue(game,[survivor.id]),/Restringido/);
  conditions.removeSurvivorCondition(game,survivor.id,restrained.id);
  apply(game,survivor,'fracture',{bodyRegion:'left-leg'});
  const before=game.minutes;
  const result=scheduleSurvivorTravel(game,'1,0',[survivor.id],'test-fracture-travel');
  assert.equal(result.ok,true,result.message);
  if (result.completed) assert.equal(game.minutes-before,90);
  else {
    const activity=game.activities.find(row=>row.operationId==='test-fracture-travel');
    assert.equal(activity.durationMinutes,90);
  }
});

test('Lesão pode ser forçada por Estresse, agrava em Falha com Medo e Lesão agravada não remove Desvantagem',()=>{
  const survivor=person(), game=gameWith(survivor);
  const injury=apply(game,survivor,'injury',{bodyRegion:'right-arm'});
  assert.equal(conditions.conditionCanDisadvantageRoll(injury),true);
  const before=survivor.stress;
  assert.equal(conditions.useConditionDuringRoll(game,survivor.id,injury.id,{forced:true,failedWithFear:true}),true);
  assert.equal(survivor.stress,before+1);
  assert.equal(injury.aggravated,true);
  assert.match(conditions.conditionRollGuidance(injury),/não pode ser forçada/i);
});

test('Fratura relevante em Falha com Medo marca PV se não imobilizada; imobilização impede esse dano',()=>{
  const survivor=person(), game=gameWith(survivor);
  const fracture=apply(game,survivor,'fracture',{bodyRegion:'left-arm'});
  conditions.useConditionDuringRoll(game,survivor.id,fracture.id,{failedWithFear:true});
  assert.equal(survivor.hp,1);
  assert.equal(conditions.setFractureImmobilized(game,survivor.id,fracture.id,true),true);
  conditions.useConditionDuringRoll(game,survivor.id,fracture.id,{failedWithFear:true});
  assert.equal(survivor.hp,1);
  assert.match(conditions.twoHandedFractureIssue(survivor),/duas mãos/);
});

test('Sangramento persiste após cobrar PV e estabilização remove a condição',()=>{
  const survivor=person(), game=gameWith(survivor);
  const bleeding=apply(game,survivor,'bleeding',{source:'corte profundo'});
  assert.equal(conditions.bleedingTrigger(game,survivor.id,'fim da cena'),true);
  assert.equal(survivor.hp,1);
  assert.equal(conditions.hasCondition(survivor,'bleeding'),true);
  assert.equal(conditions.removeSurvivorCondition(game,survivor.id,bleeding.id,'estabilizado'),true);
  assert.equal(conditions.hasCondition(survivor,'bleeding'),false);
});

test('descansos longos removem Molhado e progridem apenas Lesão tratada e Fratura imobilizada',()=>{
  const survivor=person(), game=gameWith(survivor);
  apply(game,survivor,'wet');
  const injury=apply(game,survivor,'injury',{bodyRegion:'torso'});
  const aggravated=apply(game,survivor,'injury',{bodyRegion:'left-leg'});
  conditions.setInjuryAggravated(game,survivor.id,aggravated.id,true);
  const fracture=apply(game,survivor,'fracture',{bodyRegion:'right-leg'});
  conditions.setInjuryTreated(game,survivor.id,injury.id,true);
  conditions.setInjuryTreated(game,survivor.id,aggravated.id,true);
  conditions.setFractureImmobilized(game,survivor.id,fracture.id,true);

  conditions.processLongRestConditions(game,[survivor.id]);
  assert.equal(conditions.hasCondition(survivor,'wet'),false);
  assert.equal(survivor.conditions.some(row=>row.id===injury.id),false);
  assert.equal(aggravated.recovery,1);
  assert.equal(fracture.recovery,1);

  conditions.processLongRestConditions(game,[survivor.id]);
  assert.equal(survivor.conditions.some(row=>row.id===aggravated.id),false);
  conditions.processLongRestConditions(game,[survivor.id]);
  conditions.processLongRestConditions(game,[survivor.id]);
  assert.equal(survivor.conditions.some(row=>row.id===fracture.id),false);
});

test('Vulnerável e Escondido alteram ataques recebidos e se anulam juntos',()=>{
  const survivor=person(), game=gameWith(survivor);
  const vulnerable=apply(game,survivor,'vulnerable');
  assert.deepEqual(conditions.incomingAttackConditionEdge(survivor),{edge:'advantage',labels:['Vulnerável']});
  const hidden=apply(game,survivor,'hidden');
  assert.deepEqual(conditions.incomingAttackConditionEdge(survivor),{edge:'none',labels:['Vulnerável','Escondido']});
  conditions.removeSurvivorCondition(game,survivor.id,vulnerable.id);
  assert.deepEqual(conditions.incomingAttackConditionEdge(survivor),{edge:'disadvantage',labels:['Escondido']});
  conditions.removeSurvivorCondition(game,survivor.id,hidden.id);
  assert.deepEqual(conditions.incomingAttackConditionEdge(survivor),{edge:'none',labels:[]});
});

test('interface de condições usa marcador compacto, tooltip no mouse/foco e detalhe por clique/toque',()=>{
  const panel=fs.readFileSync(require.resolve('../components/survivor-conditions.tsx'),'utf8');
  const survivorPanel=fs.readFileSync(require.resolve('../components/survivor-panel.tsx'),'utf8');
  const roll=fs.readFileSync(require.resolve('../components/roll-dialog.tsx'),'utf8');
  const conflict=fs.readFileSync(require.resolve('../components/conflict-scene-manager.tsx'),'utf8');
  const css=fs.readFileSync(require.resolve('../app/visual-system.css'),'utf8');

  assert.match(panel,/TooltipTrigger/);
  assert.match(panel,/Clique para ler a regra completa/);
  assert.match(panel,/setSelectedId\(condition\.id\)/);
  assert.match(panel,/Aplicar condição/);
  assert.match(survivorPanel,/SurvivorConditionBadges/);
  assert.match(survivorPanel,/SurvivorConditionPanel/);
  assert.match(roll,/Condições nesta ação/);
  assert.match(roll,/Forçar a Lesão/);
  assert.match(conflict,/incomingAttackConditionEdge/);
  assert.match(css,/Survivor states and conditions/);
  assert.match(css,/@media \(max-width:640px\)/);
});
