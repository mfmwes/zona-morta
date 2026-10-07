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
  state.survivors = [actor];
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
  const completedSearch=await act({id:'execute-search',type:'execute',operationId:'search-without-permission'});
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
  const rested=await act(confirm);
  assert.equal(rested.state.minutes,beforeRest+60);assert.equal(rested.state.shortRest,2);assert.equal(rested.state.survivors[0].stress,0);
  const repeated=await act(confirm);assert.equal(repeated.revision,rested.revision);assert.equal(repeated.state.minutes,rested.state.minutes);
  const afterRest=await (await mf.dispatchFetch(origin+path,{headers:headers('master')})).json();
  assert.equal(afterRest.state.shortRest,2);assert.equal(afterRest.state.survivors[0].stress,0);
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
  console.log('Runtime passed: live updates, conflict closure, automatic searches, collection while paused and replay, inventory persistence, individual rest confirmation/replay, image show/close, campaign isolation, private projection and revoked access.');
} finally {
  connections.forEach(c=>c.socket.close());
  isolatedConnections.forEach(socket=>socket.close());
  await mf.dispose();
}
