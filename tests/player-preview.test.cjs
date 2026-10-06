/* eslint-disable @typescript-eslint/no-require-imports -- Node tests transpile application TypeScript. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const {PlayerPreviewSession,playerTeamPeers}=require('../lib/player-preview.ts');
const {defaultState,initialSurvivor,content,addLog}=require('../lib/game.ts');
const {projectPlayerGame}=require('../lib/collaboration.ts');
const {createConflictScene,queueSurvivorDamage}=require('../lib/conflict.ts');
function campaign(){
 const game=defaultState();
 game.survivors=['Primeiro','Escolhido'].map(name=>initialSurvivor({name,origin:content.origins[0].name,past:'',archetype:content.archetypes[0].name,specialty:content.archetypes[0].specialties[0].name,freeExperience:'',techniques:[],attributes:{},primary:'',secondary:'',protection:'Roupa reforçada',personal:''}));
 return game;
}
test('prévia escolhe o ator certo e usa exatamente a projeção pública da API',()=>{
 const source=campaign(),actor=source.survivors[1].id;
 source.shelter.notes='Nota privada';source.formerShelters=[{...source.shelter,name:'Depósito privado'}];
 addLog(source,'dados','Rolagem do primeiro',source.survivors[0].id);addLog(source,'dados','Rolagem escolhida',actor);
 const snapshot=JSON.stringify(source),session=new PlayerPreviewSession(source,actor);
 assert.deepEqual(session.view,projectPlayerGame(source,actor));
 assert.deepEqual(session.peers,playerTeamPeers(source));
 assert.equal(session.view.survivors.length,1);assert.equal(session.view.survivors[0].id,actor);
 assert.equal(session.view.shelter.notes,'');assert.deepEqual(session.view.formerShelters,[]);
 assert.equal(session.view.log.some(row=>row.text==='Rolagem do primeiro'),false);
 session.edit(draft=>{draft.survivors[0].hp=1;addLog(draft,'chat','Mensagem simulada',actor);});
 assert.equal(session.view.survivors[0].hp,1);assert.equal(session.view.log[0].text,'Mensagem simulada');
 assert.equal(JSON.stringify(source),snapshot);
 assert.throws(()=>session.edit(draft=>{draft.survivors[0].name='Não permitido';}));
 assert.throws(()=>session.edit(draft=>{draft.shelter.notes='Compartilhado';}));
 const reset=new PlayerPreviewSession(source,actor);assert.equal(reset.view.survivors[0].hp,0);
});
test('ações contextuais e Spotlight são simulados sem tocar na campanha real',()=>{
 const source=campaign(),actor=source.survivors[1].id;
 source.conflict=createConflictScene({name:'Cena',sceneNumber:1,day:1,time:'08:00',survivorIds:[actor]});
 const snapshot=JSON.stringify(source),session=new PlayerPreviewSession(source,actor);
 session.action({type:'request',id:'sim-request',day:1,text:'Abrir porta'});
 session.spotlight('request');assert.equal(session.view.publicConflict.spotlightRequested,true);
 session.spotlight('cancel');assert.equal(session.view.publicConflict.spotlightRequested,false);
 assert.equal(JSON.stringify(source),snapshot);
 assert.throws(()=>new PlayerPreviewSession(source,'inexistente'));
});
test('resolução de dano respeita o dono e atualiza apenas a cópia da prévia',()=>{
 const source=campaign(),actor=source.survivors[1].id;
 source.conflict=createConflictScene({name:'Cena',sceneNumber:1,day:1,time:'08:00',survivorIds:source.survivors.map(row=>row.id)});
 for(const person of source.survivors) queueSurvivorDamage(source.conflict,{targetSurvivorId:person.id,sourceThreatId:'threat',sourceName:'Errante',attackName:'Golpe',damage:8,damageType:'físico',tier:{key:'major',label:'Maior',hpMarks:2},day:1,time:'08:00'});
 const snapshot=JSON.stringify(source),session=new PlayerPreviewSession(source,actor);
 const own=source.conflict.damageRequests.find(row=>row.targetSurvivorId===actor);
 const other=source.conflict.damageRequests.find(row=>row.targetSurvivorId!==actor);
 assert.throws(()=>session.damage(other.id,'hp'));
 const result=session.damage(own.id,'hp');assert.equal(result.hpMarks,2);assert.equal(session.view.survivors[0].hp,2);
 assert.equal(session.view.publicConflict.pendingDamage.length,0);
 assert.equal(JSON.stringify(source),snapshot);
});
