/* eslint-disable @typescript-eslint/no-require-imports -- Node tests load TS with the existing CommonJS hook. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, path);

const { content, defaultState, initialSurvivor } = require('../lib/game.ts');
const { itemFromCatalog } = require('../lib/inventory.ts');
const { itemActionOptions, performItemAction } = require('../lib/item-actions.ts');
const conditionItems = require('../lib/condition-item-effects.ts');
const conditions = require('../lib/survivor-conditions.ts');
const survival = require('../lib/survival.ts');

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
function gameWith(survivor=person()) {
  const game=defaultState();
  game.survivors=[survivor];
  game.partyHex='0,0';
  game.hexes['0,0'].discovery='explorado';
  return game;
}
function catalog(name) {
  const entry=content.catalog.find(item=>item.name===name);
  assert.ok(entry, `Item ausente no catálogo: ${name}`);
  return entry;
}
function give(survivor,name,qty=1) {
  const item=itemFromCatalog(catalog(name),qty,'Íntegro',1);
  survivor.inventory.push(item);
  return item;
}
function apply(game,survivor,kind,options={}) {
  const result=conditions.applySurvivorCondition(game,survivor.id,kind,options);
  assert.equal(result.ok,true,result.message);
  return result.condition;
}
function conditionUse(game,survivor,item,effectId) {
  const option=itemActionOptions(game,survivor.id,item,false).conditionUses.find(row=>!effectId || row.effect.id===effectId);
  assert.ok(option,'Uso de condição não disponível');
  return { option, result: performItemAction(game,survivor.id,item.id,{
    type:'condition-use',targetId:option.survivorId,conditionId:option.conditionId,effectId:option.effect.id
  })};
}

test('catálogo possui camada estruturada para a primeira rodada de condições',()=>{
  const names=new Set(conditionItems.conditionItemEffects.map(effect=>effect.item));
  for(const name of [
    'Casaco acolchoado','Roupa térmica','Cobertor','Saco de dormir','Fogareiro',
    'Sachês de reidratação','Bebida isotônica lacrada','Curativo compressivo','Gaze e ataduras',
    'Kit médico de campo','Bolsa de tratamento lacrada','Caixa clínica completa','Tala e faixa'
  ]) assert.equal(names.has(name),true,name);
});

test('Casaco acolchoado e Roupa térmica aparecem como apoio passivo ao Frio quando equipados',()=>{
  const survivor=person();
  survivor.protection='Casaco acolchoado';
  survivor.outfit='Roupa térmica';
  const support=conditionItems.equippedConditionSupport(survivor,'cold');
  assert.deepEqual(support.map(row=>row.item).sort(),['Casaco acolchoado','Roupa térmica'].sort());
});

test('Curativo compressivo estabiliza Sangramento e é consumido',()=>{
  const survivor=person(), game=gameWith(survivor);
  apply(game,survivor,'bleeding');
  const item=give(survivor,'Curativo compressivo');
  const {result}=conditionUse(game,survivor,item,'compression-bleeding');
  assert.equal(result.ok,true,result.message);
  assert.equal(conditions.hasCondition(survivor,'bleeding'),false);
  assert.equal(survivor.inventory.some(entry=>entry.id===item.id),false);
});

test('Gaze e ataduras também estabiliza Sangramento como material consumível',()=>{
  const survivor=person(), game=gameWith(survivor);
  apply(game,survivor,'bleeding');
  const item=give(survivor,'Gaze e ataduras');
  const {result}=conditionUse(game,survivor,item,'gauze-bleeding');
  assert.equal(result.ok,true,result.message);
  assert.equal(conditions.hasCondition(survivor,'bleeding'),false);
  assert.equal(survivor.inventory.some(entry=>entry.id===item.id),false);
});

test('Kit médico trata Lesão consumindo material e permanece reutilizável',()=>{
  const survivor=person(), game=gameWith(survivor);
  const injury=apply(game,survivor,'injury',{bodyRegion:'left-arm'});
  const kit=give(survivor,'Kit médico de campo');
  const gauze=give(survivor,'Gaze e ataduras');
  const {option,result}=conditionUse(game,survivor,kit,'medical-kit-injury');
  assert.equal(option.available,true,option.reason);
  assert.equal(result.ok,true,result.message);
  assert.equal(injury.treated,true);
  assert.equal(survivor.inventory.some(entry=>entry.id===kit.id),true);
  assert.equal(survivor.inventory.some(entry=>entry.id===gauze.id),false);
});

test('Kit médico informa falta de material antes de tratar Lesão',()=>{
  const survivor=person(), game=gameWith(survivor);
  apply(game,survivor,'injury',{bodyRegion:'right-arm'});
  const kit=give(survivor,'Kit médico de campo');
  const option=itemActionOptions(game,survivor.id,kit,false).conditionUses[0];
  assert.ok(option);
  assert.equal(option.available,false);
  assert.match(option.reason,/Gaze e ataduras|Bolsa de tratamento/);
});

test('Caixa clínica trata Lesão, é consumida e deixa Kit médico de campo',()=>{
  const survivor=person(), game=gameWith(survivor);
  const injury=apply(game,survivor,'injury',{bodyRegion:'torso'});
  const box=give(survivor,'Caixa clínica completa');
  const {result}=conditionUse(game,survivor,box,'clinical-box-injury');
  assert.equal(result.ok,true,result.message);
  assert.equal(injury.treated,true);
  assert.equal(survivor.inventory.some(entry=>entry.id===box.id),false);
  assert.equal(survivor.inventory.some(entry=>entry.name==='Kit médico de campo'),true);
});

test('Tala e faixa imobiliza Fratura e fica comprometida no paciente',()=>{
  const survivor=person(), game=gameWith(survivor);
  const fracture=apply(game,survivor,'fracture',{bodyRegion:'left-leg'});
  const splint=give(survivor,'Tala e faixa');
  const {result}=conditionUse(game,survivor,splint,'splint-fracture');
  assert.equal(result.ok,true,result.message);
  assert.equal(fracture.immobilized,true);
  assert.equal(survivor.inventory.some(entry=>entry.id===splint.id),false);
});

test('Saco de dormir reduz Frio em 1 nível quando a recuperação é confirmada',()=>{
  const survivor=person(), game=gameWith(survivor);
  const cold=apply(game,survivor,'cold',{level:2});
  const bag=give(survivor,'Saco de dormir');
  const {result}=conditionUse(game,survivor,bag,'sleeping-bag-cold');
  assert.equal(result.ok,true,result.message);
  assert.equal(cold.level,1);
  assert.equal(survivor.inventory.some(entry=>entry.id===bag.id),true);
});

test('Cobertor prepara Vantagem para a próxima recuperação de Frio',()=>{
  const survivor=person(), game=gameWith(survivor);
  const cold=apply(game,survivor,'cold',{level:2});
  const blanket=give(survivor,'Cobertor');
  const {result}=conditionUse(game,survivor,blanket,'blanket-cold');
  assert.equal(result.ok,true,result.message);
  assert.equal(cold.recoveryAdvantageSource,'Cobertor');
  conditions.reduceExposure(game,survivor.id,cold.id);
  assert.equal(cold.recoveryAdvantageSource,undefined);
});

test('Fogareiro consome Combustível e reduz Frio em 1 nível',()=>{
  const survivor=person(), game=gameWith(survivor);
  const cold=apply(game,survivor,'cold',{level:3});
  const stove=give(survivor,'Fogareiro');
  const fuel=give(survivor,'Combustível (1 unidade)');
  const {option,result}=conditionUse(game,survivor,stove,'stove-cold');
  assert.equal(option.available,true,option.reason);
  assert.equal(result.ok,true,result.message);
  assert.equal(cold.level,2);
  assert.equal(survivor.inventory.some(entry=>entry.id===fuel.id),false);
});

test('Sachê de reidratação usa Água, conta para hidratação e prepara Vantagem contra Calor',()=>{
  const survivor=person(), game=gameWith(survivor);
  const heat=apply(game,survivor,'heat',{level:2});
  survivor.water=1;
  const sachet=give(survivor,'Sachês de reidratação');
  const {option,result}=conditionUse(game,survivor,sachet,'rehydration-heat');
  assert.equal(option.available,true,option.reason);
  assert.equal(result.ok,true,result.message);
  assert.equal(survivor.water,0);
  assert.equal(survivor.waterConsumedDay,game.day);
  assert.equal(heat.exposureAdvantageSource,'Sachês de reidratação');
  assert.equal(survivor.inventory.some(entry=>entry.id===sachet.id),false);
  assert.equal(survival.remainingDailyProvisionPortions(game,survivor,'water'),1);
});

test('Bebida isotônica consumida durante Calor hidrata e prepara Vantagem',()=>{
  const survivor=person(), game=gameWith(survivor);
  const heat=apply(game,survivor,'heat',{level:1});
  const drink=give(survivor,'Bebida isotônica lacrada');
  const result=performItemAction(game,survivor.id,drink.id,{type:'consume'});
  assert.equal(result.ok,true,result.message);
  assert.equal(heat.exposureAdvantageSource,'Bebida isotônica lacrada');
  assert.equal(survivor.waterConsumedDay,game.day);
});

test('resolver exposição consome o apoio temporário de item sem acumular Vantagem',()=>{
  const survivor=person(), game=gameWith(survivor);
  const heat=apply(game,survivor,'heat',{level:2});
  conditions.setExposureAdvantage(game,survivor.id,heat.id,'Sachês de reidratação');
  assert.equal(heat.exposureAdvantageSource,'Sachês de reidratação');
  conditions.resolveExposureRoll(game,survivor.id,heat.id,'success-hope');
  assert.equal(heat.exposureAdvantageSource,undefined);
});

test('interface mostra marcadores e ação específica de condição no inventário',()=>{
  const badges=fs.readFileSync(require.resolve('../components/condition-item-badges.tsx'),'utf8');
  const inventory=fs.readFileSync(require.resolve('../components/inventory-workflow.tsx'),'utf8');
  const conditionsUi=fs.readFileSync(require.resolve('../components/survivor-conditions.tsx'),'utf8');
  const css=fs.readFileSync(require.resolve('../app/visual-system.css'),'utf8');
  assert.match(badges,/Interações com condições/);
  assert.match(badges,/TooltipContent/);
  assert.match(inventory,/Aplicar à condição/);
  assert.match(inventory,/ConditionItemBadges/);
  assert.match(inventory,/selectedConditionUse/);
  assert.match(conditionsUi,/EQUIPAMENTO ATIVO/);
  assert.match(conditionsUi,/PRÓXIMO TESTE DE EXPOSIÇÃO/);
  assert.match(css,/Catalog items that interact with survivor conditions/);
});
