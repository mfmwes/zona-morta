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
  button: ['Button'], dialog: ['Dialog', 'DialogContent', 'DialogTitle', 'DialogDescription'],
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
  if (parent?.filename.endsWith('hex-explorer.tsx')) {
    if (name === 'react') return hooks;
    if (name === 'sonner') return { toast: { success() {}, error() {} } };
    if (name.startsWith('@/components/')) {
      const exports = stubs[name.split('/').pop()];
      if (exports) return Object.fromEntries(exports.map(key => [key, key === 'Button' ? 'button' : key]));
    }
  }
  return load.call(this, name, parent, main);
};
const { HexExplorer } = require('../components/hex-explorer.tsx');
Module._load = load;
const { defaultState, initialSurvivor, content } = require('../lib/game.ts');
const { assignCustomSector } = require('../lib/sectors.ts');
const text = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' ? text(node.props?.children) : String(node);
function elements(node, tab = null, found = []) {
  if (Array.isArray(node)) { node.forEach(child => elements(child, tab, found)); return found; }
  if (!node || typeof node !== 'object' || !node.props) return found;
  if ((['Dialog', 'Sheet', 'AlertDialog'].includes(node.type) && node.props.open === false) || node.props.hidden) return found;
  if (node.type === 'Tabs') tab = node.props.value;
  if (node.type === 'TabsContent' && node.props.value !== tab) return found;
  found.push(node);elements(node.props.children, tab, found);return found;
}
function fixture(playerPreview = false) {
  let game = defaultState();
  const archetype = content.archetypes[0];
  const survivor = initialSurvivor({ name: 'Nina', origin: content.origins[1].name, past: '', archetype: archetype.name, specialty: archetype.specialties[0].name, freeExperience: '', techniques: [], attributes: { Instinto: 1 }, primary: '', secondary: '', protection: '', personal: '' });
  survivor.hex = '0,0';game.survivors = [survivor];
  assignCustomSector(game, '0,0', 'Garagens');assignCustomSector(game, '1,0', 'Oficinas');
  game.hexes['0,0'].discovery = 'explorado';game.hexes['1,0'].discovery = 'avistado';
  for (const hex of Object.values(game.hexes)) { hex.points = [];hex.events = []; }
  game.hexes['0,0'].notes = 'Segredo reservado';game.hexes['0,0'].signs = 'Portões abertos';
  const instance = { slots: [], cursor: 0, dirty: false };
  let tree;
  const render = () => { host = instance;host.cursor = 0;host.dirty = false;tree = HexExplorer({ game, playerPreview, edit: fn => { const next = structuredClone(game);fn(next);game = next; } });return tree; };
  const find = predicate => elements(render()).find(predicate);
  const button = label => find(node => node.type === 'button' && text(node).trim() === label);
  const click = label => { const control = button(label);assert.ok(control, label);assert.equal(Boolean(control.props.disabled), false);control.props.onClick();render(); };
  const select = hex => { const context = find(node => node.type === 'HexContextMenu' && node.props.hexId === hex);assert.ok(context);context.props.onOpenDetails();render(); };
  const tabTo = value => { const tabs = find(node => node.type === 'Tabs');assert.ok(tabs);tabs.props.onValueChange(value);render(); };
  return { render, find, button, click, select, tabTo, state: () => game };
}

test('selecionar um hex abre exploração sem modificar a campanha; outro hex volta à exploração', () => {
  const f = fixture(), original = structuredClone(f.state());
  assert.equal(f.find(node => node.type === 'Tabs'), undefined);
  f.select('0,0');assert.ok(f.find(node => node.type === 'Tabs' && node.props.value === 'exploration'));
  assert.equal(f.find(node => node.type === 'Pick' && node.props.label === 'Terreno'), undefined);
  f.tabTo('management');assert.ok(f.find(node => node.type === 'Pick' && node.props.label === 'Terreno'));
  f.select('1,0');assert.ok(f.find(node => node.type === 'Tabs' && node.props.value === 'exploration'));
  assert.deepEqual(f.state(), original);
});

test('escolher o marcador de grupo mantém o mapa aberto; ferramentas contextuais abrem gestão', () => {
  const f = fixture();
  f.find(node => node.type === 'MapGroupMarker' && node.props.hexId === '0,0').props.onSelect();
  assert.equal(f.find(node => node.type === 'Tabs'), undefined);
  f.find(node => node.type === 'HexContextMenu' && node.props.hexId === '1,0').props.onOpenMasterTools();
  assert.ok(f.find(node => node.type === 'Tabs' && node.props.value === 'management'));
});

