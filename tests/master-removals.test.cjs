/* eslint-disable @typescript-eslint/no-require-imports -- tests actual TypeScript operations and React handlers. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename);
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...args) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '..', name.slice(2)) : name, parent, ...args); };
const { defaultState, initialSurvivor, content, absoluteMinutes } = require('../lib/game.ts');
const { createShelterProject, shelterBlueprintSlots, projectPlacementIssue, shelterMetrics, projectOperational, processScheduledShelterWork, shelterRecommendations } = require('../lib/shelter-projects.ts');
const { survivorTimedCommitment } = require('../lib/activity.ts');
const { createSceneBoardScene, createSceneBoardObject, projectPlayerSceneBoard, validSceneBoardState } = require('../lib/scene-board.ts');
const { playerActionState } = require('../lib/player-actions.ts');
const { applyMasterRemoval, removalFingerprint, projectRemovalLabel, masterRemovalCommandSchema } = require('../lib/master-removals.ts');
function fixture() {
  const game = defaultState(), archetype = content.archetypes[0];
  game.shelter.hex = '0,0';
  game.survivors = [initialSurvivor({name:'Nina',origin:content.origins[1].name,past:'',archetype:archetype.name,specialty:archetype.specialties[0].name,freeExperience:'',techniques:[],attributes:{Instinto:1},primary:'',secondary:'',protection:'',personal:''})];
  game.survivors[0].hex = '0,0';
  return game;
}
const commandForProject = async (game, project) => ({ type:'remove-shelter-project',id:'remove-project',day:game.day,shelterHex:game.shelter.hex,projectId:project.id,expectedFingerprint:await removalFingerprint(project) });
const commandForScene = async (game, scene) => ({ type:'delete-scene',id:'remove-scene',day:game.day,sceneId:scene.id,expectedActiveSceneId:game.sceneBoard.activeSceneId??null,expectedFingerprint:await removalFingerprint(scene) });
test('cancelar solicitação libera o espaço sem gastar ou devolver recursos', async () => {
  const game=fixture(),slot=shelterBlueprintSlots.find(s=>s.zone==='interior'),project=createShelterProject('dormitories',slot.id);
  game.shelter.projects=[project];game.shelter.disabledProjectKeys=[project.key,'generator'];
  const stocks=[game.shelter.parts,game.shelter.fuel,game.shelter.medications],time=game.minutes;
  assert.equal(projectRemovalLabel(project),'Cancelar solicitação');
  assert.equal((await applyMasterRemoval(game,await commandForProject(game,project))).ok,true);
  assert.deepEqual(game.shelter.projects,[]);assert.deepEqual(game.shelter.disabledProjectKeys,['generator']);
  assert.equal(projectPlacementIssue(game.shelter,createShelterProject('dormitories',slot.id)),null);
  assert.deepEqual([game.shelter.parts,game.shelter.fuel,game.shelter.medications],stocks);assert.equal(game.minutes,time);
});
test('cancelar obra e demolir reparo cancelam turnos sem produção futura nem duplicação de materiais', async () => {
  for(const repairing of [false,true]) {
    const game=fixture(),project=createShelterProject('garden');game.shelter.projects=[project];
    project.state='Em construção';project.costsPaid=true;project.responsibleId='worker';project.survivorWorkerIds=[game.survivors[0].id];
    if(repairing) {project.repairProgress=0;project.requiredRepairProgress=2;project.repairCostsPaid=true;}
    const end=absoluteMinutes(game)+240;
    project.workShift={startDay:game.day,startMinute:game.minutes,durationMinutes:240,endAbsoluteMinute:end,points:4,workerIds:['worker'],repairing};
    project.volunteerShifts=[{survivorId:game.survivors[0].id,startDay:game.day,startMinute:game.minutes,durationMinutes:240,endAbsoluteMinute:end,points:4,repairing}];
    game.parallelTime={day:game.day,survivorMinutes:{[game.survivors[0].id]:game.minutes-10}};
    assert.ok(survivorTimedCommitment(game,game.survivors[0].id));
    assert.equal(projectRemovalLabel(project),repairing?'Demolir estrutura':'Cancelar obra');
    const resources={parts:game.shelter.parts,food:game.shelter.food};
    assert.equal((await applyMasterRemoval(game,await commandForProject(game,project))).ok,true);
    assert.equal(survivorTimedCommitment(game,game.survivors[0].id),null);
    assert.equal(game.parallelTime.survivorMinutes[game.survivors[0].id],game.minutes);
    game.minutes+=240;assert.deepEqual(processScheduledShelterWork(game),[]);
    assert.deepEqual({parts:game.shelter.parts,food:game.shelter.food},resources);
  }
});
test('demolição remove capacidade e energia; dependentes permanecem cadastradas sem funcionar', async () => {
  const game=fixture(),dorm=createShelterProject('dormitories'),generator=createShelterProject('generator'),fridge=createShelterProject('refrigeration');
  for(const p of [dorm,generator,fridge]) {p.state='Concluído';p.progress=p.requiredProgress;p.operatorReady=true;}
  game.shelter.projects=[dorm,generator,fridge];
  const capacity=shelterMetrics(game.shelter,game).capacity;
  assert.equal(projectOperational(game,game.shelter,fridge),true);
  await applyMasterRemoval(game,await commandForProject(game,dorm));assert.equal(shelterMetrics(game.shelter,game).capacity,capacity-4);
  await applyMasterRemoval(game,await commandForProject(game,generator));assert.equal(projectOperational(game,game.shelter,fridge),false);
  assert.deepEqual(game.shelter.projects.map(p=>p.id),[fridge.id]);
});
test('remover refrigeração encerra conservação legada; melhorias e estruturas destruídas também podem sair', async () => {
  const game=fixture(),fridge=createShelterProject('refrigeration'),upgrade=createShelterProject('interior-lighting');
  fridge.state='Destruído';fridge.integrity=0;upgrade.state='Concluído';
  game.shelter.projects=[fridge,upgrade];game.shelter.coldStorage=true;
  assert.equal(projectRemovalLabel(fridge),'Demolir estrutura');assert.equal(projectRemovalLabel(upgrade),'Remover melhoria');
  await applyMasterRemoval(game,await commandForProject(game,fridge));assert.equal(game.shelter.coldStorage,false);
  await applyMasterRemoval(game,await commandForProject(game,upgrade));assert.deepEqual(game.shelter.projects,[]);
});
test('snapshot protege construção alterada, abrigo movido e substituição com a mesma chave', async () => {
  const game=fixture(),project=createShelterProject('garden');game.shelter.projects=[project];
  const command=await commandForProject(game,project);
  project.progress=1;assert.equal((await applyMasterRemoval(game,command)).ok,false);
  project.progress=0;game.shelter.hex='1,0';assert.equal((await applyMasterRemoval(game,command)).ok,false);
  game.shelter.hex='0,0';game.shelter.projects=[createShelterProject(project.key)];assert.equal((await applyMasterRemoval(game,command)).ok,false);
  assert.equal(game.shelter.projects.length,1);
});
test('excluir cena ativa limpa apresentação e suas marcações sem apagar fichas ou outras cenas', async () => {
  const game=fixture(),live=createSceneBoardScene('Ao vivo'),other=createSceneBoardScene('Privada');
  live.visibleToPlayers=true;const token=createSceneBoardObject('token','Nina');token.tokenKind='survivor';token.refId=game.survivors[0].id;live.objects=[token];
  game.sceneBoard={scenes:[live,other],activeSceneId:live.id};game.playerActions=playerActionState(game);
  game.playerActions.markers=[{actorId:token.refId,sceneId:live.id,day:game.day,x:0,y:0,label:'Aqui'},{actorId:token.refId,sceneId:other.id,day:game.day,x:0,y:0,label:'Depois'}];
  const people=structuredClone(game.survivors);
  assert.equal((await applyMasterRemoval(game,await commandForScene(game,live))).ok,true);
  assert.deepEqual(game.sceneBoard.scenes,[other]);assert.equal(game.sceneBoard.activeSceneId,undefined);
  assert.deepEqual(projectPlayerSceneBoard(game.sceneBoard),{scenes:[]});assert.equal(validSceneBoardState(game.sceneBoard),true);
  assert.deepEqual(game.survivors,people);assert.deepEqual(game.playerActions.markers.map(m=>m.sceneId),[other.id]);
  await applyMasterRemoval(game,await commandForScene(game,other));assert.deepEqual(game.sceneBoard,{scenes:[]});
});
test('excluir cena privada mantém a apresentação; cenas editadas ou apresentação alterada exigem nova revisão', async () => {
  const game=fixture(),live=createSceneBoardScene('Mesa'),other=createSceneBoardScene('Rascunho');
  live.visibleToPlayers=true;game.sceneBoard={scenes:[live,other],activeSceneId:live.id};
  const command=await commandForScene(game,other);other.name='Alterada';assert.equal((await applyMasterRemoval(game,command)).ok,false);
  other.name='Rascunho';delete game.sceneBoard.activeSceneId;assert.equal((await applyMasterRemoval(game,command)).ok,false);
  game.sceneBoard.activeSceneId=live.id;assert.equal((await applyMasterRemoval(game,command)).ok,true);assert.equal(game.sceneBoard.activeSceneId,live.id);
  assert.equal(masterRemovalCommandSchema.safeParse({...command,expectedFingerprint:'invalid'}).success,false);
});

let host;
const hooks={...React,useState(initial){const index=host.cursor++;if(!(index in host.slots))host.slots[index]=typeof initial==='function'?initial():initial;const owner=host;return [owner.slots[index],value=>{owner.slots[index]=typeof value==='function'?value(owner.slots[index]):value;}];},useMemo(fn){return fn();},useRef(initial){const index=host.cursor++;if(!(index in host.slots))host.slots[index]={current:initial};return host.slots[index];}};
const load=Module._load;
Module._load=function(name,parent,main){
 if(/(?:shelter-project-manager|scene-board)\.tsx$/.test(parent?.filename??'')){
  if(name==='react')return hooks;
  if(name==='sonner')return {toast:{success(){},error(){}}};
  const keys={button:['Button'],dialog:['Dialog','DialogContent','DialogHeader','DialogTitle','DialogDescription','DialogFooter'],'game-controls':['Counter','Pick','Field'],'player-actions-panel':['MasterContextActions','PlayerContextActions']}[name.split('/').pop()];
  if(name.startsWith('@/components/')&&keys)return Object.fromEntries(keys.map(key=>[key,key==='Button'?'button':key]));
 }
 return load.call(this,name,parent,main);
};
const {ShelterProjectsManager}=require('../components/shelter-project-manager.tsx');
const {SceneBoard}=require('../components/scene-board.tsx');Module._load=load;
const text=n=>n==null||typeof n==='boolean'?'':Array.isArray(n)?n.map(text).join(''):typeof n==='object'?text(n.props?.children):String(n);
const elements=n=>Array.isArray(n)?n.flatMap(elements):n&&typeof n==='object'&&n.props?(n.type==='Dialog'&&!n.props.open?[]:[n,...elements(n.props.children)]):[];
function ui(Component,game,controls,playerPreview=false){const instance={slots:[],cursor:0};const render=()=>{host=instance;host.cursor=0;return Component({game,edit:()=>{throw Error('Deletion must use server command');},playerPreview,masterActions:controls});};const find=predicate=>elements(render()).find(predicate);return {find,button:label=>find(n=>n.type==='button'&&text(n).trim()===label)};}
test('abrigo pede confirmação, preserva snapshot e bloqueia duplo envio durante remoção',async()=>{
 const game=fixture(),project=createShelterProject(shelterRecommendations(game,game.shelter)[0].key);game.shelter.projects=[project];let command,release,started;
 const waiting=new Promise(resolve=>release=resolve),sent=new Promise(resolve=>started=resolve),f=ui(ShelterProjectsManager,game,{canAct:true,send:async c=>{command=c;started();await waiting;}});
 f.button('Cancelar solicitação').props.onClick();assert.equal(command,undefined);f.button('Manter construção').props.onClick();assert.equal(game.shelter.projects.length,1);
 f.button('Cancelar solicitação').props.onClick();const confirm=f.find(n=>n.type==='button'&&n.props.variant==='destructive');
 const pending=confirm.props.onClick();await confirm.props.onClick();await sent;
 assert.equal(command.expectedFingerprint,await removalFingerprint(project));assert.equal(command.projectId,project.id);
 assert.equal(f.button('Manter construção').props.disabled,true);release();await pending;
 assert.equal(f.find(n=>n.type==='Dialog'),undefined);
 assert.equal(ui(ShelterProjectsManager,game,{canAct:true,send:async()=>{}},true).button('Cancelar solicitação'),undefined);
});
test('cena mantém diálogo e erro ao falhar; exclusão da última cena permite criar outra',async()=>{
 const game=fixture(),scene=createSceneBoardScene('Única');game.sceneBoard={scenes:[scene]};
 const controls={canAct:true,send:async()=>{throw Error('A cena mudou');}},f=ui(SceneBoard,game,controls);
 f.button('Excluir cena').props.onClick();await f.button('Excluir definitivamente').props.onClick();
 assert.match(text(f.find(n=>n.props.role==='alert')),/A cena mudou/);assert.equal(game.sceneBoard.scenes.length,1);
 f.button('Manter cena').props.onClick();controls.send=async command=>{assert.equal((await applyMasterRemoval(game,command)).ok,true);};
 f.button('Excluir cena').props.onClick();await f.button('Excluir definitivamente').props.onClick();assert.ok(f.button('Criar primeira cena'));
 game.sceneBoard={scenes:[scene],activeSceneId:scene.id};scene.visibleToPlayers=true;
 assert.equal(ui(SceneBoard,game,controls,true).button('Excluir cena'),undefined);
 controls.pending=true;assert.equal(ui(SceneBoard,game,controls).button('Excluir cena').props.disabled,true);
});
