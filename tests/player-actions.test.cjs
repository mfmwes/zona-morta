/* eslint-disable @typescript-eslint/no-require-imports -- existing Node test loader */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, path);
const { defaultState, initialSurvivor, content } = require('../lib/game.ts');
const { assignCustomSector } = require('../lib/sectors.ts');
const { prepareLocation, registerVisibleStock, searchAreaSessionState, startSearch } = require('../lib/hex-automation.ts');
const { applyPlayerAction, projectPlayerActions, setPlayerPolicy, playerActionState } = require('../lib/player-actions.ts');
const { validPlayerActionState } = require('../lib/player-actions-types.ts');
const { projectPlayerGame } = require('../lib/collaboration.ts');
const { itemFromCatalog } = require('../lib/inventory.ts');
const { createSceneBoardScene, createSceneBoardObject } = require('../lib/scene-board.ts');
const { requestTableRest, currentTableRest, tableRestReadyForNight } = require('../lib/table-rest.ts');
let serial = 0;
function fixture() {
  const game = defaultState();
  game.survivors = ['Nina','Bia','Leo'].map(name => {
    const a = content.archetypes[0];
    const person = initialSurvivor({ name, origin: content.origins[1].name, past:'', archetype:a.name, specialty:a.specialties[0].name, freeExperience:'Resgates', techniques:[], attributes:{Agilidade:2,Força:1,Finesse:1,Instinto:0,Presença:0,Conhecimento:-1}, primary:'',secondary:'',protection:'',personal:'' });
    person.hex='0,0'; person.inventory=[]; person.hope=3; return person;
  });
  assignCustomSector(game,'0,0','Bairro residencial','explorado');
  game.hexes['0,0'].events=[];
  game.hexes['0,0'].points=[{id:'market',name:'Mercado',kind:'comércio',signal:'Porta aberta',access:'SEGREDO: vigia',notes:'SEGREDO: armadilha',revealed:true,lootTable:content.lootTables[1].name,searches:[]}];
  const point=game.hexes['0,0'].points[0]; prepareLocation(point);
  const area=point.preparation.areas[0]; area.access='open'; area.noise=0; area.minutes=30;
  const policy=playerActionState(game).policy;
  policy.areas=[{hexId:'0,0',pointId:point.id,areaId:area.id,objectives:['open','food']}];
  policy.transfers=true; policy.deposits=true; policy.rest=true; policy.tokens=true;
  game.playerActions={policy,operations:[],receipts:[],withdrawals:[],markers:[]};
  return {game, areaId:area.id, ids:game.survivors.map(p=>p.id)};
}
function command(f, actor, body, die=()=>1) {
  const input={id:`cmd-${++serial}`,day:f.game.day,...body};
  const result=applyPlayerAction(f.game,actor,input,die);
  if(result.ok) f.game=result.state;
  return {...result,input};
}
function ok(f, actor, body, die) { const r=command(f,actor,body,die); assert.equal(r.ok,true,r.error); assert.equal(validPlayerActionState(f.game.playerActions),true); return r; }
function denied(f,actor,body,pattern) { const before=structuredClone(f.game); const r=command(f,actor,body); assert.equal(r.ok,false); if(pattern) assert.match(r.error,pattern); assert.deepEqual(f.game,before); return r; }
function propose(f) { return ok(f,f.ids[0],{type:'search',hexId:'0,0',pointId:'market',areaId:f.areaId,objective:'open',purpose:'Suprimentos'}).input.id; }
function catalogItem(qty=3) { return itemFromCatalog(content.catalog.find(e=>e.name==='Faca resistente')??content.catalog[0],qty); }

