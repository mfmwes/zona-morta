/* eslint-disable @typescript-eslint/no-require-imports -- route dependencies stubbed for authentication/CAS integration */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const Module=require('node:module');
const path=require('node:path');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const {defaultState,initialSurvivor,content}=require('../lib/game.ts');
const {assignCustomSector}=require('../lib/sectors.ts');
const {prepareLocation}=require('../lib/hex-automation.ts');
let state, revision, actor, authenticated, origin, race, writes;
const db={campaignOwnerId:async()=> 'master',findPlayer:async()=>({survivor_id:actor}),readCampaign:async()=>({state:structuredClone(state),revision}),writeCampaign:async(_,next,expected)=>{
 writes++;
 if(race){race=false;state.fear=4;revision++;return null;}
 if(expected!==revision)return null;
 state=structuredClone(next);return ++revision;
}};
const originalLoad=Module._load;
Module._load=function(name,parent,main){
 if(name==='@/db/state')return db;
 if(name==='@/lib/auth')return {siteUser:async()=>authenticated,sameOrigin:()=>origin};
 if(name.startsWith('@/'))return originalLoad.call(this,path.join(__dirname,'..',name.slice(2)+'.ts'),parent,main);
 return originalLoad.call(this,name,parent,main);
};
const {advanceToNextActivity}=require('../lib/time.ts');
const {projectPlayerGame}=require('../lib/collaboration.ts');
const {POST}=require('../app/api/campaign/actions/route.ts');
const {PATCH}=require('../app/api/campaign/route.ts');
const {POST:spotlightPOST}=require('../app/api/campaign/spotlight/route.ts');
Module._load=originalLoad;
function reset(){
 state=defaultState(); const a=content.archetypes[0];
 state.survivors=[initialSurvivor({name:'Nina',origin:content.origins[1].name,past:'',archetype:a.name,specialty:a.specialties[0].name,freeExperience:'Resgates',techniques:[],attributes:{Agilidade:2,Força:1,Finesse:1,Instinto:0,Presença:0,Conhecimento:-1},primary:'',secondary:'',protection:'',personal:''})];
 actor=state.survivors[0].id;revision=1;authenticated={id:'player',email:'player@example.test'};origin=true;race=false;writes=0;
}
function send(body){return POST(new Request('https://example.test/api/campaign/actions?campanha=campaign',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));}
test('jogador adicionado a conflito existente pode pedir e cancelar Spotlight',async()=>{
 reset();
 const {createConflictScene}=require('../lib/conflict.ts');
 state.conflict=createConflictScene({name:'Conflito existente',sceneNumber:1,day:state.day,time:'08:00',survivorIds:[]});
 const spotlight=action=>spotlightPOST(new Request('https://example.test/api/campaign/spotlight?campanha=campaign',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})}));
 assert.equal((await spotlight('request')).status,403);assert.equal(writes,0);
 state.conflict.survivorIds.push(actor);
 const response=await spotlight('request');assert.equal(response.status,200);
 assert.equal((await response.json()).state.publicConflict.spotlightRequested,true);
 assert.deepEqual(state.conflict.spotlightRequests,[actor]);
 assert.equal((await spotlight('cancel')).status,200);
 assert.deepEqual(state.conflict.spotlightRequests,[]);
 authenticated=null;assert.equal((await spotlight('request')).status,401);
});
test('endpoint exige sessão, mesma origem e associação; jogador não altera permissões nem finge outro ator',async()=>{
 reset();authenticated=null;assert.equal((await send({})).status,401);
 reset();origin=false;assert.equal((await send({})).status,403);
 reset();assert.equal((await send({type:'policy',policy:{}})).status,403);
 assert.equal((await send({type:'reset-city',withShelter:false})).status,403);
 assert.equal((await send({type:'request',id:'fake',day:state.day,text:'Ajuda',actorId:'outro'})).status,409);assert.equal(writes,0);
});
test('reset da cidade é transacional, refaz CAS e devolve o estado novo para sincronização',async()=>{
 reset();authenticated={id:'master',email:'master@example.test'};
 const survivorId=actor,campaignId=state.campaignId;
 state.fear=9;state.noise=4;
 state.hexes['0,0'].points.push({id:'old-point',name:'Mapa antigo',kind:'local',signal:'Antigo',access:'',notes:'',revealed:true,searches:[]});
 const {defaultPlayerPolicy}=require('../lib/player-actions-types.ts');
 state.playerActions={policy:{...defaultPlayerPolicy(),paused:true},operations:[],receipts:[],withdrawals:[],markers:[]};
 race=true;
 const response=await send({type:'reset-city',withShelter:false});
 assert.equal(response.status,200);
 const payload=await response.json();
 assert.equal(writes,2);
 assert.equal(state.campaignId,campaignId);
 assert.equal(state.fear,0);assert.equal(state.noise,0);
 assert.equal(state.playerActions,undefined);
 assert.equal(state.survivors.length,1);assert.equal(state.survivors[0].id,survivorId);assert.equal(state.survivors[0].hex,'0,0');
 assert.equal(state.hexes['0,0'].points.some(point=>point.id==='old-point'),false);
 assert.equal(payload.state.hexes['0,0'].points.some(point=>point.id==='old-point'),false);
 assert.equal(payload.state.survivors[0].id,survivorId);
});

