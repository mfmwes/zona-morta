/* eslint-disable @typescript-eslint/no-require-imports -- Exercise task flows in the actual UI without production data. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path'),React=require('react');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,p);
const resolve=Module._resolveFilename;Module._resolveFilename=function(name,parent,...args){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'..',name.slice(2)):name,parent,...args);};
let host;
const hooks={...React,useState(initial){const i=host.cursor++;if(!(i in host.slots))host.slots[i]=typeof initial==='function'?initial():initial;const h=host;return [h.slots[i],v=>h.slots[i]=typeof v==='function'?v(h.slots[i]):v];},useRef(initial){const i=host.cursor++;return host.slots[i]??(host.slots[i]={current:initial});},useMemo(fn){host.cursor++;return fn();},useEffect(fn,deps){const i=host.cursor++;if(!host.deps[i]||deps.some((d,j)=>d!==host.deps[i][j])){host.deps[i]=deps;host.effects.push(fn);}}};
const names=['campaign-search.tsx','campaign-checkpoints.tsx','campaign-views.tsx','conflict-scene-manager.tsx'],load=Module._load;
Module._load=function(name,parent,main){if(names.some(n=>parent?.filename.endsWith(n))){if(name==='react')return hooks;if(name==='sonner')return {toast:{success(){},error(){}}};if(name.startsWith('@/components/'))return new Proxy({},{get:(_,key)=>key==='Button'?'button':String(key)});}return load.call(this,name,parent,main);};
const {CampaignSearch}=require('../components/campaign-search.tsx'),{CampaignCheckpoints}=require('../components/campaign-checkpoints.tsx'),{ShelterPanel}=require('../components/campaign-views.tsx');const {ConflictSceneManager}=require('../components/conflict-scene-manager.tsx');Module._load=load;
const {defaultState}=require('../lib/game.ts');
const text=n=>n==null||typeof n==='boolean'?'':Array.isArray(n)?n.map(text).join(''):typeof n==='object'?text(n.props?.children):String(n);
function elements(n,tab){if(Array.isArray(n))return n.flatMap(v=>elements(v,tab));if(!n?.props)return [];if(n.type==='Tabs')tab=n.props.value;if(n.type==='TabsContent'&&n.props.value!==tab)return [];return [n,...elements(n.props.children,tab)];}
function view(fn,props){const h={slots:[],cursor:0,deps:[],effects:[]};const render=()=>{host=h;h.cursor=0;return fn(props);};return {render,find:p=>elements(render()).find(p),mount:async()=>{render();for(const effect of h.effects.splice(0))effect();await new Promise(r=>setImmediate(r));}};}
const response=rows=>({ok:true,json:async()=>({checkpoints:rows})});
const points=[{id:'one',name:'Hospital',day:1,minutes:480,createdAt:'2026-01-01T00:00:00Z',revision:1,safety:false},{id:'two',name:'Estação',day:2,minutes:500,createdAt:'2026-01-02T00:00:00Z',revision:2,safety:false},{id:'safety',name:'Antes de restaurar',day:3,minutes:600,createdAt:'2026-01-03T00:00:00Z',revision:3,safety:true}];
test('busca da campanha abre o local exato, mostra ausência de resultados e fecha ao navegar',()=>{
 const g=defaultState();g.hexes['0,0'].points=[{id:'hospital',name:'Hospital São José',kind:'comércio',signal:'Porta',access:'',notes:'',revealed:false,searches:[]}];let target,closed=0;const v=view(CampaignSearch,{game:g,role:'mestre',playerPreview:false,onOpen:t=>target=t,onClose:()=>closed++});
 assert.equal(v.find(n=>n.props.className==='campaign-search-result'),undefined);v.find(n=>n.props.id==='campaign-search-query').props.onChange({target:{value:'jose'}});
 v.find(n=>n.props.className==='campaign-search-result').props.onClick();assert.deepEqual(target,{tab:'mapa',hexId:'0,0',pointId:'hospital'});assert.equal(closed,1);
 v.find(n=>n.props.id==='campaign-search-query').props.onChange({target:{value:'inexistente'}});assert.match(text(v.render()),/Nenhum registro encontrado/);
 assert.equal(view(CampaignSearch,{game:g,role:'jogador',playerPreview:false,onOpen(){},onClose(){}}).render(),null);
});
test('busca permite navegar entre resultados e voltar ao campo pelo teclado',()=>{
 const g=defaultState();g.hexes['0,0'].points=['A','B'].map(id=>({id,name:'Hospital '+id,kind:'comércio',signal:'',access:'',notes:'',revealed:true,searches:[]}));const v=view(CampaignSearch,{game:g,role:'mestre',playerPreview:false,onOpen(){},onClose(){}});
 v.find(n=>n.props.id==='campaign-search-query').props.onChange({target:{value:'Hospital'}});const input=v.find(n=>n.props.id==='campaign-search-query'),list=v.find(n=>n.props.className==='campaign-search-results');
 const original=global.document;const nodes=[0,1].map(i=>({i,focus(){global.document.activeElement=this;}}));const field={focus(){global.document.activeElement=this;}};
 global.document={activeElement:field};input.props.ref.current=field;list.props.ref.current={querySelectorAll:()=>nodes};let prevented=0;const key=key=>({key,preventDefault(){prevented++;}});
 try{input.props.onKeyDown(key('ArrowDown'));assert.equal(global.document.activeElement,nodes[0]);list.props.onKeyDown(key('ArrowDown'));assert.equal(global.document.activeElement,nodes[1]);list.props.onKeyDown(key('ArrowDown'));assert.equal(global.document.activeElement,nodes[0]);list.props.onKeyDown(key('ArrowUp'));assert.equal(global.document.activeElement,field);list.props.onKeyDown(key('End'));assert.equal(global.document.activeElement,nodes[1]);assert.equal(prevented,5);}finally{global.document=original;}
});
test('restauração confirma junto do ponto escolhido, separa a cópia automática e envia o id correto',async()=>{
 const fetch=global.fetch;global.fetch=async()=>response(points);let sent;const v=view(CampaignCheckpoints,{campaignId:'test',day:3,canAct:true,onAction:async c=>{sent=c;},onClose(){}});
 try{assert.match(text(v.render()),/Consultando pontos/);await v.mount();assert.match(text(v.render()),/2\/10 pontos guardados/);assert.ok(v.find(n=>n.props['aria-label']==='Cópia automática'));
 const row=v.find(n=>n.type==='article'&&text(n).startsWith('Estação'));elements(row).find(n=>n.type==='button'&&text(n)==='Restaurar').props.onClick();const confirming=v.find(n=>n.type==='article'&&text(n).startsWith('Estação'));assert.match(text(confirming),/Restaurar “Estação”/);assert.doesNotMatch(text(v.find(n=>n.type==='article'&&text(n).startsWith('Hospital'))),/Confirmar restauração/);
 v.find(n=>n.type==='button'&&text(n)==='Confirmar restauração').props.onClick();await new Promise(r=>setImmediate(r));assert.deepEqual(sent,{action:'restore',id:'two'});assert.match(text(v.render()),/Campanha restaurada/);
 v.find(n=>n.type==='Field'&&n.props.label==='Buscar ponto').props.onChange('estacao');assert.equal(elements(v.render()).filter(n=>n.type==='article').length,1);
 }finally{global.fetch=fetch;}
});
test('falha de consulta não aparece como lista vazia e a atualização pode ser repetida',async()=>{
 const fetch=global.fetch;let reject=true;global.fetch=async()=>{if(reject)throw new Error('Falha de conexão');return response([]);};const v=view(CampaignCheckpoints,{campaignId:'test',day:1,canAct:true,onAction(){},onClose(){}});
 try{await v.mount();assert.match(text(v.find(n=>n.props.role==='alert')),/Falha de conexão/);assert.doesNotMatch(text(v.render()),/Nenhum ponto guardado/);reject=false;v.find(n=>n.type==='button'&&text(n)==='Atualizar lista').props.onClick();assert.match(text(v.render()),/Consultando pontos/);await new Promise(r=>setImmediate(r));assert.match(text(v.render()),/Nenhum ponto guardado/);assert.equal(v.find(n=>n.props.role==='alert'),undefined);}finally{global.fetch=fetch;}
});
test('limite usa dez pontos manuais, sem contar a cópia automática, e trava durante salvamento',async()=>{
 const fetch=global.fetch;global.fetch=async()=>response([...Array.from({length:10},(_,i)=>({...points[0],id:'p'+i})),points[2]]);const v=view(CampaignCheckpoints,{campaignId:'test',day:1,canAct:true,onAction(){throw new Error('Não deve chamar');},onClose(){}});
 try{await v.mount();assert.match(text(v.render()),/10\/10 pontos/);assert.equal(v.find(n=>n.type==='button'&&n.props.type==='submit').props.disabled,true);const blocked=view(CampaignCheckpoints,{campaignId:'test',day:1,canAct:false,onAction(){throw new Error('Não deve chamar');},onClose(){}});await blocked.mount();assert.ok(elements(blocked.render()).filter(n=>n.type==='button').every(n=>n.props.disabled));}finally{global.fetch=fetch;}
});
test('estoque compartilhado filtra itens reais, limpa a busca e preserva as restrições da prévia',()=>{
 const g=defaultState();g.shelter.hex='0,0';g.shelter.inventory=[{id:'agua',name:'Água engarrafada',category:'Provisões',qty:1,load:1},{id:'corda',name:'Corda pessoal',category:'Ferramentas',qty:1,load:1}];const before=structuredClone(g);const v=view(ShelterPanel,{game:g,edit(){throw new Error('Filtro não deve editar');},playerPreview:false});
 v.find(n=>n.type==='Tabs'&&n.props.value==='overview').props.onValueChange('resources');assert.equal(elements(v.render()).filter(n=>n.type==='ItemArt').length,2);
 v.find(n=>n.type==='Field'&&n.props.label==='Buscar itens compartilhados').props.onChange('agua');assert.equal(elements(v.render()).filter(n=>n.type==='ItemArt').length,1);assert.equal(v.find(n=>n.type==='ItemArt').props.name,'Água engarrafada');
 v.find(n=>n.type==='Pick'&&n.props.label==='Categoria').props.onChange('Ferramentas');assert.match(text(v.render()),/Nenhum item corresponde/);v.find(n=>n.type==='button'&&text(n)==='Limpar filtros').props.onClick();assert.equal(elements(v.render()).filter(n=>n.type==='ItemArt').length,2);assert.deepEqual(g,before);
 const preview=view(ShelterPanel,{game:g,edit(){},playerPreview:true});preview.find(n=>n.type==='Tabs').props.onValueChange('resources');assert.equal(preview.find(n=>n.type==='ItemActionsDialog'),undefined);assert.equal(preview.find(n=>n.type==='AddItemDialog'),undefined);assert.ok(preview.find(n=>n.type==='Field'&&n.props.label==='Buscar itens compartilhados'));
});


test('conflito mantém ações compactas, consulta lateral e condições visíveis e concede o pedido ao sobrevivente certo',()=>{
 const {initialSurvivor,content}=require('../lib/game.ts');
 const {createConflictScene,addThreatInstances}=require('../lib/conflict.ts');
 const {threatLibrary}=require('../lib/threats.ts');
 const g=defaultState();const person=initialSurvivor({name:'Solicitante',origin:content.origins[0].name,past:'',archetype:content.archetypes[0].name,specialty:content.archetypes[0].specialties[0].name,freeExperience:'',techniques:[],attributes:{},primary:'',secondary:'',protection:'',personal:''});
 g.survivors=[person];g.conflict=createConflictScene({name:'Teste',sceneNumber:1,day:g.day,time:'08:00',survivorIds:[person.id]});
 g.conflict.spotlightRequests=[person.id];
 const template=threatLibrary(g.threats).find(t=>t.attack&&t.maxHp!==null);
 const [threat]=addThreatInstances(g.conflict,template);threat.conditions=['Vulnerável'];
 const v=view(ConflictSceneManager,{game:g,edit:fn=>fn(g)});
 const card=v.find(n=>n.props['data-conflict-kind']==='threat');
 const children=elements(card);
 assert.ok(children.find(n=>n.props.className==='conflict-threat-actions'));
 assert.ok(children.find(n=>n.type==='SheetTrigger'&&n.props.asChild));
 assert.ok(children.find(n=>n.type==='SheetContent'&&n.props.className==='conflict-reference-sheet'));
 assert.equal(children.filter(n=>n.type==='details').length,1);
 assert.match(text(children.find(n=>n.type==='SheetTitle')),new RegExp(threat.name));
 assert.match(text(children.find(n=>n.type==='ul'&&n.props['aria-label']===`Condições de ${threat.name}`)),/Vulnerável/);
 assert.match(text(v.find(n=>n.props['data-conflict-kind']==='survivor')),/Pediu Spotlight/);
 v.find(n=>n.type==='button'&&n.props['aria-label']==='Dar Spotlight a Solicitante').props.onClick();
 assert.deepEqual(g.conflict.spotlight,{kind:'survivor',id:person.id});assert.deepEqual(g.conflict.spotlightRequests,[]);
 assert.doesNotMatch(text(v.find(n=>n.props['data-conflict-kind']==='survivor')),/Pediu Spotlight/);
 const hp=elements(v.find(n=>n.props['data-conflict-kind']==='threat')).find(n=>n.type==='Counter'&&n.props.label==='PV marcados');hp.props.onChange(template.maxHp);
 assert.equal(threat.defeated,true);assert.equal(v.find(n=>n.props['data-conflict-kind']==='threat'),undefined);
 v.find(n=>n.type==='button'&&text(n).startsWith('Derrotadas ·')).props.onClick();
 const defeated=v.find(n=>n.props['data-conflict-kind']==='threat');assert.ok(defeated);
 assert.equal(elements(defeated).find(n=>n.type==='button'&&text(n).trim()==='Atacar').props.disabled,true);
 elements(defeated).find(n=>n.type==='button'&&text(n).trim()==='Reativar').props.onClick();assert.equal(threat.defeated,false);
});