test('descanso solicitado pelo mestre recebe escolhas individuais e conclui uma única vez',()=>{
 const f=fixture(); f.game.playerActions.policy.rest=false;
 assert.equal(requestTableRest(f.game,'short'),null);
 const op=currentTableRest(f.game), before=f.game.minutes;
 assert.deepEqual(op.participantIds,[]);assert.deepEqual(op.plans,{});
 const publicView=projectPlayerGame(f.game,f.ids[0]);assert.equal(publicView.publicPlayerActions.operations[0].plans,undefined);
 for(const id of f.ids.slice(0,2)) {
  ok(f,id,{type:'confirm-rest',operationId:op.id,choices:[{action:'prepare',targetId:id},{action:'fiction',targetId:id}]});
  assert.equal(f.game.minutes,before);assert.equal(f.game.shortRest,1);
 }
 const final=ok(f,f.ids[2],{type:'confirm-rest',operationId:op.id,choices:[{action:'prepare',targetId:f.ids[2]},{action:'fiction',targetId:f.ids[2]}]});
 assert.equal(f.game.minutes,before+60);assert.equal(f.game.shortRest,2);
 assert.ok(f.game.survivors.every(p=>!p.restPlan));assert.equal(currentTableRest(f.game),undefined);
 const saved=structuredClone(f.game);assert.equal(applyPlayerAction(f.game,f.ids[2],final.input).replay,true);assert.deepEqual(f.game,saved);
 denied(f,f.ids[2],{type:'confirm-rest',operationId:op.id,choices:final.input.choices},/terminou/);
});

test('jogador solicita descanso sem escolhas antecipadas; confirma somente a própria ficha',()=>{
 const f=fixture();f.game.playerActions.policy.rest=false;
 ok(f,f.ids[0],{type:'request-rest',kind:'short'});const op=currentTableRest(f.game);
 assert.deepEqual(op.participantIds,[]);assert.equal(op.initiatorId,f.ids[0]);
 denied(f,f.ids[1],{type:'confirm-rest',operationId:op.id,actorId:f.ids[0],choices:[{action:'prepare',targetId:f.ids[1]},{action:'fiction',targetId:f.ids[1]}]},/inválidos/);
 denied(f,f.ids[1],{type:'confirm-rest',operationId:op.id,choices:[{action:'hp-full',targetId:f.ids[1]},{action:'fiction',targetId:f.ids[1]}]},/válidas/);
 f.game.survivors[2].hex='1,0';
 denied(f,f.ids[1],{type:'confirm-rest',operationId:op.id,choices:[{action:'hp',targetId:f.ids[2]},{action:'fiction',targetId:f.ids[1]}]},/mesmo hex/);
 assert.equal(f.game.survivors[0].restPlan,undefined);
 ok(f,f.ids[1],{type:'confirm-rest',operationId:op.id,choices:[{action:'hp',targetId:f.ids[0]},{action:'fiction',targetId:f.ids[1]}]});
 assert.deepEqual(currentTableRest(f.game).participantIds,[f.ids[1]]);
});

test('descanso noturno preserva confirmações e espera Encerrar dia sem antecipar benefícios',()=>{
 const f=fixture();f.game.minutes=22*60;
 assert.equal(requestTableRest(f.game,'long'),null);const op=currentTableRest(f.game);
 for(const id of f.ids) ok(f,id,{type:'confirm-rest',operationId:op.id,choices:[{action:'hp-full',targetId:id},{action:'stress-full',targetId:id}]});
 assert.equal(f.game.minutes,22*60);assert.equal(f.game.longRest,1);
 assert.equal(currentTableRest(f.game).awaitingNight,true);assert.equal(tableRestReadyForNight(f.game),true);
 f.game.survivors[0].restPlan.choices[0].action='prepare';assert.equal(tableRestReadyForNight(f.game),false);
});

test('busca automática mantém presença, bloqueio, objetivos plausíveis e uma tentativa por área',()=>{
 const f=fixture();f.game.playerActions.policy.areas=[];
 f.game.survivors[1].hex='1,0';
 denied(f,f.ids[1],{type:'search',hexId:'0,0',pointId:'market',areaId:f.areaId,objective:'open',purpose:'Suprimentos'},/disponível/);
 const area=f.game.hexes['0,0'].points[0].preparation.areas[0];area.searchable=false;
 denied(f,f.ids[0],{type:'search',hexId:'0,0',pointId:'market',areaId:f.areaId,objective:'open',purpose:'Suprimentos'},/disponível/);
 area.searchable=true;const op=propose(f);ok(f,f.ids[0],{type:'execute',operationId:op});
 denied(f,f.ids[0],{type:'search',hexId:'0,0',pointId:'market',areaId:f.areaId,objective:'open',purpose:'Outra busca'},/disponível/);
});