test('fluxo real do jogador agenda busca geral; achados só aparecem após avanço do mestre',async()=>{
 reset();const peer=structuredClone(state.survivors[0]);peer.id='other-group';peer.hex='-1,0';state.survivors.push(peer);
 state.survivors[0].hex='0,0';
 assignCustomSector(state,'0,0','Mercado abandonado','explorado');
 state.hexes['0,0'].events=[];
 state.hexes['0,0'].points=[{id:'market',name:'Mercado',kind:'comércio',signal:'Prateleiras reviradas',access:'',notes:'',revealed:true,lootTable:content.lootTables[1].name,searches:[]}];
 const point=state.hexes['0,0'].points[0];prepareLocation(point);
 const area=point.preparation.areas.find(row=>row.searchable!==false);assert.ok(area);
 area.access='open';area.noise=0;area.minutes=30;
 const propose={type:'search',id:'player-d12-proposal',day:state.day,hexId:'0,0',pointId:'market',areaId:area.id,objective:'open',purpose:'Busca geral de suprimentos'};
 const proposed=await send(propose);assert.equal(proposed.status,200);
 let payload=await proposed.json();
 let op=payload.state.publicPlayerActions.operations.find(row=>row.id===propose.id);
 assert.ok(op);assert.equal(op.status,'forming');assert.equal(op.objective,'open');
 const execute=await send({type:'execute',id:'player-d12-execute',day:state.day,operationId:propose.id});
 assert.equal(execute.status,200);
 payload=await execute.json();
 assert.equal(state.minutes,480); assert.equal(payload.state.publicPlayerActions.stock.length,0);
 assert.equal(payload.state.publicActivities.length,1);
 if(state.activities?.some(a=>a.status==='running')){assert.equal(advanceToNextActivity(state).ok,true);revision++;}
 payload.state=projectPlayerGame(state,actor);
 const projectedArea=payload.state.publicPlayerActions.areas.find(row=>row.areaId===area.id);
 const attempt=state.hexes['0,0'].points[0].preparation.attempts.find(row=>row.id===propose.id);
 assert.ok(attempt);assert.equal(attempt.mode,'open');assert.equal(attempt.status,'completed');
 assert.ok(Number.isInteger(attempt.roll)&&attempt.roll>=1&&attempt.roll<=12);
 assert.equal(projectedArea.lastRoll,attempt.effectiveRoll??attempt.roll);
 assert.ok(typeof projectedArea.lastResult==='string');
});

test('endpoint refaz CAS sem perder edição paralela; reenvio não cria segundo pedido ou gravação',async()=>{
 reset();race=true;
 const input={type:'request',id:'same-request',day:state.day,text:'Abrir porta bloqueada'};
 const response=await send(input);assert.equal(response.status,200);
 const result=await response.json();assert.equal(result.state.playerActions,undefined);assert.equal(result.state.publicPlayerActions.actorId,actor);
 assert.equal(state.fear,4);assert.equal(state.playerActions.operations.length,1);assert.equal(writes,2);
 const replay=await send(input);assert.equal(replay.status,200);assert.equal(writes,2);assert.equal(state.playerActions.receipts.length,1);
 const changed=await send({...input,text:'Outro pedido'});assert.equal(changed.status,409);assert.equal(writes,2);
});

