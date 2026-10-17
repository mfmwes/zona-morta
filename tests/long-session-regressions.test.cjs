/* eslint-disable @typescript-eslint/no-require-imports -- existing TypeScript test loader */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),Module=require('node:module');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(n,p,...args){return resolve.call(this,n.startsWith('@/')?path.join(__dirname,'..',n.slice(2)):n,p,...args)};
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const {defaultState,initialSurvivor,content}=require('../lib/game.ts');
const {scheduleSurvivorTravel}=require('../lib/hex-actions.ts');
const {scheduleActivity,cancelActivity}=require('../lib/activity-timeline.ts');
const {advanceExpeditionTime}=require('../lib/expedition-clock.ts');
const {planJourney}=require('../lib/journey.ts');
const {validState}=require('../lib/campaign-validation.ts');
const {projectPlayerGame}=require('../lib/collaboration.ts');
const {itemFromCatalog,deployCart,storeInCart,removeFromCart,consumeProvisionItem}=require('../lib/inventory.ts');
const {groupReserves}=require('../lib/group-reserves.ts');
const {physicalFoodExpired,expirePhysicalFood}=require('../lib/provisions.ts');
function fixture(count=2){const g=defaultState(),a=content.archetypes[0];g.minutes=480;g.npcs=[];g.shelter.residents=0;g.shelter.food=99;g.shelter.water=99;g.survivors=Array.from({length:count},(_,i)=>({...initialSurvivor({name:'Pessoa '+i,origin:content.origins[0].name,past:'',archetype:a.name,specialty:a.specialties[0].name,freeExperience:'Resgates',techniques:[],attributes:{Força:1},primary:'',secondary:'',protection:'',personal:''}),hex:i?'0,1':'0,0',food:20,water:20}));for(const h of Object.values(g.hexes)){h.discovery='explorado';h.events=[];h.routeHours=1;}return g;}
const plan=g=>planJourney(g,{from:g.survivors[0].hex,to:g.survivors[0].hex==='0,0'?'1,0':'0,0',survivorIds:[g.survivors[0].id],mode:'any',dailyHours:8,reserveDays:0});
const restore=g=>JSON.parse(JSON.stringify(g));
test('120 completed travels retain every participant daily march after history pruning and reload',()=>{
 let g=fixture(12);for(const p of g.survivors.slice(0,6))p.hex='0,0';for(const p of g.survivors.slice(6))p.hex='0,1';
 for(let wave=0;wave<10;wave++){const ids=g.survivors.map(p=>p.id);for(let i=0;i<ids.length;i++){const current=g.survivors[i].hex;const next=i<6?(current==='0,0'?'1,0':'0,0'):(current==='0,1'?'1,1':'0,1');assert.equal(scheduleSurvivorTravel(g,next,[ids[i]]).ok,true);}assert.equal(advanceExpeditionTime(g,60).ok,true);g=restore(g);assert.equal(validState(g),true);}
 assert.equal(plan(g).walkedToday,600);assert.equal(plan(g).stages[0].day,2);assert.ok(g.activities.length<=130);assert.equal(projectPlayerGame(g,g.survivors[0].id).archivedTravel,undefined);
 assert.equal(advanceExpeditionTime(g,1440-g.minutes+480).ok,true);assert.equal(plan(restore(g)).walkedToday,0);assert.equal(g.archivedTravel,undefined);
});
test('partial cancelled march is archived once and rejected attempts do not change it',()=>{
 let g=fixture();const a=g.survivors[0].id,b=g.survivors[1].id;assert.equal(scheduleSurvivorTravel(g,'1,0',[a]).ok,true);assert.equal(advanceExpeditionTime(g,30).ok,true);assert.equal(cancelActivity(g,g.activities[0].id),true);
 for(let n=0;n<105;n++){const r=scheduleActivity(g,{type:'rest',kind:'short',selections:[{survivorId:b,choices:[{action:'fiction',targetId:b},{action:'fiction',targetId:b}]}]},[b],60,'Descanso');assert.equal(r.ok,true);cancelActivity(g,r.activity.id);g=restore(g);}
 assert.equal(plan(g).walkedToday,30);assert.equal(validState(g),true);const before=structuredClone(g);assert.equal(scheduleActivity(g,{type:'travel',destination:'1,0'},[a],1440,'Inválida').ok,false);assert.deepEqual(g,before);assert.equal(plan(g).walkedToday,30);
 const invalid=structuredClone(g);invalid.archivedTravel.minutes[a]=-1;assert.equal(validState(invalid),false);invalid.archivedTravel.minutes[a]=Infinity;assert.equal(validState(invalid),false);delete invalid.archivedTravel;assert.equal(validState(invalid),true);
});
test('fresh food in an open cart expires on its normal day and cannot be consumed after removal',()=>{
 let g=fixture(1);const p=g.survivors[0],cart=itemFromCatalog(content.catalog.find(e=>e.name==='Carrinho dobrável')),food=itemFromCatalog(content.catalog.find(e=>e.name==='Fruta firme'),1,'Íntegro',1);p.inventory.push(cart,food);deployCart(p,cart.id);assert.equal(storeInCart(p,food.id),true);g=restore(g);assert.equal(advanceExpeditionTime(g,2*1440).ok,true);g=restore(g);
 const person=g.survivors[0],stored=person.inventory.find(i=>i.id===cart.id).cartItems[0];assert.equal(stored.condition,'Estragado');assert.equal(removeFromCart(person,cart.id,stored.id),true);const removed=person.inventory.find(i=>i.name==='Fruta firme');assert.equal(consumeProvisionItem(g,person.id,removed.id),null);assert.equal(person.foodConsumedDay,2);assert.equal(validState(g),true);
});
test('legacy overdue fruit is excluded from map and journey totals and rejected on consumption without a day change',()=>{
 const g=fixture(1),p=g.survivors[0];g.day=4;p.food=0;g.shelter.food=0;const food=itemFromCatalog(content.catalog.find(e=>e.name==='Fruta firme'),1,'Íntegro',1);p.inventory.push(food);assert.equal(groupReserves(g).total.food,0);assert.equal(plan(g).carriedFood,0);assert.equal(consumeProvisionItem(g,p.id,food.id),null);assert.equal(p.foodConsumedDay,undefined);assert.equal(food.condition,'Estragado');
});
test('cart contents do not inherit shelter refrigeration, while durable food remains intact',()=>{
 const g=fixture(1);g.day=4;const frozen=content.catalog.find(e=>e.category==='Alimentos'&&e.fields.some(f=>f.label==='Prazo'&&f.value==='C'));assert.ok(frozen);const cold=itemFromCatalog(frozen,1,'Íntegro',1);cold.prepared=false;const durable=content.catalog.find(e=>e.category==='Alimentos'&&e.fields.some(f=>f.label==='Prazo'&&f.value==='D'));assert.ok(durable);const durableItem=itemFromCatalog(durable,1,'Íntegro',1);const cart=itemFromCatalog(content.catalog.find(e=>e.name==='Carrinho dobrável'));cart.cartItems=[{...cold},durableItem];assert.equal(physicalFoodExpired(cold,g.day,true),false);expirePhysicalFood(g,[cold,cart],true);assert.equal(cold.condition,'Íntegro');assert.equal(cart.cartItems[0].condition,'Estragado');assert.equal(durableItem.condition,'Íntegro');
});