test('buscas não exigem liberação e parâmetros forjados ou dias antigos não modificam a campanha',()=>{
 const f=fixture(); f.game.playerActions.policy.areas=[];
 assert.ok(projectPlayerActions(f.game,f.ids[0]).areas.some(a=>a.areaId===f.areaId));
 ok(f,f.ids[0],{type:'search',hexId:'0,0',pointId:'market',areaId:f.areaId,objective:'open',purpose:'Suprimentos'});
 denied(f,f.ids[0],{type:'request',text:'Ajuda',actorId:f.ids[1]},/inválidos/);
 denied(f,f.ids[0],{type:'request',text:'Ajuda',day:f.game.day+1},/dia/);
 denied(f,'intruso',{type:'request',text:'Ajuda'},/ficha/);
 denied(f,f.ids[0],{type:'withdraw',resource:'food',quantity:-1},/inválidos/);
});

test('jogador prepara automaticamente local revelado sem depender de ação do mestre',()=>{
 const f=fixture(); const point=f.game.hexes['0,0'].points[0]; delete point.preparation;
 let view=projectPlayerActions(f.game,f.ids[0]);
 assert.equal(view.locations[0].prepared,false);assert.equal(view.areas.length,0);
 ok(f,f.ids[0],{type:'prepare-search',hexId:'0,0',pointId:'market'});
 assert.ok(f.game.hexes['0,0'].points[0].preparation);
 assert.ok(f.game.hexes['0,0'].points[0].preparation.areas.every(area=>area.visibleOutcome==='item'||area.visibleOutcome==='none'));
 view=projectPlayerActions(f.game,f.ids[0]);
 assert.equal(view.locations[0].prepared,true);assert.ok(view.areas.length>0);
 assert.ok(view.areas.every(area=>area.visibleOutcome==='item'||area.visibleOutcome==='none'));
 assert.equal(f.game.log.some(entry=>entry.kind==='equipe'&&entry.text.includes('ação da equipe')),false);
 const other=fixture();delete other.game.hexes['0,0'].points[0].preparation;other.game.survivors[0].hex='1,0';
 denied(other,other.ids[0],{type:'prepare-search',hexId:'0,0',pointId:'market'},/disponível/);
});

test('item aparente em área narrativa é público e pode ser recolhido pelo jogador',()=>{
 const f=fixture();const point=f.game.hexes['0,0'].points[0];
 const area=point.preparation.areas.find(row=>row.searchable===false);assert.ok(area);
 area.access='open';area.collectible=true;
 assert.equal(registerVisibleStock(f.game,'0,0','market',area.id,'visible-narrative-player','Bebidas::Garrafa de água lacrada',1),null);
 const view=projectPlayerActions(f.game,f.ids[0]);
 const visible=view.stock.find(row=>row.stockId==='visible-narrative-player');
 assert.ok(visible);assert.equal(visible.source,'apparent');assert.equal(visible.accessible,true);
 ok(f,f.ids[0],{type:'collect',hexId:'0,0',pointId:'market',stockId:'visible-narrative-player',quantity:1});
 assert.ok(f.game.survivors[0].inventory.some(item=>item.name==='Garrafa de água lacrada'));
});

