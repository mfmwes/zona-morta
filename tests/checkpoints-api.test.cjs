/* eslint-disable @typescript-eslint/no-require-imports -- Exercise authorization and restoration with a revision-checked store. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const {defaultState}=require('../lib/game.ts');
let state,revision,user,origin,rows,race,writes;
function reset(){state=defaultState();state.campaignId='campaign';revision=1;user={id:'master',email:'master@example.test'};origin=true;rows=new Map();race=false;writes=0;}
const db={campaignOwnerId:async id=>id==='campaign'?'master':null,readCampaign:async()=>({state:structuredClone(state),revision}),writeCampaign:async(id,next,expected,safety)=>{writes++;if(race){race=false;state.noise=4;revision++;return null;}if(expected!==revision)return null;if(safety)rows.set('before-restore',{body:JSON.stringify(state),name:'Antes da última restauração',revision,safety:true});state=structuredClone(next);state.campaignId=id;return ++revision;}};
const storage={listCheckpoints:async()=>[...rows].map(([id,r])=>({id,name:r.name,revision:r.revision})),readCheckpoint:async(_,id)=>rows.get(id)??null,saveCheckpoint:async(_,id,name,expected,safety)=>{if(expected!==revision)return false;if(!safety&&rows.has(id))return false;rows.set(id,{body:JSON.stringify(state),name,revision,safety});return true;},deleteCheckpoint:async(_,id)=>rows.delete(id)};
const load=Module._load;Module._load=function(name,parent,main){if(name==='@/db/state')return db;if(name==='@/db/checkpoints')return storage;if(name==='@/lib/auth')return {siteUser:async()=>user,sameOrigin:()=>origin};if(name.startsWith('@/'))return load.call(this,path.join(__dirname,'..',name.slice(2)+'.ts'),parent,main);return load.call(this,name,parent,main);};
const {GET,POST}=require('../app/api/campaign/checkpoints/route.ts');const {defaultPlayerPolicy}=require('../lib/player-actions-types.ts');Module._load=load;
function request(body,campaign='campaign'){return new Request('https://example.test/api/campaign/checkpoints?campanha='+campaign,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
function get(campaign='campaign'){return GET(new Request('https://example.test/api/campaign/checkpoints?campanha='+campaign));}
test('pontos são restritos ao mestre e à campanha atual; pedidos de outra origem e inválidos não escrevem',async()=>{
 reset();user=null;assert.equal((await get()).status,401);user={id:'player'};assert.equal((await get()).status,403);assert.equal((await POST(request({action:'restore',id:'p',revision:1}))).status,403);
 user={id:'master'};assert.equal((await get('other')).status,403);origin=false;assert.equal((await POST(request({action:'create',id:'p',name:'Antes',revision:1}))).status,403);
 origin=true;assert.equal((await POST(request({action:'create',id:'p',name:'',revision:1}))).status,400);assert.equal((await POST(request({action:'create',id:'before-restore',name:'Falso',revision:1}))).status,400);assert.equal(rows.size,0);assert.equal(writes,0);
});
test('guardar e consultar pontos não altera o jogo nem revela o corpo privado na listagem',async()=>{
 reset();state.hexes['0,0'].notes='Segredo da campanha';const before=structuredClone(state);
 assert.equal((await POST(request({action:'create',id:'p',name:'Antes da busca',revision:1}))).status,200);const list=await (await get()).json();assert.equal(JSON.stringify(list).includes('Segredo'),false);assert.equal(list.checkpoints[0].name,'Antes da busca');assert.deepEqual(state,before);assert.equal(revision,1);
});
test('restaurar preserva o estado anterior, mantém identidade da campanha e aumenta a revisão',async()=>{
 reset();state.noise=1;await POST(request({action:'create',id:'p',name:'Antes',revision:1}));state.noise=3;revision=2;
 assert.equal((await POST(request({action:'restore',id:'p',revision:2}))).status,200);assert.equal(state.noise,1);assert.equal(state.campaignId,'campaign');assert.equal(revision,3);assert.equal(JSON.parse(rows.get('before-restore').body).noise,3);assert.match(state.log[0].text,/Ponto restaurado/);
 assert.equal((await POST(request({action:'restore',id:'before-restore',revision:3}))).status,200);assert.equal(state.noise,3);assert.equal(JSON.parse(rows.get('before-restore').body).noise,1);
});
test('mudança concorrente impede restauração e reenvio antigo sem sobrescrever o novo estado',async()=>{
 reset();await POST(request({action:'create',id:'p',name:'Antes',revision:1}));state.noise=2;revision=2;
 assert.equal((await POST(request({action:'restore',id:'p',revision:1}))).status,409);assert.equal(state.noise,2);race=true;
 assert.equal((await POST(request({action:'restore',id:'p',revision:2}))).status,409);assert.equal(state.noise,4);assert.equal(revision,3);assert.equal(rows.has("before-restore"),false);
});
test('restauração conserva recibos recentes do mesmo dia para impedir reaplicação de pedidos antigos',async()=>{
 reset();await POST(request({action:'create',id:'p',name:'Antes',revision:1}));state.playerActions={policy:defaultPlayerPolicy(),operations:[],receipts:[{id:'withdraw',actorId:'a',day:state.day,fingerprint:'old-request'}],withdrawals:[],markers:[]};revision=2;
 assert.equal((await POST(request({action:'restore',id:'p',revision:2}))).status,200);assert.equal(state.playerActions.receipts[0].id,'withdraw');
});
test('ponto incompatível ou inexistente não restaura; excluir ponto não altera fichas ou recursos',async()=>{
 reset();rows.set('bad',{body:'{}',name:'Inválido'});assert.equal((await POST(request({action:'restore',id:'bad',revision:1}))).status,400);assert.equal((await POST(request({action:'restore',id:'absent',revision:1}))).status,404);
 const before=structuredClone(state);assert.equal((await POST(request({action:'delete',id:'bad',revision:1}))).status,200);assert.deepEqual(state,before);assert.equal(writes,0);
});
