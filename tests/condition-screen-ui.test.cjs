/* eslint-disable @typescript-eslint/no-require-imports -- Exercise the actual presentation handlers with isolated fixtures. */
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
const hooks = {
  ...React,
  useState(initial) { const i = host.cursor++; if (!(i in host.slots)) host.slots[i] = typeof initial === 'function' ? initial() : initial; const current = host; return [current.slots[i], value => { current.slots[i] = typeof value === 'function' ? value(current.slots[i]) : value; }]; },
  useRef(initial) { const i = host.cursor++; return host.slots[i] ?? (host.slots[i] = { current: initial }); },
  useMemo(fn) { host.cursor++; return fn(); },
  useEffect() { host.cursor++; },
};
const load = Module._load;
Module._load = function(name, parent, main) {
  if (['survivor-panel.tsx', 'survivor-conditions.tsx'].some(file => parent?.filename.endsWith(file))) {
    if (name === 'react') return hooks;
    if (name === 'sonner') return { toast: { success() {}, error() {} } };
    if (name.startsWith('@/components/')) return new Proxy({}, { get: (_, key) => key === 'Button' ? 'button' : String(key) });
  }
  return load.call(this, name, parent, main);
};
const { SurvivorConditionPanel } = require('../components/survivor-conditions.tsx');
const { SurvivorPanel } = require('../components/survivor-panel.tsx');
Module._load = load;
const { defaultState, initialSurvivor, content } = require('../lib/game.ts');
const { applySurvivorCondition } = require('../lib/survivor-conditions.ts');
const text = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' ? text(node.props?.children) : String(node);
function nodes(node, tab, dialogOpen = true) {
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, tab, dialogOpen));
  if (!node?.props) return [];
  if (node.type === 'Tabs') tab = node.props.value;
  if (node.type === 'TabsContent' && node.props.value !== tab) return [];
  if (node.type === 'Dialog') dialogOpen = node.props.open;
  if (node.type === 'DialogContent' && !dialogOpen) return [];
  return [node, ...nodes(node.props.children, tab, dialogOpen)];
}
function view(component, props) {
  const instance = { cursor: 0, slots: [] };
  return () => { host = instance; host.cursor = 0; return nodes(component(props)); };
}
function fixture() {
  const game = defaultState(), archetype = content.archetypes[0];
  const survivor = initialSurvivor({ name: 'Ana', origin: content.origins[0].name, past: '', archetype: archetype.name, specialty: archetype.specialties[0].name, freeExperience: 'Cuidar', techniques: [], attributes: { Agilidade: 1, Força: 0, Finesse: 0, Instinto: 0, Presença: 0, Conhecimento: 0 }, primary: 'Faca resistente', secondary: '', protection: 'Roupa reforçada', personal: 'Mochila urbana' });
  game.survivors = [survivor];
  return { game, survivor };
}

test('cada condição tem um único cartão que abre seu detalhe, inclusive na ficha de jogador', () => {
  const { game, survivor } = fixture();
  applySurvivorCondition(game, survivor.id, 'heat', { level: 1 });
  applySurvivorCondition(game, survivor.id, 'bleeding');
  const playerActions = { canAct: true };
  const render = view(SurvivorConditionPanel, { game, survivor, edit() { assert.fail('Consultar não deve editar'); }, editable: false, playerActions });
  const rows = render().filter(node => node.type === 'button' && node.props['aria-haspopup'] === 'dialog');
  assert.equal(rows.length, 2);
  assert.equal(render().some(node => node.type?.name === 'SurvivorConditionBadges'), false);
  assert.equal(render().some(node => node.type === 'button' && text(node).includes('Aplicar condição')), false);
  rows.find(row => row.props['aria-label'].startsWith('Calor 1.')).props.onClick();
  const dialog = render().find(node => node.type?.name === 'ConditionDetailDialog');
  assert.equal(dialog.props.open, true);
  assert.equal(dialog.props.condition.kind, 'heat');
  assert.equal(dialog.props.editable, false);
  assert.equal(dialog.props.playerActions, playerActions);
  dialog.props.onOpenChange(false);
  assert.equal(render().find(node => node.type?.name === 'ConditionDetailDialog').props.open, false);
});

test('sem eventos ou exposição, a aba não mostra painéis vazios nem repete recursos de combate', () => {
  const { game, survivor } = fixture();
  const render = view(SurvivorPanel, { game, edit() {}, playerPreview: false, initialSection: 'condicoes' });
  let elements = render();
  assert.equal(elements.some(node => node.props.className === 'character-combat-metrics'), false);
  assert.equal(elements.some(node => node.type === 'SurvivorConditionBadges'), false);
  assert.equal(view(SurvivorPanel, { game, edit() {}, playerPreview: false, initialSection: 'resumo' })().some(node => node.type === 'SurvivorConditionBadges'), true);
  assert.equal(elements.some(node => text(node) === 'Condições de eventos'), false);
  const infection = elements.find(node => node.type === 'details' && node.props.className?.includes('survivor-infection-panel'));
  assert.equal(infection.props.open, false);
  assert.match(text(infection), /Sem exposição registrada/);
  survivor.eventConditions = [{ name: 'Fumaça densa', effect: 'Visão limitada.', clear: 'Sair da área.' }];
  elements = render();
  const event = elements.find(node => node.type === 'details' && node.props.className === 'survivor-event-condition');
  assert.match(text(event), /Fumaça densa.*Visão limitada.*Sair da área/);
  assert.equal(event.props.open, undefined);
});

test('Exposto abre o acompanhamento; tratamento e edição manual ficam reservados ao mestre', () => {
  const { game, survivor } = fixture();
  survivor.infection = 'Exposto';
  survivor.exposureDeadline = 600;
  for (const mode of [{ playerMode: false, playerPreview: false }, { playerMode: true, playerPreview: false }, { playerMode: false, playerPreview: true }]) {
    const elements = view(SurvivorPanel, { game, edit() {}, initialSection: 'condicoes', ...mode })();
    const master = !mode.playerMode && !mode.playerPreview;
    assert.equal(elements.find(node => node.type === 'details' && node.props.className?.includes('survivor-infection-panel')).props.open, true);
    assert.equal(elements.some(node => node.type === 'Pick' && node.props.label === 'Alterar estado de infecção'), master);
    assert.equal(elements.some(node => node.type === 'button' && text(node).includes('Tentar limpar exposição')), master);
    if (master) {
      const treatment = elements.find(node => node.type === 'button' && text(node).includes('Tentar limpar exposição'));
      assert.equal(treatment.props.disabled, true);
      assert.ok(elements.some(node => text(node).includes('É preciso ter 1 Medicamentos acessível para iniciar.')));
    }
  }
  survivor.infection = 'Terminal'; survivor.terminalScenes = 2;
  const player = view(SurvivorPanel, { game, edit() {}, initialSection: 'condicoes', playerMode: true, playerPreview: false })();
  assert.equal(player.some(node => node.type === 'Counter' && node.props.label === 'Cenas significativas restantes'), false);
  assert.ok(player.some(node => text(node).includes('Cenas significativas restantes: 2')));
});
