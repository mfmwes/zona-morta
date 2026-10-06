/* eslint-disable @typescript-eslint/no-require-imports -- existing Node loader with aliases for component rendering */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const loader=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText,p);
require.extensions['.ts']=loader;require.extensions['.tsx']=loader;
const originalLoad=Module._load;
Module._load=function(name,parent,main){if(name.startsWith('@/')){const base=path.join(__dirname,'..',name.slice(2));const actual=['','.ts','.tsx','.json'].map(ext=>base+ext).find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());if(actual)return originalLoad.call(this,actual,parent,main);}return originalLoad.call(this,name,parent,main);};
const {actionsInContext}=require('../lib/player-action-context.ts');
const {MasterContextActions,PlayerContextActions}=require('../components/player-actions-panel.tsx');
Module._load=originalLoad;
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {defaultState,initialSurvivor,content}=require('../lib/game.ts');
function fixture(){
 const game=defaultState(), a=content.archetypes[0];
 const actor=initialSurvivor({name:'Nina',origin:content.origins[1].name,past:'',archetype:a.name,specialty:a.specialties[0].name,freeExperience:'Resgates',techniques:[],attributes:{Agilidade:2,Força:1,Finesse:1,Instinto:0,Presença:0,Conhecimento:-1},primary:'',secondary:'',protection:'',personal:''});game.survivors=[actor];
 const area=(pointId,name)=>({hexId:'0,0',pointId,areaId:pointId+'-area',name,pointName:pointId,signal:'Porta aberta',minutes:30,noise:0,access:'open',objectives:['open'],available:true});
 const op=(id,type,extra={})=>({id,type,initiatorId:actor.id,day:1,scene:1,hexId:'0,0',status:'forming',participantIds:[actor.id],invitedIds:[],...extra});
 const view={policy:{paused:false,transfers:true,deposits:true,rest:true,tokens:true},actorId:actor.id,hexId:'0,0',busy:null,peers:[{id:actor.id,name:'Nina',hex:'0,0'}],areas:[area('market','Cozinha do mercado'),area('hospital','Sala do hospital')],stock:[{hexId:'0,0',pointId:'market',stockId:'food',name:'Latas no mercado',remaining:2,accessible:true},{hexId:'0,0',pointId:'hospital',stockId:'medicine',name:'Remédios no hospital',remaining:1,accessible:true}],routes:[{destination:'1,0',name:'Oficinas',minutes:60},{destination:'0,1',name:'Canal',minutes:60}],operations:[op('search-market','search',{pointId:'market',areaId:'market-area'}),op('search-hospital','search',{pointId:'hospital'}),op('trip-one','travel',{destination:'1,0'}),op('trip-two','travel',{destination:'0,1'}),op('transfer','transfer'),op('rest','rest',{kind:'short'})],supplies:[{key:'food',name:'Comida',available:10,allowance:2}],markers:[]};
 game.publicPlayerActions=view;return {game,view,actor};
}
test('busca permanece no local aberto: áreas, estoque e propostas de outro local são excluídos',()=>{
 const {view}=fixture();const result=actionsInContext(view,{kind:'search',hexId:'0,0',pointId:'market'});
 assert.deepEqual(result.areas.map(a=>a.pointId),['market']);assert.deepEqual(result.stock.map(s=>s.stockId),['food']);assert.deepEqual(result.operations.map(o=>o.id),['search-market']);assert.deepEqual(result.routes,[]);
 assert.equal(view.areas.length,2);
 assert.equal(actionsInContext(view,{kind:'search',hexId:'1,0',pointId:'market'}).operations.length,0);
});
test('confirmação de viagem acompanha o destino selecionado; inventário e descanso mostram suas próprias operações',()=>{
 const {view}=fixture();const trip=actionsInContext(view,{kind:'travel',destination:'1,0'});assert.deepEqual(trip.routes.map(r=>r.destination),['1,0']);assert.deepEqual(trip.operations.map(o=>o.id),['trip-one']);
 assert.deepEqual(actionsInContext(view,{kind:'inventory'}).operations.map(o=>o.type),['transfer']);
 assert.deepEqual(actionsInContext(view,{kind:'rest'}).operations.map(o=>o.type),['rest']);
 assert.deepEqual(actionsInContext(view,{kind:'supplies'}).operations,[]);
});
function render(context){const {game,actor}=fixture();return renderToStaticMarkup(React.createElement(PlayerContextActions,{game,context,controls:{actorId:actor.id,canAct:true,send:async()=>{}}}));}
test('interface de busca local não oferece troca de seção nem seleção de outro local',()=>{
 const html=render({kind:'search',hexId:'0,0',pointId:'market'});
 assert.ok(html.includes('Cozinha do mercado'));assert.ok(html.includes('Latas no mercado'));assert.equal(html.includes('Sala do hospital'),false);assert.equal(html.includes('Remédios no hospital'),false);
 assert.equal(html.includes('Tipos de ações da equipe'),false);assert.equal(html.includes('Oferecer item ao sobrevivente'),false);assert.equal(html.includes('Retirar suprimentos liberados'),false);
});
test('inventário contém entregas; abrigo contém depósitos e cotas; cena não cria segunda prévia',()=>{
 const inventory=render({kind:'inventory'}),supplies=render({kind:'supplies'}),scene=render({kind:'scene'});
 assert.ok(inventory.includes('Oferecer item ao sobrevivente'));assert.equal(inventory.includes('Depositar no abrigo'),false);assert.equal(inventory.includes('Retirar suprimentos liberados'),false);
 assert.ok(supplies.includes('Depositar no abrigo'));assert.ok(supplies.includes('Retirar suprimentos liberados'));assert.equal(supplies.includes('Oferecer item ao sobrevivente'),false);
 assert.ok(scene.includes('Selecione uma posição na cena acima'));assert.equal(scene.includes('Prévia da cena'),false);
});

