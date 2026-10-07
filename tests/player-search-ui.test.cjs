/* eslint-disable @typescript-eslint/no-require-imports -- Exercise real TSX event handlers with a minimal hook host. */
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
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...args) {
  return originalResolve.call(this, name.startsWith('@/') ? path.join(__dirname, '..', name.slice(2)) : name, parent, ...args);
};
const { defaultState, initialSurvivor, content } = require('../lib/game.ts');
const { assignCustomSector } = require('../lib/sectors.ts');
const { prepareLocation, registerVisibleStock } = require('../lib/hex-automation.ts');
const { applyPlayerAction, playerActionState } = require('../lib/player-actions.ts');
const { projectPlayerGame } = require('../lib/collaboration.ts');
const { itemFromCatalog } = require('../lib/inventory.ts');
const { TeamActionError } = require('../components/player-actions-panel.tsx');
let host;
const hooks = {
  ...React,
  useState(initial) {
    const index = host.cursor++;
    if (!(index in host.slots)) host.slots[index] = typeof initial === 'function' ? initial() : initial;
    const owner = host;
    return [owner.slots[index], value => {
      const next = typeof value === 'function' ? value(owner.slots[index]) : value;
      if (!Object.is(next, owner.slots[index])) { owner.slots[index] = next; owner.dirty = true; }
    }];
  },
  useRef(initial) {
    const index = host.cursor++;
    if (!(index in host.slots)) host.slots[index] = { current: initial };
    return host.slots[index];
  },
  useEffect(effect, deps) {
    const index = host.cursor++, previous = host.slots[index];
    if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) {
      host.slots[index] = deps; host.effects.push(effect);
    }
  },
};
const originalLoad = Module._load;
Module._load = function(name, parent, main) {
  if (parent?.filename.endsWith('player-hex-search-dialog.tsx')) {
    if (name === 'react') return hooks;
    if (name === '@/components/ui/button') return { Button: 'button' };
    if (name === '@/components/ui/dialog') return Object.fromEntries(['Dialog', 'DialogContent', 'DialogDescription', 'DialogFooter', 'DialogHeader', 'DialogTitle'].map(key => [key, key]));
    if (name === '@/components/game-controls') return { Field: 'field', Pick: 'pick' };
  }
  return originalLoad.call(this, name, parent, main);
};
const { PlayerHexSearchDialog } = require('../components/player-hex-search-dialog.tsx');
Module._load = originalLoad;
function textOf(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(textOf).join('');
  return typeof node === 'object' ? textOf(node.props?.children) : String(node);
}
function elements(node, disabled = false, found = []) {
  if (Array.isArray(node)) { node.forEach(child => elements(child, disabled, found)); return found; }
  if (!node || typeof node !== 'object' || !node.props) return found;
  const blocked = disabled || Boolean(node.props.disabled);
  found.push({ node, disabled: blocked });
  elements(node.props.children, blocked, found);
  return found;
}
function fixture() {
  let game = defaultState();
  const archetype = content.archetypes[0];
  game.survivors = [initialSurvivor({ name: 'Nina', origin: content.origins[1].name, past: '', archetype: archetype.name, specialty: archetype.specialties[0].name, freeExperience: 'Resgates', techniques: [], attributes: { Instinto: 1 }, primary: '', secondary: '', protection: '', personal: '' })];
  const actorId = game.survivors[0].id;game.survivors[0].hex = '0,0';game.survivors[0].inventory = [];
  assignCustomSector(game, '0,0', 'Mercado', 'explorado');game.hexes['0,0'].events = [];
  const point = { id: 'market', name: 'Mercado', kind: 'comércio', signal: '', access: '', notes: '', revealed: true, lootTable: content.lootTables[1].name, searches: [] };
  game.hexes['0,0'].points = [point];prepareLocation(point);
  point.preparation.areas.forEach(area => { area.access = 'open';area.noise = 0;area.visibleOutcome = 'none'; });
  const areaId = point.preparation.areas[0].id;
  assert.equal(registerVisibleStock(game, '0,0', 'market', areaId, 'visible', 'Bebidas::Garrafa de água lacrada', 2), null);
  game.playerActions = playerActionState(game);
  const calls = [], controls = { actorId, canAct: true, pending: false, send: async payload => {
    calls.push(structuredClone(payload));
    const result = applyPlayerAction(game, actorId, payload, () => 1);
    if (!result.ok) throw new TeamActionError(result.error, true);
    game = result.state;
    if (controls.disconnect) { controls.pending = true;controls.disconnect = false;throw new Error('Conexão interrompida'); }
    controls.pending = false;
  } };
  const instance = { slots: [], cursor: 0, effects: [], dirty: false };
  let tree;
  const render = () => {
    for (let pass = 0; pass < 10; pass++) {
      host = instance;instance.cursor = 0;instance.effects = [];instance.dirty = false;
      tree = PlayerHexSearchDialog({ game: projectPlayerGame(game, actorId), controls, request: { hexId: '0,0', pointId: 'market' }, onClose: () => {} });
      instance.effects.forEach(effect => effect());
      if (!instance.dirty) return tree;
    }
    throw new Error('Render did not settle');
  };
  const button = label => { render();return elements(tree).find(({ node }) => node.type === 'button' && textOf(node) === label); };
  const flush = async () => { await new Promise(resolve => setImmediate(resolve));render(); };
  const click = async label => { const entry = button(label);assert.ok(entry, label);assert.equal(entry.disabled, false, label);entry.node.props.onClick();await flush(); };
  return { controls, calls, render, button, flush, click, state: () => game, actorId, areaId };
}

