/* eslint-disable @typescript-eslint/no-require-imports -- Exercise the real TSX handlers. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
for (const ext of ['.ts','.tsx']) require.extensions[ext]=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
const originalResolve=Module._resolveFilename;
Module._resolveFilename=function(name,parent,...args){return originalResolve.call(this,name.startsWith('@/')?path.join(__dirname,'..',name.slice(2)):name,parent,...args);};
let state=false;
const originalLoad=Module._load;
Module._load=function(name,parent,main){
  if(parent?.filename.endsWith('/components/activity-timeline.tsx')){
    if(name==='react')return {useState:()=>[state,value=>{state=value;}]};
    if(name==='@/components/ui/button')return {Button:'button'};
    if(name==='sonner')return {toast:{error(){},success(){},info(){}}};
  }
  return originalLoad.call(this,name,parent,main);
};
const {ActivityTimeline}=require('../components/activity-timeline.tsx');
Module._load=originalLoad;
function nodes(node,found=[]){if(Array.isArray(node))node.forEach(n=>nodes(n,found));else if(node&&typeof node==='object'&&node.props){found.push(node);nodes(node.props.children,found);}return found;}
function text(node){if(Array.isArray(node))return node.map(text).join('');if(node&&typeof node==='object')return text(node.props?.children);return typeof node==='string'||typeof node==='number'?String(node):'';}
function fixture(){
  state=false;
  const game={day:1,minutes:540,survivors:[{id:'ana',name:'Ana',hex:'0,0'}],hexes:{'0,0':{events:[],points:[{id:'secret',name:'Local reservado',revealed:false}]}},shelter:{projects:[]},activities:[{id:'travel',type:'travel',destination:'1,0',hexId:'0,0',label:'Viagem para Garagens',participantIds:['ana'],day:1,startMinute:540,endMinute:600,status:'running'}]};
  return game;
}
test('faixa agenda avanço pelo servidor, mostra horários e bloqueia novo clique durante envio',async()=>{
  const game=fixture(),calls=[];let release;
  const controls={canAct:true,send:command=>{calls.push(command);return new Promise(resolve=>{release=resolve;});}};
  const render=()=>ActivityTimeline({game,controls});
  assert.match(text(render()),/09:00.*10:00/);
  const button=nodes(render()).find(n=>n.type==='button'&&text(n).includes('Avançar até'));
  const pending=button.props.onClick();
  assert.equal(calls[0].type,'advance-activity');assert.equal(calls[0].expectedMinute,540);assert.equal(calls[0].expectedNext,600);
  assert.equal(game.minutes,540);
  assert.equal(nodes(render()).find(n=>n.type==='button').props.disabled,true);
  release();await pending;assert.equal(nodes(render()).find(n=>n.type==='button').props.disabled,false);
});
test('jogador recebe horários de atividades sem botão de avanço ou interrupção',()=>{
  const game=fixture();game.publicActivities=game.activities.map(({type,id,label,participantIds,hexId,startMinute,endMinute})=>({type,id,label,participantIds,hexId,startMinute,endMinute}));delete game.activities;
  const view=ActivityTimeline({game});assert.match(text(view),/Viagem para Garagens/);assert.equal(nodes(view).filter(n=>n.type==='button').length,0);
});
test('atividade privada e acesso pendente continuam visíveis ao mestre com controle de interrupção',async()=>{
  const game=fixture(),calls=[];
  game.activities[0]={...game.activities[0],type:'search',pointId:'secret',attemptId:'attempt',label:'Busca reservada',issue:'Resolva o acesso.',endMinute:540};
  const controls={canAct:true,send:async command=>{calls.push(command);}};
  const view=ActivityTimeline({game,controls});assert.match(text(view),/Busca reservada.*Resolva o acesso/);assert.match(text(view),/Resolver conclusão/);
  await nodes(view).find(n=>n.type==='button'&&text(n)==='Interromper').props.onClick();assert.equal(calls[0].type,'cancel-activity');assert.equal(calls[0].activityId,'travel');
});
