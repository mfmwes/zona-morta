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
const { SurvivorConditionPanel, PublicConditionBadges, ConditionEffect } = require('../components/survivor-conditions.tsx');
const { SurvivorPanel } = require('../components/survivor-panel.tsx');
Module._load = load;
const { defaultState, initialSurvivor, content } = require('../lib/game.ts');
const { applySurvivorCondition, conditionDefinitions } = require('../lib/survivor-conditions.ts');
const expandRule = node => typeof node?.type === 'function' && ['ConditionEffect', 'EffectRuleText', 'ConditionRuleCards', 'ConditionInfoCard', 'ConditionDialogHeader'].includes(node.type.name) ? node.type(node.props) : node;
const text = node => {
  node = expandRule(node);
  return node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' ? text(node.props?.children) : String(node);
};
function nodes(node, tab, dialogOpen = true) {
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, tab, dialogOpen));
  node = expandRule(node);
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

test('Frio e Calor separam os níveis e destacam mecânicas sem alterar a regra', () => {
  for (const kind of ['cold', 'heat']) {
    const { game, survivor } = fixture();
    applySurvivorCondition(game, survivor.id, kind, { level: 2 });
    const condition = survivor.conditions.find(entry => entry.kind === kind);
    assert.ok(condition);
    const effect = conditionDefinitions[kind].effect;
    const element = ConditionEffect({ condition, effect });
    const fragments = nodes(element).filter(node => node.type === 'li' && node.props.className === 'survivor-condition-effect-level-row');
    const labels = [...effect.matchAll(/Nível\s+([123])(\+)?:\s*/g)];
    assert.equal(element.props.className, 'survivor-condition-effect');
    assert.equal(fragments.length, 3);
    for (const [index, label] of labels.entries()) {
      const strong = nodes(fragments[index]).find(node => node.type === 'strong');
      const until = labels[index + 1]?.index ?? effect.length;
      const description = effect.slice(label.index + label[0].length, until).trim();
      assert.equal(text(strong), `Nível ${label[1]}${label[2] ?? ''}:`);
      assert.equal(strong.props.className.includes('is-reached'), Number(label[1]) <= 2);
      assert.ok(text(fragments[index]).includes(description));
    }
    assert.equal(fragments.map(fragment => nodes(fragment).filter(node => node.type === 'p' || node.props.className?.split(' ').includes('survivor-condition-effect-level')).map(text).join(' ')).join(' '), effect);
    assert.ok(nodes(element).some(node => node.type === 'strong' && node.props.className === 'survivor-condition-mechanic' && text(node) === 'Desvantagem'));
  }
});

test('efeito de todas as condições sem níveis mantém integralmente as frases originais', () => {
  for (const kind of ['restrained', 'vulnerable', 'hidden', 'wet', 'bleeding', 'injury', 'fracture']) {
    const condition = { id: kind, kind };
    const effect = conditionDefinitions[kind].effect;
    const element = ConditionEffect({ condition, effect });
    const paragraphs = nodes(element).filter(node => node.type === 'p');
    assert.ok(paragraphs.length > 0, kind);
    assert.equal(paragraphs.map(text).join(' '), effect, kind);
  }
});

test('modal de condições mantém limites responsivos e isola a tipografia dos efeitos', () => {
  const css = fs.readFileSync(path.join(__dirname, '../app/condition-screen.css'), 'utf8');
  const component = fs.readFileSync(path.join(__dirname, '../components/survivor-conditions.tsx'), 'utf8');
  assert.match(css, /width:min\(790px,calc\(100vw - 28px\)\)/);
  assert.match(css, /max-height:calc\(100dvh - 20px\)/);
  assert.match(css, /overflow-y:auto/);
  assert.match(css, /\.survivor-condition-effect-level-row\s*\{/);
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /@media\(max-width:420px\)/);
  const legacyCss = fs.readFileSync(path.join(__dirname, '../app/visual-system.css'), 'utf8');
  assert.doesNotMatch(legacyCss, /\.survivor-condition-detail span\s*,/);
  assert.match(component, /Rolar exposição/);
  assert.match(component, /Falha com Esperança/);
  assert.match(component, /Falha com Medo/);
  assert.match(component, /Recuperou 1 nível/);
});

test('seletor visual de aplicar condição oferece nove cartões com ícones e seleção única', () => {
  const { game, survivor } = fixture();
  const render = view(SurvivorConditionPanel, { game, survivor, edit() {}, editable: true });
  let elements = render();
  const modal = elements.find(node => node.type === 'Dialog' && node.props.open === false);
  assert.ok(modal);
  modal.props.onOpenChange(true);
  elements = render();
  const cards = elements.filter(node => node.type === 'button' && node.props.className?.includes('survivor-condition-choice-card'));
  assert.equal(cards.length, Object.keys(conditionDefinitions).length);
  assert.equal(cards.filter(node => node.props['aria-pressed']).length, 1);
  assert.ok(cards.every(node => nodes(node).some(child => typeof child.type === 'function' || child.type === 'Sun' || child.type === 'Snowflake' || child.props?.className === 'survivor-condition-choice-icon')));
  const heat = cards.find(node => node.props['aria-label'] === 'Calor · Ambiental');
  assert.ok(heat);
  heat.props.onClick();
  elements = render();
  const selected = elements.filter(node => node.type === 'button' && node.props.className?.includes('survivor-condition-choice-card') && node.props['aria-pressed']);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].props['aria-label'], 'Calor · Ambiental');
  assert.equal(elements.find(node => node.type === 'Pick' && node.props.label === 'Intensidade inicial').props.value, '1');
  assert.ok(elements.find(node => node.type === 'Field' && node.props.label === 'Origem · opcional'));
  assert.match(text(elements.find(node => node.type === 'section' && node.props['aria-label'] === 'Prévia da condição')), /Calor.*Efeito.*Nível 1.*Como remover/);
});

