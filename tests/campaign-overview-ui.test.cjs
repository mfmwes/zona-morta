/* eslint-disable @typescript-eslint/no-require-imports -- Exercise navigation and initial selection in the actual UI components. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path'),React=require('react');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,p);
const resolve=Module._resolveFilename;Module._resolveFilename=function(name,parent,...args){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'..',name.slice(2)):name,parent,...args);};
let host;const hooks={...React,useState(initial){const i=host.cursor++;if(!(i in host.slots))host.slots[i]=typeof initial==='function'?initial():initial;const h=host;return [h.slots[i],v=>h.slots[i]=typeof v==='function'?v(h.slots[i]):v];},useRef(initial){const i=host.cursor++;return host.slots[i]??(host.slots[i]={current:initial});},useEffect(){host.cursor++;},useMemo(fn){host.cursor++;return fn();}};
const names=['master-overview.tsx','campaign-recap.tsx','campaign-sessions.tsx','survivor-panel.tsx','npc-panel.tsx'];const load=Module._load;
Module._load=function(name,parent,main){if(names.some(n=>parent?.filename.endsWith(n))){if(name==='react')return hooks;if(name==='sonner')return {toast:{success(){},error(){},info(){}}};if(name.startsWith('@/components/'))return new Proxy({},{get:(_,key)=>key==='Button'?'button':String(key)});}return load.call(this,name,parent,main);};
const {MasterOverview}=require('../components/master-overview.tsx'),{CampaignRecap}=require('../components/campaign-recap.tsx'),{CampaignSessions}=require('../components/campaign-sessions.tsx'),{SurvivorPanel}=require('../components/survivor-panel.tsx'),{NpcPanel}=require('../components/npc-panel.tsx');Module._load=load;
const {defaultState,initialSurvivor,content}=require('../lib/game.ts');
const text=n=>n==null||typeof n==='boolean'?'':Array.isArray(n)?n.map(text).join(''):typeof n==='object'?text(n.props?.children):String(n);
function elements(n,tab){if(Array.isArray(n))return n.flatMap(v=>elements(v,tab));if(!n?.props)return [];if(n.type==='Dialog'&&n.props.open===false)return [];if(n.type==='Tabs')tab=n.props.value;if(n.type==='TabsContent'&&n.props.value!==tab)return [];return [n,...elements(n.props.children,tab)];}
function view(fn,props){const instance={slots:[],cursor:0};const render=()=>{host=instance;host.cursor=0;return fn(props);};return {render,find:p=>elements(render()).find(p)};}
function fixture(){const g=defaultState(),a=content.archetypes[0];g.survivors=['Ana','Bia'].map(name=>initialSurvivor({name,origin:content.origins[1].name,past:'',archetype:a.name,specialty:a.specialties[0].name,freeExperience:'',techniques:[],attributes:{Instinto:1},primary:'',secondary:'',protection:'',personal:''}));for(const h of Object.values(g.hexes))h.events=[];return g;}
test('visão geral abre a condição da pessoa correta e permite consultar todas as pendências',()=>{
 const g=fixture();g.survivors[1].eventConditions=[{name:'Restrito',effect:'Preso.',clear:'Ajudar.'}];for(let i=0;i<10;i++)g.hexes['0,0'].events.push({id:'e'+i,text:'Evento '+i,status:'active',trigger:'',revealed:false});
 let target;const v=view(MasterOverview,{game:g,onOpen:t=>target=t,onNavigate(){}});const before=structuredClone(g);
 const row=v.find(n=>n.type==='article'&&text(n).includes('Bia · condições'));elements(row).find(n=>n.type==='button').props.onClick();assert.deepEqual(target,{tab:'sobreviventes',survivorId:g.survivors[1].id,section:'condicoes'});
 v.find(n=>n.type==='button'&&text(n)==='Ver todas as 11 pendências').props.onClick();assert.equal(elements(v.render()).filter(n=>n.type==='button'&&text(n)==='Abrir registro').length,11);assert.deepEqual(g,before);
});
test('atalho da ficha seleciona a sobrevivente e a aba Condições, sem trocar para a primeira pessoa',()=>{
 const g=fixture(),p=g.survivors[1];p.eventConditions=[{name:'Marca exclusiva',effect:'Efeito exclusivo.',clear:'Remoção exclusiva.'}];const v=view(SurvivorPanel,{game:g,edit(){},playerPreview:false,initialSurvivorId:p.id,initialSection:'condicoes'});
 assert.ok(v.find(n=>n.type==='Tabs'&&n.props.value==='condicoes'));assert.match(text(v.render()),/Marca exclusiva/);
});
test('atalho do PNJ abre sua ficha; prévia de jogador não abre o editor reservado',()=>{
 const g=fixture();g.npcs=[{id:'joana',name:'Joana',hex:'0,0',role:'Moradora',description:'',notes:'',skills:[],status:'Bem',disposition:'Aliado',infection:'Saudável',active:true}];
 const master=view(NpcPanel,{game:g,edit(){},playerPreview:false,initialNpcId:'joana'});assert.ok(master.find(n=>n.type==='Dialog'&&n.props.open));assert.ok(master.find(n=>n.type==='DialogTitle'&&text(n)==='Joana'));
 const player=view(NpcPanel,{game:g,edit(){},playerPreview:true,initialNpcId:'joana'});assert.equal(player.find(n=>n.type==='Dialog'&&n.props.open),undefined);
});
test('retomada usa os vinte registros mais recentes e mantém cronologia e dia escolhido',()=>{
 const g=fixture();g.log=Array.from({length:25},(_,i)=>({id:'l'+i,day:g.day,time:'08:00',kind:'travessia',text:'Registro '+i}));g.log.push({id:'old',day:0,time:'08:00',kind:'travessia',text:'Dia anterior'});
 const v=view(CampaignRecap,{game:g,onOpen(){}});const rows=elements(v.render()).filter(n=>n.type==='li');assert.equal(rows.length,20);assert.match(text(rows[0]),/Registro 19$/);assert.match(text(rows.at(-1)),/Registro 0$/);assert.doesNotMatch(text(v.render()),/Registro 24/);
 v.find(n=>n.type==='select').props.onChange({target:{value:'0'}});assert.match(text(v.render()),/Dia anterior/);assert.doesNotMatch(text(v.render()),/Registro 0/);
});

test('sessões permitem escolher cópia, enviar resumo e bloquear ações durante salvamento',async()=>{
 const g=fixture();let submitted;const v=view(CampaignSessions,{game:g,canAct:true,onAction:async c=>{submitted=c;}});
 assert.equal(v.find(n=>n.type==='input'),undefined);v.find(n=>n.type==='button'&&text(n)==='Iniciar sessão').props.onClick();
 const input=v.find(n=>n.type==='input'&&n.props.maxLength===80);input.props.onChange({target:{value:'Hospital'}});
 v.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:false}});
 assert.equal(v.find(n=>n.type==='button'&&n.props.type==='submit').props.disabled,false);v.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));assert.equal(v.find(n=>n.type==='form'),undefined);
 assert.equal(submitted.action,'start');assert.equal(submitted.name,'Hospital');assert.equal(submitted.checkpoint,false);
 const {applySessionCommand}=require('../lib/campaign-sessions.ts');applySessionCommand(g,submitted);
 const end=view(CampaignSessions,{game:g,canAct:true,onAction:async c=>{submitted=c;}});end.find(n=>n.type==='button'&&text(n)==='Encerrar sessão').props.onClick();end.find(n=>n.type==='textarea').props.onChange({target:{value:'Resgatar Joana na próxima sessão.'}});
 end.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));assert.equal(submitted.action,'end');assert.equal(submitted.expectedSessionId,g.sessions[0].id);assert.match(submitted.summary,/Joana/);assert.equal(submitted.checkpoint,true);
 const blocked=view(CampaignSessions,{game:g,canAct:false,onAction(){throw new Error('Não deve chamar');}});assert.equal(blocked.find(n=>n.type==='button').props.disabled,true);
});

test('filtros de pendências combinam texto, tipo e localização sem esconder os registros após limpar',()=>{
 const g=fixture();g.survivors[1].hex='1,0';g.survivors[1].eventConditions=[{name:'Restrito',effect:'Preso',clear:'Ajudar'}];for(let i=0;i<6;i++)g.hexes['0,0'].events.push({id:'e'+i,text:'Evento '+i,status:'active',trigger:'',revealed:false});
 const v=view(MasterOverview,{game:g,onOpen(){},onNavigate(){}});const before=structuredClone(g);
 v.find(n=>n.props.id==='attention-type').props.onChange({target:{value:'sobreviventes'}});assert.equal(elements(v.render()).filter(n=>n.type==='button'&&text(n)==='Abrir registro').length,1);
 v.find(n=>n.props.id==='attention-place').props.onChange({target:{value:'0,0'}});assert.match(text(v.render()),/Nenhuma pendência corresponde/);
 v.find(n=>n.type==='button'&&text(n)==='Limpar filtros').props.onClick();assert.equal(elements(v.render()).filter(n=>n.type==='button'&&text(n)==='Abrir registro').length,7);
 v.find(n=>n.props.id==='attention-search').props.onChange({target:{value:'bia restrito'}});assert.equal(elements(v.render()).filter(n=>n.type==='button'&&text(n)==='Abrir registro').length,1);assert.deepEqual(g,before);
});

test('sessão mantém o rascunho após falha e após cancelar e reabrir o formulário',async()=>{
 const g=fixture();const v=view(CampaignSessions,{game:g,canAct:true,onAction:async()=>{throw new Error('Sem espaço para o ponto.');}});
 v.find(n=>n.type==='button'&&text(n)==='Iniciar sessão').props.onClick();v.find(n=>n.props.id==='session-name').props.onChange({target:{value:'Hospital'}});
 v.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));assert.match(text(v.find(n=>n.props.role==='alert')),/Sem espaço/);assert.equal(v.find(n=>n.props.id==='session-name').props.value,'Hospital');
 v.find(n=>n.type==='button'&&text(n)==='Cancelar').props.onClick();assert.equal(v.find(n=>n.type==='form'),undefined);v.find(n=>n.type==='button'&&text(n)==='Iniciar sessão').props.onClick();assert.equal(v.find(n=>n.props.id==='session-name').props.value,'Hospital');
});
