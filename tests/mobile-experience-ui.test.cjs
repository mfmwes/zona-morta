/* eslint-disable @typescript-eslint/no-require-imports -- Exercises the real presentation handlers with isolated game state. */
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
Module._resolveFilename = function (name, parent, ...args) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '..', name.slice(2)) : name, parent, ...args); };

let host;
const hooks = {
  ...React,
  useState(initial) { const index = host.cursor++; if (!(index in host.slots)) host.slots[index] = typeof initial === 'function' ? initial() : initial; const current = host; return [current.slots[index], value => current.slots[index] = typeof value === 'function' ? value(current.slots[index]) : value]; },
  useRef(initial) { const index = host.cursor++; return host.slots[index] ?? (host.slots[index] = { current: initial }); },
  useMemo(fn) { host.cursor++; return fn(); },
  useEffect(fn) { host.cursor++; host.effects.push(fn); },
};
const names = ['mobile-campaign-shell.tsx', 'mobile-survivor-overview.tsx', 'survivor-panel.tsx', 'conflict-scene-manager.tsx', 'hex-explorer.tsx', 'table-chat.tsx'];
const originalLoad = Module._load;
Module._load = function (name, parent, main) {
  if (names.some(filename => parent?.filename.endsWith(filename))) {
    if (name === 'react') return hooks;
    if (name === 'sonner') return { toast: Object.assign(() => {}, { success() {}, error() {}, info() {} }) };
    if (name.startsWith('@/components/')) return new Proxy({}, { get: (_, key) => key === 'Button' ? 'button' : String(key) });
  }
  return originalLoad.call(this, name, parent, main);
};
const { MobileCampaignShell } = require('../components/mobile-campaign-shell.tsx');
const { MobileSurvivorOverview } = require('../components/mobile-survivor-overview.tsx');
const { SurvivorPanel } = require('../components/survivor-panel.tsx');
const { ConflictSceneManager } = require('../components/conflict-scene-manager.tsx');
const { HexExplorer } = require('../components/hex-explorer.tsx');
const { TableChat } = require('../components/table-chat.tsx');
Module._load = originalLoad;
const { mobilePrimaryNavigation, mobileReturnSection } = require('../lib/mobile-navigation.ts');
const { defaultState, initialSurvivor, content, survivorStats } = require('../lib/game.ts');
const { projectPlayerGame } = require('../lib/collaboration.ts');
const { createConflictScene, addThreatInstances } = require('../lib/conflict.ts');
const { threatLibrary } = require('../lib/threats.ts');

const text = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' ? text(node.props?.children) : String(node);
function elements(node, tab) {
  if (Array.isArray(node)) return node.flatMap(child => elements(child, tab));
  if (!node?.props) return [];
  if (node.type === 'Tabs') tab = node.props.value;
  if (node.type === 'TabsContent' && node.props.value !== tab) return [];
  return [node, ...elements(node.props.children, tab)];
}
function view(fn, props) {
  const current = { slots: [], cursor: 0, effects: [] };
  const render = () => { host = current; current.cursor = 0; current.effects = []; return fn(props); };
  return { render, effects: () => current.effects, find: predicate => elements(render()).find(predicate) };
}
function fixture() {
  const game = defaultState();
  const person = initialSurvivor({ name: 'Teste mobile', origin: content.origins[0].name, past: '', archetype: content.archetypes[0].name, specialty: content.archetypes[0].specialties[0].name, freeExperience: '', techniques: [], attributes: {}, primary: '', secondary: '', protection: '', personal: '' });
  game.survivors = [person];
  return { game, person };
}

test('navegação mobile prioriza a própria ficha e dano público; voltar do chat não abre um conflito encerrado', () => {
  assert.deepEqual(mobilePrimaryNavigation({ master: true, conflictActive: true, pendingDamage: 2 }).map(item => item.value), ['resumo', 'mapa', 'sobreviventes', 'chat']);
  const player = mobilePrimaryNavigation({ master: false, conflictActive: true, pendingDamage: 2 });
  assert.equal(player[0].value, 'sobreviventes'); assert.deepEqual(player[2], { value: 'conflito', label: 'Dano (2)' });
  assert.equal(mobilePrimaryNavigation({ master: false, conflictActive: false, pendingDamage: 0 })[2].value, 'abrigo');
  assert.equal(mobileReturnSection('conflito', false, false), 'sobreviventes');
  assert.equal(mobileReturnSection('abrigo', false, true), 'abrigo');
});