test('aplicação pelo seletor visual preserva intensidade e origem e exibe campos contextuais', () => {
  const { game, survivor } = fixture();
  const render = view(SurvivorConditionPanel, {
    game, survivor, editable: true,
    edit(mutate) { mutate(game); },
  });
  render().find(node => node.type === 'Dialog' && node.props.open === false).props.onOpenChange(true);
  function choose(label) {
    render().find(node => node.type === 'button' && node.props['aria-label'] === label).props.onClick();
  }
  choose('Lesão · Físico');
  assert.ok(render().some(node => node.type === 'Pick' && node.props.label === 'Região afetada'));
  assert.equal(render().some(node => node.type === 'Pick' && node.props.label === 'Intensidade inicial'), false);
  choose('Molhado · Ambiental');
  assert.ok(render().some(node => node.type === 'Pick' && node.props.label === 'Fonte da água'));
  choose('Calor · Ambiental');
  let elements = render();
  assert.equal(elements.some(node => node.type === 'Pick' && node.props.label === 'Fonte da água'), false);
  elements.find(node => node.type === 'Pick' && node.props.label === 'Intensidade inicial').props.onChange('2');
  elements.find(node => node.type === 'Field' && node.props.label === 'Origem · opcional').props.onChange('caminhada sob o sol');
  elements = render();
  const submit = elements.find(node => node.type === 'button' && node.props.onClick && text(node) === 'Aplicar condição');
  assert.ok(submit);
  submit.props.onClick();
  const applied = survivor.conditions.find(condition => condition.kind === 'heat');
  assert.equal(applied?.level, 2);
  assert.equal(applied?.source, 'caminhada sob o sol');
  assert.equal(render().find(node => node.type === 'Dialog').props.open, false);
});

test('modal aplicar condição é responsivo, compacto e oferece estados selecionado e foco', () => {
  const css = fs.readFileSync(path.join(__dirname, '../app/condition-screen.css'), 'utf8');
  assert.match(css, /\.survivor-condition-add-dialog\s*\{/);
  assert.match(css, /\.survivor-condition-choice-grid\s*\{/);
  assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /\.survivor-condition-choice-card\.is-selected/);
  assert.match(css, /\.survivor-condition-choice-card:focus-visible/);
  assert.match(css, /\.survivor-condition-add-fields/);
  assert.match(css, /max-height:calc\(100dvh - 20px\)/);
  assert.match(css, /@media\(max-width:620px\)/);
});

test('painel compacto do conflito aplica na mesma ficha e abre os controles existentes do mestre', () => {
  const { game, survivor } = fixture();
  const render = view(SurvivorConditionPanel, { game, survivor, compact: true, editable: true, edit: fn => fn(game) });
  assert.ok(render().some(node => node.props['aria-label'] === `Condições de ${survivor.name}`));
  assert.ok(render().some(node => node.type === 'button' && node.props['aria-label'] === `Aplicar condição a ${survivor.name}`));
  render().find(node => node.type === 'Dialog').props.onOpenChange(true);
  render().find(node => node.type === 'button' && node.props['aria-label'] === 'Calor · Ambiental').props.onClick();
  render().find(node => node.type === 'button' && text(node) === 'Aplicar condição').props.onClick();
  assert.equal(survivor.conditions[0].kind, 'heat');
  render().find(node => node.type?.name === 'ConditionBadge').props.onOpen();
  const detail = render().find(node => node.type?.name === 'ConditionDetailDialog');
  assert.equal(detail.props.condition.id, survivor.conditions[0].id);
  assert.equal(detail.props.ownerName, survivor.name);
  assert.equal(detail.props.editable, true);
});

test('painel próprio do jogador consulta sem aplicação manual e encaminha a exposição autorizada', () => {
  const { game, survivor } = fixture();
  applySurvivorCondition(game, survivor.id, 'cold');
  const playerActions = { actorId: survivor.id, canAct: true, pending: false, send() {} };
  const render = view(SurvivorConditionPanel, { game, survivor, compact: true, editable: false, playerActions, edit() {} });
  assert.equal(render().some(node => node.type === 'button' && /Aplicar condição/.test(text(node))), false);
  render().find(node => node.type?.name === 'ConditionBadge').props.onOpen();
  const detail = render().find(node => node.type?.name === 'ConditionDetailDialog');
  assert.equal(detail.props.editable, false);
  assert.equal(detail.props.playerActions, playerActions);
  assert.equal(detail.props.survivor.id, survivor.id);
});

test('consulta de outro participante só mostra regra e recuperação, sem origem ou ações', () => {
  const condition = { id: 'cold', kind: 'cold', level: 2, source: 'origem privada', exposureAdvantageSource: 'item privado' };
  const render = view(PublicConditionBadges, { conditions: [condition], ownerName: 'Bia' });
  render().find(node => node.type?.name === 'ConditionBadge').props.onOpen();
  const rows = render();
  assert.match(rows.map(text).join(' '), /Bia/);
  assert.doesNotMatch(rows.map(text).join(' '), /origem privada|item privado|Rolar exposição|Resolver manualmente|Aplicar condição/);
  assert.equal(rows.some(node => node.type?.name === 'ExposureRollControl'), false);
  assert.equal(rows.some(node => node.type?.name === 'DetailActions'), false);
  assert.ok(rows.some(node => node.type === 'ol' && node.props['aria-label'] === 'Efeitos por nível'));
});