test('coleta de achado após busca pausada persiste, refaz CAS e projeta inventário sem duplicar no reenvio',async()=>{
 reset();state.survivors[0].hex='0,0';state.survivors[0].inventory=[];
 assignCustomSector(state,'0,0','Mercado abandonado','explorado');state.hexes['0,0'].events=[];
 state.hexes['0,0'].points=[{id:'market',name:'Mercado',kind:'comércio',signal:'Porta aberta',access:'',notes:'',revealed:true,lootTable:content.lootTables[1].name,searches:[]}];
 prepareLocation(state.hexes['0,0'].points[0]);
 const area=state.hexes['0,0'].points[0].preparation.areas.find(row=>row.searchable!==false);
 area.access='open';area.collectible=true;area.noise=0;
 state.noise=3;
 assert.equal((await send({type:'search',id:'noisy-search',day:state.day,hexId:'0,0',pointId:'market',areaId:area.id,objective:'open',purpose:'Suprimentos'})).status,200);
 assert.equal((await send({type:'execute',id:'noisy-execute',day:state.day,operationId:'noisy-search'})).status,200);
 if(state.activities?.some(a=>a.status==='running')){assert.equal(advanceToNextActivity(state).ok,true);revision++;}
 assert.equal(state.playerActions.policy.paused,true);
 const stock=state.hexes['0,0'].points[0].preparation.stock.find(row=>row.attemptId==='noisy-search');assert.ok(stock);
 const beforeMinutes=state.minutes,beforeNoise=state.noise,beforeStock=stock.remaining;
 const input={type:'collect',id:'paused-collect',day:state.day,hexId:'0,0',pointId:'market',stockId:stock.id,quantity:1};
 race=true;const beforeWrites=writes;
 const response=await send(input);const payload=await response.json();assert.equal(response.status,200,payload.error);
 assert.equal(writes,beforeWrites+2);assert.equal(state.fear,4);
 assert.equal(state.minutes,beforeMinutes);assert.equal(state.noise,beforeNoise);assert.equal(state.playerActions.policy.paused,true);
 assert.equal(state.hexes['0,0'].points[0].preparation.stock.find(row=>row.id===stock.id).remaining,beforeStock-1);
 assert.deepEqual(payload.state.survivors[0].inventory,state.survivors[0].inventory);
 assert.equal(payload.state.survivors[0].inventory.find(item=>item.catalogKey===stock.item.catalogKey).qty,1);
 assert.equal(payload.state.playerActions,undefined);
 const saved=structuredClone(state),replay=await send(input);assert.equal(replay.status,200);
 assert.equal((await replay.json()).revision,payload.revision);assert.equal(writes,beforeWrites+2);assert.deepEqual(state,saved);
});
test('mestre não sobrescreve rascunho de permissões desatualizado',async()=>{
 reset();authenticated={id:'master'};
 const {playerActionState}=require('../lib/player-actions.ts');
 const policy=playerActionState(state).policy;
 assert.equal((await send({type:'policy',policy:{...policy,transfers:true},expectedPolicy:'stale'})).status,409);assert.equal(writes,0);
 assert.equal((await send({type:'policy',policy:{...policy,transfers:true},expectedPolicy:JSON.stringify(policy)})).status,200);assert.equal(state.playerActions.policy.transfers,true);
});

test('PATCH da ficha preserva CAS e reenvia o mesmo salvamento sem repetir custo ou log',async()=>{
 reset();race=true;
 const before=structuredClone(state.survivors[0]),after={...before,stress:1};
 const body={id:'sheet-save',day:state.day,before,after,fearDelta:1,noiseDelta:1,logs:[{kind:'dados',text:'Teste do jogador'}]};
 const patch=input=>PATCH(new Request('https://example.test/api/campaign?campanha=campaign',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}));
 const result=await patch(body);assert.equal(result.status,200);assert.equal(state.fear,5);assert.equal(state.noise,1);assert.equal(writes,2);
 const replay=await patch(body);assert.equal(replay.status,200);assert.equal(writes,2);assert.equal(state.log.filter(row=>row.text==='Teste do jogador').length,1);
 assert.equal((await patch({...body,after:{...after,stress:2}})).status,409);
 authenticated=null;assert.equal((await patch(body)).status,401);
});

test('PATCH de PV aceita ficha legada e preserva notas concorrentes sem bloquear cliques seguintes',async()=>{
 reset();
 state.survivors[0].inventory=[{id:'antigo',name:'Item legado',qty:0,load:1,condition:'Íntegro'}];
 state.survivors[0].campoAntigo='preservar';
 let before=structuredClone(state.survivors[0]);
 state.survivors[0].notes='Nota nova do mestre';
 const patch=(id,after)=>PATCH(new Request('https://example.test/api/campaign?campanha=campaign',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,day:state.day,before,after,logs:[]})}));
 let after={...before,hp:1};
 assert.equal((await patch('hp-1',after)).status,200);
 before=after;after={...before,hp:2};
 const second=await patch('hp-2',after);assert.equal(second.status,200);
 const saved=(await second.json()).state.survivors[0];
 assert.equal(saved.hp,2);assert.equal(saved.notes,'Nota nova do mestre');assert.equal(saved.campoAntigo,'preservar');
 assert.equal(writes,2);
});