test('shell mobile tem cinco destinos, abre a prioridade e mantém uma única instância de chat entre telas', () => {
  let destination;
  const icon = () => null, chat = React.createElement('ChatReal');
  const props = { master: true, day: 1, time: '08:00', title: 'Visão geral', activeSection: 'resumo', sections: ['resumo', 'mapa', 'sobreviventes', 'conflito'].map(value => ({ value, label: value, icon })), conflictActive: true, pendingDamage: 0, status: 'Salvo', tools: 'Ferramentas autorizadas', notices: null, chat, children: 'Campanha', priority: '1 pedido de Spotlight', onNavigate: value => destination = value };
  const v = view(MobileCampaignShell, props);
  const nav = v.find(node => node.props.className === 'mobile-bottom-nav');
  assert.equal(elements(nav).filter(node => node.type === 'button').length, 5);
  v.find(node => node.props.className === 'mobile-priority').props.onClick(); assert.equal(destination, 'conflito');
  elements(nav).find(node => node.type === 'button' && text(node) === 'Chat').props.onClick(); assert.equal(destination, 'chat');
  assert.equal(v.find(node => node.props.className === 'mobile-chat-page').props.children, chat);
  assert.equal(v.find(node => node.props.className === 'mobile-chat-page').props.hidden, true);
  props.activeSection = 'chat'; assert.equal(v.find(node => node.props.className === 'mobile-chat-page').props.hidden, false);
  assert.equal(v.find(node => node.props.id === 'campaign-main').props.hidden, true);
  props.activeSection = 'mais'; assert.match(text(v.find(node => node.props.id === 'campaign-more')), /Ferramentas autorizadas/);
  assert.equal(v.find(node => node.props.className === 'mobile-chat-page').props.children, chat);
});

test('altura do shell acompanha o teclado sem limitar zoom e remove o estado ao sair do mobile', () => {
  const oldWindow = global.window, oldDocument = global.document;
  const values = new Map(), listeners = new Map();
  global.document = { documentElement: { style: { getPropertyValue: key => values.get(key) ?? '', setProperty: (key, value) => values.set(key, value), removeProperty: key => values.delete(key) } } };
  const viewport = { scale: 1, height: 720, addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) };
  global.window = { visualViewport: viewport };
  try {
    const v = view(MobileCampaignShell, { master: true, day: 1, time: '08:00', activeSection: 'resumo', sections: [], onNavigate() {} }); v.render();
    const cleanup = v.effects()[0](); assert.equal(values.get('--mobile-viewport-height'), '720px');
    viewport.height = 380; listeners.get('resize')(); assert.equal(values.get('--mobile-viewport-height'), '380px');
    viewport.scale = 2; listeners.get('resize')(); assert.equal(values.get('--mobile-viewport-height'), '100dvh');
    cleanup(); assert.equal(values.has('--mobile-viewport-height'), false); assert.equal(listeners.size, 0);
  } finally { global.window = oldWindow; global.document = oldDocument; }
});

test('ficha mobile usa as regras reais para alimentação, recursos e rolagens; detalhes continuam acessíveis', () => {
  const empty = view(SurvivorPanel, { mobile: true, game: defaultState(), edit() {}, playerPreview: false });
  assert.equal(empty.find(node => node.type === 'MobileDisclosure' && node.props.title === 'Criar primeiro sobrevivente').props.open, true);
  assert.ok(empty.find(node => node.type === 'CharacterWizard'));
  const { game, person } = fixture(); person.food = 2; person.water = 2;
  const v = view(SurvivorPanel, { mobile: true, game, edit: fn => fn(game), playerPreview: true, playerMode: true });
  const overview = v.find(node => node.type === 'MobileSurvivorOverview'); assert.ok(overview);
  overview.props.onConsume('food'); assert.equal(person.food, 1); assert.equal(person.foodConsumedDay, game.day);
  overview.props.onConsume('food'); assert.equal(person.food, 1, 'registro repetido não consome outra porção');
  overview.props.onConsume('water'); assert.equal(person.waterConsumedDay, game.day);
  const control = overview.props.renderResource('hp'); assert.equal(control.props.label, 'PV marcados'); control.props.onChange(1); assert.equal(person.hp, 1);
  overview.props.onAttack(); const roll = v.find(node => node.type === 'RollDialog'); assert.equal(roll.props.request.survivorId, person.id); assert.equal(roll.props.hideThreatSecrets, true);
  overview.props.onSection('historia'); assert.ok(v.find(node => node.type === 'Field' && node.props.label === 'Notas do sobrevivente'));
});