function renderMaster(context, setup=()=>{}) {
 const {game}=fixture();setup(game);
 return renderToStaticMarkup(React.createElement(MasterContextActions,{game,context,controls:{canAct:true,send:async()=>{}}}));
}
test('buscas dispensam liberação por área e viagens mantêm rotas por hex de partida',()=>{
 const setup=game=>{
  game.hexes['0,0'].discovery='explorado';
  const point=(id,name)=>({id,name,revealed:true,preparation:{areas:[{id:id+'-area',name:name+' área',minutes:30,access:'open'}]}});
  game.hexes['0,0'].points=[point('market','Mercado autorizado'),point('hospital','Hospital distante')];
  game.playerActions={policy:{paused:false,transfers:true,deposits:true,rest:true,tokens:true,areas:[],routes:[{from:'0,0',to:'1,0'},{from:'1,0',to:'0,0'}],supplies:{food:2,water:2,items:{}}},operations:[],receipts:[],withdrawals:[],markers:[]};
 };
 const search=renderMaster({kind:'search',hexId:'0,0',pointId:'market'},setup);
 assert.equal(search,'');assert.equal(search.includes('Hospital distante'),false);
 assert.equal(search.includes('Retiradas do depósito'),false);assert.equal(search.includes('Rotas liberadas'),false);
 const travel=renderMaster({kind:'travel',destination:'0,0'},setup);
 assert.equal((travel.match(/Remover liberação/g)||[]).length,1);assert.equal(travel.includes('Áreas de busca liberadas'),false);
});
test('mestre administra depósitos, entregas e tokens; descanso não exige liberação adicional',()=>{
 const supplies=renderMaster({kind:'supplies'}),inventory=renderMaster({kind:'inventory'}),rest=renderMaster({kind:'rest'}),scene=renderMaster({kind:'scene'});
 assert.ok(supplies.includes('Retiradas do depósito'));assert.ok(supplies.includes('Depósito de itens próprios'));assert.equal(supplies.includes('Entregas entre sobreviventes'),false);
 assert.ok(inventory.includes('Entregas entre sobreviventes'));assert.equal(inventory.includes('Retiradas do depósito'),false);
 assert.equal(rest,'');assert.ok(scene.includes('Mover o próprio token'));assert.equal(scene.includes('Pausar ações'),false);
 const overview=renderMaster({kind:'overview'},game=>{ const state=require('../lib/player-actions.ts').playerActionState(game);game.playerActions={...state,operations:[{id:'request',type:'exception',day:game.day,initiatorId:game.survivors[0].id,attention:'Porta bloqueada',purpose:'Abrir a porta'}]}; });
 assert.ok(overview.includes('Pausar ações dos jogadores'));assert.ok(overview.includes('Pedidos e consequências'));assert.equal(overview.includes('Áreas de busca liberadas'),false);assert.equal(overview.includes('Retiradas do depósito'),false);
});
