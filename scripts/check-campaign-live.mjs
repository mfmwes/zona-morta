// Run after build: authenticated HTTP + WebSocket regression in the real
// Workers runtime, using an isolated database and no production accounts.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { Miniflare } = createRequire(require.resolve('wrangler/package.json'))('miniflare');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const { defaultState, initialSurvivor, content } = require('../lib/game.ts');
const { createConflictScene, endConflictScene } = require('../lib/conflict.ts');
const { prepareLocation } = require('../lib/hex-automation.ts');
const { assignCustomSector } = require('../lib/sectors.ts');
const mf = new Miniflare({
  modulesRoot: resolve('dist/server'),
  modules: ['index.js', ...readdirSync('dist/server', { recursive: true }).filter(name => name.endsWith('.js') && name !== 'index.js')]
    .map(name => ({ type: 'ESModule', path: resolve('dist/server', name) })),
  compatibilityDate: '2026-05-22', compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'live-test' },
  durableObjects: { CAMPAIGN_LIVE: { className: 'CampaignLive', useSQLite: true } },
});
const origin = 'https://example.test';
const tokens = { master: 'a'.repeat(43), player: 'b'.repeat(43), outsider: 'c'.repeat(43) };
const headers = user => ({ Origin: origin, Cookie: `zm_session=${tokens[user]}` });
const connections = [];
const isolatedConnections = [];
const until = (check, label) => new Promise((resolve, reject) => {
  const deadline = Date.now() + 5000;
  const timer = setInterval(() => {
    if (check()) { clearInterval(timer); resolve(); }
    else if (Date.now() > deadline) { clearInterval(timer); reject(new Error(label)); }
  }, 10);
});
try {
  const db = await mf.getD1Database('DB');
  for (const filename of ['0000_early_zzzax.sql', '0001_remarkable_harrier.sql', '0002_lethal_doctor_octopus.sql', '0003_past_toad.sql', '0004_sad_darkstar.sql', '0005_campaign_library.sql', '0006_account_characters.sql']) {
    const sql = readFileSync(new URL('../drizzle/' + filename, import.meta.url), 'utf8').replace(/^--.*$/gm, '');
    for (const statement of sql.split(';').map(text => text.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
  const now = new Date().toISOString();
  for (const user of Object.keys(tokens)) {
    await db.prepare('INSERT INTO users (id,email,password_hash,created_at) VALUES (?,?,?,?)').bind(user, user+'@example.test', 'unused', now).run();
    await db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)')
      .bind(createHash('sha256').update(tokens[user]).digest('base64url'), user, '2099-01-01', now).run();
  }
  const state = defaultState(); state.campaignId = 'test-campaign';
  const archetype = content.archetypes[0];
  const actor = initialSurvivor({ name: 'Jogador', origin: content.origins[1].name, past: '', archetype: archetype.name, specialty: archetype.specialties[0].name, freeExperience: 'Resgates', techniques: [], attributes: { Agilidade: 2, Força: 1, Finesse: 1, Instinto: 0, Presença: 0, Conhecimento: -1 }, primary: '', secondary: '', protection: '', personal: '' });
  state.survivors = [actor,{...structuredClone(actor),id:'other-group',name:'Bia',hex:'1,0'}];
  actor.hex = '0,0';
  assignCustomSector(state,'0,0','Bairro residencial','explorado');
  state.hexes['0,0'].events=[];
  const location={id:'market',name:'Mercado',kind:'comércio',signal:'Porta aberta',access:'',notes:'',revealed:true,lootTable:content.lootTables[1].name,searches:[]};
  prepareLocation(location);location.preparation.areas[0].access='open';location.preparation.areas[0].noise=0;
  state.hexes['0,0'].points=[location];
  state.conflict = createConflictScene({ name: 'Teste', sceneNumber: 1, day: state.day, time: '08:00', survivorIds: [actor.id] });
  await db.prepare('INSERT INTO campaigns (id,owner_id,name,created_at,updated_at) VALUES (?,?,?,?,?)').bind(state.campaignId,'master','Teste',now,now).run();
  await db.prepare('INSERT INTO campaign_states (owner_id,revision,body,updated_at) VALUES (?,1,?,?)').bind(state.campaignId,JSON.stringify(state),now).run();
  await db.prepare('INSERT INTO campaign_players (owner_id,email,user_id,survivor_id,created_at) VALUES (?,?,?,?,?)').bind(state.campaignId,'player@example.test','player',actor.id,now).run();
  const path = '/api/campaign?campanha=test-campaign';
  const live = '/api/campaign/live?campanha=test-campaign';
  assert.equal((await mf.dispatchFetch(origin+live,{headers:{Upgrade:'websocket',Origin:origin}})).status,401);
  assert.equal((await mf.dispatchFetch(origin+live,{headers:{...headers('outsider'),Upgrade:'websocket'}})).status,403);
  assert.equal((await mf.dispatchFetch(origin+live,{headers:{...headers('player'),Origin:'https://other.test',Upgrade:'websocket'}})).status,403);
  for (const user of ['master','player']) {
    const response = await mf.dispatchFetch(origin+live,{headers:{...headers(user),Upgrade:'websocket'}});
    assert.equal(response.status,101);
    const socket=response.webSocket, messages=[];
    socket.addEventListener('message',event=>messages.push(JSON.parse(event.data)));
    socket.accept();connections.push({socket,messages});
  }
  await until(()=>connections.every(c=>c.messages.length),'Initial socket notification missing');
  connections.forEach(c=>{c.messages.length=0;});
  const initial=await (await mf.dispatchFetch(origin+path,{headers:headers('player')})).json();
  assert.equal(initial.state.publicConflict.active,true);
  assert.equal(initial.state.conflict,undefined);
  const unchanged=await (await mf.dispatchFetch(origin+path+'&since=1&survivor='+actor.id,{headers:headers('player')})).json();
  assert.equal(unchanged.state,undefined);assert.equal(unchanged.revision,1);
  await db.prepare('INSERT INTO campaigns (id,owner_id,name,created_at,updated_at) VALUES (?,?,?,?,?)').bind('another-campaign','master','Outra mesa',now,now).run();
  const isolatedResponse=await mf.dispatchFetch(origin+'/api/campaign/live?campanha=another-campaign',{headers:{...headers('master'),Upgrade:'websocket'}});
  assert.equal(isolatedResponse.status,101);
  const isolatedMessages=[], isolatedSocket=isolatedResponse.webSocket;
  isolatedSocket.addEventListener('message',event=>isolatedMessages.push(JSON.parse(event.data)));
  isolatedSocket.accept();isolatedConnections.push(isolatedSocket);
  await until(()=>isolatedMessages.length,'Isolated room initial notification missing');isolatedMessages.length=0;
  endConflictScene(state.conflict,state.day,'08:10');state.fear=3;state.noise=2;
  const saved=await mf.dispatchFetch(origin+path,{method:'PUT',headers:{...headers('master'),'Content-Type':'application/json'},body:JSON.stringify({revision:1,state})});
  assert.equal(saved.status,200,await saved.text());
  await until(()=>connections.every(c=>c.messages.length),'Both roles must receive the conflict update');
  const next=await (await mf.dispatchFetch(origin+path+'&since=1&survivor='+actor.id,{headers:headers('player')})).json();
  assert.equal(next.revision,2);assert.equal(next.state.publicConflict,undefined);
  assert.equal(next.state.fear,3);assert.equal(next.state.noise,2);
  assert.equal(next.state.conflict,undefined);
  assert.equal(isolatedMessages.length,0);
  connections.forEach(c=>{c.messages.length=0;});
  const before=structuredClone(next.state.survivors[0]), after={...before,stress:1};
  const patched=await mf.dispatchFetch(origin+path,{method:'PATCH',headers:{...headers('player'),'Content-Type':'application/json'},body:JSON.stringify({id:'personal-save',day:state.day,before,after,logs:[]})});
  assert.equal(patched.status,200,await patched.text());
  await until(()=>connections.every(c=>c.messages.length),'Player edits must notify the master too');
  const masterView=await (await mf.dispatchFetch(origin+path,{headers:headers('master')})).json();
  assert.equal(masterView.state.survivors[0].stress,1);assert.equal(masterView.revision,3);
  const actionPath='/api/campaign/actions?campanha=test-campaign';
  const act=async body=>{
    const response=await mf.dispatchFetch(origin+actionPath,{method:'POST',headers:{...headers('player'),'Content-Type':'application/json'},body:JSON.stringify({day:state.day,...body})});
    const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result;
  };
  const search=await act({id:'search-without-permission',type:'search',hexId:'0,0',pointId:'market',areaId:location.preparation.areas[0].id,objective:'open',purpose:'Suprimentos'});
  assert.equal(search.state.publicPlayerActions.operations.find(op=>op.id==='search-without-permission').status,'forming');
  const startedSearch=await act({id:'execute-search',type:'execute',operationId:'search-without-permission'});
  assert.equal(startedSearch.state.publicPlayerActions.stock.filter(stock=>stock.source==='search').length,0);
  assert.equal(startedSearch.state.publicActivities.length,1);
  const advance=async id=>{
    const latest=await (await mf.dispatchFetch(origin+path,{headers:headers('master')})).json();
    const {nextActivityMinute}=require('../lib/time.ts');
    const command={type:'advance-activity',id,day:latest.state.day,expectedMinute:latest.state.minutes,expectedNext:nextActivityMinute(latest.state)};
    const response=await mf.dispatchFetch(origin+actionPath,{method:'POST',headers:{...headers('master'),'Content-Type':'application/json'},body:JSON.stringify(command)});
    const payload=await response.json();assert.equal(response.status,200,JSON.stringify(payload));
    const replay=await mf.dispatchFetch(origin+actionPath,{method:'POST',headers:{...headers('master'),'Content-Type':'application/json'},body:JSON.stringify(command)});
    assert.equal((await replay.json()).revision,payload.revision);
    return (await mf.dispatchFetch(origin+path+'&survivor='+actor.id,{headers:headers('player')})).json();
  };
  const completedSearch=await advance('master-search-next');
  const found=completedSearch.state.publicPlayerActions.stock.find(stock=>stock.source==='search'&&stock.accessible&&!stock.requiresFuelContainer);
  assert.ok(found,'Completed search must expose collectible stock');
  assert.ok(found.item,'Public stock must include its physical item state for the capacity preview');
  const searchLog=completedSearch.state.log.find(entry=>entry.kind==='busca');
  assert.ok(searchLog);assert.match(searchLog.text,/Jogador: busca geral.*Mercado.*Resultado:.*30 min/);
  const beforeCollect=await (await mf.dispatchFetch(origin+path,{headers:headers('master')})).json();
  const policy=beforeCollect.state.playerActions.policy;
  const setPaused=async paused=>{
    const response=await mf.dispatchFetch(origin+actionPath,{method:'POST',headers:{...headers('master'),'Content-Type':'application/json'},body:JSON.stringify({type:'policy',expectedPolicy:JSON.stringify(policy),policy:{...policy,paused}})});
    const payload=await response.json();assert.equal(response.status,200,JSON.stringify(payload));
    policy.paused=paused;
  };
  await setPaused(true);
  connections.forEach(c=>{c.messages.length=0;});
  const collect={id:'collect-after-search',type:'collect',hexId:found.hexId,pointId:found.pointId,stockId:found.stockId,quantity:1};
  const collected=await act(collect);
  await until(()=>connections.every(c=>c.messages.some(message=>message.revision===collected.revision)),'Collection must notify master and player');
  assert.equal(collected.state.minutes,completedSearch.state.minutes);
  assert.equal(collected.state.noise,completedSearch.state.noise);
  assert.equal(collected.state.publicPlayerActions.policy.paused,true);
  const collectionLog=collected.state.log.find(entry=>entry.kind==='inventário'&&entry.text.includes('recolheu em Mercado'));
  assert.ok(collectionLog);assert.equal(collectionLog.actorId,actor.id);
  assert.ok(collectionLog.text.includes(`1 × ${found.name}`));assert.match(collectionLog.text,/inventário pessoal/);
  assert.equal(collected.state.log.length,completedSearch.state.log.length+1);
  const reloaded=await (await mf.dispatchFetch(origin+path,{headers:headers('master')})).json();
  assert.deepEqual(reloaded.state.survivors[0].inventory,collected.state.survivors[0].inventory);
  assert.equal(reloaded.state.hexes[found.hexId].points.find(point=>point.id===found.pointId).preparation.stock.find(stock=>stock.id===found.stockId).remaining,found.remaining-1);
  const collectReplay=await act(collect);assert.equal(collectReplay.revision,collected.revision);
  assert.deepEqual(collectReplay.state.survivors[0].inventory,collected.state.survivors[0].inventory);
  assert.deepEqual(collectReplay.state.log,collected.state.log);
  await setPaused(false);
  const requested=await act({id:'rest-request',type:'request-rest',kind:'short'});
  const rest=requested.state.publicPlayerActions.operations.find(op=>op.individualChoices&&op.status==='forming');
  assert.ok(rest);assert.deepEqual(rest.participantIds,[]);assert.equal(rest.plans,undefined);
  const beforeRest=requested.state.minutes;
  const confirm={id:'rest-confirm',type:'confirm-rest',operationId:rest.id,choices:[{action:'stress',targetId:actor.id},{action:'prepare',targetId:actor.id}]};
  const startedRest=await act(confirm);
  assert.equal(startedRest.state.minutes,beforeRest);assert.equal(startedRest.state.publicActivities.length,1);
  const rested=await advance("master-rest-next");
  assert.equal(rested.state.minutes,beforeRest+60);assert.equal(rested.state.shortRest,2);assert.equal(rested.state.survivors[0].stress,0);
  const repeated=await act(confirm);assert.equal(repeated.revision,rested.revision);assert.equal(repeated.state.minutes,rested.state.minutes);
  const afterRest=await (await mf.dispatchFetch(origin+path,{headers:headers('master')})).json();
  assert.equal(afterRest.state.shortRest,2);assert.equal(afterRest.state.survivors[0].stress,0);
  const joined=structuredClone(afterRest.state);joined.survivors[1].hex=joined.survivors[0].hex??joined.partyHex;
  const reunion=await mf.dispatchFetch(origin+path,{method:'PUT',headers:{...headers('master'),'Content-Type':'application/json'},body:JSON.stringify({revision:afterRest.revision,state:joined})});assert.equal(reunion.status,200,await reunion.text());
  const singleRequest=await act({id:'single-rest-request',type:'request-rest',kind:'short',participantIds:[actor.id]});
  const singleRest=singleRequest.state.publicPlayerActions.operations.find(op=>op.id!==rest.id&&op.status==='forming'&&op.individualChoices);assert.ok(singleRest);
  const singleConfirm={id:'single-rest-confirm',type:'confirm-rest',operationId:singleRest.id,choices:[{action:'stress',targetId:actor.id},{action:'prepare',targetId:actor.id}]};
  const singleDone=await act(singleConfirm);assert.equal(singleDone.state.minutes,singleRequest.state.minutes+60);assert.equal(singleDone.state.publicActivities.length,0);
  const singleReplay=await act(singleConfirm);assert.equal(singleReplay.revision,singleDone.revision);assert.equal(singleReplay.state.minutes,singleDone.state.minutes);

  const {eventResolutionFingerprint}=require('../lib/event-resolution.ts');
  const eventLatest=await (await mf.dispatchFetch(origin+path,{headers:headers('master')})).json();
  const withEvent=structuredClone(eventLatest.state);
  withEvent.hexes['0,0'].events=[{id:'guided-event',text:'Porta bloqueada.',trigger:'',revealed:true,status:'active',generatorRoll:52}];
  const putEvent=await mf.dispatchFetch(origin+path,{method:'PUT',headers:{...headers('master'),'Content-Type':'application/json'},body:JSON.stringify({revision:eventLatest.revision,state:withEvent})});assert.equal(putEvent.status,200,await putEvent.text());
  const resolve={type:'resolve-event',id:'runtime-event',day:withEvent.day,expectedMinute:withEvent.minutes,expectedEvent:eventResolutionFingerprint(withEvent.hexes['0,0'].events[0]),hexId:'0,0',eventId:'guided-event',approachId:'careful',outcome:'success',summary:'Passagem aberta',continuity:'Senha privada do mestre',participantIds:[actor.id],minutes:5,noise:1,fear:0,personalEffects:[{survivorId:actor.id,hpMarks:1,armor:false,stress:1,hope:0,food:0,water:0,condition:{name:'Restrito',effect:'Preso sob a grade.',clear:'Um aliado ergue a grade.'}}]};
  const masterCommand=async command=>{
    const response=await mf.dispatchFetch(origin+actionPath,{method:'POST',headers:{...headers('master'),'Content-Type':'application/json'},body:JSON.stringify(command)});
    const payload=await response.json();assert.equal(response.status,200,JSON.stringify(payload));return payload;
  };
  const deniedEvent=await mf.dispatchFetch(origin+actionPath,{method:'POST',headers:{...headers('player'),'Content-Type':'application/json'},body:JSON.stringify(resolve)});assert.equal(deniedEvent.status,403,await deniedEvent.text());
  connections.forEach(c=>{c.messages.length=0;});
  const resolved=await masterCommand(resolve);assert.equal(resolved.state.minutes,withEvent.minutes+5);assert.equal(resolved.state.hexes['0,0'].events[0].resolutions[0].status,'completed');
  await until(()=>connections.every(c=>c.messages.some(m=>m.revision===resolved.revision)),'Event outcome must notify both roles');
  assert.equal((await masterCommand(resolve)).revision,resolved.revision);
  assert.equal(resolved.state.survivors[0].hp,Math.min(require('../lib/game.ts').survivorStats(withEvent.survivors[0]).hp,withEvent.survivors[0].hp+1));
  assert.equal(resolved.state.survivors[0].eventConditions[0].name,'Restrito');
  const publicOutcome=await (await mf.dispatchFetch(origin+path,{headers:headers('player')})).json();assert.equal(JSON.stringify(publicOutcome.state).includes('Senha privada do mestre'),false);
  const separated=structuredClone(resolved.state);separated.survivors[1].hex='1,0';separated.hexes['0,0'].events[0].status='active';
  const putSeparated=await mf.dispatchFetch(origin+path,{method:'PUT',headers:{...headers('master'),'Content-Type':'application/json'},body:JSON.stringify({revision:resolved.revision,state:separated})});assert.equal(putSeparated.status,200,await putSeparated.text());
  const parallel=await masterCommand({...resolve,id:'runtime-parallel-event',expectedMinute:separated.minutes,expectedEvent:eventResolutionFingerprint(separated.hexes['0,0'].events[0]),noise:0,minutes:10});
  assert.equal(parallel.state.minutes,separated.minutes);assert.equal(parallel.state.hexes['0,0'].events[0].resolutions[1].status,'scheduled');
  const publicWaiting=await (await mf.dispatchFetch(origin+path,{headers:headers('player')})).json();assert.equal(publicWaiting.state.publicActivities[0].label,'Resolver evento');assert.equal(JSON.stringify(publicWaiting.state).includes('Senha privada do mestre'),false);
  const eventDone=await advance('runtime-event-next');assert.equal(eventDone.state.minutes,separated.minutes+10);
  let persistedEvent=await (await mf.dispatchFetch(origin+path,{headers:headers('master')})).json();assert.equal(persistedEvent.state.hexes['0,0'].events[0].resolutions[1].status,'completed');

  const clockState=structuredClone(persistedEvent.state);
  clockState.hexes['0,0'].events.push({id:'runtime-alarm',text:require('../lib/game.ts').content.generators.eventos[87].text,trigger:'',revealed:true,status:'active',generatorRoll:88});
  const clockPut=await mf.dispatchFetch(origin+path,{method:'PUT',headers:{...headers('master'),'Content-Type':'application/json'},body:JSON.stringify({revision:persistedEvent.revision,state:clockState})});assert.equal(clockPut.status,200,await clockPut.text());
  const alarm=clockState.hexes['0,0'].events.at(-1);
  const clockStarted=await masterCommand({type:'resolve-event',id:'runtime-clock-start',day:clockState.day,expectedMinute:clockState.minutes,expectedEvent:eventResolutionFingerprint(alarm),hexId:'0,0',eventId:alarm.id,approachId:'careful',outcome:'success',summary:'Prazo anunciado',continuity:'Circuito reservado do alarme',participantIds:[],minutes:0,noise:0,fear:0,closeEvent:false,clock:{initial:{label:'Alarme',consequence:'O alarme dispara.',minutes:1,noise:2},action:'keep'}});
  assert.equal(clockStarted.state.minutes,clockState.minutes);
  const publicClock=await (await mf.dispatchFetch(origin+path,{headers:headers('player')})).json();assert.equal(publicClock.state.hexes['0,0'].events.at(-1).clock,undefined);assert.equal(JSON.stringify(publicClock.state).includes('Circuito reservado'),false);
  const clockExpired=await advance('runtime-clock-next');assert.equal(clockExpired.state.minutes,clockState.minutes+1);
  persistedEvent=await (await mf.dispatchFetch(origin+path,{headers:headers('master')})).json();
  assert.equal(persistedEvent.state.hexes['0,0'].events.at(-1).clock.status,'expired');assert.equal(persistedEvent.state.noise,Math.min(5,clockState.noise+2));

  const {createShelterProject,shelterBlueprintSlots}=require('../lib/shelter-projects.ts');
  const {createSceneBoardScene}=require('../lib/scene-board.ts');
  const {removalFingerprint}=require('../lib/master-removals.ts');
  const removable=structuredClone(persistedEvent.state),project=createShelterProject('dormitories',shelterBlueprintSlots.find(s=>s.zone==='interior').id);
  const visual=createSceneBoardScene('Cena removível'),privateScene=createSceneBoardScene('Cena preservada');visual.visibleToPlayers=true;
  removable.shelter.hex='0,0';removable.shelter.projects=[project];removable.sceneBoard={scenes:[visual,privateScene],activeSceneId:visual.id};
  const putRemovable=await mf.dispatchFetch(origin+path,{method:'PUT',headers:{...headers('master'),'Content-Type':'application/json'},body:JSON.stringify({revision:persistedEvent.revision,state:removable})});assert.equal(putRemovable.status,200,await putRemovable.text());
  const removeProject={type:'remove-shelter-project',id:'runtime-remove-project',day:removable.day,shelterHex:'0,0',projectId:project.id,expectedFingerprint:await removalFingerprint(project)};
  const removeScene={type:'delete-scene',id:'runtime-remove-scene',day:removable.day,sceneId:visual.id,expectedActiveSceneId:visual.id,expectedFingerprint:await removalFingerprint(visual)};
  for(const command of [removeProject,removeScene]) {
    const denied=await mf.dispatchFetch(origin+actionPath,{method:'POST',headers:{...headers('player'),'Content-Type':'application/json'},body:JSON.stringify(command)});assert.equal(denied.status,403,await denied.text());
  }
  const clearedProject=await masterCommand(removeProject);assert.deepEqual(clearedProject.state.shelter.projects,[]);assert.equal(clearedProject.state.shelter.parts,removable.shelter.parts);
  assert.equal((await masterCommand(removeProject)).revision,clearedProject.revision);
  connections.forEach(c=>{c.messages.length=0;});
  const clearedScene=await masterCommand(removeScene);assert.deepEqual(clearedScene.state.sceneBoard.scenes.map(s=>s.id),[privateScene.id]);assert.equal(clearedScene.state.sceneBoard.activeSceneId,undefined);
  await until(()=>connections.every(c=>c.messages.length),'Scene deletion notification missing');
  const publicScene=await (await mf.dispatchFetch(origin+path,{headers:headers('player')})).json();assert.deepEqual(publicScene.state.sceneBoard,{scenes:[]});assert.equal(clearedScene.state.survivors.length,removable.survivors.length);
  assert.equal((await masterCommand(removeScene)).revision,clearedScene.revision);

  connections.forEach(c=>{c.messages.length=0;});
  const imagePath='/api/campaign/presentation?campanha=test-campaign';
  const presented=await mf.dispatchFetch(origin+imagePath,{method:'PUT',headers:{...headers('master'),'Content-Type':'application/json'},body:JSON.stringify({id:'image',image:'https://example.test/image.png',active:true})});
  assert.equal(presented.status,200);
  await until(()=>connections.every(c=>c.messages.length),'Presentation notification missing');
  connections.forEach(c=>{c.messages.length=0;});
  assert.equal((await mf.dispatchFetch(origin+imagePath,{method:'DELETE',headers:headers('master')})).status,200);
  await until(()=>connections.every(c=>c.messages.length),'Presentation close notification missing');
  assert.ok(connections.every(c=>c.messages.every(message=>message.type==='changed'&&message.presentation===true&&message.revision===undefined)));
  await db.prepare('UPDATE campaign_players SET revoked_at=? WHERE owner_id=?').bind(now,state.campaignId).run();
  assert.equal((await mf.dispatchFetch(origin+path+'&since=3',{headers:headers('player')})).status,403);
  assert.equal(isolatedMessages.length,0);
  console.log('Runtime passed: live updates, conflict closure, automatic searches, collection while paused and replay, inventory persistence, individual rest confirmation/replay, event guides and parallel outcomes/replay, persisted alarm deadline and private projection, shelter cancellation and scene deletion/replay, image show/close, campaign isolation, private projection and revoked access.');
} finally {
  connections.forEach(c=>c.socket.close());
  isolatedConnections.forEach(socket=>socket.close());
  await mf.dispose();
}
