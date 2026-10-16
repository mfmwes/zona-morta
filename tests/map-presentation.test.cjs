/* eslint-disable @typescript-eslint/no-require-imports -- existing Node TypeScript loader */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,p);
const {mapArtworkIndex,findMapLocations,mapHexSummary}=require('../lib/map-presentation.ts');
const hex=(overrides={})=>({discovery:'explorado',terrain:'urban',sector:{name:'Bairro residencial'},points:[],events:[],...overrides});

test('map artwork never reveals an unknown sector and uses visible terrain/name only',()=>{
  assert.equal(mapArtworkIndex(hex({discovery:'desconhecido',sector:{name:'Hospital secreto'}})),null);
  assert.equal(mapArtworkIndex(hex({sector:{name:'Reservatórios'}})),1);
  assert.equal(mapArtworkIndex(hex({sector:{name:'Cemitério e entorno'}})),9);
  assert.equal(mapArtworkIndex(hex({sector:{name:'Nó rodoviário'}})),10);
  assert.equal(mapArtworkIndex(hex({terrain:'forest',sector:{name:'Hospital'}})),13);
  assert.equal(mapArtworkIndex(hex({sector:{name:'Lugar personalizado'}})),0);
});
test('map search matches accents and coordinates but hides private points and unknown names',()=>{
  const hexes={'0,0':hex({points:[{id:'a',name:'Farmácia da praça',revealed:true},{id:'b',name:'Depósito secreto',revealed:false}]}),'1,0':hex({discovery:'desconhecido',sector:{name:'Quartel secreto'},points:[{id:'c',name:'Pista escondida',revealed:true}]})};
  assert.equal(findMapLocations(hexes,'farmacia',true)[0].pointName,'Farmácia da praça');
  assert.deepEqual(findMapLocations(hexes,'secreto',true),[]);
  assert.deepEqual(findMapLocations(hexes,'escondida',true),[]);
  assert.equal(findMapLocations(hexes,'1,0',true)[0].name,'Desconhecido');
  assert.equal(findMapLocations(hexes,'Depósito',false)[0].id,'0,0');
});
test('map filters use public stock projection for players and omit hidden/pending events',()=>{
  const game={hexes:{'0,0':hex({points:[{id:'a',revealed:true,preparation:{stock:[{remaining:99}]}},{id:'b',revealed:false,preparation:{stock:[{remaining:5}]}}],events:[{revealed:true,status:'active'},{revealed:false,status:'active'},{revealed:true,status:'pending'},{revealed:true,status:'resolved'}]})},publicPlayerActions:{locations:[{hexId:'0,0',pointId:'a',stockUnits:3},{hexId:'0,0',pointId:'b',stockUnits:5}]}};
  assert.deepEqual(mapHexSummary(game,'0,0',false),{stock:104,events:3});
  assert.deepEqual(mapHexSummary(game,'0,0',true),{stock:3,events:1});
  delete game.publicPlayerActions;assert.equal(mapHexSummary(game,'0,0',true).stock,0);
  game.hexes['0,0'].discovery='desconhecido';assert.deepEqual(mapHexSummary(game,'0,0',true),{stock:0,events:0});
});
