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

test('Cobertor reduz Frio 1–2 diretamente e não basta sozinho em Frio 3',()=>{
  const survivor=person(), game=gameWith(survivor);
  const cold=apply(game,survivor,'cold',{level:2});
  const blanket=give(survivor,'Cobertor');
  let usage=conditionUse(game,survivor,blanket,'blanket-cold');
  assert.equal(usage.option.available,true,usage.option.reason);
  assert.equal(usage.result.ok,true,usage.result.message);
  assert.equal(cold.level,1);

  cold.level=3;
  const option=itemActionOptions(game,survivor.id,blanket,false).conditionUses.find(row=>row.effect.id==='blanket-cold');
  assert.ok(option);
  assert.equal(option.available,false);
  assert.match(option.reason,/Frio 3/);
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

test('Molhado é impedido pela proteção equipada apenas para fontes compatíveis',()=>{
  const jacketSurvivor=person('Jaqueta');
  jacketSurvivor.protection='Jaqueta impermeável grossa';
  const jacketGame=gameWith(jacketSurvivor);
  const blocked=conditions.applySurvivorCondition(jacketGame,jacketSurvivor.id,'wet',{wetExposureSource:'heavy-rain'});
  assert.equal(blocked.ok,false);
  assert.equal(blocked.prevented,true);
  assert.equal(conditions.hasCondition(jacketSurvivor,'wet'),false);

  const raincoatSurvivor=person('Capa');
  raincoatSurvivor.outfit='Capa de chuva leve';
  const raincoatGame=gameWith(raincoatSurvivor);
  const common=conditions.applySurvivorCondition(raincoatGame,raincoatSurvivor.id,'wet',{wetExposureSource:'common-rain'});
  assert.equal(common.ok,false);
  assert.equal(common.prevented,true);
  const heavy=conditions.applySurvivorCondition(raincoatGame,raincoatSurvivor.id,'wet',{wetExposureSource:'heavy-rain'});
  assert.equal(heavy.ok,true,heavy.message);
  assert.equal(conditions.hasCondition(raincoatSurvivor,'wet'),true);

  const bootsSurvivor=person('Botas');
  bootsSurvivor.outfit='Botas impermeáveis';
  const bootsGame=gameWith(bootsSurvivor);
  const shallow=conditions.applySurvivorCondition(bootsGame,bootsSurvivor.id,'wet',{wetExposureSource:'shallow-water'});
  assert.equal(shallow.ok,false);
  assert.equal(shallow.prevented,true);
});

test('imersão aplica Molhado mesmo com Jaqueta impermeável grossa',()=>{
  const survivor=person(), game=gameWith(survivor);
  survivor.protection='Jaqueta impermeável grossa';
  const result=conditions.applySurvivorCondition(game,survivor.id,'wet',{wetExposureSource:'immersion'});
  assert.equal(result.ok,true,result.message);
  assert.equal(result.condition.wetExposureSource,'immersion');
});

test('Roupa seca sobressalente remove Molhado, fica Molhada e pode ser seca novamente',()=>{
  const survivor=person(), game=gameWith(survivor);
  apply(game,survivor,'wet',{wetExposureSource:'immersion'});
  const clothes=give(survivor,'Roupa seca sobressalente');
  const {option,result}=conditionUse(game,survivor,clothes,'dry-clothes-wet');
  assert.equal(option.available,true,option.reason);
  assert.equal(result.ok,true,result.message);
  assert.equal(conditions.hasCondition(survivor,'wet'),false);
  const wetClothes=survivor.inventory.find(entry=>entry.name==='Roupa seca sobressalente'&&entry.condition==='Molhada');
  assert.ok(wetClothes);
  const dryResult=performItemAction(game,survivor.id,wetClothes.id,{type:'dry-clothes'});
  assert.equal(dryResult.ok,true,dryResult.message);
  assert.equal(survivor.inventory.some(entry=>entry.name==='Roupa seca sobressalente'&&entry.condition==='Íntegro'),true);
});

test('Bolsa de tratamento lacrada estabiliza Sangramento e é consumida',()=>{
  const survivor=person(), game=gameWith(survivor);
  apply(game,survivor,'bleeding');
  const bag=give(survivor,'Bolsa de tratamento lacrada');
  const {result}=conditionUse(game,survivor,bag,'treatment-bag-bleeding');
  assert.equal(result.ok,true,result.message);
  assert.equal(conditions.hasCondition(survivor,'bleeding'),false);
  assert.equal(survivor.inventory.some(entry=>entry.id===bag.id),false);
});

test('Caixa clínica estabiliza Sangramento e deixa Kit médico de campo',()=>{
  const survivor=person(), game=gameWith(survivor);
  apply(game,survivor,'bleeding');
  const box=give(survivor,'Caixa clínica completa');
  const {result}=conditionUse(game,survivor,box,'clinical-box-bleeding');
  assert.equal(result.ok,true,result.message);
  assert.equal(conditions.hasCondition(survivor,'bleeding'),false);
  assert.equal(survivor.inventory.some(entry=>entry.id===box.id),false);
  assert.equal(survivor.inventory.some(entry=>entry.name==='Kit médico de campo'),true);
});

test('Tala e faixa trata Lesão apenas em braço ou perna',()=>{
  const limb=person('Membro'), limbGame=gameWith(limb);
  const injury=apply(limbGame,limb,'injury',{bodyRegion:'right-leg'});
  const splint=give(limb,'Tala e faixa');
  const limbUse=conditionUse(limbGame,limb,splint,'splint-injury');
  assert.equal(limbUse.result.ok,true,limbUse.result.message);
  assert.equal(injury.treated,true);
  assert.equal(limb.inventory.some(entry=>entry.id===splint.id),false);

  const torso=person('Tronco'), torsoGame=gameWith(torso);
  apply(torsoGame,torso,'injury',{bodyRegion:'torso'});
  const torsoSplint=give(torso,'Tala e faixa');
  const torsoOptions=itemActionOptions(torsoGame,torso.id,torsoSplint,false).conditionUses.filter(row=>row.effect.id==='splint-injury');
  assert.equal(torsoOptions.length,0);
});

test('apoio de equipamento e reidratação aparece como Vantagem de exposição sem acumular fontes',()=>{
  const survivor=person(), game=gameWith(survivor);
  survivor.protection='Casaco acolchoado';
  survivor.outfit='Roupa térmica';
  const cold=apply(game,survivor,'cold',{level:1});
  assert.deepEqual(conditions.exposureAdvantageSources(survivor,cold.id).sort(),['Casaco acolchoado','Roupa térmica'].sort());

  const heat=apply(game,survivor,'heat',{level:1});
  conditions.setExposureAdvantage(game,survivor.id,heat.id,'Sachês de reidratação');
  conditions.setExposureAdvantage(game,survivor.id,heat.id,'Sachês de reidratação');
  assert.deepEqual(conditions.exposureAdvantageSources(survivor,heat.id),['Sachês de reidratação']);
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
  assert.match(inventory,/Secar roupa/);
  assert.match(conditionsUi,/title="Equipamento ativo"/);
  assert.match(conditionsUi,/Fonte da água/);
  assert.match(conditionsUi,/Rolar exposição/);
  assert.match(conditionsUi,/title="Próximo teste de exposição"/);
  assert.match(css,/Catalog items that interact with survivor conditions/);
});
