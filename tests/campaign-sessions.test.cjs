/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const {defaultState,initialSurvivor,content,addLog}=require('../lib/game.ts');
const {applySessionCommand,sessionEntries,validCampaignSessions}=require('../lib/campaign-sessions.ts');
const {projectPlayerGame}=require('../lib/collaboration.ts');
const {clearCampaignHistory}=require('../lib/history.ts');
function fixture(){const g=defaultState();const a=content.archetypes[0];g.survivors=[initialSurvivor({name:'Ana',origin:content.origins[1].name,past:'',archetype:a.name,specialty:a.specialties[0].name,freeExperience:'',techniques:[],attributes:{Instinto:1},primary:'',secondary:'',protection:'',personal:''})];return g;}
const start={action:'start',name:'Sessão 1',summary:'',checkpoint:false};
test('sessão atravessa dias, preserva resumo e pendências após limpar diário, sem avançar tempo',()=>{
 const g=fixture();const before={day:g.day,minutes:g.minutes};applySessionCommand(g,start);assert.deepEqual({day:g.day,minutes:g.minutes},before);
 const s=g.sessions[0];addLog(g,'travessia','Encontraram um hospital.');g.day=2;g.minutes=600;addLog(g,'evento','Negociaram com Joana.');
 g.survivors[0].eventConditions=[{name:'Restrito',effect:'Preso.',clear:'Libertar.'}];
 applySessionCommand(g,{action:'end',name:'',summary:'Retomar o resgate.',checkpoint:false,expectedSessionId:s.id});
 assert.equal(s.endDay,2);assert.deepEqual(s.entries.map(e=>e.text),['Encontraram um hospital.','Negociaram com Joana.']);assert.match(s.pending.join(' '),/Ana/);assert.equal(s.summary,'Retomar o resgate.');
 const saved=structuredClone(s);clearCampaignHistory(g,'events');assert.deepEqual(g.sessions[0],saved);assert.deepEqual(sessionEntries(g,s),saved.entries);assert.equal(validCampaignSessions(g.sessions),true);
 assert.equal(projectPlayerGame(g,g.survivors[0].id).sessions,undefined);
});
test('sessão rejeita dupla abertura e encerramento antigo; retomada separa registros entre sessões',()=>{
 const g=fixture();applySessionCommand(g,start);const s=g.sessions[0];const before=structuredClone(g);
 assert.throws(()=>applySessionCommand(g,start));assert.deepEqual(g,before);
 assert.throws(()=>applySessionCommand(g,{action:'end',summary:'',expectedSessionId:'errado'}));assert.deepEqual(g,before);
 applySessionCommand(g,{action:'end',summary:'',expectedSessionId:s.id});applySessionCommand(g,{...start,name:'Sessão 2'});addLog(g,'evento','Nova decisão.');assert.deepEqual(sessionEntries(g,g.sessions[1]).map(e=>e.text),['Nova decisão.']);
});
test('validação aceita campanhas antigas e bloqueia sessões inválidas ou excessivas',()=>{
 assert.equal(validCampaignSessions(undefined),true);const g=fixture();applySessionCommand(g,start);assert.equal(validCampaignSessions(g.sessions),true);
 assert.equal(validCampaignSessions([...g.sessions,...g.sessions]),false);
 assert.equal(validCampaignSessions([{...g.sessions[0],summary:'x'.repeat(2001)}]),false);
 assert.equal(validCampaignSessions([{...g.sessions[0],endDay:2}]),false);
});