test('jogador pode executar busca profunda plausível sem liberação manual do mestre',()=>{
 const f=fixture();const normal=propose(f);ok(f,f.ids[0],{type:'execute',operationId:normal});
 let view=projectPlayerActions(f.game,f.ids[0]);const area=view.areas.find(row=>row.areaId===f.areaId);
 assert.equal(area.state,'deep-available');
 const focus=area.objectives.find(value=>value!=='open');assert.ok(focus,'A área de teste precisa oferecer um foco plausível');
 const deep=ok(f,f.ids[0],{type:'deep-search',hexId:'0,0',pointId:'market',areaId:f.areaId,objective:focus,purpose:'Vasculhar melhor'}).input.id;
 assert.equal(f.game.playerActions.operations.find(op=>op.id===deep).depth,'deep');
 ok(f,f.ids[0],{type:'execute',operationId:deep});
 const attempt=f.game.hexes['0,0'].points[0].preparation.attempts.find(row=>row.id===deep);
 assert.equal(attempt.kind,'deep');assert.equal(attempt.status,'pending');
 const dice=[12,1];ok(f,f.ids[0],{type:'roll-access',operationId:deep,trait:'Instinto',experiences:[]},()=>dice.shift());
 assert.equal(f.game.hexes['0,0'].points[0].preparation.attempts.find(row=>row.id===deep).status,'completed');
 view=projectPlayerActions(f.game,f.ids[0]);assert.ok(['exhausted','searched'].includes(view.areas.find(row=>row.areaId===f.areaId).state));
});
test('projeção mostra somente autorização local e não vaza preparação, tabela, dificuldade ou fichas dos colegas',()=>{
 const f=fixture(); f.game.hexes['0,0'].points[0].preparation.areas[0].difficulty=99;
 const own=projectPlayerGame(f.game,f.ids[0]);
 assert.equal(own.playerActions,undefined); assert.equal(own.survivors.length,1);
 assert.equal(own.publicPlayerActions.areas.length,f.game.hexes['0,0'].points[0].preparation.areas.length); assert.equal(own.hexes['0,0'].points[0].preparation,undefined);
 assert.equal(own.publicPlayerActions.locations[0].prepared,true); assert.equal(own.publicPlayerActions.locations[0].areaCount,f.game.hexes['0,0'].points[0].preparation.areas.length);
 const text=JSON.stringify(own.publicPlayerActions); assert.equal(text.includes('difficulty'),false); assert.equal(text.includes('lootTable'),false); assert.equal(text.includes('SEGREDO'),false);
 f.game.hexes['0,0'].points[0].revealed=false; assert.equal(projectPlayerActions(f.game,f.ids[0]).areas.length,0);
});
test('proposta do jogador reserva o cômodo para mestre e demais jogadores até iniciar ou cancelar',()=>{
 const f=fixture();const op=propose(f);
 const point=f.game.hexes['0,0'].points[0],area=point.preparation.areas.find(row=>row.id===f.areaId);
 let view=projectPlayerActions(f.game,f.ids[1]);
 assert.equal(view.areas.find(row=>row.areaId===f.areaId).state,'proposed');
 assert.equal(view.areas.find(row=>row.areaId===f.areaId).available,false);
 assert.equal(view.locations[0].activeSearches,1);
 assert.equal(searchAreaSessionState(f.game,'0,0','market',area),'proposed');
 const before=structuredClone(f.game);
 assert.match(startSearch(f.game,{id:'master-race',hexId:'0,0',pointId:'market',areaId:f.areaId,participants:[f.ids[1]],mode:'open',objective:'Vasculhar',purpose:'Busca concorrente'}),/Já existe uma busca proposta/);
 assert.deepEqual(f.game,before);
 ok(f,f.ids[0],{type:'leave',operationId:op});
 view=projectPlayerActions(f.game,f.ids[1]);
 assert.equal(view.areas.find(row=>row.areaId===f.areaId).state,'available');
 assert.equal(startSearch(f.game,{id:'master-after-cancel',hexId:'0,0',pointId:'market',areaId:f.areaId,participants:[f.ids[1]],mode:'open',objective:'Vasculhar',purpose:'Busca após cancelamento'}),null);
});

