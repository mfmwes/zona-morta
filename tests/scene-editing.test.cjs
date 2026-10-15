/* eslint-disable @typescript-eslint/no-require-imports -- existing Node TypeScript test loader */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (m,p) => m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const {createSceneBoardScene,createSceneBoardObject,validSceneBoardState}=require('../lib/scene-board.ts');
const {describeSceneEdit,applySceneEdit,emptySceneHistory,recordSceneEdit}=require('../lib/scene-history.ts');
const {createSceneTemplate,insertSceneTemplate,readSceneLibrary}=require('../lib/scene-templates.ts');
function fixture(){const scene=createSceneBoardScene();scene.objects=[createSceneBoardObject('wall','Parede'),createSceneBoardObject('furniture','Mesa','table')];return scene;}

test('undo/redo retains unrelated remote edits and rejects changed target atomically',()=>{
 const before=fixture(), after=structuredClone(before);after.objects[0].x+=40;
 const entry=describeSceneEdit(before,after);after.objects[1].label='Renomeada por outra pessoa';
 const undo=applySceneEdit(after,entry,'undo');assert.ok(undo.ok);assert.equal(undo.scene.objects[0].x,before.objects[0].x);assert.equal(undo.scene.objects[1].label,'Renomeada por outra pessoa');
 const redo=applySceneEdit(undo.scene,entry,'redo');assert.ok(redo.ok);assert.equal(redo.scene.objects[0].x,after.objects[0].x);
 after.objects[0].x+=20;const copy=structuredClone(after);assert.equal(applySceneEdit(after,entry,'undo').ok,false);assert.deepEqual(after,copy);
});
test('new remote fixture prevents undoing its wall and preserves both',()=>{
 const before=fixture(),after=structuredClone(before);after.objects[0].x+=20;const entry=describeSceneEdit(before,after);
 const wall=after.objects[0];after.objects.push({...createSceneBoardObject('door','Porta'),parentWallId:wall.id});
 assert.equal(applySceneEdit(after,entry,'undo').ok,false);
});
test('deletion restores wall with fixtures; creation preserves background order after redo',()=>{
 const before=fixture();before.objects.push({...createSceneBoardObject('door','Porta'),parentWallId:before.objects[0].id});
 const after=structuredClone(before);after.objects=after.objects.filter(o=>o.kind==='furniture');
 const entry=describeSceneEdit(before,after),undo=applySceneEdit(after,entry,'undo');assert.ok(undo.ok);assert.deepEqual(undo.scene,before);assert.ok(validSceneBoardState({scenes:[undo.scene]}));
 const withZone=structuredClone(before);withZone.objects.unshift(createSceneBoardObject('zone','Sala'));
 const add=describeSceneEdit(before,withZone);const removed=applySceneEdit(withZone,add,'undo');assert.ok(removed.ok);const redo=applySceneEdit(removed.scene,add,'redo');assert.ok(redo.ok);assert.deepEqual(redo.scene,withZone);
});
test('history tracks settings and reordering, caps entries, clears redo on a new edit',()=>{
 const before=fixture(),after=structuredClone(before);after.showGrid=false;after.objects.reverse();
 const entry=describeSceneEdit(before,after);assert.deepEqual(applySceneEdit(after,entry,'undo').scene,before);
 const history=emptySceneHistory();for(let i=0;i<65;i++)recordSceneEdit(history,entry);assert.equal(history.undo.length,50);history.redo.push(entry);recordSceneEdit(history,null);assert.equal(history.redo.length,1);recordSceneEdit(history,entry);assert.equal(history.redo.length,0);
 assert.equal(applySceneEdit({...after,id:'other'},entry,'undo').ok,false);
});
test('templates include walls for fixtures, exclude characters and remap IDs per insertion',()=>{
 const scene=fixture();const wall=scene.objects[0];const door={...createSceneBoardObject('door','Porta'),parentWallId:wall.id};scene.objects.push(door,{...createSceneBoardObject('token','Privado'),tokenKind:'survivor',refId:'secret'});
 const template=createSceneTemplate(scene,[door.id,scene.objects[3].id],'Sala');assert.equal(template.objects.length,2);assert.ok(!JSON.stringify(template).includes('secret'));
 const first=insertSceneTemplate(scene,template),second=insertSceneTemplate(scene,template);assert.notEqual(first[0].id,second[0].id);assert.equal(first.find(o=>o.kind==='door').parentWallId,first.find(o=>o.kind==='wall').id);
 assert.ok(validSceneBoardState({scenes:[{...scene,objects:[...scene.objects,...first,...second]}]}));
});
test('library handles corrupt data, disallows linked tokens and insertion rejects oversized/overflow models',()=>{
 assert.deepEqual(readSceneLibrary('bad'),{templates:[],favorites:[]});
 const scene=fixture(), template=createSceneTemplate(scene,scene.objects.map(o=>o.id),'Casa');
 assert.equal(readSceneLibrary(JSON.stringify({templates:[template],favorites:['furniture:table','furniture:table']})).templates.length,1);
 const invalid=structuredClone(template);invalid.objects.push({...createSceneBoardObject('token','Pessoa'),refId:'private'});
 assert.equal(readSceneLibrary(JSON.stringify({templates:[invalid],favorites:[]})).templates.length,0);
 assert.throws(()=>createSceneTemplate(scene,[],'Vazio'));
 const full={...scene,objects:Array.from({length:250},()=>createSceneBoardObject('prop','Item'))};assert.throws(()=>insertSceneTemplate(full,template));
 const wide=structuredClone(template);wide.objects[0].width=2000;assert.throws(()=>insertSceneTemplate(scene,wide));
});