test('map and itinerary totals stay constant when ready provisions move into and out of a cart',()=>{
 const g=fixture(1),p=g.survivors[0];const cart=itemFromCatalog(content.catalog.find(e=>e.name==='Carrinho dobrável'));
 const food=itemFromCatalog(content.catalog.find(e=>e.name==='Fruta firme'),1,'Íntegro',g.day),water=itemFromCatalog(content.catalog.find(e=>e.name==='Garrafa de água lacrada'),2,'Íntegro',g.day);p.inventory.push(cart,food,water);assert.equal(deployCart(p,cart.id),true);
 const expectedMap=groupReserves(g),expectedPlan=plan(g);assert.equal(storeInCart(p,food.id),true);assert.equal(storeInCart(p,water.id,2),true);const before=structuredClone(g);assert.deepEqual(groupReserves(g),expectedMap);assert.equal(plan(g).carriedFood,expectedPlan.carriedFood);assert.equal(plan(g).carriedWater,expectedPlan.carriedWater);assert.deepEqual(g,before);
 const restored=restore(g),person=restored.survivors[0],stored=person.inventory.find(i=>i.id===cart.id).cartItems[0];assert.equal(removeFromCart(person,cart.id,stored.id),true);assert.deepEqual(groupReserves(restored),expectedMap);assert.equal(plan(restored).carriedFood,expectedPlan.carriedFood);
});

test('cart totals exclude expired, unprepared, contaminated and unverified provisions',()=>{
 const g=fixture(1),p=g.survivors[0];g.day=4;p.food=0;p.water=0;g.shelter.food=0;g.shelter.water=0;
 const fruit=itemFromCatalog(content.catalog.find(e=>e.name==='Fruta firme'),1,'Íntegro',1);const cart=itemFromCatalog(content.catalog.find(e=>e.name==='Carrinho dobrável'));cart.cartDeployed=true;
 const item={name:'Provisão de teste',qty:1,load:0,provisionResource:'food',portionsPerUnit:4,prepared:true,condition:'Íntegro'};
 cart.cartItems=[fruit,{...item,id:'raw',prepared:false},{...item,id:'bad',condition:'Contaminado'},{...item,id:'explicit-expiry',expiresDay:4},{...item,id:'opened',portionsRemaining:2,opened:true},{...item,id:'water',provisionResource:'water',verified:false}];p.inventory=[cart];
 assert.deepEqual(groupReserves(g).total,{food:2,water:0,parts:g.shelter.parts});assert.equal(plan(g).carriedFood,2);assert.equal(plan(g).carriedWater,0);
});

test('a remote survivor cart is included only for that survivor group and selected itinerary participants',()=>{
 const g=fixture(2);g.shelter.hex='0,0';const p=g.survivors[1],cart=itemFromCatalog(content.catalog.find(e=>e.name==='Carrinho dobrável'));cart.cartDeployed=true;cart.cartItems=[itemFromCatalog(content.catalog.find(e=>e.name==='Garrafa de água lacrada'),2,'Íntegro',g.day)];p.inventory=[cart];
 const before=groupReserves(g,'0,0');const remote=groupReserves(g,'0,1');assert.equal(remote.personal.water,22);assert.equal(before.personal.water,20);assert.equal(plan(g).carriedWater,20);
 const selected=planJourney(g,{from:'0,1',to:'1,1',survivorIds:[p.id],mode:'any',dailyHours:8,reserveDays:0});assert.equal(selected.carriedWater,22);assert.equal(remote.shared.water,0);
});
