/* eslint-disable @typescript-eslint/no-require-imports -- Node tests load TS with the existing CommonJS hook. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, path);

const { defaultState, initialSurvivor, content: gameContent } = require('../lib/game.ts');
const { itemFromCatalog } = require('../lib/inventory.ts');
const { applyPlayerAction } = require('../lib/player-actions.ts');
const { applySurvivorCondition } = require('../lib/survivor-conditions.ts');
const { projectPlayerGame, playerEditPayload, applyPlayerChange } = require('../lib/collaboration.ts');

let serial=0;
function fixture() {
  const game=defaultState();
  const archetype=gameContent.archetypes[0];
  const actor=initialSurvivor({
    name:'Nina',origin:gameContent.origins[0].name,past:'',archetype:archetype.name,
    specialty:archetype.specialties[0].name,freeExperience:'Sobrevivência',techniques:[],
    attributes:{Agilidade:2,Força:1,Finesse:1,Instinto:0,Presença:0,Conhecimento:-1},
    primary:'',secondary:'',protection:'',personal:''
  });
  actor.hex='0,0';actor.inventory=[];actor.hope=3;
  game.survivors=[actor];
  return {game,actorId:actor.id};
}
function action(f,body,die=()=>1) {
  const result=applyPlayerAction(f.game,f.actorId,{id:`condition-sync-${++serial}`,day:f.game.day,...body},die);
  if(result.ok) f.game=result.state;
  return result;
}
function actor(f){return f.game.survivors.find(person=>person.id===f.actorId);}
function catalog(name){const entry=gameContent.catalog.find(item=>item.name===name);assert.ok(entry,name);return entry;}

test('consumo de isotônico pelo comando do jogador persiste Vantagem no Calor',()=>{
  const f=fixture();
  const applied=applySurvivorCondition(f.game,f.actorId,'heat',{level:1});
  assert.equal(applied.ok,true);
  const drink=itemFromCatalog(catalog('Bebida isotônica lacrada'),1,'Íntegro',f.game.day);
  actor(f).inventory.push(drink);
  const result=action(f,{type:'item-action',itemId:drink.id,action:{type:'consume'}});
  assert.equal(result.ok,true,result.error);
  const heat=actor(f).conditions.find(condition=>condition.kind==='heat');
  assert.equal(heat.exposureAdvantageSource,'Bebida isotônica lacrada');
  assert.equal(actor(f).waterConsumedDay,f.game.day);
  assert.equal(actor(f).inventory.some(item=>item.id===drink.id),false);
  assert.equal(projectPlayerGame(f.game,f.actorId).survivors[0].conditions.find(condition=>condition.kind==='heat').exposureAdvantageSource,'Bebida isotônica lacrada');
});

test('hidratação solta do jogador registra corretamente a segunda porção exigida por Calor',()=>{
  const f=fixture();
  assert.equal(applySurvivorCondition(f.game,f.actorId,'heat',{level:1}).ok,true);
  actor(f).water=2;
  let result=action(f,{type:'consume-loose',resource:'water'});
  assert.equal(result.ok,true,result.error);
  assert.equal(actor(f).waterConsumedDay,f.game.day);
  assert.equal(actor(f).extraWaterConsumedDay,undefined);
  result=action(f,{type:'consume-loose',resource:'water'});
  assert.equal(result.ok,true,result.error);
  assert.equal(actor(f).extraWaterConsumedDay,f.game.day);
  assert.equal(actor(f).water,0);
  const third=action(f,{type:'consume-loose',resource:'water'});
  assert.equal(third.ok,false);
  assert.match(third.error,/necessidade diária/);
});

test('teste de exposição do jogador usa Vantagem automática no servidor e consome o apoio temporário',()=>{
  const f=fixture();
  const applied=applySurvivorCondition(f.game,f.actorId,'heat',{level:1});
  assert.equal(applied.ok,true);
  applied.condition.exposureAdvantageSource='Bebida isotônica lacrada';
  const dice=[6,4,5];
  const result=action(f,{
    type:'roll-exposure',conditionId:applied.condition.id,trait:'Força',difficulty:12,
    experiences:[],edge:'none',other:0,conditionIds:[],forcedConditionIds:[]
  },()=>dice.shift());
  assert.equal(result.ok,true,result.error);
  const heat=actor(f).conditions.find(condition=>condition.kind==='heat');
  assert.equal(heat.exposureAdvantageSource,undefined);
  assert.equal(heat.level,1);
  assert.equal(actor(f).hope,4);
  assert.ok(f.game.log.some(log=>log.kind==='dados'&&/Bebida isotônica lacrada/.test(log.text)&&/\+ d6\(5\)/.test(log.text)));
});

test('Vantagem automática e Desvantagem situacional se anulam sem lançar d6',()=>{
  const f=fixture();
  const applied=applySurvivorCondition(f.game,f.actorId,'heat',{level:1});
  assert.equal(applied.ok,true);
  applied.condition.exposureAdvantageSource='Sachês de reidratação';
  const faces=[];
  const result=action(f,{
    type:'roll-exposure',conditionId:applied.condition.id,trait:'Força',difficulty:8,
    experiences:[],edge:'disadvantage',other:0,conditionIds:[],forcedConditionIds:[]
  },facesCount=>{faces.push(facesCount);return facesCount===12?6:1;});
  assert.equal(result.ok,true,result.error);
  assert.deepEqual(faces,[12,12]);
  assert.ok(f.game.log.some(log=>log.kind==='dados'&&/Apoio de exposição: Sachês de reidratação/.test(log.text)));
});

test('pausa de exploração não bloqueia consumo pessoal nem teste de exposição',()=>{
  const f=fixture();
  const applied=applySurvivorCondition(f.game,f.actorId,'heat',{level:1});
  assert.equal(applied.ok,true);
  f.game.playerActions={policy:{paused:true,transfers:false,deposits:false,rest:false,tokens:false,areas:[],routes:[],supplies:{food:0,water:0,items:{}}},operations:[],receipts:[],withdrawals:[],markers:[]};
  actor(f).water=1;
  const hydration=action(f,{type:'consume-loose',resource:'water'});
  assert.equal(hydration.ok,true,hydration.error);
  const dice=[7,3];
  const exposure=action(f,{type:'roll-exposure',conditionId:applied.condition.id,trait:'Força',difficulty:8,experiences:[],edge:'none'},()=>dice.shift());
  assert.equal(exposure.ok,true,exposure.error);
});

test('jogador continua sem permissão para editar conditions diretamente',()=>{
  const f=fixture();
  const applied=applySurvivorCondition(f.game,f.actorId,'heat',{level:1});
  assert.equal(applied.ok,true);
  const before=projectPlayerGame(f.game,f.actorId);
  const after=structuredClone(before);
  after.survivors[0].conditions[0].exposureAdvantageSource='forjado pelo cliente';
  const payload=playerEditPayload(before,after);
  assert.ok(payload);
  const forged=applyPlayerChange(f.game,f.actorId,payload.before,payload.after,
    payload.fearDelta,payload.logs,payload.noiseDelta,payload.shelterWorkActions);
  assert.equal(forged,null);
});

test('interface envia consumo sensível e exposição pelos comandos controlados do servidor',()=>{
  const inventory=fs.readFileSync(require.resolve('../components/inventory-workflow.tsx'),'utf8');
  const context=fs.readFileSync(require.resolve('../components/item-context-menu.tsx'),'utf8');
  const roll=fs.readFileSync(require.resolve('../components/roll-dialog.tsx'),'utf8');
  const survivor=fs.readFileSync(require.resolve('../components/survivor-panel.tsx'),'utf8');
  assert.match(inventory,/type: "item-action"/);
  assert.match(context,/type: "item-action"/);
  assert.match(roll,/type: "roll-exposure"/);
  assert.match(survivor,/type: "consume-loose"/);
  assert.match(survivor,/playerActions=\{playerActions\}/);
});