test('botão Recolher envia comando real mesmo com pausa; nova busca permanece desativada', async () => {
  const f = fixture();f.state().playerActions.policy.paused = true;
  assert.equal(f.button('Propor busca geral (1d12)').disabled, true);
  await f.click('Recolher');
  assert.equal(f.calls[0].type, 'collect');assert.equal(f.calls[0].quantity, 1);
  assert.equal(f.state().survivors[0].inventory[0].qty, 1);
  assert.equal(f.state().hexes['0,0'].points[0].preparation.stock[0].remaining, 1);
  assert.equal(f.state().playerActions.policy.paused, true);
});

test('duplo clique não duplica coleta e controles ficam bloqueados enquanto envia ou sincroniza', async () => {
  const f = fixture(), entry = f.button('Recolher');
  entry.node.props.onClick();entry.node.props.onClick();
  assert.equal(f.button('Recolher').disabled, true);
  await f.flush();assert.equal(f.calls.length, 1);
  f.controls.canAct = false;assert.equal(f.button('Recolher').disabled, true);
});

test('queda após coleta salva permite reenviar exatamente o mesmo comando sem duplicação', async () => {
  const f = fixture();f.controls.disconnect = true;
  await f.click('Recolher');
  assert.equal(f.state().survivors[0].inventory[0].qty, 1);
  assert.equal(f.button('Recolher').disabled, true);
  await f.click('Tentar novamente a mesma ação');
  assert.deepEqual(f.calls[1], f.calls[0]);assert.equal(f.state().survivors[0].inventory[0].qty, 1);
  assert.equal(f.button('Recolher').disabled, false);
});

test('rejeição por capacidade mostra erro, mantém estoque e permite corrigir sem reenvio pendente', async () => {
  const f = fixture();f.state().survivors[0].inventory = [{ id: 'full', name: 'Carga', qty: 99, load: 1, condition: 'Íntegro' }];
  await f.click('Recolher');
  assert.match(textOf(f.render()), /não tem capacidade/);
  assert.equal(f.button('Tentar novamente a mesma ação'), undefined);
  assert.equal(f.state().hexes['0,0'].points[0].preparation.stock[0].remaining, 2);
  f.state().survivors[0].inventory = [];
  await f.click('Recolher');assert.notEqual(f.calls[1].id, f.calls[0].id);
  assert.equal(f.state().survivors[0].inventory[0].qty, 1);
});

test('botão coleta no carrinho escolhido e preserva combustível em galão no inventário', async () => {
  const f = fixture(), cart = itemFromCatalog(content.catalog.find(row => row.name === 'Carrinho dobrável'));
  cart.cartDeployed = true;cart.cartItems = [];f.state().survivors[0].inventory.push(cart);
  const destination = elements(f.render()).find(({ node }) => node.type === 'pick' && node.props.label === 'Destino da coleta');
  destination.node.props.onChange(cart.id);await f.flush();
  f.state().playerActions.policy.paused = true;
  await f.click('Recolher');assert.equal(f.calls[0].cartId, cart.id);
  assert.equal(f.state().survivors[0].inventory.find(row => row.id === cart.id).cartItems[0].qty, 1);
  const stock = f.state().hexes['0,0'].points[0].preparation.stock[0];
  stock.item = itemFromCatalog(content.catalog.find(row => row.name === 'Combustível (1 unidade)'));stock.requiresFuelContainer = true;
  const gallon = itemFromCatalog(content.catalog.find(row => row.name === 'Galão vazio'));
  f.state().survivors[0].inventory.push(gallon);
  const reserves = f.state().shelter.fuel;
  await f.click('Recolher');assert.equal(f.calls[1].cartId, undefined);
  const stored = f.state().survivors[0].inventory.find(row => row.id === gallon.id);
  assert.equal(stored.storedResource, 'fuel');assert.equal(stored.storedAmount, 1);assert.equal(f.state().shelter.fuel, reserves);
});

test('quantidade inválida e acesso bloqueado desativam coleta; reabertura orienta recuperar ação pendente', () => {
  const f = fixture();
  for (const quantity of ['0', '1.5', '3', 'abc']) {
    elements(f.render()).find(({ node }) => node.type === 'field' && node.props.label === 'Quantidade a recolher').node.props.onChange(quantity);
    assert.equal(f.button('Recolher').disabled, true);
  }
  elements(f.render()).find(({ node }) => node.type === 'field' && node.props.label === 'Quantidade a recolher').node.props.onChange('1');
  f.state().hexes['0,0'].points[0].preparation.areas[0].access = 'blocked';assert.equal(f.button('Recolher').disabled, true);
  f.controls.pending = true;assert.match(textOf(f.render()), /Feche esta janela e use Reenviar ação pendente/);
});

test('resultado permanece no cômodo escolhido e início salvo pode ser reenviado após desaparecer da tela', async () => {
  const f = fixture(), area = f.state().hexes['0,0'].points[0].preparation.areas.find(row => row.searchable !== false && row.id !== f.areaId);
  assert.ok(area);
  const entry = elements(f.render()).find(({ node }) => node.type === 'button' && node.props['aria-pressed'] === false && textOf(node).startsWith(area.name));
  entry.node.props.onClick();await f.flush();
  await f.click('Propor busca geral (1d12)');
  f.controls.disconnect = true;await f.click('Iniciar busca');
  assert.match(textOf(f.render()), /Última busca nesta área/);
  assert.equal(f.button('Iniciar busca'), undefined);
  const minutes = f.state().minutes, attempts = structuredClone(f.state().hexes['0,0'].points[0].preparation.attempts);
  await f.click('Tentar novamente a mesma ação');
  assert.deepEqual(f.calls[2], f.calls[1]);assert.equal(f.state().minutes, minutes);
  assert.deepEqual(f.state().hexes['0,0'].points[0].preparation.attempts, attempts);
});
