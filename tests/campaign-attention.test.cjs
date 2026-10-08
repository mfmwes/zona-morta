/* eslint-disable @typescript-eslint/no-require-imports -- Exercise current campaign states and navigation targets. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const {defaultState,initialSurvivor,content,absoluteMinutes}=require('../lib/game.ts');
const {campaignAttention,campaignTargetExists}=require('../lib/campaign-attention.ts');
function fixture(){const g=defaultState(),a=content.archetypes[0];g.survivors=[initialSurvivor({name:'Ana',origin:content.origins[1].name,past:'',archetype:a.name,specialty:a.specialties[0].name,freeExperience:'',techniques:[],attributes:{Instinto:1},primary:'',secondary:'',protection:'',personal:''})];for(const h of Object.values(g.hexes)){h.events=[];h.points=[];}return g;}
test('visão geral reúne prazos, Exposição e condições e aponta a ficha certa sem mutação',()=>{
 const g=fixture(),p=g.survivors[0];p.infection='Exposto';p.exposureDeadline=absoluteMinutes(g)+30;p.eventConditions=[{name:'Restrito',effect:'Preso.',clear:'Soltar.'}];
 g.hexes['0,0'].events=[{id:'alarm',text:'Sirene',trigger:'',status:'active',revealed:false,clock:{label:'Alarme',consequence:'Dispara.',noise:2,dueAbsoluteMinute:absoluteMinutes(g)+5,status:'active'}}];
 const original=structuredClone(g),rows=campaignAttention(g);assert.equal(rows.length,3);assert.equal(rows[0].id,`exposure:${p.id}`);assert.deepEqual(rows.find(r=>r.id.startsWith('condition')).target,{tab:'sobreviventes',survivorId:p.id,section:'condicoes'});
 assert.deepEqual(rows.find(r=>r.id.startsWith('event')).target,{tab:'mapa',hexId:'0,0',eventId:'alarm'});assert.deepEqual(g,original);
});
test('prazo vencido continua pendente até concluir o evento; PNJs inativos e eventos arquivados ficam fora',()=>{
 const g=fixture();g.npcs=[{id:'n',name:'Joana',active:true,status:'Bem',infection:'Saudável',hex:'0,0',skills:[],eventConditions:[{name:'Restrito',effect:'Presa.',clear:'Apoiar.'}]}];
 const e={id:'e',text:'Porta',trigger:'',status:'active',clock:{label:'Porta',consequence:'Abre.',noise:1,dueAbsoluteMinute:1,status:'expired'}};g.hexes['0,0'].events=[e];
 assert.equal(campaignAttention(g).length,2);e.status='resolved';g.npcs[0].active=false;assert.equal(campaignAttention(g).length,0);e.status='archived';e.clock.status='active';assert.equal(campaignAttention(g).length,0);
});
test('atalhos conferem entidade e área atuais, inclusive registros que foram excluídos',()=>{
 const g=fixture();const p={id:'p',name:'Oficina',preparation:{areas:[{id:'a'}]},searches:[]};g.hexes['0,0'].points=[p];
 const t={tab:'mapa',hexId:'0,0',pointId:'p',areaId:'a'};assert.equal(campaignTargetExists(g,t),true);p.preparation.areas=[];assert.equal(campaignTargetExists(g,t),false);
 assert.equal(campaignTargetExists(g,{tab:'sobreviventes',survivorId:'ausente'}),false);assert.equal(campaignTargetExists(g,{tab:'comunidade',npcId:'ausente'}),false);assert.equal(campaignTargetExists(g,{tab:'conflito'}),false);
});