test('busca usa somente participantes confirmados, impede propostas duplicadas e reenvio não duplica achados ou tempo',()=>{
 const f=fixture(); const op=propose(f); const before=structuredClone(f.game);
 denied(f,f.ids[1],{type:'search',hexId:'0,0',pointId:'market',areaId:f.areaId,objective:'open',purpose:'Outra'},/Já existe/);
 ok(f,f.ids[1],{type:'join',operationId:op});
 denied(f,f.ids[1],{type:'execute',operationId:op},/quem propôs/);
 const r=ok(f,f.ids[0],{type:'execute',operationId:op});
 const p=f.game.hexes['0,0'].points[0]; assert.equal(p.preparation.attempts[0].participants.length,2);
 assert.equal(p.preparation.attempts[0].status,'completed'); assert.ok(p.preparation.stock.length);
 assert.equal(f.game.playerActions.operations[0].status,'done');
 assert.equal(f.game.survivors[2].availableAt,before.survivors[2].availableAt);
 const saved=structuredClone(f.game); const replay=applyPlayerAction(f.game,f.ids[0],r.input,()=>{throw Error('Rolagem duplicada');});
 assert.equal(replay.ok,true); assert.equal(replay.replay,true); assert.deepEqual(replay.state,saved);
 denied(f,f.ids[0],{id:r.input.id,type:'request',text:'Reusar id'},/identificador/);
});
test('coleta consome estoque real, aceita reenvio seguro e rejeita retirada maior que o achado',()=>{
 const f=fixture(); const op=propose(f); ok(f,f.ids[0],{type:'execute',operationId:op});
 const stock=f.game.hexes['0,0'].points[0].preparation.stock[0]; const amount=stock.remaining;
 const r=ok(f,f.ids[0],{type:'collect',hexId:'0,0',pointId:'market',stockId:stock.id,quantity:amount});
 assert.equal(f.game.hexes['0,0'].points[0].preparation.stock[0].remaining,0); assert.ok(f.game.survivors[0].inventory.length);
 assert.equal(applyPlayerAction(f.game,f.ids[0],r.input).replay,true);
 denied(f,f.ids[1],{type:'collect',hexId:'0,0',pointId:'market',stockId:stock.id,quantity:1});
});
test('teste de acesso rola no servidor, falha cobra tempo e Medo preserva achados do sucesso e pausa para o mestre',()=>{
 for(const success of [false,true]) {
  const f=fixture(); const area=f.game.hexes['0,0'].points[0].preparation.areas[0]; area.access='risk'; area.difficulty=success?2:99;
  const op=propose(f); ok(f,f.ids[0],{type:'execute',operationId:op});
  denied(f,f.ids[0],{type:'roll-access',operationId:op,trait:'Instinto',experiences:[],hope:12},/inválidos/);
  const dice=[2,10,1]; ok(f,f.ids[0],{type:'roll-access',operationId:op,trait:'Instinto',experiences:[]},()=>dice.shift());
  const prep=f.game.hexes['0,0'].points[0].preparation;
  assert.equal(prep.attempts[0].status,success?'completed':'failed'); assert.equal(prep.stock.length>0,success);
  assert.equal(f.game.playerActions.policy.paused,true); assert.match(f.game.playerActions.operations[0].attention,/Medo/);
  denied(f,f.ids[0],{type:'travel',destination:'1,0'},/pausadas/);
 }
});
test('entrega exige destinatário presente, confirmação própria e estoque inalterado; recusa reverte a mutação',()=>{
 const f=fixture(); const item=catalogItem(); f.game.survivors[0].inventory=[item];
 const op=ok(f,f.ids[0],{type:'offer',targetId:f.ids[1],itemId:item.id,quantity:1}).input.id;
 assert.equal(f.game.survivors[0].inventory[0].qty,3);
 denied(f,f.ids[2],{type:'join',operationId:op},/destinatário/);
 ok(f,f.ids[1],{type:'join',operationId:op}); assert.equal(f.game.survivors[0].inventory[0].qty,2); assert.equal(f.game.survivors[1].inventory[0].qty,1);
 const second=ok(f,f.ids[0],{type:'offer',targetId:f.ids[1],itemId:item.id,quantity:1}).input.id;
 f.game.survivors[0].inventory[0].qty=1;
 denied(f,f.ids[1],{type:'join',operationId:second},/mudou/);
});
test('retirada respeita cota por pessoa e dia; devolver ou alterar permissões não renova a cota',()=>{
 const f=fixture(); f.game.shelter.active=true; f.game.shelter.hex='0,0'; f.game.shelter.food=10; f.game.playerActions.policy.supplies.food=2;
 ok(f,f.ids[0],{type:'withdraw',resource:'food',quantity:2});
 assert.equal(f.game.shelter.food,8); assert.equal(f.game.playerActions.withdrawals[0].quantity,2);
 denied(f,f.ids[0],{type:'withdraw',resource:'food',quantity:1},/diária/);
 f.game=setPlayerPolicy(f.game,{...f.game.playerActions.policy,transfers:false});
 assert.equal(projectPlayerActions(f.game,f.ids[0]).supplies.find(s=>s.key==='food').allowance,0);
 ok(f,f.ids[1],{type:'withdraw',resource:'food',quantity:2});
 f.game.day++; ok(f,f.ids[0],{type:'withdraw',resource:'food',quantity:2});
 assert.equal(f.game.playerActions.withdrawals.filter(w=>w.actorId===f.ids[0]).length,1);
});
test('depósito requer presença e liberação, e não pode retirar itens dos colegas',()=>{
 const f=fixture(); const item=catalogItem(); f.game.survivors[0].inventory=[item]; f.game.shelter.active=true; f.game.shelter.hex='0,0';
 denied(f,f.ids[1],{type:'deposit',itemId:item.id,quantity:1});
 ok(f,f.ids[0],{type:'deposit',itemId:item.id,quantity:1}); assert.equal(f.game.shelter.inventory[0].qty,1);
 f.game.survivors[0].hex='1,0'; denied(f,f.ids[0],{type:'deposit',itemId:item.id,quantity:1},/acessível/);
});
test('viagem usa rota liberada e move somente quem confirmou',()=>{
 const f=fixture(); assignCustomSector(f.game,'1,0','Bairro residencial','explorado'); f.game.hexes['1,0'].events=[];
 denied(f,f.ids[0],{type:'travel',destination:'1,0'},/liberada/);
 f.game.playerActions.policy.routes=[{from:'0,0',to:'1,0'}];
 const op=ok(f,f.ids[0],{type:'travel',destination:'1,0'}).input.id;
 ok(f,f.ids[1],{type:'join',operationId:op}); ok(f,f.ids[0],{type:'execute',operationId:op});
 assert.equal(f.game.survivors[0].hex,'1,0'); assert.equal(f.game.survivors[1].hex,'1,0'); assert.equal(f.game.survivors[2].hex,'0,0');
 denied(f,f.ids[0],{type:'travel',destination:'0,0'},/liberada/);
});
test('descanso preserva a regra da mesa inteira, exige confirmação de todos e rejeita escolhas alteradas',()=>{
 const f=fixture(); for(const person of f.game.survivors) person.restPlan={kind:'short',choices:[{action:'prepare',targetId:person.id},{action:'fiction',targetId:person.id}]};
 const op=ok(f,f.ids[0],{type:'rest',kind:'short'}).input.id;
 denied(f,f.ids[0],{type:'execute',operationId:op},/Todos/);
 ok(f,f.ids[1],{type:'join',operationId:op}); ok(f,f.ids[2],{type:'join',operationId:op});
 f.game.survivors[1].restPlan.choices[0].action='hp'; denied(f,f.ids[0],{type:'execute',operationId:op},/escolhas mudaram/);
 f.game.survivors[1].restPlan.choices[0].action='prepare';
 const r=ok(f,f.ids[0],{type:'execute',operationId:op});
 assert.ok(f.game.survivors.every(p=>!p.restPlan)); assert.equal(f.game.shortRest,2);
 assert.equal(applyPlayerAction(f.game,f.ids[0],r.input).replay,true);
});
test('token limita movimento ao próprio objeto desbloqueado e à área revelada; marcadores são próprios',()=>{
 const f=fixture(); const scene=createSceneBoardScene('Mercado'); scene.visibleToPlayers=true; scene.fogEnabled=true; scene.revealedAreas=[{id:'fog',x:0,y:0,width:300,height:300}];
 const token=createSceneBoardObject('token','Nina'); Object.assign(token,{x:20,y:20,width:40,height:40,tokenKind:'survivor',refId:f.ids[0],visibleToPlayers:true}); scene.objects=[token]; f.game.sceneBoard={scenes:[scene],activeSceneId:scene.id};
 const move={type:'token',sceneId:scene.id,objectId:token.id,beforeX:20,beforeY:20,x:40,y:40};
 denied(f,f.ids[1],move); denied(f,f.ids[0],{...move,x:280},/revelada/);
 ok(f,f.ids[0],move); denied(f,f.ids[0],move,/mudou/);
 ok(f,f.ids[0],{type:'marker',sceneId:scene.id,x:100,y:100,label:'Olhem aqui'});
 ok(f,f.ids[0],{type:'marker',sceneId:scene.id,x:120,y:100,label:'Aqui'}); assert.equal(f.game.playerActions.markers.length,1);
 ok(f,f.ids[1],{type:'clear-marker'}); assert.equal(f.game.playerActions.markers.length,1);
 f.game.sceneBoard.scenes[0].revealedAreas=[]; assert.equal(projectPlayerActions(f.game,f.ids[0]).markers.length,0);
});
test('conflito e revogação bloqueiam operações propostas; falha preserva toda a campanha',()=>{
 const f=fixture(); const op=propose(f); f.game.conflict={active:true}; denied(f,f.ids[0],{type:'execute',operationId:op},/conflito/);
 delete f.game.conflict; f.game.hexes['0,0'].points[0].preparation.areas[0].access='blocked'; denied(f,f.ids[0],{type:'execute',operationId:op},/acesso/);
});

