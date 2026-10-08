/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const dice=require('../lib/free-dice.ts');const {defaultState,initialSurvivor,content,addLog}=require('../lib/game.ts');const {projectPlayerGame,playerEditPayload,applyPlayerChange}=require('../lib/collaboration.ts');const {historyEntries}=require('../lib/history.ts');
function fixture(){const g=defaultState(),a=content.archetypes[0];g.survivors=['Ana','Bia'].map(name=>initialSurvivor({name,origin:content.origins[1].name,past:'',archetype:a.name,specialty:a.specialties[0].name,freeExperience:'',techniques:[],attributes:{Instinto:1},primary:'',secondary:'',protection:'',personal:''}));return g;}
test('dados livres aceitam todos os tamanhos, misturas, negativos e vinte dados',()=>{
 const r=dice.rollFreeDice('d4+2d6+1d8+1d10+d12+d20+d100-3',f=>f);assert.equal(r.total,163);assert.equal(r.modifier,-3);assert.equal(r.formula,'1d4 + 2d6 + 1d8 + 1d10 + 1d12 + 1d20 + 1d100 − 3');assert.deepEqual(dice.readFreeDiceLog(dice.freeDiceLog(r)),r);
 const max=dice.rollFreeDice('20d100+999',()=>100);assert.equal(max.total,2999);assert.ok(dice.freeDiceLog(max).length<=600);assert.deepEqual(dice.readFreeDiceLog(dice.freeDiceLog(max)),max);
 assert.equal(dice.rollFreeDice('d4-999',()=>1).total,-998);
});
test('fórmulas inválidas não rolam dados e registros incoerentes são rejeitados',()=>{
 for(const f of ['','0d6','21d6','d3','d0','d1000','1d6-1d4','1d6+1000','123','1d6*2','1d6;alert(1)','1d6+','1d6+NaN']){let called=false;assert.throws(()=>dice.rollFreeDice(f,()=>{called=true;return 1;}));assert.equal(called,false);}
 const r=dice.rollFreeDice('2d6+3',()=>4);assert.equal(dice.readFreeDiceLog(dice.freeDiceLog({...r,total:12})),null);assert.equal(dice.readFreeDiceLog(dice.freeDiceLog({...r,dice:[{faces:6,values:[7,1]}]})),null);
});
test('rolagem do jogador mantém ficha e recursos e aparece para outro jogador',()=>{
 const g=fixture(),a=g.survivors[0],b=g.survivors[1];const before=projectPlayerGame(g,a.id),after=structuredClone(before);const roll=dice.rollFreeDice('2d8+1',()=>5);addLog(after,'rolagem',dice.freeDiceLog(roll),a.id);
 const payload=playerEditPayload(before,after);assert.ok(payload);const next=applyPlayerChange(g,a.id,payload.before,payload.after,payload.fearDelta,payload.logs,payload.noiseDelta,payload.shelterWorkActions);assert.ok(next);
 assert.deepEqual(next.survivors,g.survivors);assert.equal(next.fear,g.fear);assert.equal(next.noise,g.noise);assert.equal(next.minutes,g.minutes);
 const other=projectPlayerGame(next,b.id);assert.equal(other.log[0].kind,'rolagem');assert.equal(other.log[0].actorName,'Ana');assert.equal(historyEntries(other,'chat')[0].text,dice.freeDiceLog(roll));assert.equal(historyEntries(other,'events').some(e=>e.kind==='rolagem'),false);
 assert.equal(applyPlayerChange(g,a.id,a,a,0,[{kind:'rolagem',text:'falso'}]),null);
});
