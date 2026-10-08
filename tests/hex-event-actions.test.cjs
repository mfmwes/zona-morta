/* eslint-disable @typescript-eslint/no-require-imports -- uses the existing Node test loader. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, path);
const { defaultState, initialSurvivor, content } = require('../lib/game.ts');
const { prepareEventAction, applyEventAction, eventActionError, eventActionUsed, eventActionLinkLabels } = require('../lib/hex-event-actions.ts');
const { createConflictScene, addThreatInstances } = require('../lib/conflict.ts');
const { projectPlayerGame, playerEditPayload } = require('../lib/collaboration.ts');
const { validWorld } = require('../lib/world.ts');
const { validHexEventOrigin, validEventActionLinks } = require('../lib/hex-event-links.ts');
// Exercita os validadores reais da rota sem inicializar banco ou autenticação.
const routeAst = ts.createSourceFile('route.ts', fs.readFileSync(require('node:path').join(__dirname, '../app/api/campaign/route.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
const routeValidators = routeAst.statements.filter(node => ts.isFunctionDeclaration(node)
  && ['validThreat', 'validConflict'].includes(node.name?.text)).map(node => node.getText(routeAst)).join('\n');
const { validConflict } = require('node:vm').runInNewContext(ts.transpileModule(routeValidators, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText + '\n({ validConflict })', { validHexEventOrigin });

function campaign(status = 'pending') {
  const game = defaultState();
  const archetype = content.archetypes[0];
  game.survivors = [initialSurvivor({ name: 'Nina', origin: content.origins[0].name, past: '', archetype: archetype.name,
    specialty: archetype.specialties[0].name, freeExperience: 'Resgates', techniques: [],
    attributes: { Agilidade: 2, Força: 1, Finesse: 1, Instinto: 0, Presença: 0, Conhecimento: -1 },
    primary: 'Faca resistente', secondary: '', protection: 'Roupa reforçada', personal: 'Mochila urbana' })];
  game.survivors[0].hex = '0,0';
  game.hexes['0,0'].discovery = 'explorado';
  game.hexes['1,0'].discovery = 'desconhecido';
  game.hexes['0,0'].events.push({ id: 'event', text: 'Pessoa à janela.', trigger: 'Ao entrar', revealed: true,
    guidance: 'SEGREDO: vigia armado.', ...(status === 'legacy' ? {} : { status, triggerType: 'enter' }) });
  return game;
}
function event(game) { return game.hexes['0,0'].events[0]; }
function action(game, type, changes = {}) {
  return { ...prepareEventAction(game, '0,0', event(game), type),
    ...(type === 'point' ? { name: 'Oficina', lootTable: content.lootTables[0].name } : {}),
    ...(type === 'npc' ? { name: 'Nara', skills: [' medicina ', 'Medicina', 'Vigilância'] } : {}),
    ...(type === 'clue' ? { name: 'Rastro', targetHex: '1,0' } : {}),
    ...(type === 'threat' ? { templateId: game.threats[0].id, quantity: 2 } : {}), ...changes };
}
function unchangedConsequences(game) {
  return { day: game.day, minutes: game.minutes, scene: game.scene, fear: game.fear, noise: game.noise,
    partyHex: game.partyHex, survivors: game.survivors, shelter: game.shelter,
    hexes: Object.fromEntries(Object.entries(game.hexes).map(([key, hex]) => [key, {
      discovery: hex.discovery, sector: hex.sector, infestation: hex.infestation,
    }])), status: event(game).status };
}
function assertRejectedUnchanged(game, input, pattern) {
  const before = structuredClone(game);
  const result = applyEventAction(game, '0,0', 'event', input);
  assert.equal(result.ok, false);
  assert.match(result.message, pattern);
  assert.deepEqual(game, before);
}

test('preparação e cancelamento não alteram mundo, gatilhos nem consequências', () => {
  const game = campaign();
  event(game).text = 'Distribuidora de água. Galões vazios predominam; pergunte pela origem dos cheios.';
  const before = structuredClone(game);
  for (const type of ['point', 'npc', 'threat', 'clue']) {
    const draft = prepareEventAction(game, '0,0', event(game), type);
    assert.equal(draft.type, type);
    assert.match(draft.notes, /SEGREDO/);
    const publicText = draft.signal ?? draft.description ?? draft.text ?? '';
    assert.doesNotMatch(publicText, /SEGREDO|pergunte/);
    assert.deepEqual(game, before);
  }
});

test('quatro ações funcionam em eventos pendentes, ativos e antigos sem efeitos automáticos', () => {
  for (const status of ['pending', 'active', 'legacy']) {
    const game = campaign(status);
    const before = structuredClone(unchangedConsequences(game));
    for (const type of ['point', 'npc', 'clue', 'threat']) {
      const result = applyEventAction(game, '0,0', 'event', action(game, type));
      assert.equal(result.ok, true, type);
      assert.equal(eventActionUsed(game, '0,0', event(game), type), true);
      assert.deepEqual(unchangedConsequences(game), before);
    }
    assert.equal(game.hexes['0,0'].points.length, 2);
    const point = game.hexes['0,0'].points[0];
    assert.equal(point.revealed, false);
    assert.equal(point.lootTable, content.lootTables[0].name);
    assert.deepEqual(point.searches, []);
    assert.equal(game.npcs[0].hex, '0,0');
    assert.equal(game.npcs[0].visibleToPlayers, false);
    assert.equal(game.npcs[0].home, undefined);
    assert.equal(game.npcs[0].accompaniesParty, false);
    assert.deepEqual(game.npcs[0].skills, ['Medicina', 'Vigilância']);
    assert.equal(game.hexes['0,0'].points[1].clueTargetHex, '1,0');
    assert.equal(game.conflict.active, true);
    assert.deepEqual(game.conflict.survivorIds, [game.survivors[0].id]);
    assert.equal(game.conflict.threats.length, 2);
    assert.equal(game.conflict.spotlight, null);
    assert.deepEqual(game.conflict.damageRequests, []);
    assert.ok(game.conflict.threats.every(row => row.hpMarked === 0 && row.stressMarked === 0 && !row.defeated));
    assert.equal(validWorld(game.hexes), true);
    assert.equal(eventActionLinkLabels(game, '0,0', event(game)).length, 4);
  }
});

test('repetição, recarregamento, renomeação e exclusão não duplicam os resultados', () => {
  for (const type of ['point', 'npc', 'clue', 'threat']) {
    const game = campaign();
    assert.equal(applyEventAction(game, '0,0', 'event', action(game, type)).ok, true);
    const reloaded = JSON.parse(JSON.stringify(game));
    assertRejectedUnchanged(reloaded, action(reloaded, type, { name: 'Outro nome' }), /já foi registrada/);
    reloaded.hexes['0,0'].points = [];
    reloaded.npcs = [];
    delete reloaded.conflict;
    assertRejectedUnchanged(reloaded, action(reloaded, type), /já foi registrada/);
    assert.match(eventActionLinkLabels(reloaded, '0,0', event(reloaded))[0], /removido|anterior/);
    // Mesmo sem o vínculo no evento, a origem do resultado impede duplicação.
    delete event(game).actionLinks;
    assertRejectedUnchanged(game, action(game, type), /já foi registrada/);
  }
});

test('nomes equivalentes são vinculados ao cadastro existente sem reescrever dados ou visibilidade', () => {
  for (const type of ['point', 'npc', 'clue']) {
    const game = campaign();
    const input = action(game, type, { name: 'Médica  da Rua', revealed: true, visibleToPlayers: true });
    const first = applyEventAction(game, '0,0', 'event', input);
    const original = structuredClone(type === 'npc' ? game.npcs[0] : game.hexes['0,0'].points[0]);
    event(game).id = 'second';
    delete event(game).actionLinks;
    const duplicate = { ...input, name: ' medica da rua ', revealed: false, visibleToPlayers: false };
    const before = structuredClone(game);
    assert.match(eventActionError(game, '0,0', 'second', duplicate), /Já existe/);
    assert.deepEqual(game, before);
    const linked = applyEventAction(game, '0,0', 'second', { ...duplicate, existingId: first.ids[0] });
    assert.equal(linked.ok, true);
    assert.deepEqual(type === 'npc' ? game.npcs[0] : game.hexes['0,0'].points[0], original);
    assert.equal(type === 'npc' ? game.npcs.length : game.hexes['0,0'].points.length, 1);
  }
});

test('ameaças reutilizam o gerenciador, o snapshot e nomes únicos sem substituir o conflito ativo', () => {
  const game = campaign();
  game.conflict = createConflictScene({ name: 'Portão', sceneNumber: 5, day: 2, time: '08:00', survivorIds: [] });
  addThreatInstances(game.conflict, game.threats[0], 1);
  const oldId = game.conflict.id;
  const original = structuredClone(game.conflict.threats[0]);
  const draft = action(game, 'threat');
  assert.equal(draft.conflictId, oldId);
  assert.equal(applyEventAction(game, '0,0', 'event', draft).ok, true);
  assert.equal(game.conflict.id, oldId);
  assert.deepEqual(game.conflict.threats[0], original);
  assert.equal(new Set(game.conflict.threats.map(row => row.name)).size, 3);
  const snapshot = structuredClone(game.conflict.threats[1].templateSnapshot);
  game.threats[0].attack.name = 'Alterado no catálogo';
  assert.deepEqual(game.conflict.threats[1].templateSnapshot, snapshot);
});

test('estado ou conflito alterado, destino inválido e dados incompletos são recusados atomicamente', () => {
  for (const status of ['archived']) {
    const game = campaign(status);
    for (const type of ['point', 'npc', 'clue', 'threat']) assertRejectedUnchanged(game, action(game, type), /Reabra/);
  }
  const game = campaign();
  assertRejectedUnchanged(game, action(game, 'npc', { name: ' ' }), /nome/);
  assertRejectedUnchanged(game, action(game, 'clue', { targetHex: '999,999' }), /hex existente/);
  assertRejectedUnchanged(game, action(game, 'clue', { text: ' ' }), /texto/);
  assertRejectedUnchanged(game, action(game, 'threat', { templateId: 'missing' }), /ficha/);
  assertRejectedUnchanged(game, action(game, 'threat', { quantity: 0 }), /1 e 20/);
  assertRejectedUnchanged(game, action(game, 'point', { existingId: 'deleted' }), /disponível/);
  const newConflict = action(game, 'threat');
  game.conflict = createConflictScene({ name: 'Outro', sceneNumber: 1, day: 1, time: '12:00' });
  assertRejectedUnchanged(game, newConflict, /iniciado/);
  const existingConflict = action(game, 'threat');
  game.conflict.active = false;
  assertRejectedUnchanged(game, existingConflict, /mudou ou foi encerrado/);
  game.hexes['0,0'].events = [];
  assertRejectedUnchanged(game, newConflict, /não existe/);
});

test('ameaças autorais com nomes longos mantêm rótulos únicos dentro do limite de salvamento', () => {
  const game = campaign();
  game.threats[0] = { ...game.threats[0], source: 'custom', name: 'A'.repeat(100) };
  assert.equal(applyEventAction(game, '0,0', 'event', action(game, 'threat')).ok, true);
  assert.ok(game.conflict.threats.every(row => row.name.length <= 100));
  addThreatInstances(game.conflict, game.threats[0], 2);
  assert.equal(new Set(game.conflict.threats.map(row => row.name)).size, 4);
});

test('limites de cadastro não produzem mutações parciais ou estados impossíveis de salvar', () => {
  const game = campaign();
  const pointAction = action(game, 'point', { notes: 'x'.repeat(4000), signal: 'x'.repeat(3000) });
  assert.equal(applyEventAction(game, '0,0', 'event', pointAction).ok, true);
  assert.equal(validWorld(game.hexes), true);
  event(game).id = 'event'; delete event(game).actionLinks;
  game.hexes['0,0'].points = Array.from({ length: 120 }, (_, i) => ({ ...game.hexes['0,0'].points[0], id: String(i), eventOrigin: undefined }));
  assertRejectedUnchanged(game, action(game, 'point', { name: 'Novo' }), /120 pontos/);
  game.npcs = Array.from({ length: 300 }, (_, i) => ({ id: String(i), name: String(i), hex: '1,0' }));
  assertRejectedUnchanged(game, action(game, 'npc'), /300 PNJs/);
  game.conflict = createConflictScene({ name: 'Cheio', sceneNumber: 1, day: 1, time: '12:00' });
  for (let i = 0; i < 4; i++) addThreatInstances(game.conflict, game.threats[0], 20);
  assertRejectedUnchanged(game, action(game, 'threat'), /80 ameaças/);
});

test('jogadores recebem somente resultados revelados, sem vínculos, segredos, destinos ou mecânicas privadas', () => {
  const game = campaign('active');
  event(game).generatorCategory = 'CATEGORIA_RESERVADA';
  for (const type of ['point', 'npc', 'clue', 'threat']) assert.equal(applyEventAction(game, '0,0', 'event', action(game, type)).ok, true);
  const before = structuredClone(game);
  let visible = projectPlayerGame(game, game.survivors[0].id);
  assert.deepEqual(game, before);
  assert.equal(visible.npcs.length, 0);
  assert.equal(visible.hexes['0,0'].points.length, 0);
  for (const point of game.hexes['0,0'].points) point.revealed = true;
  game.npcs[0].visibleToPlayers = true;
  visible = projectPlayerGame(game, game.survivors[0].id);
  assert.equal(visible.npcs[0].name, 'Nara');
  assert.equal(visible.hexes['0,0'].points.length, 2);
  assert.equal(visible.publicConflict.threats.length, 2);
  assert.equal(visible.conflict, undefined);
  const json = JSON.stringify(visible);
  assert.doesNotMatch(json, /SEGREDO|CATEGORIA_RESERVADA|eventOrigin|actionLinks|clueTargetHex|templateSnapshot|triggerType/);
  assert.equal(visible.hexes['0,0'].events[0].trigger, '');
  assert.equal(visible.hexes['1,0'].sector, null);
  const pending = structuredClone(game);
  event(pending).status = 'pending';
  assert.equal(projectPlayerGame(pending, game.survivors[0].id).hexes['0,0'].events.length, 0);
});

test('ações e vínculos novos não podem ser enviados como edição de jogador', () => {
  for (const type of ['point', 'npc', 'clue', 'threat']) {
    const game = campaign('active');
    const before = projectPlayerGame(game, game.survivors[0].id);
    const after = structuredClone(before);
    const input = action(game, type);
    // Mesmo forjando a biblioteca ausente da projeção, a edição compartilhada é bloqueada.
    if (type === 'threat') after.threats = game.threats;
    assert.equal(applyEventAction(after, '0,0', 'event', input).ok, true);
    assert.equal(playerEditPayload(before, after), null);
  }
});

test('validação aceita campanhas antigas e vínculos persistidos, mas recusa metadados malformados', () => {
  const game = campaign('legacy');
  assert.equal(validWorld(game.hexes), true);
  for (const value of [null, [], 'bad', { pointId: 12 }, { threat: { conflictId: 'c', threatIds: ['a', 'a'] } }, { secret: 'vaza' }]) {
    assert.equal(validEventActionLinks(value), false);
    event(game).actionLinks = value;
    assert.equal(validWorld(game.hexes), false);
  }
  delete event(game).actionLinks;
  assert.equal(validHexEventOrigin(undefined), true);
  assert.equal(validHexEventOrigin({ hexId: '0,0', eventId: 'event', action: 'npc' }), true);
  assert.equal(validHexEventOrigin({ hexId: 'bad', eventId: 'event', action: 'npc' }), false);
  assert.equal(validHexEventOrigin({ hexId: '0,0', eventId: '', action: 'auto' }), false);
  for (const type of ['point', 'npc', 'clue', 'threat']) assert.equal(applyEventAction(game, '0,0', 'event', action(game, type)).ok, true);
  const saved = JSON.parse(JSON.stringify(game));
  assert.equal(validWorld(saved.hexes), true);
  assert.equal(validEventActionLinks(event(saved).actionLinks), true);
  assert.ok(saved.npcs.every(row => validHexEventOrigin(row.eventOrigin)));
  assert.ok(saved.conflict.threats.every(row => validHexEventOrigin(row.eventOrigin)));
  assert.equal(validConflict(saved.conflict), true);
  saved.conflict.threats[0].eventOrigin = { hexId: 'bad', eventId: 'event', action: 'auto' };
  assert.equal(validConflict(saved.conflict), false);
  delete saved.conflict.threats[0].eventOrigin;
  assert.equal(validConflict(saved.conflict), true);
});

test('pistas locais ou no próprio hex não viram locais de busca nem expõem destino reservado',()=>{
 const {isCluePoint}=require('../lib/hex-event-links.ts');
 const {projectPlayerActions}=require('../lib/player-actions.ts');
 for(const targetHex of ['', '0,0']){
  const game=campaign();const draft=action(game,'clue',{targetHex,revealed:true});
  assert.equal(applyEventAction(game,'0,0','event',draft).ok,true);
  const point=game.hexes['0,0'].points.at(-1);assert.equal(isCluePoint(point),true);assert.equal(point.clue,true);
  assert.equal(validWorld(game.hexes),true);
  const view=projectPlayerGame(game,game.survivors[0].id),visible=view.hexes['0,0'].points.find(p=>p.id===point.id);
  assert.equal(visible.clue,true);assert.equal(visible.clueTargetHex,undefined);assert.equal(visible.eventOrigin,undefined);
  const actions=projectPlayerActions(game,game.survivors[0].id);assert.equal(actions.locations.some(s=>s.pointId===point.id),false);
 }
});
test('evento encerrado pode concluir vínculos pendentes sem reabrir ou repetir custos',()=>{
 const game=campaign('resolved'),before={minutes:game.minutes,noise:game.noise,fear:game.fear};
 assert.equal(applyEventAction(game,'0,0','event',action(game,'npc')).ok,true);
 assert.equal(game.hexes['0,0'].events[0].status,'resolved');
 assert.deepEqual({minutes:game.minutes,noise:game.noise,fear:game.fear},before);
});
