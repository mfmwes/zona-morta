/* eslint-disable @typescript-eslint/no-require-imports -- uses the existing Node test loader. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, path);
const { defaultState, initialSurvivor, content } = require('../lib/game.ts');
const { setWorldConnection, worldConnection, visibleWorldConnections, expandWorld, validWorld } = require('../lib/world.ts');
const { planJourney } = require('../lib/journey.ts');
const { projectPlayerGame, playerEditPayload } = require('../lib/collaboration.ts');
const { moveSurvivors, scheduleSurvivorTravel, performHexAction } = require('../lib/hex-actions.ts');
function fixture() {
  const game = defaultState();
  const a = content.archetypes[0];
  game.survivors = [initialSurvivor({ name:'Ana', origin:content.origins[0].name, past:'', archetype:a.name,
    specialty:a.specialties[0].name, freeExperience:'Resgate', techniques:[],
    attributes:{Agilidade:2,Força:1,Finesse:1,Instinto:0,Presença:0,Conhecimento:-1},
    primary:'Faca resistente',secondary:'',protection:'Roupa reforçada',personal:'Mochila urbana' })];
  expandWorld(game,{origin:'2,0',mode:'direction',direction:1,length:8,terrain:'rural',passage:'road',connect:true});
  for(const hex of Object.values(game.hexes))hex.discovery='explorado';
  setWorldConnection(game.hexes,'0,0','1,0','road');setWorldConnection(game.hexes,'1,0','2,0','road');
  return game;
}
const plan = (g, extra={}) => planJourney(g,{from:g.partyHex,to:'10,0',survivorIds:g.survivors.map(p=>p.id),mode:'roads',dailyHours:8,reserveDays:0,...extra});

test('connections validate adjacency, stay reciprocal, survive JSON and remove in both directions',()=>{
  const g=fixture();assert.equal(validWorld(g.hexes),true);
  assert.equal(setWorldConnection(g.hexes,'0,0','3,0','road'),false);
  assert.equal(setWorldConnection(g.hexes,'0,0','1,0','road',true),true);
  assert.equal(worldConnection(g.hexes,'1,0','0,0').blocked,true);
  assert.equal(validWorld(JSON.parse(JSON.stringify(g.hexes))),true);
  const bad=structuredClone(g.hexes);bad['1,0'].connections=[];assert.equal(validWorld(bad),false);
  const malformed=structuredClone(g.hexes);malformed['1,0'].connections='bad';assert.equal(validWorld(malformed),false);
  const nullLink=structuredClone(g.hexes);nullLink['1,0'].connections=[null];assert.equal(validWorld(nullLink),false);
  setWorldConnection(g.hexes,'0,0','1,0','none');assert.equal(worldConnection(g.hexes,'1,0','0,0'),undefined);
});

test('connected expansion preserves existing blocked links and sector contents',()=>{
  const g=fixture();setWorldConnection(g.hexes,'2,0','3,0','road',true);
  const original=structuredClone(g.hexes['2,0'].points);
  expandWorld(g,{origin:'2,0',mode:'direction',direction:1,length:10,terrain:'rural',passage:'road',connect:true,region:'Interior'});
  assert.equal(worldConnection(g.hexes,'2,0','3,0').blocked,true);
  assert.deepEqual(g.hexes['2,0'].points,original);assert.equal(g.hexes['12,0'].region,'Interior');
  assert.equal(worldConnection(g.hexes,'11,0','12,0').kind,'road');assert.equal(validWorld(g.hexes),true);
});

test('unknown destinations, regions and connections do not leak to players or route planning',()=>{
  const g=fixture();g.hexes['3,0'].discovery='desconhecido';g.hexes['3,0'].region='Cidade secreta';
  assert.equal(plan(g).path.length,0);
  const projected=projectPlayerGame(g,g.survivors[0].id);
  assert.equal(projected.hexes['3,0'].connections,undefined);assert.equal(projected.hexes['3,0'].region,undefined);
  assert.equal(projected.hexes['2,0'].connections.some(l=>l.to==='3,0'),false);
  assert.equal(visibleWorldConnections(g.hexes).some(l=>l.from==='3,0'||l.to==='3,0'),false);
  const changed=structuredClone(projected);setWorldConnection(changed.hexes,'0,0','1,0','road',true);
  assert.equal(playerEditPayload(projected,changed),null);
});

test('planner uses a known detour and movement rejects a blocked edge without side effects',()=>{
  const g=fixture();setWorldConnection(g.hexes,'0,0','1,0','road',true);
  setWorldConnection(g.hexes,'0,0','0,1','trail');setWorldConnection(g.hexes,'0,1','1,0','trail');
  const snapshot=structuredClone(g),p=plan(g);
  assert.deepEqual(p.path.slice(0,3),['0,0','0,1','1,0']);assert.equal(p.distanceKm,22);assert.equal(p.minutes,660);
  assert.deepEqual(g,snapshot);
  assert.equal(moveSurvivors(g,'1,0',[g.survivors[0].id]).ok,false);
  assert.equal(scheduleSurvivorTravel(g,'1,0',[g.survivors[0].id]).ok,false);
  assert.equal(performHexAction(g,'1,0',{type:'travel'}).ok,false);assert.deepEqual(g,snapshot);
  setWorldConnection(g.hexes,'0,0','1,0','road',false);assert.equal(plan(g).distanceKm,20);
});

test('planner totals actual traversal costs, conditions, companions, reserve and personal provisions',()=>{
  const g=fixture();g.hexes['2,0'].routeHours=2;
  g.survivors[0].conditions=[{id:'leg',kind:'fracture',bodyRegion:'left-leg'}];
  g.survivors[0].food=3;g.survivors[0].water=2;
  g.npcs=[{id:'n',name:'Elias',active:true,hex:'0,0',status:'Bem',accompaniesParty:true}];
  const p=plan(g,{reserveDays:1});assert.equal(p.minutes,990);assert.equal(p.stages.length,3);
  assert.equal(p.people,2);assert.equal(p.food,8);assert.equal(p.water,8);assert.equal(p.carriedFood,3);assert.equal(p.carriedWater,2);
});

test('daily stages respect recorded travel and midnight; planning never consumes or advances time',()=>{
  const g=fixture();const before=structuredClone(g);const p=plan(g);
  assert.deepEqual(p.stages.map(s=>s.minutes),[480,120]);assert.deepEqual(g,before);
  g.activities=[{id:'walk',type:'travel',day:g.day,startMinute:0,endMinute:480,status:'completed',participantIds:[g.survivors[0].id]}];
  const tomorrow=plan(g);assert.equal(tomorrow.walkedToday,480);assert.equal(tomorrow.stages[0].day,g.day+1);
  delete g.activities;g.minutes=1410;assert.equal(plan(g).stages[0].day,g.day+1);
});

test('terrain routes are an explicit option and still avoid blocked edges',()=>{
  const g=fixture();setWorldConnection(g.hexes,'0,0','1,0','none');
  assert.ok(plan(g).error);assert.equal(plan(g,{mode:'any'}).error,null);
  setWorldConnection(g.hexes,'0,0','1,0','road',true);
  assert.notEqual(plan(g,{mode:'any'}).path[1],'1,0');
});