test('resumo mobile mantém PV marcados explícitos, impede consumo repetido e desabilita ataque quando caído', () => {
  const { person, game } = fixture(); person.foodConsumedDay = game.day; person.water = 0;
  const stats = survivorStats(person), v = view(MobileSurvivorOverview, { survivor: person, day: game.day, hpMax: stats.hp, armorMax: stats.armor, down: true, weapon: { name: 'Desarmado', details: 'Teste' }, renderResource: key => React.createElement('Controle', { resource: key }), onAttack() {}, onTest() {}, onSection() {}, onConsume() {} });
  assert.equal(v.find(node => node.type === 'button' && text(node) === 'Comeu hoje').props.disabled, true);
  assert.equal(v.find(node => node.type === 'button' && text(node) === 'Beber 1 porção').props.disabled, true);
  assert.equal(v.find(node => node.type === 'button' && text(node) === 'Atacar').props.disabled, true);
  let focused = false; v.find(node => node.props['aria-label']?.startsWith('Ajustar PV marcados')).props.onClick({ currentTarget: { focus() { focused = true; } } });
  assert.equal(v.find(node => node.type === 'Controle').props.resource, 'hp'); v.find(node => node.type === 'DialogContent').props.onCloseAutoFocus({ preventDefault() {} }); assert.equal(focused, true);
});

test('conflito mobile alterna listas sem apagar pedidos, spotlight ou ameaças', () => {
  const { game, person } = fixture();
  game.conflict = createConflictScene({ name: 'Teste', sceneNumber: 1, day: game.day, time: '08:00', survivorIds: [person.id] });
  game.conflict.spotlightRequests = [person.id];
  const template = threatLibrary(game.threats).find(row => row.attack); const [threat] = addThreatInstances(game.conflict, template);
  const before = structuredClone(game);
  const v = view(ConflictSceneManager, { mobile: true, game, edit: fn => fn(game) });
  assert.equal(v.find(node => node.props.id === 'mobile-conflict-team').props.hidden, true);
  assert.equal(v.find(node => node.props.id === 'mobile-conflict-threats').props.hidden, false);
  v.find(node => node.props['aria-controls'] === 'mobile-conflict-team').props.onClick();
  assert.equal(v.find(node => node.props.id === 'mobile-conflict-team').props.hidden, false); assert.deepEqual(game, before);
  v.find(node => node.type === 'button' && text(node) === 'Dar Spotlight').props.onClick();
  assert.deepEqual(game.conflict.spotlight, { kind: 'survivor', id: person.id }); assert.deepEqual(game.conflict.spotlightRequests, []); assert.equal(game.conflict.threats[0].id, threat.id);
});

test('mapa mobile abre e fecha o painel inferior sem exigir um breakpoint desktop ou revelar conteúdo privado', () => {
  const { game, person } = fixture();
  const v = view(HexExplorer, { mobile: true, game, edit() {}, playerPreview: false });
  v.find(node => node.props.className === 'mobile-sector-selection').props.onClick();
  assert.equal(v.find(node => node.type === 'Sheet').props.open, true);
  let focused = false; v.find(node => node.props.className === 'mobile-sector-selection').props.ref.current = { focus() { focused = true; } };
  v.find(node => node.type === 'SheetContent').props.onCloseAutoFocus({ preventDefault() {} }); assert.equal(focused, true);
  v.find(node => node.type === 'button' && text(node) === 'Voltar ao mapa').props.onClick(); assert.equal(v.find(node => node.type === 'Sheet').props.open, false);
  const publicGame = projectPlayerGame(game, person.id), player = view(HexExplorer, { mobile: true, game: publicGame, edit() {}, playerPreview: true });
  assert.ok(player.find(node => node.type === 'Sheet')); assert.equal(player.find(node => node.type === 'button' && text(node) === 'Preparar hex'), undefined);
});

test('chat mobile mantém o rascunho ao ocultar a tela e usa o mesmo envio da mesa', () => {
  const { game, person } = fixture(), props = { game, edit: fn => fn(game), role: 'jogador', survivorId: person.id, layout: 'screen', active: true, onClose() {} };
  const v = view(TableChat, props); assert.equal(v.render().props.className, 'table-chat table-chat--screen');
  const input = v.find(node => node.type === 'textarea'); input.props.onChange({ target: { value: 'Mensagem da ficha' } });
  props.active = false; assert.equal(v.find(node => node.type === 'textarea').props.value, 'Mensagem da ficha');
  props.active = true; assert.equal(v.find(node => node.type === 'textarea').props.value, 'Mensagem da ficha');
  assert.equal(game.log.some(row => row.text === 'Mensagem da ficha'), false, 'alternar a tela não envia mensagens');
  v.find(node => node.props['aria-label'] === 'Enviar mensagem').props.onClick();
  const message = game.log.find(row => row.kind === 'chat' && row.text === 'Mensagem da ficha'); assert.equal(message.actorId, person.id); assert.equal(v.find(node => node.type === 'textarea').props.value, '');
  v.find(node => node.type === 'FreeDiceTray').props.onRoll('1d4 + 1'); assert.ok(game.log.some(row => row.kind === 'rolagem' && row.actorId === person.id));
});
