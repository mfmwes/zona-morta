/* eslint-disable @typescript-eslint/no-require-imports -- Exercise actual sector handlers with a minimal React hook host. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename);
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...args) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '..', name.slice(2)) : name, parent, ...args); };
let host;
const hooks = { ...React, useState(initial) {
  const index = host.cursor++;
  if (!(index in host.slots)) host.slots[index] = typeof initial === 'function' ? initial() : initial;
  const owner = host;
  return [owner.slots[index], value => { const next = typeof value === 'function' ? value(owner.slots[index]) : value; if (!Object.is(next, owner.slots[index])) { owner.slots[index] = next; owner.dirty = true; } }];
}, useEffect() { host.cursor++; } };
const stubs = {
  button: ['Button'], dialog: ['Dialog', 'DialogContent', 'DialogTitle', 'DialogDescription', 'DialogHeader', 'DialogFooter'],
  tabs: ['Tabs', 'TabsContent', 'TabsList', 'TabsTrigger'],
  'alert-dialog': ['AlertDialog', 'AlertDialogAction', 'AlertDialogCancel', 'AlertDialogContent', 'AlertDialogDescription', 'AlertDialogFooter', 'AlertDialogHeader', 'AlertDialogTitle'],
  collapsible: ['Collapsible', 'CollapsibleContent', 'CollapsibleTrigger'],
  sheet: ['Sheet', 'SheetContent', 'SheetDescription', 'SheetHeader', 'SheetTitle'], switch: ['Switch'],
  'game-controls': ['Counter', 'Field', 'Pick'], 'player-actions-panel': ['MasterContextActions', 'PlayerContextActions'],
  'shelter-move': ['ShelterMoveDialog'], 'survivor-move-dialog': ['SurvivorMoveDialog'],
  'world-map-viewport': ['WorldMapViewport'], 'world-expansion-dialog': ['WorldExpansionDialog'],
  'map-group-marker': ['MapGroupMarker'], 'hex-context-menu': ['HexContextMenu'],
  'hex-generator-dialog': ['HexGeneratorDialog'], 'hex-search-dialog': ['HexSearchDialog'],
  'player-hex-search-dialog': ['PlayerHexSearchDialog'], 'hex-event-action-dialog': ['HexEventActionDialog'], 'hex-event-guide-dialog': ['HexEventGuideDialog'],
};
const load = Module._load;
Module._load = function(name, parent, main) {
  if (parent?.filename.endsWith('hex-event-guide-dialog.tsx')) {
    if (name === 'react') return hooks;
    if (name === 'sonner') return { toast: { success() {}, error() {} } };
    if (name.startsWith('@/components/')) {
      const exports = stubs[name.split('/').pop()];
      if (exports) return Object.fromEntries(exports.map(key => [key, key === 'Button' ? 'button' : key]));
    }
  }
  return load.call(this, name, parent, main);
};
const { HexEventGuideDialog } = require('../components/hex-event-guide-dialog.tsx');
Module._load = load;
const { defaultState, initialSurvivor, content } = require('../lib/game.ts');
const { eventResolutionFingerprint } = require('../lib/event-resolution.ts');
const text = n => n == null || typeof n==='boolean' ? '' : Array.isArray(n) ? n.map(text).join('') : typeof n==='object' ? text(n.props?.children) : String(n);
const elements = n => Array.isArray(n) ? n.flatMap(elements) : n && typeof n==='object' && n.props ? [n,...elements(n.props.children)] : [];
function fixture(controls) {
 const game=defaultState(),a=content.archetypes[0];
 const person=initialSurvivor({name:'Nina',origin:content.origins[1].name,past:'',archetype:a.name,specialty:a.specialties[0].name,freeExperience:'',techniques:[],attributes:{Instinto:1},primary:'',secondary:'',protection:'',personal:''});person.hex='0,0';game.survivors=[person];
 const event={id:'scene',text:'Porta bloqueada.',trigger:'',revealed:true,status:'active',generatorRoll:52};game.hexes['0,0'].events=[event];
 const instance={slots:[],cursor:0,dirty:false};let closed=0,edits=0;
 const render=()=>{host=instance;host.cursor=0;return HexEventGuideDialog({game,hexId:'0,0',eventId:'scene',controls,edit:()=>{edits++;},onClose:()=>{closed++;}});};
 const find=predicate=>elements(render()).find(predicate);
 return {game,event,find,closed:()=>closed,edits:()=>edits};
}
test('guia envia desfecho revisado ao servidor, bloqueia repetição e não aplica antes da resposta', async()=>{
 let release,command;const waiting=new Promise(resolve=>release=resolve);
 const f=fixture({canAct:true,pending:false,send:async c=>{command=c;await waiting;}}),before=structuredClone(f.game);
 f.find(n=>n.props?.label==='O que aconteceu').props.onChange('Abrimos por outro acesso');
 f.find(n=>n.props?.label==='O que permanece para próximas visitas').props.onChange('Passagem segura marcada');
 f.find(n=>n.props?.label==='Barulho').props.onChange(2);
 const pending=f.find(n=>n.type==='button'&&text(n)==='Registrar desfecho').props.onClick();
 assert.equal(command.type,'resolve-event');assert.equal(command.expectedEvent,eventResolutionFingerprint(f.event));assert.equal(command.summary,'Abrimos por outro acesso');assert.equal(command.continuity,'Passagem segura marcada');assert.equal(command.noise,2);assert.deepEqual(command.participantIds,[f.game.survivors[0].id]);
 assert.deepEqual(f.game,before);assert.equal(f.edits(),0);assert.equal(f.find(n=>n.type==='button'&&text(n)==='Registrar desfecho').props.disabled,true);
 release();await pending;await new Promise(resolve=>setImmediate(resolve));assert.equal(f.closed(),1);
});
test('abordagem cuidadosa não penaliza automaticamente; recuo preserva tempo e erro mantém rascunho',async()=>{
 const f=fixture({canAct:true,pending:false,send:async()=>{throw new Error('O evento mudou');}});
 f.find(n=>n.props?.label==='Desfecho escolhido').props.onChange('failure');assert.equal(f.find(n=>n.props?.label==='Barulho').props.value,0);
 f.find(n=>n.type==='button'&&text(n).startsWith('Intervir / negociar')).props.onClick();
 f.find(n=>n.props?.label==='Desfecho escolhido').props.onChange('withdrawn');assert.equal(f.find(n=>n.props?.label==='Tempo (min)').props.value,5);
 f.find(n=>n.type==='button'&&text(n)==='Registrar desfecho').props.onClick();await new Promise(resolve=>setImmediate(resolve));
 assert.match(text(f.find(n=>n.props?.role==='alert')),/O evento mudou/);assert.equal(f.closed(),0);
 f.event.status='resolved';assert.equal(f.find(n=>n.type==='button'&&text(n)==='Registrar desfecho'),undefined);
});


test('trocar abordagem atualiza somente sugestões e preserva relato e efeitos editados',()=>{
 const f=fixture({canAct:true,pending:false,send:async()=>{}});
 f.event.generatorRoll=63;f.event.text=content.generators.eventos[62].text;
 assert.match(f.find(n=>n.props?.label==='O que aconteceu').props.value,/reparo continuam por resolver/);
 f.find(n=>n.type==='button'&&text(n).startsWith('Intervir / negociar')).props.onClick();
 assert.match(f.find(n=>n.props?.label==='O que aconteceu').props.value,/perda é contida/);
 f.find(n=>n.props?.label==='O que aconteceu').props.onChange('O grupo só identificou a válvula');
 f.find(n=>n.props?.label==='O que permanece para próximas visitas').props.onChange('Falta uma ferramenta');
 f.find(n=>n.props?.label==='Tempo (min)').props.onChange(7);f.find(n=>n.props?.label==='Barulho').props.onChange(2);
 f.find(n=>n.props?.label==='Desfecho escolhido').props.onChange('withdrawn');
 f.find(n=>n.type==='button'&&text(n).startsWith('Observar / preparar')).props.onClick();
 assert.equal(f.find(n=>n.props?.label==='O que aconteceu').props.value,'O grupo só identificou a válvula');assert.equal(f.find(n=>n.props?.label==='O que permanece para próximas visitas').props.value,'Falta uma ferramenta');assert.equal(f.find(n=>n.props?.label==='Tempo (min)').props.value,7);assert.equal(f.find(n=>n.props?.label==='Barulho').props.value,2);
 f.find(n=>n.type==='button'&&text(n)==='Usar sugestão do desfecho').props.onClick();assert.notEqual(f.find(n=>n.props?.label==='O que aconteceu').props.value,'O grupo só identificou a válvula');assert.equal(f.find(n=>n.props?.label==='Tempo (min)').props.value,7);
});
test('reconhecer desvio tem custo local e mostra condição do teste sem realizar deslocamento',()=>{
 const f=fixture({canAct:true,pending:false,send:async()=>{}}),before=structuredClone(f.game);
 f.find(n=>n.type==='button'&&text(n).startsWith('Outra saída / recuar')).props.onClick();
 assert.equal(f.find(n=>n.props?.label==='Tempo (min)').props.value,10);assert.match(text(f.find(n=>n.type==='p'&&text(n).includes('custo do mapa'))),/custo do mapa/);assert.deepEqual(f.game,before);
 f.find(n=>n.type==='button'&&text(n).startsWith('Intervir / negociar')).props.onClick();assert.ok(f.find(n=>n.type==='details'&&text(n).includes('Quando propor um teste')));assert.match(text(f.find(n=>n.type==='details'&&text(n).includes('Quando propor um teste'))),/forçar a grade travada/);
});