test('sobrecarga rejeita entrega e retirada sem perder itens do remetente ou do depósito',()=>{
 const f=fixture(); const item=catalogItem(); f.game.survivors[0].inventory=[item];
 f.game.survivors[1].inventory=[{id:'heavy',name:'Carga pesada',qty:1,load:999,condition:'Íntegro'}];
 const op=ok(f,f.ids[0],{type:'offer',targetId:f.ids[1],itemId:item.id,quantity:1}).input.id;
 denied(f,f.ids[1],{type:'join',operationId:op},/capacidade/);
 f.game.shelter.active=true; f.game.shelter.hex='0,0'; f.game.shelter.inventory=[catalogItem(2)];
 const shared=f.game.shelter.inventory[0]; f.game.playerActions.policy.supplies.items[shared.id]=2;
 denied(f,f.ids[1],{type:'withdraw',resource:'item',itemId:shared.id,quantity:1},/capacidade/);
 assert.equal(f.game.shelter.inventory[0].qty,2); assert.equal(f.game.playerActions.withdrawals.length,0);
});
test('confirmar uma operação antes do limite diário ainda permite sua conclusão',()=>{
 const f=fixture(); const op=propose(f);
 const original=f.game.playerActions.operations[0];
 for(let i=1;i<150;i++) f.game.playerActions.operations.push({...original,id:`past-${i}`,status:'cancelled'});
 denied(f,f.ids[1],{type:'request',text:'Novo pedido'},/Limite/);
 ok(f,f.ids[0],{type:'execute',operationId:op}); assert.equal(f.game.playerActions.operations[0].status,'done');
});
test('descanso que atravessa o dia e operação expirada não alteram recursos ou relógio',()=>{
 const f=fixture(); f.game.minutes=1300;
 for(const p of f.game.survivors) p.restPlan={kind:'long',choices:[{action:'hp-full',targetId:p.id},{action:'stress-full',targetId:p.id}]};
 const op=ok(f,f.ids[0],{type:'rest',kind:'long'}).input.id;
 ok(f,f.ids[1],{type:'join',operationId:op}); ok(f,f.ids[2],{type:'join',operationId:op});
 denied(f,f.ids[0],{type:'execute',operationId:op},/fim do dia/);
 f.game.day++; denied(f,f.ids[0],{type:'execute',operationId:op},/expirou/);
});

test('falha de acesso com Esperança também encaminha consequência ao mestre',()=>{
 const f=fixture(); const area=f.game.hexes['0,0'].points[0].preparation.areas[0];area.access='risk';area.difficulty=99;
 const op=propose(f);ok(f,f.ids[0],{type:'execute',operationId:op});const dice=[10,2];
 ok(f,f.ids[0],{type:'roll-access',operationId:op,trait:'Instinto',experiences:[]},()=>dice.shift());
 assert.equal(f.game.playerActions.policy.paused,true);assert.match(f.game.playerActions.operations[0].attention,/Falha/);
});
