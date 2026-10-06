/* eslint-disable @typescript-eslint/no-require-imports -- route dependencies stubbed for authentication/CAS integration */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const Module=require('node:module');
const path=require('node:path');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const {defaultState,initialSurvivor,content}=require('../lib/game.ts');
let state, revision, actor, authenticated, origin, race, writes;
const db={campaignOwnerId:async()=> 'master',findPlayer:async()=>({survivor_id:actor}),readCampaign:async()=>({state:structuredClone(state),revision}),writeCampaign:async(_,next,expected)=>{
 writes++;
 if(race){race=false;state.fear=4;revision++;return null;}
 if(expected!==revision)return null;
 state=structuredClone(next);return ++revision;
}};
const originalLoad=Module._load;
Module._load=function(name,parent,main){
 if(name==='@/db/state')return db;
 if(name==='@/lib/auth')return {siteUser:async()=>authenticated,sameOrigin:()=>origin};
 if(name.startsWith('@/'))return originalLoad.call(this,path.join(__dirname,'..',name.slice(2)+'.ts'),parent,main);
 return originalLoad.call(this,name,parent,main);
};
const {POST}=require('../app/api/campaign/actions/route.ts');
Module._load=originalLoad;
function reset(){
 state=defaultState(); const a=content.archetypes[0];
 state.survivors=[initialSurvivor({name:'Nina',origin:content.origins[1].name,past:'',archetype:a.name,specialty:a.specialties[0].name,freeExperience:'Resgates',techniques:[],attributes:{Agilidade:2,Força:1,Finesse:1,Instinto:0,Presença:0,Conhecimento:-1},primary:'',secondary:'',protection:'',personal:''})];
 actor=state.survivors[0].id;revision=1;authenticated={id:'player',email:'player@example.test'};origin=true;race=false;writes=0;
}
function send(body){return POST(new Request('https://example.test/api/campaign/actions?campanha=campaign',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));}
test('endpoint exige sessão, mesma origem e associação; jogador não altera permissões nem finge outro ator',async()=>{
 reset();authenticated=null;assert.equal((await send({})).status,401);
 reset();origin=false;assert.equal((await send({})).status,403);
 reset();assert.equal((await send({type:'policy',policy:{}})).status,403);
 assert.equal((await send({type:'request',id:'fake',day:state.day,text:'Ajuda',actorId:'outro'})).status,409);assert.equal(writes,0);
});
test('endpoint refaz CAS sem perder edição paralela; reenvio não cria segundo pedido ou gravação',async()=>{
 reset();race=true;
 const input={type:'request',id:'same-request',day:state.day,text:'Abrir porta bloqueada'};
 const response=await send(input);assert.equal(response.status,200);
 const result=await response.json();assert.equal(result.state.playerActions,undefined);assert.equal(result.state.publicPlayerActions.actorId,actor);
 assert.equal(state.fear,4);assert.equal(state.playerActions.operations.length,1);assert.equal(writes,2);
 const replay=await send(input);assert.equal(replay.status,200);assert.equal(writes,2);assert.equal(state.playerActions.receipts.length,1);
 const changed=await send({...input,text:'Outro pedido'});assert.equal(changed.status,409);assert.equal(writes,2);
});
test('mestre não sobrescreve rascunho de permissões desatualizado',async()=>{
 reset();authenticated={id:'master'};
 const {playerActionState}=require('../lib/player-actions.ts');
 const policy=playerActionState(state).policy;
 assert.equal((await send({type:'policy',policy:{...policy,transfers:true},expectedPolicy:'stale'})).status,409);assert.equal(writes,0);
 assert.equal((await send({type:'policy',policy:{...policy,transfers:true},expectedPolicy:JSON.stringify(policy)})).status,200);assert.equal(state.playerActions.policy.transfers,true);
});
