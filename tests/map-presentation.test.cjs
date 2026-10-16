/* eslint-disable @typescript-eslint/no-require-imports -- existing Node TypeScript loader */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,p);
const {mapArtworkIndex}=require('../lib/map-presentation.ts');
const hex=(overrides={})=>({discovery:'explorado',terrain:'urban',sector:{name:'Bairro residencial'},points:[],events:[],...overrides});

test('road bridge uses bridge artwork across rural terrain without exposing unknown content',()=>{
  const bridge=hex({terrain:'rural',passage:'road',sector:{name:'Ponte bloqueada'}});
  assert.equal(mapArtworkIndex(bridge),6);
  assert.equal(mapArtworkIndex({...bridge,discovery:'desconhecido'}),null);
});

test('map artwork never reveals an unknown sector and uses visible terrain/name only',()=>{
  assert.equal(mapArtworkIndex(hex({discovery:'desconhecido',sector:{name:'Hospital secreto'}})),null);
  assert.equal(mapArtworkIndex(hex({sector:{name:'Reservatórios'}})),1);
  assert.equal(mapArtworkIndex(hex({sector:{name:'Cemitério e entorno'}})),9);
  assert.equal(mapArtworkIndex(hex({sector:{name:'Nó rodoviário'}})),10);
  assert.equal(mapArtworkIndex(hex({terrain:'forest',sector:{name:'Hospital'}})),13);
  assert.equal(mapArtworkIndex(hex({sector:{name:'Lugar personalizado'}})),0);
});