test('avanço do mestre é exclusivo, preserva CAS e pode ser reenviado sem concluir a próxima atividade',async()=>{
 reset();const peer=structuredClone(state.survivors[0]);peer.id='other-group';peer.hex='-1,0';state.survivors.push(peer);
 const {scheduleSurvivorTravel}=require('../lib/hex-actions.ts');
 assignCustomSector(state,'1,0','Garagens','avistado');state.hexes['1,0'].routeHours=1;
 assert.equal(scheduleSurvivorTravel(state,'1,0',[actor]).ok,true);
 const input={type:'advance-activity',id:'master-next',day:state.day,expectedMinute:state.minutes,expectedNext:state.minutes+60};
 assert.equal((await send(input)).status,403);assert.equal(writes,0);
 authenticated={id:'master'};race=true;
 const advanced=await send(input);assert.equal(advanced.status,200);assert.equal(writes,2);assert.equal(state.minutes,540);assert.equal(state.survivors[0].hex,'1,0');assert.equal(state.fear,4);
 const saved=structuredClone(state);const replay=await send(input);assert.equal(replay.status,200);assert.equal(writes,2);assert.deepEqual(state,saved);
 assert.equal((await send({...input,id:'stale-next'})).status,409);assert.equal(writes,2);
});

test('interrupção de atividade exige mestre e reenvio mantém posição e relógio',async()=>{
 reset();const peer=structuredClone(state.survivors[0]);peer.id='other-group';peer.hex='-1,0';state.survivors.push(peer);const {scheduleSurvivorTravel}=require('../lib/hex-actions.ts');assignCustomSector(state,'1,0','Garagens','avistado');
 assert.equal(scheduleSurvivorTravel(state,'1,0',[actor]).ok,true);
 const activity=state.activities[0];const command={type:'cancel-activity',id:'cancel-1',day:state.day,activityId:activity.id};
 assert.equal((await send(command)).status,403);authenticated={id:'master'};
 assert.equal((await send(command)).status,200);assert.equal(state.minutes,480);assert.equal(state.survivors[0].hex??state.partyHex,'0,0');
 const saved=structuredClone(state);assert.equal((await send(command)).status,200);assert.deepEqual(state,saved);assert.equal(writes,1);
});

test('grupo único conclui busca no endpoint, preserva CAS e reenvio não cobra tempo novamente',async()=>{
 reset();
 state.survivors[0].hex='0,0';
 assignCustomSector(state,'0,0','Mercado abandonado','explorado');
 state.hexes['0,0'].events=[];
 state.hexes['0,0'].points=[{id:'market',name:'Mercado',kind:'comércio',signal:'Prateleiras reviradas',access:'',notes:'',revealed:true,lootTable:content.lootTables[1].name,searches:[]}];
 const point=state.hexes['0,0'].points[0];prepareLocation(point);
 const area=point.preparation.areas.find(row=>row.searchable!==false);assert.ok(area);
 area.access='open';area.noise=0;area.minutes=30;
 const propose={type:'search',id:'player-d12-proposal',day:state.day,hexId:'0,0',pointId:'market',areaId:area.id,objective:'open',purpose:'Busca geral de suprimentos'};
 const proposed=await send(propose);assert.equal(proposed.status,200);
 let payload=await proposed.json();
 let op=payload.state.publicPlayerActions.operations.find(row=>row.id===propose.id);
 assert.ok(op);assert.equal(op.status,'forming');assert.equal(op.objective,'open');
 race=true;const beforeWrites=writes;
 const execute=await send({type:'execute',id:'player-d12-execute',day:state.day,operationId:propose.id});
 assert.equal(execute.status,200);
 payload=await execute.json();
 assert.equal(state.minutes,510);assert.equal(writes,beforeWrites+2);assert.equal(state.fear,4);assert.equal(payload.state.publicActivities.length,0);
 const saved=structuredClone(state),count=writes;
 assert.equal((await send({type:'execute',id:'player-d12-execute',day:state.day,operationId:propose.id})).status,200);assert.equal(writes,count);assert.deepEqual(state,saved);
 if(state.activities?.some(a=>a.status==='running')){assert.equal(advanceToNextActivity(state).ok,true);revision++;}
 payload.state=projectPlayerGame(state,actor);
 const projectedArea=payload.state.publicPlayerActions.areas.find(row=>row.areaId===area.id);
 const attempt=state.hexes['0,0'].points[0].preparation.attempts.find(row=>row.id===propose.id);
 assert.ok(attempt);assert.equal(attempt.mode,'open');assert.equal(attempt.status,'completed');
 assert.ok(Number.isInteger(attempt.roll)&&attempt.roll>=1&&attempt.roll<=12);
 assert.equal(projectedArea.lastRoll,attempt.effectiveRoll??attempt.roll);
 assert.ok(typeof projectedArea.lastResult==='string');
});