test('rascunhos de sinais e notas sobrevivem à troca de aba e são salvos independentemente', () => {
  const f = fixture();f.select('0,0');
  f.find(node => node.type === 'Field' && node.props.label === 'Sinais adicionais mostrados').props.onChange('Novo sinal');
  f.find(node => node.type === 'Field' && node.props.label === 'Anotações reservadas').props.onChange('Nova nota');
  f.tabTo('management');f.tabTo('exploration');
  assert.equal(f.find(node => node.type === 'Field' && node.props.label === 'Sinais adicionais mostrados').props.value, 'Novo sinal');
  f.click('Salvar sinais');assert.equal(f.state().hexes['0,0'].signs, 'Novo sinal');assert.equal(f.state().hexes['0,0'].notes, 'Segredo reservado');
  f.click('Salvar notas');assert.equal(f.state().hexes['0,0'].notes, 'Nova nota');
});

test('jogador recebe apenas locais públicos e nunca recebe controles de gestão ou notas reservadas', () => {
  const f = fixture(true);
  f.state().hexes['0,0'].points = [{ id: 'hidden', name: 'Depósito secreto', kind: 'local', signal: '', access: '', notes: '', revealed: false, searches: [] }];
  assert.equal(f.find(node => node.type === 'Tabs'), undefined);
  assert.equal(f.find(node => node.type === 'TabsList'), undefined);
  assert.equal(f.find(node => node.type === 'Pick'), undefined);
  assert.equal(f.find(node => node.type === 'Field'), undefined);
  assert.equal(f.find(node => typeof node.type === 'string' && text(node) === 'Depósito secreto'), undefined);
});

test('movimento de grupo único avança o relógio e aplica a chegada e bloqueia viagem após o fim do dia', () => {
  const f = fixture();f.select('1,0');
  const before = f.state().minutes;
  const move = f.find(node => node.type === 'button' && node.props['aria-label']?.startsWith('Mover grupo principal'));
  assert.ok(move);assert.equal(move.props.disabled, false);move.props.onClick();
  assert.equal(f.state().partyHex, '1,0');assert.equal(f.state().survivors[0].hex, '1,0');assert.equal(f.state().minutes, before+60);
  const marker = f.find(node => node.type === 'MapGroupMarker' && node.props.hexId === '1,0');assert.equal(marker.props.active, true);
  const late = fixture();late.state().minutes = 1400;late.select('1,0');assert.equal(late.find(node => node.type === 'button' && node.props['aria-label']?.startsWith('Mover grupo principal')).props.disabled, true);
});

test('fechar busca ou gerador devolve o mestre ao setor selecionado', () => {
  const f = fixture();f.select('0,0');f.click('Adicionar local');
  assert.equal(f.find(node => node.type === 'Tabs'), undefined);
  const generator = f.find(node => node.type === 'HexGeneratorDialog');assert.ok(generator);generator.props.onOpenChange(false);
  assert.ok(f.find(node => node.type === 'Tabs' && node.props.value === 'exploration'));
  const search = fixture();
  search.state().hexes['0,0'].points = [{ id: 'workshop', name: 'Garagem de reparos', kind: 'local', signal: '', access: '', notes: '', revealed: true, searches: [] }];
  search.select('0,0');search.click('Explorar local');
  assert.equal(search.find(node => node.type === 'Tabs'), undefined);
  const searchDialog = search.find(node => node.type === 'HexSearchDialog');assert.ok(searchDialog);
  assert.equal(searchDialog.props.request.pointId, 'workshop');searchDialog.props.onClose();
  assert.ok(search.find(node => node.type === 'Tabs' && node.props.value === 'exploration'));
});


test('mestre abre guia do evento e jogador não recebe o controle de desfecho', () => {
  const f = fixture();
  f.state().hexes['0,0'].events = [{id:'scene',text:'Porta bloqueada.',trigger:'',revealed:true,status:'active',generatorRoll:52}];
  f.select('0,0');f.click('Conduzir evento');
  const guide = f.find(node => node.type === 'HexEventGuideDialog');assert.ok(guide);assert.equal(guide.props.eventId,'scene');
  guide.props.onClose();assert.ok(f.find(node => node.type === 'Tabs'));
  const player = fixture(true);player.state().hexes['0,0'].events = structuredClone(f.state().hexes['0,0'].events);
  assert.equal(player.button('Conduzir evento'),undefined);assert.equal(player.find(node=>node.type==='HexEventGuideDialog'),undefined);
});
