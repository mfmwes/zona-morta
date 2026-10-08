/* eslint-disable @typescript-eslint/no-require-imports -- Node's test runner loads TS through the CommonJS transpilation hook below. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, path);
const { defaultState, initialSurvivor, resetCityPreservingSurvivors, survivorIsDown, survivorStats, content } = require('../lib/game.ts');
const inventory = require('../lib/inventory.ts');
const itemActions = require('../lib/item-actions.ts');
const hexActions = require('../lib/hex-actions.ts');
const equipment = require('../lib/equipment.ts');
const survival = require('../lib/survival.ts');
const provisions = require('../lib/provisions.ts');
const abilities = require('../lib/abilities.ts');
const collaboration = require('../lib/collaboration.ts');
const { createSurvivorFromDraft } = require('../lib/character-creation.ts');
const { explicitItemArtFor, itemArtFor, itemArtUrl } = require('../lib/item-art.ts');
const exploration = require('../lib/exploration.ts');
const { revealSector, preserveKnownSectors, assignCustomSector, redrawSector, sectorProfiles } = require('../lib/sectors.ts');
const { parseWeaponDamage, resolveActionRoll, resolveRollResources, resolveWeaponDamage } = require('../lib/rolls.ts');
const shelterProjects = require('../lib/shelter-projects.ts');
const campaignTime = require('../lib/time.ts');
const activity = require('../lib/activity.ts');
const npcGenerator = require('../lib/npc-generator.ts');
const combatResources = require('../lib/combat-resources.ts');
const { rollInfo } = require('../lib/roll-log.ts');
const { traitLabel, traitStorageKey, localizeRollLog } = require('../lib/terminology.ts');
const conflictScene = require('../lib/conflict.ts');
const threats = require('../lib/threats.ts');

test('custos em português e descrições antigas debitam os mesmos recursos', () => {
  for (const description of ['gaste 1 Hope', 'gaste 1 hope', 'gaste 1 Esperança']) {
    const game = campaign();
    game.survivors[0].hope = 2;
    assert.equal(abilities.recordAbilityUse(game, game.survivors[0].id, 'custo', 'Apoio', description, 'hope1'), true);
    assert.equal(game.survivors[0].hope, 1);
    assert.match(game.log[0].text, /1 Esperança/);
  }
  for (const description of ['marque 1 Stress', 'marque 1 Estresse']) {
    const game = campaign();
    assert.equal(abilities.recordAbilityUse(game, game.survivors[0].id, 'custo', 'Apoio', description, 'stress1'), true);
    assert.equal(game.survivors[0].stress, 1);
  }
  assert.deepEqual(abilities.abilityCosts('gaste 3 Esperança'), ['hope3']);
  assert.deepEqual(abilities.abilityCosts('gaste 1 Esperança ou use sem pagar Esperança'), ['hope1', 'free']);
  const game = campaign();
  assert.equal(abilities.recordAbilityUse(game, game.survivors[0].id, 'custo', 'Apoio', 'gaste 3 Esperança', 'hope3'), false);
  assert.equal(game.survivors[0].hope, 0);
});

test('Acuidade exibe o novo termo e usa o atributo das fichas existentes no ataque', () => {
  const person = survivor();
  const weapon = equipment.getPrimary(person.primary);
  assert.equal(traitLabel(weapon.trait), 'Acuidade');
  assert.equal(traitStorageKey('Acuidade'), 'Finesse');
  const result = resolveActionRoll({ hopeDie: 9, fearDie: 3, trait: person.attributes[weapon.trait], experience: 0, other: 0, symptom: 0, edge: 'none', difficulty: 13 });
  assert.equal(result.total, 13);
  assert.equal(result.success, true);
  assert.equal(person.attributes.Finesse, 1);
});

test('carga guardada e efeitos traduzidos mantêm os valores dos equipamentos', () => {
  for (const [name, load] of [['Canivete robusto', 0], ['Faca resistente', 1], ['Espingarda', 2]]) {
    assert.equal(equipment.getPrimary(name).stored, load);
    assert.equal(item(name).load, load);
  }
  assert.equal(equipment.getSecondary('Faca pequena').stored, 0);
  assert.equal(equipment.getSecondary('Escudo improvisado').stored, 2);
  for (const [name, evasion, finesse, agility] of [
    ['Roupa reforçada', 1, 0, 0], ['Colete de proteção', -1, 0, 0],
    ['Jaqueta de motociclista', 0, -1, 0], ['Traje de bombeiro', 0, 0, -1],
    ['Colete tático reforçado', 0, 0, -1],
  ]) {
    const modifiers = equipment.equipmentModifiers({ primary: '', secondary: '', protection: name });
    assert.equal(modifiers.evasion, evasion, name);
    assert.equal(modifiers.traits.Finesse, finesse, name);
    assert.equal(modifiers.traits.Agilidade, agility, name);
  }
});

test('rolagens históricas e novas mantêm dados, modificadores, resultados e nomes', () => {
  const legacy = 'Hope: ação (Finesse): Hope 4 + Fear 9 − 2 + d6(3) = 14; Dificuldade 15. Falha com Fear · Experiences: com Hope (−1 Hope).';
  const translated = 'Hope: ação (Acuidade): Esperança 4 + Medo 9 − 2 + d6(3) = 14; Dificuldade 15. Falha com Medo · Experiências: com Hope (−1 Esperança).';
  assert.equal(localizeRollLog(legacy), translated);
  assert.deepEqual(rollInfo(legacy), rollInfo(translated));
  assert.deepEqual(rollInfo(legacy), { total: '14', hope: '4', fear: '9', modifier: '−2', edge: ' + d6', outcome: 'FALHA COM MEDO', title: 'Teste · Acuidade', target: '', targetResult: '' });
  assert.equal(localizeRollLog(translated), translated);
  assert.equal(rollInfo('Ana: ação (Força): Hope 12 + Fear 12 + 1 = 25; Dificuldade 20. Sucesso crítico.').outcome, 'CRÍTICO');
  const targeted = rollInfo('Ana: ataque com Cano / bastão (Força): Esperança 8 + Medo 5 + 1 = 14; Alvo: ERRANTE A. Resultado contra o alvo: ACERTO. Sucesso com Esperança.');
  assert.equal(targeted.target, 'ERRANTE A');
  assert.equal(targeted.targetResult, 'ACERTO');
});

test('painel de construção não sombreia o Map nativo com ícone', () => {
  const source = fs.readFileSync(require.resolve('../components/shelter-project-manager.tsx'), 'utf8');
  assert.equal(/\bMap,\s*\n/.test(source), false);
  assert.match(source, /new globalThis\.Map\(/);
});

function survivor(name = 'Ana') {
  return initialSurvivor({ name, origin: content.origins[0].name, past: '', archetype: content.archetypes[0].name,
    specialty: content.archetypes[0].specialties[0].name, freeExperience: 'Resgates', techniques: [],
    attributes: { Agilidade: 2, Força: 1, Finesse: 1, Instinto: 0, Presença: 0, Conhecimento: -1 },
    primary: 'Faca resistente', secondary: '', protection: 'Roupa reforçada', personal: 'Mochila urbana' });
}
function campaign() { const game = defaultState(); game.survivors = [survivor(), survivor('Bia')]; return game; }
function item(name, qty = 1, category) {
  const entry = content.catalog.find(e => e.name === name && (!category || e.category === category));
  assert.ok(entry, name);
  return inventory.itemFromCatalog(entry, qty, 'Íntegro', 1);
}
function physicalCount(s) { return s.inventory.reduce((sum, x) => sum + x.qty, 0) + ['primary','secondary','protection','outfit','bag','personal','pocket1','pocket2'].filter(key => s[key] && !(key === 'personal' && s.personal === s.bag)).length; }


test('sobreviventes usam recursos marcados a partir de zero e caem no máximo de PV', () => {
  const person = survivor();
  const stats = survivorStats(person);
  assert.equal(person.hp, 0);
  assert.equal(person.armorMarked, 0);
  assert.equal(person.stress, 0);
  assert.equal(person.hope, 0);
  assert.equal(survivorIsDown(person), false);

  person.hp = stats.hp - 1;
  assert.equal(survivorIsDown(person), false);
  person.hp = stats.hp;
  assert.equal(survivorIsDown(person), true);
  person.hp = Math.max(0, stats.hp - 1);
  assert.equal(survivorIsDown(person), false);
});

test('interface exibe PV e Armadura como trilhas marcadas, sem inverter para valores restantes', () => {
  const source = fs.readFileSync(require.resolve('../components/survivor-panel.tsx'), 'utf8');
  assert.match(source, /label="PV marcados"/);
  assert.match(source, /current=\{selected\.hp\}/);
  assert.match(source, /label="Armadura marcada"/);
  assert.match(source, /current=\{selected\.armorMarked \?\? 0\}/);
  assert.doesNotMatch(source, /current=\{stats\.hp-selected\.hp\}/);
  assert.match(source, /CAÍDO/);
});

test('Cena de Conflito acompanha instâncias e spotlight sem criar ordem de turnos', () => {
  const g = campaign();
  const scene = conflictScene.createConflictScene({
    name: 'Posto abandonado', sceneNumber: 3, day: g.day, time: '08:00',
    survivorIds: g.survivors.map(person => person.id),
  });
  g.conflict = scene;
  const template = threats.threatLibrary(g.threats).find(row => row.name === 'ERRANTE');
  assert.ok(template);

  const added = conflictScene.addThreatInstances(scene, template, 3);
  assert.deepEqual(added.map(row => row.name), ['ERRANTE A', 'ERRANTE B', 'ERRANTE C']);
  assert.equal(scene.threats.length, 3);

  template.difficulty = 99;
  assert.equal(scene.threats[0].templateSnapshot.difficulty, 11);

  assert.equal(conflictScene.setConflictSpotlight(scene, { kind:'survivor', id:g.survivors[0].id }, g.survivors[0].name, 1, '08:01'), true);
  assert.equal(conflictScene.setConflictSpotlight(scene, { kind:'survivor', id:g.survivors[0].id }, g.survivors[0].name, 1, '08:02'), false);
  assert.equal(conflictScene.setConflictSpotlight(scene, { kind:'threat', id:added[0].id }, added[0].name, 1, '08:03'), true);
  assert.equal(scene.spotlightHistory.length, 2);
  assert.deepEqual(scene.spotlight, { kind:'threat', id:added[0].id });

  conflictScene.removeConflictParticipant(scene, { kind:'threat', id:added[0].id });
  assert.equal(scene.spotlight, null);
  assert.equal(scene.threats.length, 2);

  conflictScene.endConflictScene(scene, 1, '08:10');
  assert.equal(scene.active, false);
  assert.equal(scene.endedTime, '08:10');
  assert.equal(scene.spotlight, null);
});

test('alvos de conflito resolvem acerto e faixas de dano sem aplicar PV', () => {
  const g = campaign();
  const scene = conflictScene.createConflictScene({ name:'Teste', sceneNumber:1, day:g.day, time:'08:00' });
  const template = threats.threatLibrary(g.threats).find(row => row.name === 'ERRANTE');
  const instance = conflictScene.addThreatInstances(scene, template, 1)[0];

  assert.deepEqual(conflictScene.resolveThreatDamageTier(template, 1), { key:'minor', label:'Menor', hpMarks:1 });
  assert.deepEqual(conflictScene.resolveThreatDamageTier(template, template.majorThreshold), { key:'major', label:'Maior', hpMarks:2 });
  assert.deepEqual(conflictScene.resolveThreatDamageTier(template, template.severeThreshold), { key:'severe', label:'Severo', hpMarks:3 });

  const miss = conflictScene.resolveThreatAttack(instance, template.difficulty - 1, false, template.majorThreshold);
  assert.equal(miss.hit, false);
  assert.equal(miss.damageTier.hpMarks, 2);
  assert.equal(instance.hpMarked, 0);

  const hit = conflictScene.resolveThreatAttack(instance, template.difficulty, false, template.severeThreshold);
  assert.equal(hit.hit, true);
  assert.equal(hit.damageTier.label, 'Severo');
  assert.equal(instance.hpMarked, 0);

  const critical = conflictScene.resolveThreatAttack(instance, 1, true, 1);
  assert.equal(critical.hit, true);
});

test('dano confirmado no chat é aplicado uma única vez à ameaça', () => {
  const g = campaign();
  const scene = conflictScene.createConflictScene({ name:'Teste', sceneNumber:1, day:g.day, time:'08:00' });
  const template = threats.threatLibrary(g.threats).find(row => row.name === 'ERRANTE');
  const instance = conflictScene.addThreatInstances(scene, template, 1)[0];

  const applied = conflictScene.applyThreatDamage(scene, instance.id, 2, 'roll-1');
  assert.equal(applied.ok, true);
  assert.equal(instance.hpMarked, 2);
  assert.equal(instance.defeated, false);
  const duplicate = conflictScene.applyThreatDamage(scene, instance.id, 2, 'roll-1');
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, 'already-applied');
  assert.equal(instance.hpMarked, 2);

  const finishing = conflictScene.applyThreatDamage(scene, instance.id, 3, 'roll-2');
  assert.equal(finishing.ok, true);
  assert.equal(instance.hpMarked, template.maxHp);
  assert.equal(instance.defeated, true);
});

test('condições de ameaça são públicas, únicas e removíveis', () => {
  const g = campaign();
  const scene = conflictScene.createConflictScene({ name:'Teste', sceneNumber:1, day:g.day, time:'08:00' });
  const template = threats.threatLibrary(g.threats).find(row => row.name === 'ERRANTE');
  const instance = conflictScene.addThreatInstances(scene, template, 1)[0];
  assert.equal(conflictScene.addThreatCondition(instance, 'Vulnerável'), true);
  assert.equal(conflictScene.addThreatCondition(instance, ' vulnerável '), false);
  assert.deepEqual(instance.conditions, ['Vulnerável']);
  assert.equal(conflictScene.removeThreatCondition(instance, 'Vulnerável'), true);
  assert.deepEqual(instance.conditions, []);
});

test('ataque de ameaça interpreta dano e classifica pelos limiares do sobrevivente', () => {
  assert.deepEqual(conflictScene.parseThreatDamageFormula('1d8+2'), { dice:1, die:8, flat:2 });
  assert.deepEqual(conflictScene.parseThreatDamageFormula('2d6-1'), { dice:2, die:6, flat:-1 });
  assert.deepEqual(conflictScene.parseThreatDamageFormula('3'), { dice:0, die:0, flat:3 });
  assert.deepEqual(conflictScene.parseThreatDamageFormula('sem dano'), { dice:0, die:0, flat:0 });
  assert.equal(conflictScene.parseThreatDamageFormula('x+y'), null);
  assert.deepEqual(conflictScene.resolveSurvivorDamageTier(8, 14, 7), { key:'minor', label:'Menor', hpMarks:1 });
  assert.deepEqual(conflictScene.resolveSurvivorDamageTier(8, 14, 8), { key:'major', label:'Maior', hpMarks:2 });
  assert.deepEqual(conflictScene.resolveSurvivorDamageTier(8, 14, 14), { key:'severe', label:'Severo', hpMarks:3 });
});

test('pedidos de spotlight são sinais sem fila e só o próprio jogador vê seu estado', () => {
  const g = campaign();
  const [ana, bia] = g.survivors;
  g.conflict = conflictScene.createConflictScene({ name:'Teste', sceneNumber:1, day:g.day, time:'08:00', survivorIds:[ana.id, bia.id] });

  assert.equal(conflictScene.requestConflictSpotlight(g.conflict, ana.id), true);
  assert.equal(conflictScene.requestConflictSpotlight(g.conflict, ana.id), false);
  assert.deepEqual(g.conflict.spotlightRequests, [ana.id]);
  assert.equal(collaboration.projectPlayerGame(g, ana.id).publicConflict.spotlightRequested, true);
  assert.equal(collaboration.projectPlayerGame(g, bia.id).publicConflict.spotlightRequested, false);

  assert.equal(conflictScene.requestConflictSpotlight(g.conflict, bia.id), true);
  assert.deepEqual(new Set(g.conflict.spotlightRequests), new Set([ana.id, bia.id]));
  assert.equal(conflictScene.grantConflictSpotlight(g.conflict, bia.id, bia.name, g.day, '08:02'), true);
  assert.deepEqual(g.conflict.spotlight, { kind:'survivor', id:bia.id });
  assert.deepEqual(g.conflict.spotlightRequests, [ana.id]);
  assert.equal(conflictScene.cancelConflictSpotlightRequest(g.conflict, ana.id), true);
  assert.deepEqual(g.conflict.spotlightRequests, []);
});

test('ameaças públicas preservam grupo para seleção compacta sem expor ficha mecânica', () => {
  const g = campaign();
  const [ana] = g.survivors;
  g.conflict = conflictScene.createConflictScene({ name:'Teste', sceneNumber:1, day:g.day, time:'08:00', survivorIds:[ana.id] });
  const template = threats.threatLibrary(g.threats).find(row => row.name === 'ERRANTE');
  conflictScene.addThreatInstances(g.conflict, template, 3);
  const view = collaboration.projectPlayerGame(g, ana.id);
  assert.deepEqual(view.publicConflict.threats.map(row => row.groupName), ['ERRANTE', 'ERRANTE', 'ERRANTE']);
  const json = JSON.stringify(view.publicConflict.threats);
  assert.equal(json.includes('difficulty'), false);
  assert.equal(json.includes('templateSnapshot'), false);
});

test('Regras e itens mantém apenas Itens e Procedimentos; Ameaças ficam no menu do mestre', () => {
  const page = fs.readFileSync(require.resolve('../app/page.tsx'), 'utf8');
  const reference = fs.readFileSync(require.resolve('../components/campaign-views.tsx'), 'utf8');
  const threatsUi = fs.readFileSync(require.resolve('../components/threat-manager.tsx'), 'utf8');

  assert.match(page, /activeTab === "ameacas" && role === "mestre" && !playerPreview/);
  assert.match(page, /activeTab === "referencias" && <ReferencePanel \/>/);
  assert.match(reference, /TabsTrigger value="itens"/);
  assert.match(reference, /TabsTrigger value="procedimentos"/);
  assert.doesNotMatch(reference, /TabsTrigger value="ameacas"/);
  assert.doesNotMatch(reference, /ThreatReference/);
  assert.doesNotMatch(threatsUi, /export function ThreatReference/);
});

test('gerenciador de ameaças aceita imagem e preserva-a em duplicações e instâncias', () => {
  const manager = fs.readFileSync(require.resolve('../components/threat-manager.tsx'), 'utf8');
  const template = threats.createThreatTemplate();
  template.image = 'https://example.com/ameaça.png';
  const sanitized = threats.sanitizeThreatTemplate(template);
  assert.equal(sanitized.image, 'https://example.com/ameaça.png');
  const copy = threats.duplicateThreatTemplate(sanitized);
  assert.equal(copy.image, sanitized.image);
  const instance = threats.instantiateThreat(sanitized);
  assert.equal(instance.templateSnapshot.image, sanitized.image);
  assert.match(manager, /<ImagePicker label="Imagem da ameaça"/);
  assert.match(manager, /threat-card-icon.*has-image/);
  assert.match(manager, /threat-sheet-art/);
});

test('Cena de Conflito reage à largura útil e evita sobreposição dos controles', () => {
  const visual = fs.readFileSync(require.resolve('../app/visual-system.css'), 'utf8');
  assert.match(visual, /\.conflict-manager\s*\{[\s\S]*container-type:inline-size/);
  assert.match(visual, /\.conflict-team-panel \.conflict-add-row\s*\{[\s\S]*grid-template-columns:1fr/);
  assert.match(visual, /@container \(max-width: 980px\)/);
  assert.match(visual, /grid-template-columns:minmax\(290px,330px\) minmax\(0,1fr\)/);
  assert.match(visual, /repeat\(auto-fit,minmax\(300px,1fr\)\)/);
});

test('Cena de Conflito usa dashboard compacto, grupos e vocabulário visual consistente', () => {
  const manager = fs.readFileSync(require.resolve('../components/conflict-scene-manager.tsx'), 'utf8');
  const visual = fs.readFileSync(require.resolve('../app/visual-system.css'), 'utf8');
  assert.match(manager, /conflict-overview-metrics/);
  assert.match(manager, /conflict-workspace/);
  assert.match(manager, /conflict-threat-groups/);
  assert.match(manager, /conflict-threat-group-heading/);
  assert.match(manager, /ThreatRoleIcon/);
  assert.match(manager, /<Shield size=\{11\}/);
  assert.match(manager, /<Gauge size=\{11\}/);
  assert.match(manager, /<HeartPulse size=\{10\}/);
  assert.match(manager, /<Zap size=\{10\}/);
  assert.match(manager, /conflict-state-badge is-wounded/);
  assert.match(manager, /conflict-state-badge is-defeated/);
  assert.match(visual, /grid-template-columns:minmax\(285px,.68fr\) minmax\(0,2.15fr\)/);
  assert.match(visual, /conflict-threat-grid/);
  assert.match(visual, /repeat\(auto-fit,minmax\(275px,1fr\)\)/);
});

test('Trilha de Conflito mantém 30 ameaças em grupos sem perder instâncias derrotadas', () => {
  const g = campaign();
  const [ana, bia] = g.survivors;
  g.conflict = conflictScene.createConflictScene({ name:'Horda', sceneNumber:1, day:g.day, time:'08:00', survivorIds:[ana.id, bia.id] });
  const templates = threats.threatLibrary(g.threats);
  const errante = templates.find(row => row.name === 'ERRANTE');
  const corredor = templates.find(row => row.name === 'CORREDOR') ?? errante;
  conflictScene.addThreatInstances(g.conflict, errante, 20);
  conflictScene.addThreatInstances(g.conflict, corredor, 10);
  g.conflict.threats[7].defeated = true;

  const view = collaboration.projectPlayerGame(g, ana.id);
  assert.equal(view.publicConflict.threats.length, 30);
  assert.equal(view.publicConflict.threats[7].defeated, true);
  assert.equal(view.publicConflict.threats.filter(row => row.groupName === errante.name).length >= 20, true);
});

test('dano de ameaça vira solicitação e Armadura reduz a severidade em um passo', () => {
  const g = campaign();
  const [ana] = g.survivors;
  g.conflict = conflictScene.createConflictScene({ name:'Teste', sceneNumber:1, day:g.day, time:'08:00', survivorIds:[ana.id] });
  const template = threats.threatLibrary(g.threats).find(row => row.name === 'ERRANTE');
  const instance = conflictScene.addThreatInstances(g.conflict, template, 1)[0];
  const tier = conflictScene.resolveSurvivorDamageTier(8, 14, 9);
  const request = conflictScene.queueSurvivorDamage(g.conflict, {
    targetSurvivorId: ana.id, sourceThreatId: instance.id, sourceName: instance.name,
    attackName:'Investida', damage:9, damageType:'físico', tier, day:g.day, time:'08:01',
  });
  assert.ok(request);
  assert.equal(request.status, 'pending');
  assert.equal(request.tier.hpMarks, 2);

  const stats = survivorStats(ana);
  assert.ok(stats.armor > 0);
  const result = conflictScene.resolveSurvivorDamageRequest(
    g.conflict, request.id, ana, { hp:stats.hp, armor:stats.armor }, 'armor', g.day, '08:02',
  );
  assert.equal(result.ok, true);
  assert.equal(result.armorUsed, 1);
  assert.equal(result.hpMarks, 1);
  assert.equal(ana.armorMarked, 1);
  assert.equal(ana.hp, 1);
  assert.equal(request.status, 'resolved');
  assert.equal(conflictScene.resolveSurvivorDamageRequest(
    g.conflict, request.id, ana, { hp:stats.hp, armor:stats.armor }, 'hp', g.day, '08:03',
  ).ok, false);
});

test('solicitação de dano pública aparece somente para o sobrevivente alvo', () => {
  const g = campaign();
  const [ana, bia] = g.survivors;
  g.conflict = conflictScene.createConflictScene({ name:'Teste', sceneNumber:1, day:g.day, time:'08:00', survivorIds:[ana.id, bia.id] });
  const template = threats.threatLibrary(g.threats).find(row => row.name === 'ERRANTE');
  const instance = conflictScene.addThreatInstances(g.conflict, template, 1)[0];
  const tier = conflictScene.resolveSurvivorDamageTier(8, 14, 8);
  conflictScene.queueSurvivorDamage(g.conflict, {
    targetSurvivorId: ana.id, sourceThreatId: instance.id, sourceName: instance.name,
    attackName:'Investida', damage:8, damageType:'físico', tier, day:g.day, time:'08:01',
  });

  const anaView = collaboration.projectPlayerGame(g, ana.id);
  const biaView = collaboration.projectPlayerGame(g, bia.id);
  assert.equal(anaView.publicConflict.pendingDamage.length, 1);
  assert.equal(anaView.publicConflict.pendingDamage[0].attackName, 'Investida');
  assert.equal(biaView.publicConflict.pendingDamage.length, 0);
  const publicJson = JSON.stringify(anaView.publicConflict.pendingDamage[0]);
  assert.equal(publicJson.includes(ana.id), false);
  assert.equal(publicJson.includes(instance.id), false);
});

test('PV e Estresse das ameaças são trilhas marcadas a partir de zero', () => {
  const g = campaign();
  const scene = conflictScene.createConflictScene({ name:'Teste', sceneNumber:1, day:g.day, time:'08:00' });
  const template = threats.threatLibrary(g.threats).find(row => row.name === 'ERRANTE');
  const instance = conflictScene.addThreatInstances(scene, template, 1)[0];
  assert.equal(instance.hpMarked, 0);
  assert.equal(instance.stressMarked, 0);
  assert.equal(instance.defeated, false);

  conflictScene.setThreatHpMarked(instance, 1);
  assert.equal(instance.hpMarked, 1);
  assert.equal(instance.defeated, false);

  conflictScene.setThreatStressMarked(instance, 1);
  assert.equal(instance.stressMarked, 1);

  conflictScene.setThreatHpMarked(instance, template.maxHp);
  assert.equal(instance.hpMarked, template.maxHp);
  assert.equal(instance.defeated, true);

  conflictScene.setThreatHpMarked(instance, template.maxHp - 1);
  assert.equal(instance.defeated, false);
});

test('reiniciar cidade preserva fichas, ids e campanha mas limpa o mundo e estados temporários', () => {
  const g = campaign();
  const originalCampaignId = g.campaignId;
  const [ana] = g.survivors;
  ana.hex = '1,0';
  ana.hp = 2;
  ana.hope = 4;
  ana.inventory = [item('Pé de cabra')];
  ana.abilityUses = { exemplo: 'scene:1' };
  ana.restPlan = { kind:'short', choices:[] };
  ana.ammoSpentScene = 1;
  g.shelter.food = 17;
  g.day = 9;
  g.minutes = 900;
  g.hexes['0,0'].notes = 'cidade antiga';
  g.playerActions = { policy:{ paused:true, transfers:false, deposits:false, rest:false, tokens:false, areas:[], routes:[], supplies:{food:0,water:0,items:{}} }, operations:[], receipts:[], withdrawals:[], markers:[] };
  g.explorationPreferences = { autoPrepare:true, participantIds:[ana.id] };
  g.parallelTime = { day:g.day, survivorMinutes:{ [ana.id]:300 } };

  const count = resetCityPreservingSurvivors(g, { withShelter:true });
  assert.equal(count, 2);
  assert.equal(g.campaignId, originalCampaignId);
  assert.equal(g.day, 1);
  assert.equal(g.minutes, 480);
  assert.equal(g.shelter.food, 0);
  assert.equal(g.shelter.hex, '0,0');
  assert.equal(g.survivors.length, 2);
  assert.equal(g.survivors[0].id, ana.id);
  assert.equal(g.survivors[0].name, ana.name);
  assert.equal(g.survivors[0].hp, 2);
  assert.equal(g.survivors[0].hope, 4);
  assert.equal(g.survivors[0].hex, '0,0');
  assert.equal(g.survivors[0].inventory[0].name, 'Pé de cabra');
  assert.equal(g.survivors[0].abilityUses, undefined);
  assert.equal(g.survivors[0].restPlan, undefined);
  assert.equal(g.survivors[0].ammoSpentScene, undefined);
  assert.equal(g.playerActions, undefined);
  assert.equal(g.explorationPreferences, undefined);
  assert.equal(g.parallelTime, undefined);
});

test('resolução privada de alvo existe sem enviar dificuldade ao cliente jogador', () => {
  const route = fs.readFileSync(require.resolve('../app/api/campaign/target/route.ts'), 'utf8');
  assert.match(route, /resolveThreatAttack/);
  assert.match(route, /conflict\.survivorIds\.includes/);
  assert.doesNotMatch(route, /difficulty:\s*resolution/);
  assert.doesNotMatch(route, /majorThreshold:\s*resolution/);
  assert.doesNotMatch(route, /severeThreshold:\s*resolution/);
});

test('API limita imagens persistidas de PNJs e ameaças', () => {
  const route = fs.readFileSync(require.resolve('../lib/campaign-validation.ts'), 'utf8');
  assert.match(route, /threat\.image\.length <= 12000/);
  assert.match(route, /npc\.portrait\.length <= 12000/);
});

test('rota de spotlight permite pedir e cancelar sem criar iniciativa ou escrever no chat', () => {
  const route = fs.readFileSync(require.resolve('../app/api/campaign/spotlight/route.ts'), 'utf8');
  assert.match(route, /requestConflictSpotlight/);
  assert.match(route, /cancelConflictSpotlightRequest/);
  assert.match(route, /\["request", "cancel"\]/);
  assert.doesNotMatch(route, /addLog/);
});

test('prévia dos jogadores mostra Spotlight e oculta Dificuldade e Limiares das ameaças', () => {
  const panel = fs.readFileSync(require.resolve('../components/survivor-panel.tsx'), 'utf8');
  const hud = fs.readFileSync(require.resolve('../components/survivor-conflict-hud.tsx'), 'utf8');
  const spotlightControl = fs.readFileSync(require.resolve('../components/spotlight-request-button.tsx'), 'utf8');
  const rolls = fs.readFileSync(require.resolve('../components/roll-dialog.tsx'), 'utf8');

  assert.match(panel, /playerPreview=\{playerPreview\}/);
  assert.match(panel, /hideThreatSecrets=\{playerMode \|\| playerPreview\}/);
  assert.match(hud, /const playerPerspective = playerMode \|\| playerPreview/);
  assert.match(spotlightControl, /Prévia dos jogadores/);
  assert.match(hud, /preview=\{playerPreview && !playerMode\}/);
  assert.match(spotlightControl, /Pedir Spotlight/);
  assert.match(hud, /SpotlightRequestButton/);
  assert.match(rolls, /hideThreatSecrets/);
  assert.match(rolls, /!hideThreatSecrets && game\.conflict\?\.active/);
  assert.match(rolls, /publicConflictScene\(game\.conflict, game\.survivors, survivor\.id\)/);
  assert.match(rolls, /Dificuldade e Limiares são ocultos e resolvidos pelo sistema/);
});

test('Resumo compacto usa a largura real da ficha e empilha recursos com testes', () => {
  const visual = fs.readFileSync(require.resolve('../app/visual-system.css'), 'utf8');
  assert.match(visual, /Resumo compacto: kit à esquerda, recursos e testes à direita/);
  assert.match(visual, /@container dossier \(min-width:680px\)/);
  assert.match(visual, /\.character-summary-action[\s\S]*grid-row:1 \/ span 2/);
  assert.match(visual, /\.character-summary-resources[\s\S]*grid-column:2[\s\S]*grid-row:1/);
  assert.match(visual, /\.character-summary-tests[\s\S]*grid-column:2[\s\S]*grid-row:2/);
  assert.match(visual, /character-summary-resources \.character-provision-grid > span[\s\S]*min-height:46px/);
  assert.match(visual, /character-summary-tests \.character-summary-attribute[\s\S]*min-height:42px/);
  assert.match(visual, /@container dossier \(max-width:679px\)/);
  assert.match(visual, /@container dossier \(max-width:430px\)/);
});

test('Resumo da ficha oferece testes rápidos para todos os atributos', () => {
  const panel = fs.readFileSync(require.resolve('../components/survivor-panel.tsx'), 'utf8');
  const styles = fs.readFileSync(require.resolve('../app/globals.css'), 'utf8');
  assert.match(panel, /title="Testes rápidos"/);
  assert.match(panel, /character-summary-attributes/);
  assert.match(panel, /traits\.map\(trait =>/);
  assert.match(panel, /beginRoll\(\{ survivorId: selected\.id, kind: "action", trait \}\)/);
  assert.match(panel, /Ajustes de equipamento entram automaticamente/);
  assert.match(panel, /Abrir atributos e Experiências/);
  assert.match(styles, /\.character-summary-attributes/);
  assert.match(styles, /grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
});

test('Trilha de Conflito acompanha a rolagem da página sem invadir o modal de dados', () => {
  const hud = fs.readFileSync(require.resolve('../components/survivor-conflict-hud.tsx'), 'utf8');
  const spotlightControl = fs.readFileSync(require.resolve('../components/spotlight-request-button.tsx'), 'utf8');
  const trail = fs.readFileSync(require.resolve('../components/conflict-trail.tsx'), 'utf8');
  const rolls = fs.readFileSync(require.resolve('../components/roll-dialog.tsx'), 'utf8');
  const visual = fs.readFileSync(require.resolve('../app/visual-system.css'), 'utf8');
  assert.match(hud, /TRILHA DE CONFLITO/);
  assert.match(hud, /ALVOS DA CENA/);
  assert.match(hud, /Localizar/);
  assert.match(spotlightControl, /Pedir Spotlight/);
  assert.match(hud, /SpotlightRequestButton/);
  assert.match(spotlightControl, /character-spotlight-request/);
  assert.match(hud, /character-conflict-sticky-sentinel/);
  assert.match(hud, /isStuck/);
  assert.match(hud, /DANO PENDENTE/);
  assert.match(hud, /targets-recent/);
  assert.match(hud, /onThreatTarget=\{chooseTarget\}/);
  assert.match(trail, /data-trail-key/);
  assert.match(trail, /scrollIntoView/);
  assert.match(trail, /is-spotlight/);
  assert.match(trail, /is-target/);
  assert.match(trail, /is-defeated/);
  assert.doesNotMatch(trail, /próximo turno|ordem de turno|iniciativa/i);
  assert.match(visual, /character-conflict-hud--trail\s*\{[\s\S]*position:sticky/);
  assert.match(visual, /character-conflict-hud--trail\.is-stuck/);
  assert.match(rolls, /targetThreatId\?: string/);
  assert.match(rolls, /useState\(request\?\.targetThreatId/);
  assert.doesNotMatch(rolls, /roll-conflict-dock/);
  assert.doesNotMatch(rolls, /<ConflictTrail/);
});

test('rota de dano exige o sobrevivente alvo e resolve PV ou Armadura no servidor', () => {
  const route = fs.readFileSync(require.resolve('../app/api/campaign/damage/route.ts'), 'utf8');
  assert.match(route, /resolveSurvivorDamageRequest/);
  assert.match(route, /pending\.targetSurvivorId !== member!\.survivor_id/);
  assert.match(route, /\["hp", "armor"\]/);
  assert.match(route, /writeCampaign/);
});

test('persistência de conta mantém tabela e sincronização de sobreviventes fora do estado da cidade', () => {
  const schema = fs.readFileSync(require.resolve('../db/schema.ts'), 'utf8');
  const state = fs.readFileSync(require.resolve('../db/state.ts'), 'utf8');
  const actions = fs.readFileSync(require.resolve('../app/api/campaign/actions/route.ts'), 'utf8');
  assert.match(schema, /sqliteTable\("user_characters"/);
  assert.match(state, /syncCampaignAccountCharacters\(campaignId, persisted\)/);
  assert.match(state, /INSERT INTO user_characters/);
  assert.match(actions, /resetCityPreservingSurvivors/);
});

test('jogador cria ficha válida sem poder injetar recursos ou escolhas fora do arquétipo', () => {
  const archetype = content.archetypes[0];
  const draft = { name: 'Nina', origin: content.origins[0].name, past: 'Procuro minha irmã',
    archetype: archetype.name, specialty: archetype.specialties[0].name,
    attributes: { Agilidade: 2, Força: -1, Finesse: 1, Instinto: 0, Presença: 1, Conhecimento: 0 },
    freeExperience: 'Conheço a região', techniques: content.techniques.filter(t => archetype.tracks.includes(t.track)).slice(0, 2).map(t => t.name),
    primary: content.primaries[0].name, secondary: '', protection: content.protections[0].name,
    personal: content.personal[0].name, hp: 99, hope: 99, inventory: [{ name: 'Injetado' }], id: 'roubado' };
  const created = createSurvivorFromDraft(draft);
  assert.ok(created);
  assert.notEqual(created.id, 'roubado'); assert.equal(created.hp, 0); assert.equal(created.stress, 0); assert.equal(created.hope, 0);
  assert.deepEqual(created.inventory, []);
  assert.equal(createSurvivorFromDraft({ ...draft, attributes: { ...draft.attributes, Força: 2 } }), null);
  assert.equal(createSurvivorFromDraft({ ...draft, techniques: [draft.techniques[0], draft.techniques[0]] }), null);
  assert.equal(createSurvivorFromDraft({ ...draft, archetype: 'Classe impossível' }), null);
  const empty = collaboration.projectPlayerGame(campaign(), '');
  assert.deepEqual(empty.survivors, []);
  assert.deepEqual(empty.log, []);
});

test('cada item físico do catálogo tem miniatura ilustrada válida', () => {
  for (const entry of content.catalog.filter(e => e.category !== 'Consulta antes de sair e ao retornar')) {
    const art = explicitItemArtFor(entry.name);
    assert.ok(art, `Sem arte para ${entry.category}: ${entry.name}`);
    assert.ok(Number.isInteger(art.cell) && art.cell >= 0 && art.cell < 16);
    assert.ok(fs.statSync(`public${itemArtUrl(art.sheet)}`).size > 1000);
  }
  assert.deepEqual(itemArtFor('Lanterna inventada', 'Outros'), { sheet: 'care', cell: 9 });
  assert.deepEqual(itemArtFor('Objeto inédito', 'Ferramentas, acesso e reparo'), { sheet: 'clothing', cell: 10 });
});

test('visão do jogador mostra só sua ficha, locais revelados e registros próprios', () => {
  const g = campaign(); const [ana, bia] = g.survivors;
  const unknown = Object.values(g.hexes).find(hex => hex.discovery === 'desconhecido');
  unknown.sector = { id: 'segredo', name: 'Laboratório secreto', border: 'Nada' };
  unknown.notes = 'porta escondida'; unknown.signs = 'segredo'; unknown.points.push({
    id: 'p0', name: 'Cofre', kind: 'local', signal: '', access: '', notes: 'senha', revealed: true, searches: [],
  });
  const known = g.hexes['0,0']; known.notes = 'armadilha';
  known.points.push({ id: 'p1', name: 'Depósito', kind: 'local', signal: 'letreiro', access: 'fundo',
    notes: 'senha', revealed: true, searches: [{ id:'q', what:'x', why:'y', sector:'z', minutes: 10, result: 'chave' }] });
  known.points.push({ id: 'p2', name: 'Porta oculta', kind: 'local', signal: '', access: '',
    notes: '', revealed: false, searches: [] });
  known.events.push({ id: 'e', text: 'Surge um grupo', trigger: 'relógio secreto', revealed: false });
  g.shelter.notes = 'reserva secreta';
  g.conflict = conflictScene.createConflictScene({ name:'Posto abandonado', sceneNumber:1, day:g.day, time:'08:00', survivorIds:[ana.id, bia.id] });
  const publicThreat = conflictScene.addThreatInstances(g.conflict, threats.threatLibrary(g.threats).find(row => row.name === 'ERRANTE'), 1)[0];
  conflictScene.setConflictSpotlight(g.conflict, { kind:'threat', id:publicThreat.id }, publicThreat.name, g.day, '08:02');
  require('../lib/game.ts').addLog(g, 'ameaça', 'ERRANTE: Investida contra Ana — d20 10 + 0 = 10 vs Evasão 10: ACERTO. Dano 3 físico → MENOR (1 PV). Aplique dano ou Armadura na ficha do alvo.');
  require('../lib/game.ts').addLog(g, 'dados', 'Ana rolou', ana.id);
  require('../lib/game.ts').addLog(g, 'evento', 'Segredo do mestre');
  const visible = collaboration.projectPlayerGame(g, ana.id);
  assert.equal(visible.survivors.length, 1); assert.equal(visible.survivors[0].id, ana.id);
  assert.equal(visible.survivors.some(person => person.id === bia.id), false);
  assert.equal(JSON.stringify(visible).includes('Laboratório secreto'), false);
  assert.equal(JSON.stringify(visible).includes('porta escondida'), false);
  assert.equal(JSON.stringify(visible).includes('armadilha'), false);
  assert.equal(JSON.stringify(visible).includes('Porta oculta'), false);
  assert.equal(JSON.stringify(visible).includes('relógio secreto'), false);
  assert.equal(JSON.stringify(visible).includes('reserva secreta'), false);
  assert.equal(visible.conflict, undefined);
  assert.equal(visible.publicConflict.name, 'Posto abandonado');
  assert.deepEqual(visible.publicConflict.survivors.map(person => person.name), ['Ana', 'Bia']);
  assert.equal(visible.publicConflict.threats[0].name, 'ERRANTE');
  assert.deepEqual(visible.publicConflict.spotlight, { kind:'threat', id:publicThreat.id });
  assert.equal(visible.log.some(entry => entry.kind === 'ameaça' && /Investida/.test(entry.text)), true);
  const publicConflictJson = JSON.stringify(visible.publicConflict);
  for (const privateField of ['difficulty', 'majorThreshold', 'severeThreshold', 'maxHp', 'maxStress', 'hpMarked', 'stressMarked', 'templateSnapshot', 'motivations', 'notes']) {
    assert.equal(publicConflictJson.includes(privateField), false, privateField);
  }
  assert.equal(visible.hexes['0,0'].points[0].name, 'Depósito');
  assert.equal(visible.hexes['0,0'].points[0].notes, '');
  assert.equal(visible.hexes['0,0'].points[0].searches.length, 0);
  assert.deepEqual(visible.log.map(row => row.kind), ['dados', 'ameaça']);
  assert.equal(visible.log[0].text, 'Ana rolou');
  assert.match(visible.log[1].text, /ERRANTE: Investida/);
  assert.equal(g.hexes['0,0'].notes, 'armadilha');
  conflictScene.endConflictScene(g.conflict, g.day, '08:10');
  assert.equal(collaboration.projectPlayerGame(g, ana.id).publicConflict, undefined);
});

test('dois jogadores editam fichas diferentes após atualização do mapa sem sobrescrever dados', () => {
  let g = campaign(); const [ana, bia] = g.survivors;
  const anaBefore = structuredClone(ana), biaBefore = structuredClone(bia);
  const nextMap = structuredClone(g); nextMap.hexes['0,0'].notes = 'pista nova'; g = nextMap;
  const anaAfter = { ...anaBefore, hope: 3 };
  const biaAfter = { ...biaBefore, stress: 1 };
  g = collaboration.applyPlayerChange(g, ana.id, anaBefore, anaAfter, 1, [{ kind:'dados', text:'Rolagem de Ana' }]);
  assert.ok(g);
  g = collaboration.applyPlayerChange(g, bia.id, biaBefore, biaAfter, 0, [{ kind:'habilidade', text:'Bia ajudou' }]);
  assert.ok(g);
  assert.equal(g.hexes['0,0'].notes, 'pista nova');
  assert.equal(g.survivors[0].hope, 3); assert.equal(g.survivors[1].stress, 1);
  assert.equal(g.fear, 1);
  assert.equal(collaboration.applyPlayerChange(g, ana.id, anaBefore, anaAfter, 0, []), null);
  assert.equal(collaboration.projectPlayerGame(g, bia.id).log.some(row => row.text === 'Rolagem de Ana'), false);
});

test('jogador não consegue salvar alterações de mapa, outra ficha ou campos de criação', () => {
  const g = campaign(), view = collaboration.projectPlayerGame(g, g.survivors[0].id);
  const secret = structuredClone(view); secret.hexes['0,0'].notes = 'alterado';
  assert.equal(collaboration.playerEditPayload(view, secret), null);
  const another = structuredClone(view); another.survivors.push(g.survivors[1]);
  assert.equal(collaboration.playerEditPayload(view, another), null);
  const own = structuredClone(view); own.survivors[0].hp = 1;
  assert.ok(collaboration.playerEditPayload(view, own));
  assert.equal(collaboration.applyPlayerChange(g, own.survivors[0].id, g.survivors[0],
    { ...g.survivors[0], archetype: 'Outro' }, 0, []), null);
  assert.equal(collaboration.applyPlayerChange(g, own.survivors[0].id, g.survivors[0],
    { ...g.survivors[0], hp: 1 }, 0, [{ kind:'evento', text:'Segredo falso' }]), null);
  assert.equal(collaboration.applyPlayerChange(g, own.survivors[0].id, g.survivors[0],
    { ...g.survivors[0], hp: 1 }, 1, []), null);

  const plan = structuredClone(view);
  plan.survivors[0].restPlan = { kind: 'long', choices: [
    { action: 'hp-full', targetId: g.survivors[1].id },
    { action: 'prepare', targetId: g.survivors[0].id },
  ] };
  assert.ok(collaboration.playerEditPayload(view, plan));
  const planned = collaboration.applyPlayerChange(g, g.survivors[0].id, g.survivors[0], plan.survivors[0], 0, []);
  assert.equal(planned.survivors[0].restPlan.choices[0].targetId, g.survivors[1].id);
  const invalidPlan = structuredClone(plan.survivors[0]);
  invalidPlan.restPlan.choices[0].targetId = 'inexistente';
  assert.equal(collaboration.applyPlayerChange(g, g.survivors[0].id, g.survivors[0], invalidPlan, 0, []), null);
});

test('perecíveis mantêm prazo em transferência, consumo e amanhecer; estoque durável sobrevive', () => {
  const g = campaign(); const [a,b] = g.survivors;
  provisions.recordProvisionLot(a, 'food', 2, 'Sanduíche', 2);
  provisions.recordProvisionLot(a, 'food', 3, 'Fruta', 3);
  a.food += 2; // reservas duráveis existentes
  assert.equal(inventory.transferProvisions(g, a.id, b.id, 'food', 3), true);
  assert.deepEqual(b.provisionLots.map(lot => [lot.label, lot.qty, lot.expiresDay]), [['Sanduíche',2,2],['Fruta',1,3]]);
  assert.equal(survival.consumeDailyProvision(g, b.id, 'food'), true);
  assert.equal(b.provisionLots.find(lot => lot.label === 'Sanduíche').qty, 1);
  const raw = item('Fruta firme'); g.shelter.inventory.push(raw);
  const frozen = item('Refeição congelada'); g.shelter.inventory.push(frozen);
  g.shelter.energy = 1; g.shelter.coldStorage = true;
  assert.equal(survival.closeDay(g, 0, 0), true); // manhã do dia 2
  assert.equal(g.day, 2); assert.equal(b.food, 2);
  assert.equal(g.shelter.inventory.find(x => x.id === frozen.id).condition, 'Íntegro');
  assert.equal(survival.closeDay(g, 0, 0), true); // manhã do dia 3
  assert.equal(b.food, 1); assert.equal(raw.condition, 'Estragado');
  assert.equal(inventory.provisionInfo(raw).type, null);
  assert.equal(frozen.condition, 'Íntegro');
  g.shelter.energy = 0;
  assert.equal(survival.closeDay(g, 0, 0), true);
  assert.equal(frozen.condition, 'Estragado');
  assert.equal(provisions.provisionDeadline('R', 1), 2);
  assert.equal(provisions.provisionDeadline('F', 1), 3);
  assert.equal(provisions.provisionDeadline('C', 3), 4);
});

test('mudança de abrigo transporta só o manifesto e preserva antiga base e lotes', () => {
  const g = campaign();
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  g.shelter.food = 6; g.shelter.water = 4; g.shelter.parts = 3; g.shelter.residents = 2;
  g.shelter.security = 3; g.shelter.inventory.push(item('Pé de cabra'));
  provisions.recordProvisionLot(g.shelter, 'food', 2, 'Sanduíche', 2);
  const oldItemId = g.shelter.inventory[0].id;
  const target = Object.keys(g.hexes).find(key => key !== '0,0' && g.hexes[key].discovery === 'avistado');
  g.partyHex = target; g.hexes[target].discovery = 'explorado';
  const move = require('../lib/game.ts').establishShelter;
  const invalid = structuredClone(g);
  assert.equal(move(g, target, { stocks: {food: 99} }), false);
  assert.deepEqual(g, invalid);
  assert.equal(move(g, target, { stocks: {food: 3, water: 1}, residents: 1, itemIds: [oldItemId] }), true);
  assert.equal(g.shelter.food, 3); assert.equal(g.shelter.water, 1); assert.equal(g.shelter.residents, 1);
  assert.equal(g.shelter.parts, 0); assert.equal(g.shelter.security, 1);
  const former = g.formerShelters.find(site => site.hex === '0,0');
  assert.equal(former.food, 5); assert.equal(former.water, 3); assert.equal(former.parts, 3);
  assert.equal(former.security, 3); assert.equal(former.residents, 1);
  assert.equal(g.shelter.inventory[0].name, 'Pé de cabra'); assert.equal(former.inventory.length, 0);
  assert.equal(g.shelter.provisionLots[0].qty, 2);
  g.partyHex = '0,0';
  assert.equal(require('../lib/game.ts').recoverFormerStock(g, '0,0', g.survivors[0].id, 'water', 1), true);
  assert.equal(former.water, 2);
});

test('abandono, retirada do depósito e retorno conservam moradores e suprimentos', () => {
  const g = campaign(); const rules = require('../lib/game.ts');
  assert.equal(rules.establishShelter(g, '0,0'), true);
  g.shelter.residents = 3; g.shelter.parts = 4; g.shelter.medications = 2;
  const tool = item('Pé de cabra'); g.shelter.inventory.push(tool);
  assert.equal(rules.abandonShelter(g, { residents: 2, stocks: { parts: 1 } }), true);
  assert.equal(g.shelter.hex, null); assert.equal(g.shelter.residents, 2); assert.equal(g.shelter.parts, 1);
  const cache = g.formerShelters[0];
  assert.equal(cache.residents, 1); assert.equal(cache.parts, 3);
  assert.equal(rules.recoverFormerStock(g, '0,0', g.survivors[0].id, 'medications', 1), true);
  assert.equal(rules.recoverFormerStock(g, '0,0', g.survivors[0].id, 'food', 0, tool.id), true);
  assert.equal(cache.medications, 1); assert.equal(cache.inventory.length, 0);
  assert.equal(g.survivors[0].inventory.some(x => x.name === 'Medicamentos (1 unidade)'), true);
  assert.equal(g.survivors[0].inventory.some(x => x.name === 'Pé de cabra'), true);
  assert.equal(rules.establishShelter(g, '0,0'), true);
  assert.equal(g.shelter.residents, 3); assert.equal(g.shelter.parts, 4);
  assert.equal(g.formerShelters.length, 0);
});

test('transferência não cria porções quando se pede mais do que existe', () => {
  const from = { food: 2, water: 0 }, to = { food: 0, water: 0 };
  provisions.transferPortionLots(from, to, 'food', 5);
  assert.equal(from.food, 0); assert.equal(to.food, 2);
});

test('habilidades gastam recursos, respeitam cena, expedição e alvo sem repetir uso', () => {
  const g = campaign(); const a = g.survivors[0];
  a.hope = 2;
  const action = 'Uma vez por cena, gaste 1 Hope para abrir um caminho.';
  assert.equal(abilities.recordAbilityUse(g, a.id, 'teste', 'Caminho', action, 'hope1'), true);
  assert.equal(a.hope, 1);
  assert.equal(abilities.recordAbilityUse(g, a.id, 'teste', 'Caminho', action, 'hope1'), false);
  abilities.beginScene(g);
  assert.equal(abilities.recordAbilityUse(g, a.id, 'teste', 'Caminho', action, 'hope1'), true);
  assert.equal(a.hope, 0);
  assert.equal(abilities.recordAbilityUse(g, a.id, 'hope', 'Poder', 'Gaste 3 Hope', 'hope3', '', true), false);
  const place = 'Uma vez por local, examine marcas antes de entrar.';
  assert.equal(abilities.recordAbilityUse(g, a.id, 'marca', 'Marcas', place, 'free', 'Mercado'), true);
  assert.equal(abilities.recordAbilityUse(g, a.id, 'marca', 'Marcas', place, 'free', 'Mercado'), false);
  assert.equal(abilities.recordAbilityUse(g, a.id, 'marca', 'Marcas', place, 'free', 'Oficina'), true);
  const exp = 'Uma vez por expedição, marque 1 Stress para rastrear.';
  assert.equal(abilities.recordAbilityUse(g, a.id, 'trilha', 'Rastreio', exp, 'stress1'), true);
  assert.equal(abilities.recordAbilityUse(g, a.id, 'trilha', 'Rastreio', exp, 'stress1'), false);
  abilities.beginExpedition(g);
  assert.equal(abilities.recordAbilityUse(g, a.id, 'trilha', 'Rastreio', exp, 'stress1'), true);
  assert.equal(a.stress, 2);
  a.hope = 4;
  const sceneCare = 'Durante uma cena: uma vez por paciente, gaste 1 Hope para limpar 1 HP.';
  const restCare = 'Durante um descanso curto: uma vez por paciente, limpe +1 HP sem pagar Hope.';
  assert.equal(abilities.recordAbilityUse(g, a.id, 'maos:cena', 'Mãos firmes · cena', sceneCare, 'hope1', 'Bia'), true);
  assert.equal(abilities.recordAbilityUse(g, a.id, 'maos:descanso', 'Mãos firmes · descanso', restCare, 'free', 'Bia'), true);
  assert.equal(abilities.recordAbilityUse(g, a.id, 'maos:descanso', 'Mãos firmes · descanso', restCare, 'free', 'Bia'), false);
  abilities.registerRest(g, 'short');
  assert.equal(abilities.recordAbilityUse(g, a.id, 'maos:descanso', 'Mãos firmes · descanso', restCare, 'free', 'Bia'), true);
  assert.equal(abilities.recordAbilityUse(g, a.id, 'maos:cena', 'Mãos firmes · cena', sceneCare, 'hope1', 'Bia'), false);
});

test('descanso da mesa aplica duas escolhas por sobrevivente e registra Fear automaticamente', () => {
  const g = campaign(); const [ana, bia] = g.survivors;
  ana.hp = 4; ana.stress = 4; ana.armorMarked = 2; ana.hope = 0;
  bia.hp = 4; bia.hope = 0;
  const shortStart = g.minutes;
  const short = abilities.resolveGroupRest(g, 'short', [
    { survivorId: ana.id, choices: [{ action: 'hp', targetId: ana.id }, { action: 'stress', targetId: ana.id }] },
    { survivorId: bia.id, choices: [{ action: 'prepare', targetId: bia.id }, { action: 'prepare', targetId: bia.id }] },
  ], () => 3);
  assert.equal(short.ok, true);
  assert.equal(g.minutes, shortStart + 60);
  assert.equal(short.minutes, 60);
  assert.equal(ana.hp, 0);
  assert.equal(ana.stress, 0);
  assert.equal(bia.hope, 2);
  assert.equal(g.fear, 3);
  assert.equal(g.shortRest, 2);
  assert.equal(g.log.filter(entry => entry.kind === 'descanso').length, 4);

  ana.hp = 3; ana.armorMarked = 2; bia.stress = 5; bia.hope = 0;
  const longStart = g.minutes;
  const long = abilities.resolveGroupRest(g, 'long', [
    { survivorId: ana.id, choices: [{ action: 'hp-full', targetId: ana.id }, { action: 'prepare', targetId: ana.id }] },
    { survivorId: bia.id, choices: [{ action: 'stress-full', targetId: bia.id }, { action: 'prepare', targetId: bia.id }] },
  ], () => 2);
  assert.equal(long.ok, true);
  assert.equal(g.minutes, longStart + 360);
  assert.equal(long.minutes, 360);
  assert.equal(ana.hp, 0);
  assert.equal(bia.stress, 0);
  assert.equal(ana.hope, 2);
  assert.equal(bia.hope, 2);
  assert.equal(g.fear, 7);
  assert.equal(g.longRest, 2);

  ana.hp = 0; bia.hp = 5;
  const helpStart = g.minutes;
  const help = abilities.resolveGroupRest(g, 'short', [
    { survivorId: ana.id, choices: [{ action: 'hp', targetId: bia.id }, { action: 'fiction', targetId: ana.id }] },
    { survivorId: bia.id, choices: [{ action: 'fiction', targetId: bia.id }, { action: 'fiction', targetId: bia.id }] },
  ], () => 4);
  assert.equal(help.ok, true);
  assert.equal(g.minutes, helpStart + 60);
  assert.equal(bia.hp, 0);
});

test('todo o catálogo de armas e proteções pode ser equipado, consultado e calculado', () => {
  const categories = { 'Armas primárias': 'primary', 'Armas secundárias': 'secondary', 'Proteções': 'protection' };
  const candidates = content.catalog.filter(x => categories[x.category]);
  assert.equal(candidates.length, 42);
  for (const entry of candidates) {
    const s = survivor(); const found = inventory.itemFromCatalog(entry);
    s.inventory.push(found);
    const slot = categories[entry.category];
    assert.equal(inventory.equipItem(s, found.id, slot), true, entry.name);
    assert.equal(s[slot], entry.name);
    const stats = survivorStats(s);
    for (const key of ['major','severe','armor','evasion','carried']) assert.ok(Number.isFinite(stats[key]), `${entry.name}: ${key}`);
    if (slot !== 'protection') assert.ok(parseWeaponDamage((slot === 'primary' ? equipment.getPrimary(entry.name) : equipment.getSecondary(entry.name)).damage), entry.name);
  }
});

test('trocas de arma resolvem duas mãos e conservam todos os objetos', () => {
  const s = survivor(); s.secondary = 'Tampa resistente';
  const shotgun = item('Espingarda'); s.inventory.push(shotgun);
  const before = physicalCount(s);
  assert.equal(inventory.equipItem(s, shotgun.id, 'primary'), true);
  assert.equal(s.secondary, '');
  assert.equal(s.inventory.find(x => x.name === 'Tampa resistente').qty, 1);
  assert.equal(physicalCount(s), before);
  const shield = s.inventory.find(x => x.name === 'Tampa resistente');
  assert.equal(inventory.equipItem(s, shield.id, 'secondary'), true);
  assert.equal(s.primary, '');
  assert.equal(physicalCount(s), before);
});

test('equipar e guardar conserva carga corrigida, estado, origem do item e armadura marcada', () => {
  const s = survivor(); const jacket = item('Jaqueta de motociclista', 2);
  Object.assign(jacket, { load: 4, condition: 'Danificado', foundDay: 3, armorMarked: 2 });
  const before = physicalCount(s); s.inventory.push(jacket);
  assert.equal(inventory.equipItem(s, jacket.id, 'protection'), true);
  assert.equal(s.armorMarked, 2);
  assert.equal(inventory.stowSlot(s, 'protection'), true);
  const recovered = s.inventory.find(x => x.catalogKey === jacket.catalogKey);
  assert.equal(recovered.qty, 2); assert.equal(recovered.load, 4);
  assert.equal(recovered.condition, 'Danificado'); assert.equal(recovered.foundDay, 3);
  assert.equal(recovered.armorMarked, 2); assert.equal(physicalCount(s), before + 2);
});

test('mochila do kit inicial não se duplica pelo atalho de item pessoal', () => {
  const s = survivor(); const initial = physicalCount(s);
  inventory.stowSlot(s, 'personal');
  assert.equal(s.bag, ''); assert.equal(s.personal, '');
  assert.equal(s.inventory.filter(x => x.name === 'Mochila urbana').length, 1);
  const bag = s.inventory[0]; bag.load = 3;
  inventory.equipItem(s, bag.id, 'bag'); inventory.stowSlot(s, 'personal');
  assert.equal(s.inventory[0].load, 3); assert.equal(physicalCount(s), initial);
});

test('limiares acompanham nível e ausência de proteção; modificadores do kit entram nos cálculos', () => {
  const s = survivor(); s.level = 4; s.protection = 'Colete tático reforçado'; s.secondary = 'Tampa resistente';
  let stats = survivorStats(s);
  assert.equal(stats.major, 11); assert.equal(stats.severe, 20); assert.equal(stats.armor, 5);
  assert.equal(equipment.equipmentModifiers(s).traits.Agilidade, -1);
  s.protection = ''; s.secondary = ''; stats = survivorStats(s);
  assert.equal(stats.major, 4); assert.equal(stats.severe, 8); assert.equal(stats.armor, 0);
  s.secondary = 'Faca pequena'; assert.equal(equipment.equipmentModifiers(s).primaryDamage, 1);
  s.primary = 'Pistola'; assert.equal(equipment.equipmentModifiers(s).primaryDamage, 0);
  s.secondary = 'Escudo improvisado'; s.kitCondition = { secondary: 'Danificado' };
  assert.equal(equipment.equipmentModifiers(s).armor, 0);
  s.kitCondition.secondary = 'Íntegro'; assert.equal(equipment.equipmentModifiers(s).armor, 2);
});

test('munição física transfere por tipo e o abrigo usa os mesmos itens', () => {
  const g = campaign(); const [a,b] = g.survivors;
  a.inventory = [item('Munição de Espingarda', 3)];
  b.inventory = [item('Munição de Pistola', 2)];
  assert.equal(inventory.transferProvisions(g, a.id, b.id, 'ammo', 2, 'Espingarda'), true);
  assert.equal(require('../lib/game.ts').ammunitionCount(a.inventory, 'Espingarda'), 1);
  assert.equal(require('../lib/game.ts').ammunitionCount(b.inventory, 'Espingarda'), 2);
  assert.equal(require('../lib/game.ts').ammunitionCount(b.inventory, 'Pistola'), 2);
  assert.equal(inventory.transferProvisions(g, b.id, 'shared', 'ammo', 1, 'Espingarda'), true);
  assert.equal(require('../lib/game.ts').shelterAmmoCount(g.shelter, 'Espingarda'), 1);
  require('../lib/game.ts').setShelterAmmoCount(g.shelter, 'Pistola', 2);
  assert.equal(inventory.transferProvisions(g, 'shared', b.id, 'ammo', 1, 'Pistola'), true);
  assert.equal(require('../lib/game.ts').ammunitionCount(b.inventory, 'Pistola'), 3);
  assert.equal(require('../lib/game.ts').shelterAmmoCount(g.shelter, 'Pistola'), 1);
});

test('munição física ocupa 1 espaço por até quatro unidades do mesmo tipo', () => {
  const s = survivor();
  s.inventory = [item('Munição de Pistola', 4)];
  assert.equal(survivorStats(s).load.ammo, 1);
  s.inventory[0].qty = 5;
  assert.equal(survivorStats(s).load.ammo, 2);
  s.inventory.push(item('Munição de Carabina', 1));
  assert.equal(survivorStats(s).load.ammo, 3);
});

test('transações rejeitam valores inválidos e acesso remoto sem alterar o estado', () => {
  const g = campaign(); const [a,b] = g.survivors; const tool = item('Pé de cabra', 3); a.inventory.push(tool);
  for (const value of [NaN, Infinity, -1, 0, 1.5, 4]) {
    const before = JSON.stringify(g);
    assert.equal(inventory.transferItem(g, a.id, b.id, tool.id, value), false);
    assert.equal(inventory.discardItem(g, a.id, tool.id, value), false);
    assert.equal(inventory.transferProvisions(g, a.id, b.id, 'food', value), false);
    assert.equal(JSON.stringify(g), before);
  }
  g.shelter.hex = '1,0'; g.shelter.inventory = [item('Faca pequena')]; g.shelter.food = 9;
  const before = JSON.stringify(g);
  assert.equal(inventory.transferItem(g, 'shared', a.id, g.shelter.inventory[0].id, 1), false);
  assert.equal(inventory.discardItem(g, 'shared', g.shelter.inventory[0].id, 1), false);
  assert.equal(inventory.transferProvisions(g, 'shared', a.id, 'food', 1), false);
  assert.equal(JSON.stringify(g), before);
});

test('simulação: 300 transferências entre fichas e depósito conservam recursos e itens', () => {
  const g = campaign(); const [a,b] = g.survivors;
  g.shelter.food = 25; a.food = 25; b.food = 25; a.inventory.push(item('Faca pequena', 18));
  const holders = [a.id, b.id, 'shared'];
  for (let i = 0; i < 300; i++) {
    const from = holders[i % 3], to = holders[(i + 1) % 3];
    inventory.transferProvisions(g, from, to, 'food', 1 + i % 3);
    const objects = inventory.container(g, from);
    if (objects.length) inventory.transferItem(g, from, to, objects[0].id, 1);
    assert.equal(a.food + b.food + g.shelter.food, 75);
    assert.equal(holders.flatMap(id => inventory.container(g,id)).reduce((sum, x) => sum + x.qty, 0), 18);
    assert.ok([a.food,b.food,g.shelter.food].every(n => n >= 0));
  }
});

test('jornada completa: provisões pessoais, ausência do abrigo e infecção ao amanhecer', () => {
  const g = campaign(); const [a,b] = g.survivors; g.shelter.residents = 2; g.shelter.food = 10; g.shelter.water = 10;
  assert.deepEqual(survival.eveningNeeds(g), { food: 4, water: 4 });
  assert.equal(survival.consumeDailyProvision(g, a.id, 'food'), true);
  assert.equal(survival.consumeDailyProvision(g, a.id, 'food'), false);
  assert.equal(a.food, 0);
  assert.deepEqual(survival.eveningNeeds(g), { food: 3, water: 4 });
  a.infection = 'Exposto'; a.exposureDeadline = 600; b.infection = 'Infectado';
  const before = JSON.stringify(g);
  assert.equal(survival.closeDay(g, 1.5, 4), false); assert.equal(JSON.stringify(g), before);
  assert.equal(survival.closeDay(g, 3, 4, 1), true);
  assert.equal(survival.closeDay(g, 3, 4, 1), false);
  assert.equal(g.day, 2); assert.equal(g.shelter.food, 7); assert.equal(g.shelter.water, 6);
  assert.equal(a.infection, 'Infectado'); assert.equal(b.infection, 'Sintomático');
  g.shelter.hex = '1,0'; assert.deepEqual(survival.eveningNeeds(g), { food: 2, water: 2 });
  assert.equal(survival.closeDay(g, 2, 2), true); assert.equal(b.infection, 'Terminal');
  assert.equal(b.terminalScenes, 3);
});

test('NPCs são globais, usam reservas conforme posição e mantêm privacidade na projeção do jogador', () => {
  const g = defaultState({ withShelter: true });
  g.survivors = [survivor(), survivor('Bia')];
  g.shelter.residents = 2; g.shelter.food = 5; g.shelter.water = 5;
  const maria = { id: 'maria', name: 'Maria Alves', role: 'Enfermeira', description: 'Cuida da enfermaria.', notes: 'Conhece a rota secreta.',
    publicNotes: 'Está organizando remédios.', hex: '0,0', home: '0,0', status: 'Bem', infection: 'Saudável', disposition: 'Aliado', skills: ['Medicina'], duty: 'Enfermaria', active: true };
  g.npcs.push(maria);
  assert.equal(require('../lib/game.ts').shelterPopulation(g), 5);
  assert.deepEqual(survival.eveningNeeds(g), { food: 5, water: 5 });
  assert.equal(survival.closeDay(g, 5, 5), true);
  assert.equal(maria.foodConsumedDay, 1); assert.equal(maria.waterConsumedDay, 1);
  const player = collaboration.projectPlayerGame(g, g.survivors[0].id);
  assert.equal(player.npcs[0].notes, undefined); assert.equal(player.npcs[0].home, undefined);
  assert.equal(player.npcs[0].publicNotes, 'Está organizando remédios.');
});

test('NPC que fica em uma base antiga não é transportado sem ser selecionado', () => {
  const g = defaultState({ withShelter: true });
  const joel = { id: 'joel', name: 'Joel', role: 'Vigia', description: '', notes: '', hex: '0,0', home: '0,0', status: 'Bem', infection: 'Saudável', disposition: 'Neutro', skills: [], active: true };
  g.npcs.push(joel); g.partyHex = '1,0'; g.hexes['1,0'].discovery = 'explorado';
  assert.equal(require('../lib/game.ts').establishShelter(g, '1,0', {}), true);
  assert.equal(joel.home, '0,0'); assert.equal(joel.hex, '0,0');
  assert.equal(g.formerShelters[0].hex, '0,0');
});

test('apresentação visual usa canal separado e não infla o JSON principal da campanha', () => {
  const g = campaign();
  g.presentation = { id:'imagem-1', image:'https://example.com/foto.jpg', title:'Porta-retrato', caption:'Uma família diante do prédio.', active:true };
  const projected = collaboration.projectPlayerGame(g, g.survivors[0].id);
  assert.equal(projected.presentation, undefined);

  const component = fs.readFileSync(require.resolve('../components/table-presentation.tsx'), 'utf8');
  const page = fs.readFileSync(require.resolve('../app/page.tsx'), 'utf8');
  const visual = fs.readFileSync(require.resolve('../app/visual-system.css'), 'utf8');
  const route = fs.readFileSync(require.resolve('../app/api/campaign/presentation/route.ts'), 'utf8');
  const state = fs.readFileSync(require.resolve('../db/state.ts'), 'utf8');
  const imageUtils = fs.readFileSync(require.resolve('../lib/client-image.ts'), 'utf8');

  assert.match(component, /Mostrar aos jogadores/);
  assert.match(component, /mode="presentation"/);
  assert.match(component, /\/api\/campaign\/presentation/);
  assert.match(component, /setDismissedId\(presentation\.id\)/);
  assert.doesNotMatch(component, /edit\(draft|draft\.presentation|addLog|table-chat|kind:\s*["']chat["']/);
  assert.match(page, /rail-presentation-slot/);
  assert.match(page, /<TablePresentationControl campaignId=\{ownerId\} presentation=\{presentation\}/);
  assert.doesNotMatch(page, /<TablePresentationControl campaignId=\{game\.campaignId\}/);
  assert.match(page, /<TablePresentationViewer presentation=\{presentation\} enabled=\{readOnlyPreview\}/);
  assert.match(page, /refreshPresentation/);
  assert.match(page, /startCampaignSync/);
  assert.match(route, /campaignPresentationVersion/);
  assert.match(route, /writeCampaignPresentation/);
  assert.match(route, /clearCampaignPresentation/);
  assert.match(state, /campaign_presentations/);
  assert.match(state, /delete persisted\.presentation/);
  assert.match(state, /delete state\.presentation/);
  assert.match(imageUtils, /encodePresentationImage/);
  assert.match(imageUtils, /presentationImageMaxLength = 60_000/);
  assert.match(visual, /\.table-presentation-trigger[\s\S]*position:fixed/);
  assert.match(visual, /\.table-presentation-overlay[\s\S]*position:fixed/);
});

test('ferramentas de PNJ permitem imagem por link/upload e exclusão com limpeza de vínculos', () => {
  const panel = fs.readFileSync(require.resolve('../components/npc-panel.tsx'), 'utf8');
  const picker = fs.readFileSync(require.resolve('../components/image-picker.tsx'), 'utf8');
  assert.match(panel, /<ImagePicker label="Retrato do PNJ"/);
  assert.match(panel, /Excluir PNJ/);
  assert.match(panel, /state\.npcs = state\.npcs\.filter/);
  assert.match(panel, /project\.helperIds = \(project\.helperIds \?\? \[\]\)\.filter/);
  assert.match(panel, /post\.helperIds = \(post\.helperIds \?\? \[\]\)\.filter/);
  assert.match(picker, /Usar link/);
  assert.match(picker, /accept="image\/\*"/);
  assert.match(picker, /encodeSquareImage/);
});

test('NPC acompanhante segue o grupo quando o hex muda', () => {
  const g = defaultState();
  g.npcs.push({ id: 'rui', name: 'Rui', role: '', description: '', notes: '', hex: '0,0', status: 'Bem', infection: 'Saudável', disposition: 'Neutro', skills: [], active: true, accompaniesParty: true });
  assert.equal(hexActions.performHexAction(g, '1,0', { type: 'travel' }).ok, true);
  assert.equal(g.npcs[0].hex, '1,0');
});

test('144 pares de dualidade: críticos, Hope/Fear, recursos e dificuldade', () => {
  const counts = { critical: 0, hope: 0, fear: 0 };
  for (let hopeDie=1; hopeDie<=12; hopeDie++) for (let fearDie=1; fearDie<=12; fearDie++) {
    const roll = resolveActionRoll({ hopeDie, fearDie, trait: 2, experience: 0, other: -1, symptom: 0, edge: 'none', difficulty: 13 });
    assert.equal(roll.total, hopeDie + fearDie + 1);
    assert.equal(roll.success, hopeDie === fearDie || roll.total >= 13);
    counts[roll.critical ? 'critical' : roll.with === 'Hope' ? 'hope' : 'fear']++;
    const resources = resolveRollResources({ hope: 6, stress: 0, fear: 12, experienceCost: 0, reaction: false, outcome: roll });
    assert.equal(resources.hope, 6); assert.equal(resources.stress, 0); assert.equal(resources.fear, 12);
  }
  assert.deepEqual(counts, { critical:12, hope:66, fear:66 });
});

test('mestre pode revelar hex distante, nomear setor e substituir sem perder conteúdo', () => {
  const g = campaign();
  const distant = Object.entries(g.hexes).find(([, hex]) => hex.discovery === 'desconhecido');
  assert.ok(distant);
  const [id, hex] = distant;
  assert.equal(hex.sector, null);

  const point = { id:'ponto-remoto', name:'Farmácia', kind:'comércio', signal:'Placa caída', access:'', notes:'', revealed:false, searches:[] };
  const event = { id:'evento-remoto', text:'Sirenes ao longe', trigger:'ao entrar', revealed:false };
  hex.points.push(point); hex.events.push(event);

  const custom = assignCustomSector(g, id, '  Hospital   São Vicente  ');
  g.hexes[id].discovery = 'avistado';
  assert.equal(custom.name, 'Hospital São Vicente');
  assert.match(custom.id, /^custom-/);
  assert.equal(g.hexes[id].points[0].id, point.id);
  assert.equal(g.hexes[id].events[0].id, event.id);

  const customId = custom.id;
  const proceduralIdsBefore = new Set(sectorProfiles.map(profile => profile.id));
  assert.equal(proceduralIdsBefore.has(customId), false);

  const redrawn = redrawSector(g, id);
  g.hexes[id].discovery = 'explorado';
  assert.equal(proceduralIdsBefore.has(redrawn.id), true);
  assert.notEqual(redrawn.id, customId);
  assert.equal(g.hexes[id].points[0].name, 'Farmácia');
  assert.equal(g.hexes[id].events[0].text, 'Sirenes ao longe');
});

test('reiniciar cidade usa ação transacional do servidor em vez de edição local otimista', () => {
  const source = fs.readFileSync(require.resolve('../app/page.tsx'),'utf8');
  const route = fs.readFileSync(require.resolve('../app/api/campaign/actions/route.ts'),'utf8');
  assert.match(source,/type: "reset-city"/);
  assert.match(source,/await executeTeamAction/);
  assert.doesNotMatch(source,/preserved = resetCityPreservingSurvivors/);
  assert.match(route,/resetCityPreservingSurvivors/);
  assert.match(route,/payload\.type === "reset-city"/);
});

test('Ferramentas do mestre expõem revelação direta sem mostrar o controle na prévia', () => {
  const explorer = fs.readFileSync(require.resolve('../components/hex-explorer.tsx'), 'utf8');
  assert.match(explorer, /Revelação direta do mestre/);
  assert.match(explorer, /Sortear e revelar/);
  assert.match(explorer, /Definir nome/);
  assert.match(explorer, /Estado após revelar/);
  assert.match(explorer, /assignCustomSector/);
  assert.match(explorer, /redrawSector/);
  assert.match(explorer, /Substituir o setor deste hex/);
  assert.match(explorer, /pontos, eventos, buscas, infestação e anotações permanecem registrados/);
  assert.match(explorer, /!playerPreview && <>/);
});

test('mapa: setores só são fixados na descoberta e permanecem após salvar e reabrir', () => {
  const g = campaign(); assert.equal(g.shelter.hex, null);
  const unknown = Object.entries(g.hexes).filter(([,hex]) => hex.discovery === 'desconhecido');
  assert.ok(unknown.length > 0); assert.ok(unknown.every(([,hex]) => hex.sector === null));
  for (const key of Object.keys(g.hexes)) {
    const first = revealSector(g, key); assert.deepEqual(revealSector(g, key), first);
  }
  assert.equal(new Set(Object.values(g.hexes).map(hex => hex.sector.id)).size, Object.keys(g.hexes).length);
  assert.deepEqual(preserveKnownSectors(JSON.parse(JSON.stringify(g))), g);
});

test('busca: presença, tempo, objetivo e setor já vasculhado são verificados sem perder recursos', () => {
  const g = campaign();
  const point = { id:'mercado', name:'Mercado', kind:'comércio', signal:'Porta aberta', access:'', notes:'', revealed:true, searches:[] };
  g.hexes['0,0'].points.push(point);
  const input = { hex:'0,0', pointId:point.id, sector:'Depósito dos fundos', what:'Comida para a viagem', result:'Duas latas intactas', minutes:30, mode:'specific' };
  let before = JSON.stringify(g);
  assert.equal(exploration.recordSearch(g, {...input, what:''}), false);
  assert.equal(exploration.recordSearch(g, {...input, pointId:'desaparecido'}), false);
  assert.equal(JSON.stringify(g), before);
  g.partyHex = '1,0'; before = JSON.stringify(g);
  assert.equal(exploration.recordSearch(g,input), false); assert.equal(JSON.stringify(g),before);
  g.partyHex = '0,0';
  assert.equal(exploration.recordSearch(g,input), true); assert.equal(g.minutes,510); assert.equal(point.searches.length,1);
  before = JSON.stringify(g);
  assert.equal(exploration.recordSearch(g,{...input, sector:' depósito  dos FUNDOS '}),false);
  assert.equal(JSON.stringify(g),before);
  const open = {...input, sector:'Balcão', mode:'open', table:content.lootTables[0].name, roll:12};
  assert.equal(exploration.recordSearch(g,open),true); assert.equal(point.searches[1].roll,12);
  g.minutes = 1430; before = JSON.stringify(g);
  assert.equal(exploration.recordSearch(g,{...input, sector:'Cozinha'}),false); assert.equal(JSON.stringify(g),before);
});

test('tabelas e criação: cobertura completa dos dados, 30 origens e habilidades centrais disponíveis', () => {
  for (const rows of Object.values(content.generators)) {
    assert.deepEqual(rows.map(row => row.roll).sort((a,b) => a-b), Array.from({length:100},(_,i) => i+1));
  }
  for (const table of content.lootTables) assert.equal(table.entries.length,12,table.name);
  assert.equal(content.origins.length,30);
  for (const archetype of content.archetypes) {
    const s = survivor(); s.archetype = archetype.name; s.specialty = archetype.specialties[0].name;
    assert.equal(survivorStats(s).hp,archetype.hp); assert.ok(archetype.hopeFeature.length > 10,archetype.name);
    for (const specialty of archetype.specialties) assert.ok(specialty.effect.length > 5,specialty.name);
  }
});

test('duas porções pessoais são livres e excedentes ocupam grupos de até quatro', () => {
  const s = survivor();
  s.inventory = [];
  s.food = 2; s.water = 2;
  let stats = survivorStats(s);
  assert.equal(stats.load.food, 0);
  assert.equal(stats.load.water, 0);

  s.food = 3; s.water = 3;
  stats = survivorStats(s);
  assert.equal(stats.load.food, 1);
  assert.equal(stats.load.water, 1);

  s.food = 6; s.water = 6;
  stats = survivorStats(s);
  assert.equal(stats.load.food, 1);
  assert.equal(stats.load.water, 1);

  s.food = 7; s.water = 7;
  stats = survivorStats(s);
  assert.equal(stats.load.food, 2);
  assert.equal(stats.load.water, 2);
});

test('dois bolsos aceitam objetos compactos e conservam o item ao guardar', () => {
  const s = survivor();
  const radio = item('Rádio portátil');
  const alicate = item('Alicate');
  const crowbar = item('Pé de cabra');
  s.inventory.push(radio, alicate, crowbar);

  assert.ok(inventory.compatibleSlots(radio).includes('pocket1'));
  assert.ok(inventory.compatibleSlots(radio).includes('pocket2'));
  assert.ok(inventory.compatibleSlots(alicate).includes('pocket1'));
  assert.equal(inventory.compatibleSlots(crowbar).includes('pocket1'), false);

  assert.equal(inventory.equipItem(s, radio.id, 'pocket1'), true);
  assert.equal(inventory.equipItem(s, alicate.id, 'pocket2'), true);
  assert.equal(s.pocket1, 'Rádio portátil');
  assert.equal(s.pocket2, 'Alicate');
  assert.equal(inventory.stowSlot(s, 'pocket1'), true);
  assert.equal(s.pocket1, '');
  assert.ok(s.inventory.some(entry => entry.name === 'Rádio portátil'));
});

test('traje vestido, carrinho conduzido e cassetete curto seguem a carga descrita no catálogo', () => {
  const s = survivor(); s.inventory = [];
  const outfit = item('Capa de chuva leve');
  const cart = item('Carrinho dobrável');
  const baton = item('Cassetete curto');
  const crowbar = item('Pé de cabra');
  s.inventory.push(outfit, cart, baton, crowbar);
  const baseCapacity = survivorStats(s).capacity;

  assert.ok(inventory.compatibleSlots(outfit).includes('outfit'));
  assert.equal(inventory.compatibleSlots(cart).includes('transport'), false);
  assert.ok(inventory.compatibleSlots(baton).includes('pocket1'));

  assert.equal(inventory.equipItem(s, outfit.id, 'outfit'), true);
  assert.equal(s.outfit, 'Capa de chuva leve');

  assert.equal(inventory.deployCart(s, cart.id), true);
  const active = inventory.activeCart(s);
  assert.ok(active);
  assert.equal(s.primary, '');
  assert.equal(s.secondary, '');
  assert.equal(survivorStats(s).capacity, baseCapacity);
  assert.equal(survivorStats(s).cart.capacity, 4);
  assert.equal(inventory.equipItem(s, baton.id, 'primary'), false);

  assert.equal(inventory.storeInCart(s, crowbar.id, 1), true);
  assert.equal(inventory.cartStoredLoad(active.cartItems), 1);
  assert.equal(survivorStats(s).cart.carried, 1);
  assert.equal(inventory.foldCart(s, active.id), false);
  assert.equal(inventory.removeFromCart(s, active.id, active.cartItems[0].id, 1), true);
  assert.equal(inventory.foldCart(s, active.id), true);
  assert.equal(s.inventory.find(entry => entry.id === active.id).cartDeployed, false);

  assert.equal(inventory.stowSlot(s, 'outfit'), true);
  assert.ok(s.inventory.some(entry => entry.name === 'Capa de chuva leve'));
});

test('ações contextuais abrem, carregam e esvaziam o carrinho sem slot de transporte', () => {
  const g = campaign(); const ana = g.survivors[0];
  ana.inventory = [item('Carrinho dobrável'), item('Pé de cabra')];
  const cart = ana.inventory.find(entry => entry.name === 'Carrinho dobrável');
  const crowbar = ana.inventory.find(entry => entry.name === 'Pé de cabra');

  let options = itemActions.itemActionOptions(g, ana.id, cart, false);
  assert.equal(options.canDeployCart, true);
  let result = itemActions.performItemAction(g, ana.id, cart.id, { type: 'deploy-cart' });
  assert.equal(result.ok, true);

  options = itemActions.itemActionOptions(g, ana.id, crowbar, false);
  assert.equal(options.canStoreInCart, true);
  assert.equal(options.slots.includes('primary'), false);
  assert.equal(options.slots.includes('secondary'), false);
  result = itemActions.performItemAction(g, ana.id, crowbar.id, { type: 'cart-store', quantity: 1 });
  assert.equal(result.ok, true);

  const active = inventory.activeCart(ana);
  assert.ok(active);
  assert.equal(active.cartItems.length, 1);
  result = itemActions.performItemAction(g, ana.id, active.id, { type: 'cart-remove', nestedItemId: active.cartItems[0].id, quantity: 1 });
  assert.equal(result.ok, true);
  result = itemActions.performItemAction(g, ana.id, active.id, { type: 'fold-cart' });
  assert.equal(result.ok, true);
});

test('ataque desarmado usa Força ou Acuidade, Proficiência d4 e não consome munição', () => {
  const profile = equipment.unarmedAttack;
  assert.equal(profile.name, 'Ataque desarmado');
  assert.equal(profile.damage, 'd4');
  assert.equal(profile.range, 'Corpo a corpo');
  assert.equal(profile.trait, 'Força');

  const g = campaign(); const ana = g.survivors[0];
  ana.primary = ''; ana.secondary = ''; ana.proficiency = 3; g.noise = 0;
  const resources = combatResources.attackResourceState(g, ana, profile.name, profile.noise);
  assert.equal(resources.ammoType, null);
  assert.equal(resources.ammoReady, true);
  assert.equal(resources.spendsAmmo, false);
  assert.equal(resources.noise, 0);
  assert.equal(combatResources.applyAttackResources(g, ana.id, profile.name, profile.noise).ok, true);
  assert.equal(g.noise, 0);

  const formula = parseWeaponDamage(profile.damage);
  assert.deepEqual(formula, { die: 4, flat: 0 });
  const damage = resolveWeaponDamage([1, 2, 4], formula.die, formula.flat, 0, false);
  assert.equal(damage.total, 7);

  const dialog = fs.readFileSync(require.resolve('../components/roll-dialog.tsx'), 'utf8');
  const panel = fs.readFileSync(require.resolve('../components/survivor-panel.tsx'), 'utf8');
  assert.match(dialog, /weapon\?: "primary" \| "secondary" \| "unarmed"/);
  assert.match(dialog, /Atributo do ataque desarmado/);
  assert.match(dialog, /value: "Força"/);
  assert.match(dialog, /value: "Finesse"/);
  assert.match(dialog, /label: "Ataque desarmado"/);
  assert.match(panel, /Ataque desarmado/);
  assert.match(panel, /weapon: "unarmed"/);
  assert.match(panel, /quickAttack\.slot/);
});

test('pá dobrável pode ser empunhada usando os dados de Pá curta', () => {
  const s = survivor(); s.inventory = [item('Pá dobrável')];
  const shovel = s.inventory[0];
  assert.ok(inventory.compatibleSlots(shovel).includes('primary'));
  assert.equal(inventory.equipItem(s, shovel.id, 'primary'), true);
  assert.equal(s.primary, 'Pá dobrável');
  const weapon = equipment.getPrimary(s.primary);
  assert.ok(weapon);
  assert.equal(weapon.name, 'Pá curta');
  assert.equal(weapon.damage, 'd10+1');
});

test('água insegura exige método de tratamento e pastilhas são consumidas', () => {
  const g = campaign(); const ana = g.survivors[0];
  ana.inventory = [item('Água de chuva coletada')];
  const rain = ana.inventory[0];
  let check = inventory.provisionPreparationCheck(g, ana.id, rain, 1);
  assert.equal(check.ok, false);

  ana.inventory.push(item('Pastilhas de purificação'));
  check = inventory.provisionPreparationCheck(g, ana.id, rain, 1);
  assert.equal(check.ok, true);
  const prepared = inventory.prepareProvisionItem(g, ana.id, rain.id, 1);
  assert.ok(prepared);
  assert.equal(ana.inventory.some(entry => entry.name === 'Pastilhas de purificação'), false);
  assert.equal(require('../lib/provision-items.ts').provisionItemInfo(rain).ready, true);
});

test('cozinhar alimento complexo exige água, panela e calor e consome os recursos', () => {
  const g = campaign(); const ana = g.survivors[0];
  ana.water = 1;
  ana.inventory = [item('Arroz cru'), item('Panela leve'), item('Fogareiro'), item('Combustível (1 unidade)', 1, 'Suprimentos abstratos')];
  const rice = ana.inventory.find(entry => entry.name === 'Arroz cru');
  const check = inventory.provisionPreparationCheck(g, ana.id, rice, 1);
  assert.equal(check.ok, true);
  assert.ok(inventory.prepareProvisionItem(g, ana.id, rice.id, 1));
  assert.equal(ana.water, 0);
  assert.equal(ana.inventory.some(entry => entry.name === 'Combustível (1 unidade)'), false);
});

test('disparos comprometem uma unidade física por tipo e a troca de cena consome', () => {
  const g = campaign(); const a = g.survivors[0];
  a.primary = 'Pistola'; a.inventory = [item('Munição de Pistola', 2), item('Munição de Carabina', 1)];
  g.scene = 3; g.noise = 0;
  let state = combatResources.attackResourceState(g, a, 'Pistola', '+2');
  assert.equal(state.ammoReady, true); assert.equal(state.spendsAmmo, true);
  assert.equal(combatResources.applyAttackResources(g, a.id, 'Pistola', '+2').ok, true);
  assert.equal(require('../lib/game.ts').ammunitionCount(a.inventory, 'Pistola'), 2);
  assert.equal(require('../lib/game.ts').ammunitionCount(a.inventory, 'Pistola', true), 1);
  assert.equal(a.inventory.find(x => x.ammunitionType === 'Pistola').committedAmmo, 1);
  assert.equal(g.noise, 2);
  assert.equal(combatResources.applyAttackResources(g, a.id, 'Pistola', '+2').ok, true);
  assert.equal(a.inventory.find(x => x.ammunitionType === 'Pistola').committedAmmo, 1);
  assert.equal(g.noise, 4);

  a.primary = 'Carabina';
  assert.equal(combatResources.applyAttackResources(g, a.id, 'Carabina', '+3').ok, true);
  assert.equal(require('../lib/game.ts').ammunitionCount(a.inventory, 'Carabina', true), 0);
  assert.equal(g.noise, 5);
  a.primary = 'Pistola';
  assert.equal(combatResources.attackResourceState(g, a, 'Pistola', '+2').covered, true);

  abilities.beginScene(g);
  assert.equal(g.scene, 4);
  assert.equal(require('../lib/game.ts').ammunitionCount(a.inventory, 'Pistola'), 1);
  assert.equal(require('../lib/game.ts').ammunitionCount(a.inventory, 'Carabina'), 0);
  assert.equal(a.inventory.some(x => x.committedAmmo), false);
  assert.equal(combatResources.attackResourceState(g, a, 'Pistola', '+2').covered, false);
});

test('caixa clínica vira Medicamentos sem apagar o estojo reutilizável', () => {
  const g = campaign(); const ana = g.survivors[0];
  ana.inventory = [item('Caixa clínica completa')];
  const box = ana.inventory[0];
  const result = itemActions.performItemAction(g, ana.id, box.id, { type: 'medication', quantity: 1 });
  assert.equal(result.ok, true);
  assert.equal(g.shelter.medications, 1);
  assert.ok(ana.inventory.some(entry => entry.name === 'Kit médico de campo'));
});

test('consumíveis genéricos somem após uso e itens reutilizáveis permanecem', () => {
  const g = campaign(); const ana = g.survivors[0];
  ana.inventory = [item('Sinalizador de mão'), item('Apito'), item('Kit de pilhas')];
  let signal = ana.inventory.find(entry => entry.name === 'Sinalizador de mão');
  let result = itemActions.performItemAction(g, ana.id, signal.id, { type: 'use', quantity: 1 });
  assert.equal(result.ok, true);
  assert.equal(g.noise, 2);
  assert.equal(ana.inventory.some(entry => entry.name === 'Sinalizador de mão'), false);

  const whistle = ana.inventory.find(entry => entry.name === 'Apito');
  result = itemActions.performItemAction(g, ana.id, whistle.id, { type: 'use', quantity: 1 });
  assert.equal(result.ok, true);
  assert.equal(g.noise, 3);
  assert.ok(ana.inventory.some(entry => entry.name === 'Apito'));

  ana.inventory.push(item('Telefone descarregado'));
  const batteries = ana.inventory.find(entry => entry.name === 'Kit de pilhas');
  const phone = ana.inventory.find(entry => entry.name === 'Telefone descarregado');
  assert.equal(inventory.batteryStateFor(phone), 'Descarregada');
  result = itemActions.performItemAction(g, ana.id, batteries.id, { type: 'recharge', targetId: phone.id });
  assert.equal(result.ok, true);
  assert.equal(ana.inventory.some(entry => entry.name === 'Kit de pilhas'), false);
  assert.equal(inventory.batteryStateFor(phone), 'Carregada');
});

test('galão transporta água sem carga duplicada e mantém o recipiente ao consumir', () => {
  const g = campaign(); const ana = g.survivors[0];
  ana.water = 6;
  ana.inventory = [item('Galão vazio')];
  const gallon = ana.inventory[0];

  let options = inventory.reusableContainerOptions(g, ana.id, gallon);
  assert.equal(options.waterAvailable, 6);
  assert.equal(options.waterCapacity, 4);
  const filled = inventory.fillReusableContainer(g, ana.id, gallon.id, 'water', 4);
  assert.ok(filled);
  assert.equal(ana.water, 2);
  assert.equal(filled.storedResource, 'water');
  assert.equal(filled.storedAmount, 4);
  assert.equal(filled.load, 1);
  assert.equal(require('../lib/provision-items.ts').provisionItemInfo(filled).remaining, 4);

  const consumed = inventory.consumeProvisionPortionFromItems(ana.inventory, filled.id);
  assert.ok(consumed);
  assert.equal(filled.storedAmount, 3);
  assert.ok(ana.inventory.some(entry => entry.id === filled.id));

  g.shelter.hex = g.partyHex;
  assert.equal(inventory.emptyReusableContainerToReserves(g, ana.id, filled.id), true);
  assert.equal(g.shelter.water, 3);
  assert.equal(filled.storedResource, undefined);
  assert.equal(filled.storedAmount, undefined);
  assert.equal(filled.load, 1);
});

test('galão não mistura recursos, combustível ocupa uma unidade e conteúdo próprio não completa água', () => {
  const g = campaign(); const ana = g.survivors[0];
  ana.water = 2;
  ana.inventory = [item('Galão vazio'), item('Combustível (1 unidade)', 1, 'Suprimentos abstratos')];
  const gallon = ana.inventory.find(entry => entry.name === 'Galão vazio');

  assert.ok(inventory.fillReusableContainer(g, ana.id, gallon.id, 'water', 2));
  assert.equal(ana.water, 0);
  assert.equal(inventory.reusableContainerOptions(g, ana.id, gallon).waterAvailable, 0);
  assert.equal(inventory.fillReusableContainer(g, ana.id, gallon.id, 'water', 1), null);
  assert.equal(inventory.fillReusableContainer(g, ana.id, gallon.id, 'fuel', 1), null);

  g.shelter.hex = g.partyHex;
  assert.equal(inventory.emptyReusableContainerToReserves(g, ana.id, gallon.id), true);
  assert.equal(g.shelter.water, 2);

  assert.ok(inventory.fillReusableContainer(g, ana.id, gallon.id, 'fuel', 1));
  assert.equal(gallon.storedResource, 'fuel');
  assert.equal(gallon.storedAmount, 1);
  assert.equal(ana.inventory.some(entry => entry.name === 'Combustível (1 unidade)'), false);
  assert.equal(inventory.fillReusableContainer(g, ana.id, gallon.id, 'fuel', 1), null);
});

test('galões com conteúdos diferentes não são empilhados', () => {
  const empty = item('Galão vazio');
  const water = item('Galão vazio');
  water.storedResource = 'water'; water.storedAmount = 4;
  const items = [empty];
  inventory.addStack(items, water);
  assert.equal(items.length, 2);
  assert.equal(items.some(entry => entry.storedAmount === 4), true);
});


test('alimentos e água prontos são identificados para contagem automática de porções', () => {
  const cereal = item('Barra de cereal');
  const biscuits = item('Pacote de bolachas');
  const water = item('Garrafa de água lacrada');
  const uncertainWater = item('Água de cisterna tratada');
  const oats = item('Aveia');

  assert.equal(inventory.automaticProvision(cereal).type, 'food');
  assert.equal(inventory.automaticProvision(cereal).portions, 1);
  assert.equal(inventory.automaticProvision(biscuits).portions, 2);
  assert.equal(inventory.automaticProvision(water).type, 'water');
  assert.equal(inventory.automaticProvision(water).portions, 1);
  assert.equal(inventory.automaticProvision(uncertainWater), null);
  assert.equal(inventory.automaticProvision(oats), null);
});

test('ações contextuais reutilizam as mesmas regras de inventário', () => {
  const g = campaign(); const [ana, bia] = g.survivors;
  ana.food = 0; ana.water = 0; bia.food = 0; bia.water = 0;
  ana.inventory = [item('Pacote de bolachas', 2), item('Rádio portátil')];

  const biscuits = ana.inventory.find(entry => entry.name === 'Pacote de bolachas');
  let result = itemActions.performItemAction(g, ana.id, biscuits.id, { type: 'consume', consumerId: ana.id });
  assert.equal(result.ok, true);
  assert.equal(require('../lib/provision-items.ts').physicalProvisionPortions(ana.inventory, 'food', true), 3);

  const radio = ana.inventory.find(entry => entry.name === 'Rádio portátil');
  const options = itemActions.itemActionOptions(g, ana.id, radio, false);
  assert.ok(options.slots.includes('pocket1'));
  result = itemActions.performItemAction(g, ana.id, radio.id, { type: 'equip', slot: 'pocket1' });
  assert.equal(result.ok, true);
  assert.equal(ana.pocket1, 'Rádio portátil');

  const remaining = ana.inventory.find(entry => entry.name === 'Pacote de bolachas' && !entry.opened);
  result = itemActions.performItemAction(g, ana.id, remaining.id, { type: 'transfer', targetId: bia.id, quantity: 1 });
  assert.equal(result.ok, true);
  assert.ok(bia.inventory.some(entry => entry.name === 'Pacote de bolachas'));
});

test('menu contextual respeita preparo, custos materiais e descarte', () => {
  const g = campaign(); const ana = g.survivors[0];
  ana.food = 0; ana.water = 1; ana.inventory = [item('Aveia'), item('Pé de cabra')];

  const oats = ana.inventory.find(entry => entry.name === 'Aveia');
  let result = itemActions.performItemAction(g, ana.id, oats.id, { type: 'prepare', quantity: 1 });
  assert.equal(result.ok, true);
  assert.equal(ana.water, 0);
  assert.equal(require('../lib/provision-items.ts').provisionItemInfo(ana.inventory.find(entry => entry.name === 'Aveia')).ready, true);

  const crowbar = ana.inventory.find(entry => entry.name === 'Pé de cabra');
  result = itemActions.performItemAction(g, ana.id, crowbar.id, { type: 'discard', quantity: 1 });
  assert.equal(result.ok, true);
  assert.equal(ana.inventory.some(entry => entry.name === 'Pé de cabra'), false);
});

test('ações contextuais de hex respeitam avistamento, viagem e relógio', () => {
  const g = campaign();
  const start = content.hexes.find(hex => `${hex.q},${hex.r}` === g.partyHex);
  assert.ok(start);
  const neighbor = content.hexes.find(hex => require('../lib/game.ts').hexDistance(hex.q-start.q, hex.r-start.r) === 1);
  assert.ok(neighbor);
  const id = `${neighbor.q},${neighbor.r}`;
  g.hexes[id].discovery = 'desconhecido';
  g.hexes[id].sector = null;
  const before = g.minutes;

  let result = hexActions.performHexAction(g, id, { type:'observe' });
  assert.equal(result.ok, true);
  assert.equal(g.hexes[id].discovery, 'avistado');
  const hours = g.hexes[id].routeHours;

  result = hexActions.performHexAction(g, id, { type:'travel' });
  assert.equal(result.ok, true);
  assert.equal(g.partyHex, id);
  assert.equal(g.hexes[id].discovery, 'explorado');
  assert.equal(g.minutes, before + hours * 60);
});

test('ações contextuais de hex controlam infestação e abrigo sem pular regras', () => {
  const g = campaign();
  const id = g.partyHex;
  g.hexes[id].discovery = 'explorado';

  let result = hexActions.performHexAction(g, id, { type:'infestation', value:4 });
  assert.equal(result.ok, true);
  assert.equal(g.hexes[id].infestation, 4);

  result = hexActions.performHexAction(g, id, { type:'infestation', value:null });
  assert.equal(result.ok, true);
  assert.equal(g.hexes[id].infestation, null);

  g.shelter.hex = null;
  result = hexActions.performHexAction(g, id, { type:'establish' });
  assert.equal(result.ok, true);
  assert.equal(g.shelter.hex, id);

  result = hexActions.performHexAction(g, id, { type:'establish' });
  assert.equal(result.ok, false);
});

test('menu de sobrevivente pode transferir item pelas regras centrais já usadas no inventário', () => {
  const g = campaign(); const [ana, bia] = g.survivors;
  ana.inventory = [item('Rádio portátil', 2)];
  const radio = ana.inventory[0];
  const options = itemActions.itemActionOptions(g, ana.id, radio, false);
  assert.ok(options.targets.some(target => target.value === bia.id));

  const result = itemActions.performItemAction(g, ana.id, radio.id, { type:'transfer', targetId:bia.id, quantity:1 });
  assert.equal(result.ok, true);
  assert.equal(ana.inventory.reduce((sum, entry) => sum + entry.qty, 0), 1);
  assert.equal(bia.inventory.some(entry => entry.name === 'Rádio portátil'), true);
});


test('movimento individual divide e reúne grupos sem perder a posição principal', () => {
  const g = campaign(); const [ana, bia] = g.survivors;
  const start = content.hexes.find(hex => `${hex.q},${hex.r}` === g.partyHex);
  const neighbor = content.hexes.find(hex => require('../lib/game.ts').hexDistance(hex.q-start.q, hex.r-start.r) === 1);
  assert.ok(neighbor);
  const destination = `${neighbor.q},${neighbor.r}`;
  const before = g.minutes;

  let result = hexActions.moveSurvivors(g, destination, [ana.id]);
  assert.equal(result.ok, true);
  assert.equal(require('../lib/game.ts').survivorHex(g, ana), destination);
  assert.equal(require('../lib/game.ts').survivorHex(g, bia), '0,0');
  assert.equal(g.partyHex, '0,0');
  assert.equal(g.minutes, before + g.hexes[destination].routeHours * 60);

  const afterAna = g.minutes;
  result = hexActions.moveSurvivors(g, destination, [bia.id]);
  assert.equal(result.ok, true);
  assert.equal(require('../lib/game.ts').survivorHex(g, bia), destination);
  assert.equal(g.partyHex, destination);
  assert.equal(require('../lib/game.ts').survivorsAtHex(g, destination).length, 2);
  assert.equal(g.minutes, afterAna + g.hexes[destination].routeHours * 60);
  assert.doesNotMatch(result.message, /em paralelo/);
});

test('um subgrupo pode seguir viagem enquanto outro permanece no hex anterior', () => {
  const g = campaign(); const [ana, bia] = g.survivors;
  const first = content.hexes.find(hex => require('../lib/game.ts').hexDistance(hex.q, hex.r) === 1);
  const firstId = `${first.q},${first.r}`;
  assert.equal(hexActions.moveSurvivors(g, firstId, [ana.id, bia.id]).ok, true);

  const second = content.hexes.find(hex => {
    const id = `${hex.q},${hex.r}`;
    return id !== '0,0' && id !== firstId
      && require('../lib/game.ts').hexDistance(hex.q-first.q, hex.r-first.r) === 1;
  });
  assert.ok(second);
  const secondId = `${second.q},${second.r}`;
  if (g.hexes[secondId].discovery === 'desconhecido') {
    require('../lib/sectors.ts').revealSector(g, secondId);
    g.hexes[secondId].discovery = 'avistado';
  }
  const result = hexActions.moveSurvivors(g, secondId, [ana.id]);
  assert.equal(result.ok, true);
  assert.equal(require('../lib/game.ts').survivorHex(g, ana), secondId);
  assert.equal(require('../lib/game.ts').survivorHex(g, bia), firstId);
  assert.equal(require('../lib/game.ts').survivorPositionGroups(g).length, 2);
});

test('campanhas antigas sem posição individual continuam usando partyHex', () => {
  const g = campaign(); const [ana, bia] = g.survivors;
  assert.equal(ana.hex, undefined); assert.equal(bia.hex, undefined);
  assert.equal(require('../lib/game.ts').survivorHex(g, ana), g.partyHex);
  g.partyHex = '1,0';
  assert.equal(require('../lib/game.ts').survivorHex(g, ana), '1,0');
  assert.equal(require('../lib/game.ts').survivorHex(g, bia), '1,0');
});

test('transferências e reservas exigem sobreviventes no mesmo local', () => {
  const g = campaign(); const [ana, bia] = g.survivors;
  g.shelter.hex = '0,0';
  ana.hex = '1,0'; bia.hex = '0,0';
  const radio = item('Rádio portátil'); ana.inventory.push(radio);
  const tool = item('Alicate'); bia.inventory.push(tool);

  assert.equal(inventory.atSharedStorage(g, ana.id), false);
  assert.equal(inventory.atSharedStorage(g, bia.id), true);
  assert.equal(inventory.transferItem(g, ana.id, bia.id, radio.id, 1), false);
  assert.equal(inventory.transferItem(g, bia.id, 'shared', tool.id, 1), true);

  ana.food = 2; bia.food = 0;
  assert.equal(inventory.transferProvisions(g, ana.id, bia.id, 'food', 1), false);
  assert.equal(inventory.transferProvisions(g, 'shared', ana.id, 'food', 1), false);
});

test('anoitecer conta nas reservas apenas quem está fisicamente na base', () => {
  const g = campaign(); const [ana, bia] = g.survivors;
  g.shelter.hex = '0,0'; g.shelter.residents = 1;
  ana.hex = '0,0'; bia.hex = '1,0';
  assert.deepEqual(survival.eveningNeeds(g), { food: 2, water: 2 });
  ana.foodConsumedDay = g.day;
  assert.deepEqual(survival.eveningNeeds(g), { food: 1, water: 2 });
});

test('depósito antigo só pode ser retirado por sobrevivente presente naquele hex', () => {
  const g = campaign(); const [ana, bia] = g.survivors;
  g.formerShelters = [{ ...structuredClone(g.shelter), hex:'1,0', food:2, inventory:[] }];
  ana.hex = '1,0'; bia.hex = '0,0';
  assert.equal(require('../lib/game.ts').recoverFormerStock(g, '1,0', bia.id, 'food', 1), false);
  assert.equal(require('../lib/game.ts').recoverFormerStock(g, '1,0', ana.id, 'food', 1), true);
  assert.equal(ana.food, 2);
});

test('jogador não pode alterar a própria posição diretamente pelo payload da ficha', () => {
  const g = campaign(); const ana = g.survivors[0];
  const before = structuredClone(ana);
  const after = { ...structuredClone(ana), hex:'1,0' };
  assert.equal(collaboration.applyPlayerChange(g, ana.id, before, after, 0, []), null);
});


test('descanso entre grupos separados só permite alvos no mesmo hex', () => {
  const g = campaign(); const [ana, bia] = g.survivors;
  ana.hex = '0,0'; bia.hex = '1,0';
  const invalid = abilities.resolveGroupRest(g, 'short', [
    { survivorId: ana.id, choices: [{ action:'stress', targetId:bia.id }, { action:'prepare', targetId:ana.id }] },
    { survivorId: bia.id, choices: [{ action:'stress', targetId:bia.id }, { action:'prepare', targetId:bia.id }] },
  ], () => 2);
  assert.equal(invalid.ok, false);
});

test('preparo em descanso só recebe bônus de equipe com sobreviventes no mesmo hex', () => {
  const g = campaign(); const [ana, bia] = g.survivors;
  ana.hex = '0,0'; bia.hex = '1,0';
  ana.hope = 2; bia.hope = 2;
  const result = abilities.resolveGroupRest(g, 'short', [
    { survivorId: ana.id, choices: [{ action:'prepare', targetId:ana.id }, { action:'fiction', targetId:ana.id }] },
    { survivorId: bia.id, choices: [{ action:'prepare', targetId:bia.id }, { action:'fiction', targetId:bia.id }] },
  ], () => 1);
  assert.equal(result.ok, true);
  assert.equal(ana.hope, 3);
  assert.equal(bia.hope, 3);
});

test('habilidade limitada por local usa o hex real do sobrevivente', () => {
  const g = campaign(); const ana = g.survivors[0];
  ana.hex = '0,0';
  const effect = 'Uma vez por hex, faça algo útil.';
  assert.equal(abilities.recordAbilityUse(g, ana.id, 'teste-local', 'Teste local', effect, 'free'), true);
  assert.equal(abilities.abilityAvailable(g, ana.id, 'teste-local', effect), false);
  ana.hex = '1,0';
  assert.equal(abilities.abilityAvailable(g, ana.id, 'teste-local', effect), true);
});


test('encerrar o dia é independente de descanso longo', () => {
  const g = campaign(); const [ana, bia] = g.survivors;
  ana.hp = 2; bia.stress = 2;
  const dayBeforeRest = g.day;
  const minutesBeforeRest = g.minutes;

  const rest = abilities.resolveGroupRest(g, 'long', [
    { survivorId: ana.id, choices: [{ action:'hp-full', targetId:ana.id }, { action:'fiction', targetId:ana.id }] },
    { survivorId: bia.id, choices: [{ action:'stress-full', targetId:bia.id }, { action:'fiction', targetId:bia.id }] },
  ], () => 1);
  assert.equal(rest.ok, true);
  assert.equal(g.day, dayBeforeRest);
  assert.equal(g.minutes, minutesBeforeRest + 360);
  assert.equal(rest.minutes, 360);

  const shortRestBeforeDayClose = g.shortRest;
  const longRestBeforeDayClose = g.longRest;
  assert.equal(survival.closeDay(g, 0, 0, dayBeforeRest), true);
  assert.equal(g.day, dayBeforeRest + 1);
  assert.equal(g.minutes, 480);
  assert.equal(g.shortRest, shortRestBeforeDayClose);
  assert.equal(g.longRest, longRestBeforeDayClose);
});


test('encerramento do dia monta fontes individuais por posição e consumo já registrado', () => {
  const g = campaign(); const [ana, bia] = g.survivors;
  g.shelter.hex = '0,0'; g.shelter.residents = 1; g.shelter.food = 6; g.shelter.water = 6;
  ana.hex = '0,0'; bia.hex = '1,0';
  ana.foodConsumedDay = g.day;
  bia.food = 1; bia.water = 0;

  const plan = survival.defaultDayClosePlan(g);
  const anaPlan = plan.survivors.find(row => row.survivorId === ana.id);
  const biaPlan = plan.survivors.find(row => row.survivorId === bia.id);
  assert.equal(anaPlan.food, 'already');
  assert.equal(anaPlan.water, 'shared');
  assert.equal(biaPlan.food, 'personal');
  assert.equal(biaPlan.water, 'none');
  assert.equal(plan.residentsFood, 1);
  assert.equal(plan.residentsWater, 1);
});

test('encerrar dia consome porções pessoais em campo sem cobrar novamente quem já consumiu', () => {
  const g = campaign(); const [ana, bia] = g.survivors;
  g.shelter.hex = '0,0'; g.shelter.residents = 0; g.shelter.food = 2; g.shelter.water = 2;
  ana.hex = '0,0'; bia.hex = '1,0';
  ana.foodConsumedDay = g.day;
  bia.food = 1; bia.water = 1;

  const plan = {
    expectedDay: g.day, residentsFood: 0, residentsWater: 0,
    survivors: [
      { survivorId: ana.id, food:'already', water:'shared' },
      { survivorId: bia.id, food:'personal', water:'personal' },
    ],
  };
  const result = survival.closeDayWithPlan(g, plan);
  assert.equal(result.ok, true);
  assert.equal(result.deprivations.length, 0);
  assert.equal(g.shelter.food, 2);
  assert.equal(g.shelter.water, 1);
  assert.equal(bia.food, 0);
  assert.equal(bia.water, 0);
  assert.equal(ana.foodConsumedDay, 1);
  assert.equal(ana.waterConsumedDay, 1);
  assert.equal(bia.foodConsumedDay, 1);
  assert.equal(bia.waterConsumedDay, 1);
  assert.equal(g.day, 2);
});

test('encerramento registra privação nominal e impede uso remoto das reservas', () => {
  const g = campaign(); const [ana, bia] = g.survivors;
  g.shelter.hex = '0,0'; g.shelter.residents = 0; g.shelter.food = 5; g.shelter.water = 5;
  ana.hex = '0,0'; bia.hex = '1,0';

  const plan = {
    expectedDay: g.day, residentsFood: 0, residentsWater: 0,
    survivors: [
      { survivorId: ana.id, food:'other', water:'other' },
      { survivorId: bia.id, food:'shared', water:'other' },
    ],
  };
  const result = survival.closeDayWithPlan(g, plan);
  assert.equal(result.ok, true);
  assert.equal(g.shelter.food, 5);
  assert.ok(result.deprivations.some(row => row.survivorId === bia.id && row.resource === 'food' && row.reason === 'remote'));
  assert.ok(g.log.some(row => row.kind === 'privação' && row.actorId === bia.id && /sem registrar alimentação/.test(row.text)));
  assert.equal(bia.foodConsumedDay, undefined);
  assert.equal(bia.waterConsumedDay, 1);
});

test('moradores usam uma conta separada e faltas ficam registradas sem aplicar efeito automático', () => {
  const g = campaign(); const [ana, bia] = g.survivors;
  g.shelter.residents = 3; g.shelter.food = 1; g.shelter.water = 2;
  const plan = {
    expectedDay: g.day, residentsFood: 3, residentsWater: 3,
    survivors: [
      { survivorId: ana.id, food:'other', water:'other' },
      { survivorId: bia.id, food:'other', water:'other' },
    ],
  };
  const result = survival.closeDayWithPlan(g, plan);
  assert.equal(result.ok, true);
  assert.deepEqual(result.residentMissing, { food:2, water:1 });
  assert.equal(g.shelter.food, 0); assert.equal(g.shelter.water, 0);
  assert.ok(g.log.some(row => row.kind === 'privação' && /Moradores do abrigo/.test(row.text)));
  assert.equal(ana.stress, 0); assert.equal(bia.stress, 0);
});

test('encerramento prioriza provisão física perecível antes de porção solta durável', () => {
  const g = campaign();
  g.shelter.food = 1;
  g.shelter.provisionLots = [];
  g.shelter.inventory = [item('Fruta firme')];
  const fruitId = g.shelter.inventory[0].id;

  const used = survival.consumeBestProvision(g.shelter, 'food');
  assert.equal(used.consumed, 1);
  assert.equal(used.source, 'item');
  assert.equal(g.shelter.food, 1);
  assert.equal(g.shelter.inventory.some(entry => entry.id === fruitId), false);
});

test('consumo por item físico já registrado não é cobrado novamente ao encerrar o dia', () => {
  const g = campaign(); const [ana, bia] = g.survivors;
  ana.food = 0; ana.inventory = [item('Barra de cereal')];
  const cereal = ana.inventory[0];
  const consumed = inventory.consumeProvisionItem(g, ana.id, cereal.id, ana.id);
  assert.ok(consumed);
  assert.equal(ana.foodConsumedDay, g.day);

  g.shelter.food = 5; g.shelter.water = 5;
  const plan = survival.defaultDayClosePlan(g);
  assert.equal(plan.survivors.find(row => row.survivorId === ana.id).food, 'already');
  const beforeFood = g.shelter.food;
  const result = survival.closeDayWithPlan(g, plan);
  assert.equal(result.ok, true);
  assert.equal(g.shelter.food <= beforeFood, true);
  assert.equal(result.deprivations.some(row => row.survivorId === ana.id && row.resource === 'food'), false);
});

test('outra fonte satisfaz a necessidade sem gastar provisões', () => {
  const g = campaign(); const [ana, bia] = g.survivors;
  g.shelter.food = 4; g.shelter.water = 4;
  const plan = {
    expectedDay: g.day, residentsFood: 0, residentsWater: 0,
    survivors: [
      { survivorId: ana.id, food:'other', water:'other' },
      { survivorId: bia.id, food:'other', water:'other' },
    ],
  };
  const result = survival.closeDayWithPlan(g, plan);
  assert.equal(result.ok, true);
  assert.equal(result.deprivations.length, 0);
  assert.equal(g.shelter.food, 4); assert.equal(g.shelter.water, 4);
  assert.equal(ana.foodConsumedDay, 1); assert.equal(ana.waterConsumedDay, 1);
  assert.equal(bia.foodConsumedDay, 1); assert.equal(bia.waterConsumedDay, 1);
});

test('projetos persistentes derivam estado do abrigo, exigem operador e sobrevivem em snapshots', () => {
  const g = campaign();
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  g.shelter.parts = 2;
  const barricades = shelterProjects.createShelterProject('barricades');
  g.shelter.projects.push(barricades);
  assert.equal(shelterProjects.startProject(g.shelter, barricades), null);
  assert.equal(g.shelter.parts, 1);
  assert.equal(shelterProjects.advanceProject(barricades), true);
  assert.equal(shelterProjects.advanceProject(barricades), true);
  assert.equal(barricades.state, 'Concluído');
  assert.equal(shelterProjects.shelterMetrics(g.shelter).security, 2);

  const infirmary = shelterProjects.createShelterProject('infirmary');
  infirmary.state = 'Concluído'; infirmary.progress = infirmary.requiredProgress;
  const medic = { id: 'npc-medic', name: 'Luana', role: 'Enfermeira', description: '', notes: '', hex: '0,0', home: '0,0', status: 'Bem', infection: 'Saudável', disposition: 'Aliado', skills: ['Medicina'], active: true };
  g.shelter.projects.push(infirmary); g.npcs.push(medic);
  assert.equal(shelterProjects.projectOperational(g, g.shelter, infirmary), false);
  infirmary.responsibleId = medic.id;
  assert.equal(shelterProjects.projectOperational(g, g.shelter, infirmary), true);
  const previous = structuredClone(g.shelter);
  assert.equal(previous.projects.find(project => project.key === 'barricades').state, 'Concluído');
});


test('instalação física exige local, inclusive para projeto legado sem posição', () => {
  const g = campaign();
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  g.shelter.parts = 5;
  const workshop = shelterProjects.createShelterProject('electrical-workshop');
  g.shelter.projects.push(workshop);
  assert.match(shelterProjects.startProject(g.shelter, workshop), /Escolha um local/);
  assert.equal(shelterProjects.placeShelterProject(g.shelter, workshop, 'utility-a'), null);
  assert.equal(workshop.slotId, 'utility-a');
});

test('turno agendado não avança o relógio sozinho e conclui quando tempo externo alcança o fim', () => {
  const g = campaign();
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  g.shelter.parts = 5;
  const worker = { id:'clock-builder', name:'Iara', role:'Construtora', description:'', notes:'', hex:'0,0', home:'0,0', status:'Bem', infection:'Saudável', disposition:'Aliado', skills:['Construção'], active:true };
  g.npcs.push(worker);
  const barricades = shelterProjects.createShelterProject('barricades');
  barricades.responsibleId = worker.id;
  g.shelter.projects.push(barricades);
  assert.equal(shelterProjects.startProject(g.shelter, barricades), null);

  const before = g.minutes;
  const scheduled = shelterProjects.scheduleShelterWorkShift(g, barricades, 4);
  assert.equal(scheduled.ok, true);
  assert.equal(g.minutes, before);
  assert.ok(barricades.workShift);

  assert.equal(campaignTime.advanceCampaignTime(g, 120).ok, true);
  assert.equal(barricades.progress, 0);
  assert.ok(barricades.workShift);

  const result = campaignTime.advanceCampaignTime(g, 120);
  assert.equal(result.ok, true);
  assert.equal(barricades.state, 'Concluído');
  assert.equal(barricades.workShift, undefined);
  assert.equal(g.minutes, before + 240);
  assert.equal(result.completedWork.length, 1);
});

test('ajuste manual para frente também resolve turno programado', () => {
  const g = campaign();
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  g.shelter.parts = 5;
  const worker = { id:'manual-builder', name:'Lia', role:'Construtora', description:'', notes:'', hex:'0,0', home:'0,0', status:'Bem', infection:'Saudável', disposition:'Aliado', skills:['Construção'], active:true };
  g.npcs.push(worker);
  const barricades = shelterProjects.createShelterProject('barricades');
  barricades.responsibleId = worker.id;
  g.shelter.projects.push(barricades);
  shelterProjects.startProject(g.shelter, barricades);
  assert.equal(shelterProjects.scheduleShelterWorkShift(g, barricades, 4).ok, true);
  const target = g.minutes + 240;
  const result = campaignTime.setCampaignTime(g, target);
  assert.equal(result.ok, true);
  assert.equal(barricades.state, 'Concluído');
});

test('turno de construção avança obras simultâneas com equipes distintas e consome tempo', () => {
  const g = campaign();
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  g.shelter.parts = 5;
  const joao = { id:'builder-1', name:'João', role:'Pedreiro', description:'', notes:'', hex:'0,0', home:'0,0', status:'Bem', infection:'Saudável', disposition:'Aliado', skills:['Construção'], active:true };
  const bia = { id:'builder-2', name:'Bia', role:'Marceneira', description:'', notes:'', hex:'0,0', home:'0,0', status:'Bem', infection:'Saudável', disposition:'Aliado', skills:['Construção'], active:true };
  g.npcs.push(joao, bia);

  const barricades = shelterProjects.createShelterProject('barricades');
  const collector = shelterProjects.createShelterProject('rain-collector');
  barricades.responsibleId = joao.id;
  collector.responsibleId = bia.id;
  g.shelter.projects.push(barricades, collector);
  assert.equal(shelterProjects.startProject(g.shelter, barricades), null);
  assert.equal(shelterProjects.startProject(g.shelter, collector), null);

  const before = g.minutes;
  const result = shelterProjects.runShelterWorkShift(g, 4);
  assert.equal(result.ok, true);
  assert.equal(g.minutes, before + 240);
  assert.equal(barricades.state, 'Concluído');
  assert.equal(collector.state, 'Concluído');
  assert.equal(result.results.length, 2);
});

test('dependências, energia e desligamento manual controlam estruturas condicionais', () => {
  const g = campaign();
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  g.shelter.parts = 20; g.shelter.fuel = 10;

  const battery = shelterProjects.createShelterProject('battery-bank', 'utility-a');
  g.shelter.projects.push(battery);
  assert.match(shelterProjects.startProject(g.shelter, battery), /Requer uma destas estruturas/);
  g.shelter.projects.splice(g.shelter.projects.indexOf(battery), 1);

  const mechanic = { id:'mechanic', name:'Mara', role:'Mecânica', description:'', notes:'', hex:'0,0', home:'0,0', status:'Bem', infection:'Saudável', disposition:'Aliado', skills:['Mecânica'], active:true };
  g.npcs.push(mechanic);
  const generator = shelterProjects.createShelterProject('generator', 'utility-a');
  generator.state = 'Concluído'; generator.progress = generator.requiredProgress; generator.responsibleId = mechanic.id;
  const lighting = shelterProjects.createShelterProject('interior-lighting');
  lighting.state = 'Concluído'; lighting.progress = lighting.requiredProgress;
  const fridge = shelterProjects.createShelterProject('refrigeration', 'utility-b');
  fridge.state = 'Concluído'; fridge.progress = fridge.requiredProgress;
  g.shelter.projects.push(generator, lighting, fridge);

  let power = shelterProjects.shelterPower(g, g.shelter);
  assert.equal(power.production, 1);
  assert.equal(power.consumption, 2);
  assert.equal(power.balance, -1);
  assert.equal(shelterProjects.projectOperational(g, g.shelter, lighting), false);

  g.shelter.disabledProjectKeys = ['refrigeration'];
  power = shelterProjects.shelterPower(g, g.shelter);
  assert.equal(power.balance, 0);
  assert.equal(shelterProjects.projectOperational(g, g.shelter, lighting), true);
  assert.equal(shelterProjects.projectOperational(g, g.shelter, fridge), false);
});

test('reparo usa custo e progresso próprios sem apagar construção concluída', () => {
  const g = campaign();
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  g.shelter.parts = 5;
  const builder = { id:'repair-builder', name:'Ravi', role:'Construtor', description:'', notes:'', hex:'0,0', home:'0,0', status:'Bem', infection:'Saudável', disposition:'Aliado', skills:['Construção'], active:true };
  g.npcs.push(builder);

  const barricades = shelterProjects.createShelterProject('barricades');
  barricades.state = 'Concluído'; barricades.progress = barricades.requiredProgress; barricades.responsibleId = builder.id;
  g.shelter.projects.push(barricades);
  assert.equal(shelterProjects.markProjectDamaged(barricades), true);
  assert.equal(barricades.state, 'Danificado');
  const beforeParts = g.shelter.parts;
  assert.equal(shelterProjects.startRepair(g.shelter, barricades), null);
  assert.equal(g.shelter.parts, beforeParts); // dano leve (2/3) não consome Peças
  assert.equal(barricades.requiredRepairProgress, 1);
  assert.equal(barricades.progress, barricades.requiredProgress);
  const result = shelterProjects.runShelterWorkShift(g, 4);
  assert.equal(result.ok, true);
  assert.equal(barricades.state, 'Concluído');
  assert.equal(barricades.progress, barricades.requiredProgress);
});

test('instalações podem guardar posição física na planta do abrigo', () => {
  const infirmary = shelterProjects.createShelterProject('infirmary', 'room-b');
  assert.equal(infirmary.slotId, 'room-b');
  assert.equal(shelterProjects.projectDefinition('infirmary').kind, 'facility');
  assert.ok(shelterProjects.shelterBlueprintSlots.some(slot => slot.id === 'room-b' && slot.zone === 'interior'));
});


test('jogador pode se voluntariar, trabalhar quatro horas e concluir obra pelo relógio global', () => {
  const g = campaign(); const ana = g.survivors[0];
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  g.shelter.parts = 5;
  ana.hex = '0,0';
  ana.freeExperience = 'Eletricista de manutenção';

  const workshop = shelterProjects.createShelterProject('electrical-workshop', 'utility-a');
  g.shelter.projects.push(workshop);
  assert.equal(shelterProjects.joinShelterProjectAsSurvivor(g, workshop, ana.id), null);
  assert.ok(workshop.survivorWorkerIds.includes(ana.id));
  assert.equal(shelterProjects.startProject(g.shelter, workshop), null);

  const preview = shelterProjects.survivorWorkPreview(g, workshop, ana.id);
  assert.equal(preview.issue, null);
  assert.equal(preview.points, 2);
  assert.ok(preview.matches.includes('Eletricidade'));

  const before = g.minutes;
  const scheduled = shelterProjects.scheduleSurvivorWorkShift(g, workshop, ana.id, 4);
  assert.equal(scheduled.ok, true);
  assert.equal(g.minutes, before);
  assert.equal(workshop.volunteerShifts.length, 1);

  const result = campaignTime.advanceCampaignTime(g, 240);
  assert.equal(result.ok, true);
  assert.equal(workshop.state, 'Concluído');
  assert.equal(workshop.volunteerShifts.length, 0);
  assert.equal(g.minutes, before + 240);
});

test('compromisso temporal do sobrevivente bloqueia descanso nas mesmas horas', () => {
  const g = campaign(); const ana = g.survivors[0];
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  g.shelter.parts = 5; ana.hex = '0,0';
  const barricades = shelterProjects.createShelterProject('barricades');
  g.shelter.projects.push(barricades);
  assert.equal(shelterProjects.joinShelterProjectAsSurvivor(g, barricades, ana.id), null);
  assert.equal(shelterProjects.startProject(g.shelter, barricades), null);
  assert.equal(shelterProjects.scheduleSurvivorWorkShift(g, barricades, ana.id, 4).ok, true);
  assert.match(activity.survivorTimedCommitment(g, ana.id).label, /Barricadas/);
  const before = structuredClone(g);
  const rest = abilities.resolveGroupRest(g, 'short', g.survivors.map(person => ({
    survivorId: person.id,
    choices: [{ action:'prepare', targetId:person.id }, { action:'fiction', targetId:person.id }],
  })), () => 2);
  assert.equal(rest.ok, false);
  assert.match(rest.message, /ocupado/i);
  assert.deepEqual(g, before);
});

test('descanso longo pode ser preparado e aplicado durante o fechamento da noite sem somar outras 6h após o amanhecer', () => {
  const g = campaign();
  g.minutes = 22 * 60;
  for (const person of g.survivors) person.restPlan = { kind:'long', choices:[
    { action:'prepare', targetId:person.id }, { action:'fiction', targetId:person.id },
  ]};
  const direct = abilities.resolveGroupRest(g, 'long', abilities.plannedRestSelections(g, 'long'), () => 2);
  assert.equal(direct.ok, false);
  assert.match(direct.message, /Encerrar dia/);
  assert.equal(survival.closeDay(g, 0, 0), true);
  assert.equal(g.minutes, 480);
  const overnight = abilities.resolvePlannedOvernightRest(g, () => 2);
  assert.equal(overnight.ok, true);
  assert.equal(overnight.minutes, 0);
  assert.equal(g.minutes, 480);
});

test('primeira etapa de UX adiciona visão geral do mestre sem remover ferramentas existentes', () => {
  const page = fs.readFileSync(require.resolve('../app/page.tsx'), 'utf8');
  const overview = fs.readFileSync(require.resolve('../components/master-overview.tsx'), 'utf8');
  const reference = fs.readFileSync(require.resolve('../components/campaign-views.tsx'), 'utf8');
  assert.match(page, /Visão geral/);
  assert.match(page, /MasterOverview/);
  assert.match(page, /Mapa e exploração/);
  assert.match(overview, /Situação atual/);
  assert.match(overview, /Precisa de atenção/);
  assert.match(overview, /Equipe agora/);
  assert.match(overview, /Em andamento/);
  assert.match(overview, /Reservas principais/);
  assert.match(reference, /Subgrupos separados podem ocupar o mesmo intervalo de tempo/);
  assert.match(reference, /O descanso longo consome 6 horas/);
  for (const tab of ['mapa','cena','sobreviventes','comunidade','abrigo','conflito','ameacas','referencias','jogadores']) {
    assert.match(page, new RegExp('value: "' + tab + '"'));
  }
});

test('ficha de mestre e jogador compartilha abas e consulta lateral sem abrir permissões do mestre', () => {
  const page = fs.readFileSync(require.resolve('../app/page.tsx'), 'utf8');
  const survivor = fs.readFileSync(require.resolve('../components/survivor-panel.tsx'), 'utf8');
  assert.match(page, /Meu sobrevivente/);
  assert.doesNotMatch(survivor, /playerTabs|is-player-facing|character-player-now/);
  assert.match(survivor, /className="character-layout"/);
  assert.match(survivor, /Consulta rápida do sobrevivente/);
  for (const label of ['Resumo','Atributos','Combate','Habilidades','Inventário','Condições','História']) assert.ok(survivor.includes('label: "'+label+'"'));
  assert.match(survivor, /selfOnly=\{playerMode \|\| playerPreview\}/);
  assert.match(survivor, /id="character-rest-panel"/);
});

test('etapa de UX do abrigo prioriza estado, pendências e próxima ação sem remover ferramentas', () => {
  const views = fs.readFileSync(require.resolve('../components/campaign-views.tsx'), 'utf8');
  const dashboard = fs.readFileSync(require.resolve('../components/shelter-dashboard.tsx'), 'utf8');
  const manager = fs.readFileSync(require.resolve('../components/shelter-project-manager.tsx'), 'utf8');
  assert.match(views, /shelterSection/);
  assert.match(views, /onValueChange=\{setShelterSection\}/);
  assert.match(views, /onNavigate=\{setShelterSection\}/);
  for (const tab of ['overview','resources','community','construction','routine']) {
    assert.match(views, new RegExp('value="' + tab + '"'));
  }
  assert.match(dashboard, /Abrigo agora/);
  assert.match(dashboard, /Outras pendências/);
  assert.match(dashboard, /Próximo passo/);
  assert.match(dashboard, /Provisões abaixo da população presente/);
  assert.match(manager, /PRÓXIMA AÇÃO/);
  assert.match(manager, /constructionNext/);
  assert.match(manager, /Alocar trabalho/);
  assert.match(manager, /Revisar energia/);
  assert.match(manager, /Registrar incidente/);
});

test('interfaces de tempo avisam correção para trás, eventos pendentes e tratamento de 30 min', () => {
  const page = fs.readFileSync(require.resolve('../app/page.tsx'), 'utf8');
  const close = fs.readFileSync(require.resolve('../components/day-close-dialog.tsx'), 'utf8');
  const survivor = fs.readFileSync(require.resolve('../components/survivor-panel.tsx'), 'utf8');
  assert.match(page, /Confirmar correção para trás/);
  assert.match(page, /não desfaz buscas, obras, recursos, eventos/i);
  assert.match(close, /evento\(s\) temporal\(is\) pendente/);
  assert.match(close, /Aplicar descanso longo durante a noite/);
  assert.match(survivor, /Tratamento de Exposição · 30 min/);
  assert.match(survivor, /scheduleExposureTreatment\(draft, selected\.id/);
});

test('ações imediatas legadas começam no relógio atual e não criam ações retroativas', () => {
  const g=campaign(); const [ana,bia]=g.survivors; const start=g.minutes;
  assert.equal(campaignTime.advanceParticipantTime(g,[ana.id],120).ok,true);
  const result=campaignTime.advanceParticipantTime(g,[bia.id],60);
  assert.equal(result.startMinute,start+120); assert.equal(result.overlapMinutes,0);
  assert.equal(g.minutes,start+180);
});

test('avanço global sincroniza subgrupos e encerra folgas paralelas anteriores', () => {
  const g = campaign(); const [ana,bia] = g.survivors;
  const start = g.minutes;
  assert.equal(campaignTime.advanceParticipantTime(g,[ana.id],60).ok,true);
  assert.equal(g.parallelTime.survivorMinutes[bia.id],start);
  assert.equal(campaignTime.advanceCampaignTime(g,30).ok,true);
  assert.equal(g.minutes,start+90);
  assert.equal(g.parallelTime.survivorMinutes[ana.id],start+90);
  assert.equal(g.parallelTime.survivorMinutes[bia.id],start+90);

  const next = campaignTime.advanceParticipantTime(g,[bia.id],60);
  assert.equal(next.worldAdvance,60);
  assert.equal(next.overlapMinutes,0);
});

test('passagem de dia reinicia as linhas de tempo individuais no novo amanhecer', () => {
  const g = campaign(); const [ana,bia] = g.survivors;
  assert.equal(campaignTime.advanceParticipantTime(g,[ana.id],60).ok,true);
  assert.ok(g.parallelTime);
  assert.ok(g.parallelTime.survivorMinutes[bia.id] < g.minutes);
  assert.equal(survival.closeDay(g,0,0),true);
  assert.equal(g.day,2);
  assert.equal(g.minutes,480);
  assert.equal(g.parallelTime.day,2);
  assert.equal(g.parallelTime.survivorMinutes[ana.id],480);
  assert.equal(g.parallelTime.survivorMinutes[bia.id],480);
});

test('projeção do jogador não expõe relógios paralelos internos da mesa', () => {
  const g = campaign(); const ana = g.survivors[0];
  assert.equal(campaignTime.advanceParticipantTime(g,[ana.id],60).ok,true);
  const view = collaboration.projectPlayerGame(g,ana.id);
  assert.equal(view.parallelTime,undefined);
});

test('sobrevivente em turno no abrigo não pode viajar até o trabalho terminar', () => {
  const g = campaign(); const ana = g.survivors[0];
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  g.shelter.parts = 5;
  ana.hex = '0,0';

  const barricades = shelterProjects.createShelterProject('barricades');
  g.shelter.projects.push(barricades);
  assert.equal(shelterProjects.joinShelterProjectAsSurvivor(g, barricades, ana.id), null);
  assert.equal(shelterProjects.startProject(g.shelter, barricades), null);
  assert.equal(shelterProjects.scheduleSurvivorWorkShift(g, barricades, ana.id, 4).ok, true);

  const blocked = hexActions.moveSurvivors(g, '1,0', [ana.id]);
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /trabalhando em Barricadas/);

  assert.equal(campaignTime.advanceCampaignTime(g, 240).ok, true);
  const moved = hexActions.moveSurvivors(g, '1,0', [ana.id]);
  assert.equal(moved.ok, true);
});

test('payload do jogador aceita apenas sua própria participação em obra do abrigo', () => {
  let g = campaign(); const ana = g.survivors[0]; const bia = g.survivors[1];
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  g.shelter.parts = 5;
  ana.hex = '0,0'; bia.hex = '0,0';
  const barricades = shelterProjects.createShelterProject('barricades');
  g.shelter.projects.push(barricades);

  const beforeView = collaboration.projectPlayerGame(g, ana.id);
  const joinView = structuredClone(beforeView);
  const projected = joinView.shelter.projects[0];
  assert.equal(shelterProjects.joinShelterProjectAsSurvivor(joinView, projected, ana.id), null);
  const joinPayload = collaboration.playerEditPayload(beforeView, joinView);
  assert.ok(joinPayload);
  assert.deepEqual(joinPayload.shelterWorkActions, [{ type:'join', projectId:barricades.id }]);

  g = collaboration.applyPlayerChange(g, ana.id, g.survivors[0], joinPayload.after, 0, [], 0, joinPayload.shelterWorkActions);
  assert.ok(g);
  assert.ok(g.shelter.projects[0].survivorWorkerIds.includes(ana.id));

  const maliciousBefore = collaboration.projectPlayerGame(g, ana.id);
  const maliciousAfter = structuredClone(maliciousBefore);
  maliciousAfter.shelter.projects[0].survivorWorkerIds.push(bia.id);
  assert.equal(collaboration.playerEditPayload(maliciousBefore, maliciousAfter), null);

  assert.equal(shelterProjects.startProject(g.shelter, g.shelter.projects[0]), null);
  const scheduleBefore = collaboration.projectPlayerGame(g, ana.id);
  const scheduleAfter = structuredClone(scheduleBefore);
  assert.equal(shelterProjects.scheduleSurvivorWorkShift(scheduleAfter, scheduleAfter.shelter.projects[0], ana.id, 4).ok, true);
  const schedulePayload = collaboration.playerEditPayload(scheduleBefore, scheduleAfter);
  assert.ok(schedulePayload);
  assert.deepEqual(schedulePayload.shelterWorkActions, [{ type:'schedule', projectId:barricades.id }]);

  const fullBefore = structuredClone(g.survivors[0]);
  g = collaboration.applyPlayerChange(g, ana.id, fullBefore, schedulePayload.after, 0, [], 0, schedulePayload.shelterWorkActions);
  assert.ok(g);
  assert.equal(g.shelter.projects[0].volunteerShifts[0].survivorId, ana.id);
});

test('NPC em campo só consome provisão portada por sobrevivente do mesmo hex', () => {
  const g = campaign(); const [ana, bia] = g.survivors;
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  ana.hex = '1,0'; bia.hex = '0,0'; ana.food = 2; ana.water = 2;
  g.shelter.food = 7; g.shelter.water = 7;
  const npc = { id: 'npc-field', name: 'Rui', role: 'Guia', description: '', notes: '', hex: '1,0', status: 'Bem', infection: 'Saudável', disposition: 'Neutro', skills: ['Logística'], active: true };
  g.npcs.push(npc);
  const plan = survival.defaultDayClosePlan(g);
  const anaPlan = plan.survivors.find(entry => entry.survivorId === ana.id);
  const biaPlan = plan.survivors.find(entry => entry.survivorId === bia.id);
  anaPlan.food = 'other'; anaPlan.water = 'other';
  biaPlan.food = 'other'; biaPlan.water = 'other';
  const npcPlan = plan.npcs.find(entry => entry.npcId === npc.id);
  npcPlan.food = 'personal'; npcPlan.water = 'personal'; npcPlan.foodCarrierId = ana.id; npcPlan.waterCarrierId = ana.id;
  const result = survival.closeDayWithPlan(g, plan);
  assert.equal(result.ok, true);
  assert.equal(g.shelter.food, 7); assert.equal(g.shelter.water, 7);
  assert.equal(ana.food, 1); assert.equal(ana.water, 1);
  assert.equal(npc.foodConsumedDay, 1); assert.equal(npc.waterConsumedDay, 1);
});

test('NPC pode acompanhar um subgrupo nomeado sem arrastar quem ficou para trás', () => {
  const g = campaign(); const [ana, bia] = g.survivors;
  const npc = { id: 'npc-subgroup', name: 'Cris', role: 'Batedora', description: '', notes: '', hex: '0,0', status: 'Bem', infection: 'Saudável', disposition: 'Neutro', skills: ['Vigilância'], active: true, accompaniesSurvivorIds: [ana.id] };
  g.npcs.push(npc);
  const moved = hexActions.moveSurvivors(g, '1,0', [ana.id]);
  assert.equal(moved.ok, true);
  assert.equal(ana.hex, '1,0'); assert.equal(bia.hex ?? g.partyHex, '0,0');
  assert.equal(npc.hex, '1,0');
});

test('gerador de encontro é local e a projeção pública não revela seus segredos nem equipe interna', () => {
  const drafts = npcGenerator.generateNpcDrafts({ quantity: 3, context: 'Hospitalar', tone: 'Tenso', hex: '0,0' }, () => .12);
  assert.equal(drafts.length, 3);
  assert.ok(drafts.every(npc => npc.name && npc.role && npc.publicNotes && npc.notes.includes('Segredo gerado')));
  assert.ok(drafts.some(npc => npc.skills.includes('Medicina')));
  const g = campaign();
  g.npcs.push({ ...drafts[0], id: 'generated' });
  assert.equal(g.npcs[0].visibleToPlayers, false);
  assert.deepEqual(collaboration.projectPlayerGame(g, g.survivors[0].id).npcs, []);
  g.npcs[0].visibleToPlayers = true;
  g.shelter.projects.push({ ...shelterProjects.createShelterProject('barricades'), responsibleId: 'generated', helperIds: ['generated'] });
  const view = collaboration.projectPlayerGame(g, g.survivors[0].id);
  assert.equal('notes' in view.npcs[0], false);
  assert.equal('immediateNeed' in view.npcs[0], false);
  assert.deepEqual(view.shelter.projects[0].helperIds, []);
  assert.equal(view.shelter.projects[0].responsibleId, undefined);
});


test('integridade estrutural degrada de íntegra a destruída e suspende operação em 1/3', () => {
  const g = campaign();
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  const barricades = shelterProjects.createShelterProject('barricades');
  barricades.state = 'Concluído'; barricades.progress = barricades.requiredProgress;
  g.shelter.projects.push(barricades);
  assert.equal(shelterProjects.projectIntegrity(barricades), 3);
  assert.equal(shelterProjects.projectOperational(g, g.shelter, barricades), true);

  assert.equal(shelterProjects.applyProjectDamage(barricades, 1), 1);
  assert.equal(barricades.state, 'Danificado');
  assert.equal(shelterProjects.projectIntegrity(barricades), 2);
  assert.equal(shelterProjects.projectOperational(g, g.shelter, barricades), true);

  shelterProjects.applyProjectDamage(barricades, 1);
  assert.equal(barricades.state, 'Inoperante');
  assert.equal(shelterProjects.projectIntegrity(barricades), 1);
  assert.equal(shelterProjects.projectOperational(g, g.shelter, barricades), false);

  shelterProjects.applyProjectDamage(barricades, 1);
  assert.equal(barricades.state, 'Destruído');
  assert.equal(shelterProjects.projectIntegrity(barricades), 0);
});

test('incidentes usam Segurança e Portão para mitigar Impacto e distribuem dano comum', () => {
  const g = campaign();
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  const gate = shelterProjects.createShelterProject('reinforced-gate');
  gate.state = 'Concluído'; gate.progress = gate.requiredProgress;
  const workshop = shelterProjects.createShelterProject('workshop', 'room-a');
  workshop.state = 'Concluído'; workshop.progress = workshop.requiredProgress;
  g.shelter.projects.push(gate, workshop);

  const mitigation = shelterProjects.shelterIncidentMitigation(g, 'Invasão');
  assert.equal(mitigation.amount, 2);
  assert.ok(mitigation.sources.includes('Segurança do abrigo'));
  assert.ok(mitigation.sources.includes('Portão reforçado'));

  const result = shelterProjects.applyShelterIncident(g, {
    kind: 'Invasão', impact: 3, targetProjectIds: [workshop.id],
  });
  assert.equal(result.ok, true);
  assert.equal(result.remainingImpact, 1);
  assert.equal(result.damaged.length, 1);
  assert.equal(shelterProjects.projectIntegrity(workshop), 2);

  const pantry = shelterProjects.createShelterProject('pantry', 'room-b');
  pantry.state = 'Concluído'; pantry.progress = pantry.requiredProgress;
  g.shelter.projects.push(pantry);
  g.shelter.manualAdjustments.security = -2;
  g.shelter.security = -1;
  const spread = shelterProjects.applyShelterIncident(g, {
    kind: 'Outro', impact: 3, targetProjectIds: [workshop.id, pantry.id],
  });
  assert.equal(spread.ok, true);
  assert.equal(spread.unassignedImpact, 1);
  assert.equal(shelterProjects.projectIntegrity(workshop), 1);
  assert.equal(shelterProjects.projectIntegrity(pantry), 2);
});

test('reparo leve, reparo estrutural e restauração usam custos e trabalho por integridade', () => {
  const g = campaign();
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  g.shelter.parts = 10; g.shelter.fuel = 5;
  const generator = shelterProjects.createShelterProject('generator', 'utility-a');
  generator.state = 'Concluído'; generator.progress = generator.requiredProgress;
  g.shelter.projects.push(generator);

  shelterProjects.applyProjectDamage(generator, 1);
  let plan = shelterProjects.repairPlan(g, generator);
  assert.equal(plan.requiredProgress, 1);
  assert.deepEqual(plan.costs, {});
  assert.equal(shelterProjects.startRepair(g, generator), null);
  assert.equal(shelterProjects.advanceProject(generator, 1), true);
  assert.equal(generator.state, 'Concluído');
  assert.equal(shelterProjects.projectIntegrity(generator), 3);

  shelterProjects.applyProjectDamage(generator, 2);
  plan = shelterProjects.repairPlan(g, generator);
  assert.equal(plan.requiredProgress, 2);
  assert.deepEqual(plan.costs, { parts: 1 });
  const partsBefore = g.shelter.parts;
  assert.equal(shelterProjects.startRepair(g, generator), null);
  assert.equal(g.shelter.parts, partsBefore - 1);
  shelterProjects.advanceProject(generator, 2);
  assert.equal(shelterProjects.projectIntegrity(generator), 3);

  shelterProjects.applyProjectDamage(generator, 3);
  plan = shelterProjects.repairPlan(g, generator);
  assert.equal(plan.label, 'Restauração');
  assert.equal(plan.requiredProgress, 2);
  assert.deepEqual(plan.costs, { parts: 1, fuel: 1 });
});

test('Oficina reduz a primeira Peça paga em reparo do dia e bancada acelera trabalho', () => {
  const g = campaign();
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  g.shelter.parts = 5;
  const mechanic = { id:'maintainer', name:'Mara', role:'Mecânica', description:'', notes:'', hex:'0,0', home:'0,0', status:'Bem', infection:'Saudável', disposition:'Aliado', skills:['Mecânica','Construção'], active:true };
  g.npcs.push(mechanic);

  const workshop = shelterProjects.createShelterProject('workshop', 'room-a');
  workshop.state = 'Concluído'; workshop.progress = workshop.requiredProgress; workshop.responsibleId = mechanic.id;
  const bench = shelterProjects.createShelterProject('tool-bench', 'utility-a');
  bench.state = 'Concluído'; bench.progress = bench.requiredProgress;
  const barricades = shelterProjects.createShelterProject('barricades');
  barricades.state = 'Concluído'; barricades.progress = barricades.requiredProgress; barricades.responsibleId = mechanic.id;
  g.shelter.projects.push(workshop, bench, barricades);

  shelterProjects.applyProjectDamage(barricades, 2);
  const plan = shelterProjects.repairPlan(g, barricades);
  assert.equal(plan.workshopDiscount, true);
  assert.deepEqual(plan.costs, {});
  assert.equal(shelterProjects.startRepair(g, barricades), null);
  assert.equal(g.shelter.maintenanceDiscountDay, g.day);
  const preview = shelterProjects.projectWorkPreview(g, g.shelter, barricades);
  assert.ok(preview.repairBonus.sources.includes('Bancada de ferramentas'));
  assert.ok(preview.points >= 2);
});

test('Conforto reduz Fear uma vez por dia e superlotação bloqueia o benefício', () => {
  const g = campaign();
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  const dorm = shelterProjects.createShelterProject('dormitories', 'room-a');
  dorm.state = 'Concluído'; dorm.progress = dorm.requiredProgress;
  const common = shelterProjects.createShelterProject('common-area', 'room-b');
  common.state = 'Concluído'; common.progress = common.requiredProgress;
  g.shelter.projects.push(dorm, common);

  assert.equal(shelterProjects.shelterMetrics(g.shelter, g).comfort, 2);
  assert.equal(shelterProjects.shelterComfortFearReduction(g), 1);
  const selections = g.survivors.map(person => ({
    survivorId: person.id,
    choices: [{ action:'fiction', targetId:person.id }, { action:'fiction', targetId:person.id }],
  }));
  let result = abilities.resolveGroupRest(g, 'short', selections, () => 1);
  assert.equal(result.ok, true);
  assert.equal(result.fear, 0);
  result = abilities.resolveGroupRest(g, 'short', selections, () => 1);
  assert.equal(result.ok, true);
  assert.equal(result.fear, 1);

  g.day += 1;
  g.shelter.residents = 20;
  assert.equal(shelterProjects.shelterOvercrowded(g), true);
  assert.equal(shelterProjects.shelterComfortFearReduction(g), 0);
});

test('Refrigeração operacional conserva estoque e falha quando a geração fica inoperante', () => {
  const g = campaign();
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  const mechanic = { id:'power-tech', name:'Ivo', role:'Mecânico', description:'', notes:'', hex:'0,0', home:'0,0', status:'Bem', infection:'Saudável', disposition:'Aliado', skills:['Mecânica'], active:true };
  g.npcs.push(mechanic);
  const generator = shelterProjects.createShelterProject('generator', 'utility-a');
  generator.state = 'Concluído'; generator.progress = generator.requiredProgress; generator.responsibleId = mechanic.id;
  const refrigeration = shelterProjects.createShelterProject('refrigeration', 'utility-b');
  refrigeration.state = 'Concluído'; refrigeration.progress = refrigeration.requiredProgress;
  g.shelter.projects.push(generator, refrigeration);
  assert.equal(shelterProjects.shelterColdStorageActive(g), true);

  shelterProjects.applyProjectDamage(generator, 2);
  assert.equal(generator.state, 'Inoperante');
  assert.equal(shelterProjects.shelterColdStorageActive(g), false);
});

test('Horta usa turnos de 4h, acumula Cultivo e gera comida perecível sem avançar o relógio ao agendar', () => {
  const g = campaign();
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  const farmer = { id:'farmer', name:'Rosa', role:'Agricultora', description:'', notes:'', hex:'0,0', home:'0,0', status:'Bem', infection:'Saudável', disposition:'Aliado', skills:['Cultivo'], active:true };
  g.npcs.push(farmer);
  const garden = shelterProjects.createShelterProject('garden', 'yard-a');
  garden.state = 'Concluído'; garden.progress = garden.requiredProgress; garden.responsibleId = farmer.id;
  g.shelter.projects.push(garden);

  const before = g.minutes;
  assert.equal(shelterProjects.scheduleShelterWorkShift(g, garden, 4).ok, true);
  assert.equal(g.minutes, before);
  assert.equal(garden.workShift.purpose, 'operation');
  assert.equal(campaignTime.advanceCampaignTime(g, 240).ok, true);
  assert.equal(garden.operationProgress, 2);
  assert.equal(g.shelter.food, 0);

  assert.equal(shelterProjects.scheduleShelterWorkShift(g, garden, 4).ok, true);
  assert.equal(campaignTime.advanceCampaignTime(g, 240).ok, true);
  assert.equal(garden.operationProgress, 0);
  assert.equal(g.shelter.food, 2);
  assert.ok(g.shelter.provisionLots.some(lot => lot.label === 'Colheita da horta' && lot.qty === 2 && lot.expiresDay === g.day + 2));
});


test('benefícios de instalações permanecem em 2/3 e param em 1/3 de Integridade', () => {
  const g = campaign(); const ana = g.survivors[0];
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  ana.inventory = [item('Água de chuva coletada')];
  const rain = ana.inventory[0];

  const filter = shelterProjects.createShelterProject('water-filter', 'utility-a');
  filter.state = 'Concluído'; filter.progress = filter.requiredProgress;
  g.shelter.projects.push(filter);
  let check = inventory.provisionPreparationCheck(g, ana.id, rain, 1);
  assert.equal(check.ok, true);

  shelterProjects.applyProjectDamage(filter, 1);
  assert.equal(filter.state, 'Danificado');
  check = inventory.provisionPreparationCheck(g, ana.id, rain, 1);
  assert.equal(check.ok, true);

  shelterProjects.applyProjectDamage(filter, 1);
  assert.equal(filter.state, 'Inoperante');
  check = inventory.provisionPreparationCheck(g, ana.id, rain, 1);
  assert.equal(check.ok, false);
});


test('Enfermaria e Estoque médico dão suporte mecânico ao tratamento no abrigo', () => {
  const g = campaign(); const ana = g.survivors[0];
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  ana.hex = '0,0';
  const medic = { id:'medic-infra', name:'Lia', role:'Médica', description:'', notes:'', hex:'0,0', home:'0,0', status:'Bem', infection:'Saudável', disposition:'Aliado', skills:['Medicina','Logística'], active:true };
  g.npcs.push(medic);

  const infirmary = shelterProjects.createShelterProject('infirmary', 'room-a');
  infirmary.state = 'Concluído'; infirmary.progress = infirmary.requiredProgress; infirmary.responsibleId = medic.id;
  const stock = shelterProjects.createShelterProject('medical-stock', 'room-b');
  stock.state = 'Concluído'; stock.progress = stock.requiredProgress; stock.responsibleId = medic.id;
  g.shelter.projects.push(infirmary, stock);

  let support = shelterProjects.shelterTreatmentBonus(g, ana.id);
  assert.equal(support.bonus, 2);
  assert.deepEqual(support.sources, ['Enfermaria', 'Estoque médico']);

  ana.hex = '1,0';
  support = shelterProjects.shelterTreatmentBonus(g, ana.id);
  assert.equal(support.bonus, 0);

  ana.hex = '0,0';
  shelterProjects.applyProjectDamage(infirmary, 2);
  support = shelterProjects.shelterTreatmentBonus(g, ana.id);
  assert.equal(support.bonus, 1);
  assert.deepEqual(support.sources, ['Estoque médico']);
});

test('Quadro de rotas reduz em 30 minutos viagens que partem ou retornam ao abrigo', () => {
  const g = campaign(); const ana = g.survivors[0];
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  ana.hex = '0,0';
  const board = shelterProjects.createShelterProject('route-board');
  board.state = 'Concluído'; board.progress = board.requiredProgress;
  g.shelter.projects.push(board);

  assert.equal(shelterProjects.shelterTravelMinutes(g, '0,0', '1,0', 60), 30);
  assert.equal(shelterProjects.shelterTravelMinutes(g, '1,0', '0,0', 120), 90);
  assert.equal(shelterProjects.shelterTravelMinutes(g, '1,0', '2,0', 60), 60);

  g.hexes['1,0'].discovery = 'explorado';
  g.hexes['1,0'].routeHours = 1;
  const before = g.minutes;
  const moved = hexActions.moveSurvivors(g, '1,0', [ana.id]);
  assert.equal(moved.ok, true);
  assert.equal(g.minutes, before + 30);
  assert.match(moved.message, /30 min/);
});

test('Cozinha comunitária só substitui panela e calor quando está realmente operacional', () => {
  const g = campaign(); const ana = g.survivors[0];
  assert.equal(require('../lib/game.ts').establishShelter(g, '0,0'), true);
  ana.hex = '0,0';
  ana.water = 2;
  ana.inventory = [item('Arroz cru')];
  const rice = ana.inventory[0];

  const kitchen = shelterProjects.createShelterProject('community-kitchen', 'room-a');
  kitchen.state = 'Concluído'; kitchen.progress = kitchen.requiredProgress;
  g.shelter.projects.push(kitchen);

  let check = inventory.provisionPreparationCheck(g, ana.id, rice, 1);
  assert.equal(check.ok, false);
  assert.match(check.message, /Panela leve|fonte de calor/);

  const cook = { id:'cook-infra', name:'Nina', role:'Cozinheira', description:'', notes:'', hex:'0,0', home:'0,0', status:'Bem', infection:'Saudável', disposition:'Aliado', skills:['Cozinha'], active:true };
  g.npcs.push(cook);
  kitchen.responsibleId = cook.id;
  check = inventory.provisionPreparationCheck(g, ana.id, rice, 1);
  assert.equal(check.ok, true);
  assert.equal(check.fuelCost, 0);

  shelterProjects.applyProjectDamage(kitchen, 2);
  check = inventory.provisionPreparationCheck(g, ana.id, rice, 1);
  assert.equal(check.ok, false);
});


test('munição comprometida permanece visível e não pode ser transferida ou descartada', () => {
  const g = campaign(); const [a,b] = g.survivors;
  a.primary = 'Pistola';
  a.inventory = [item('Munição de Pistola', 2)];
  g.scene = 7;
  assert.equal(combatResources.applyAttackResources(g, a.id, 'Pistola', '+1').ok, true);
  const ammo = a.inventory.find(x => x.ammunitionType === 'Pistola');
  assert.equal(ammo.qty, 2);
  assert.equal(ammo.committedAmmo, 1);

  assert.equal(inventory.transferItem(g, a.id, b.id, ammo.id, 2), false);
  assert.equal(inventory.discardItem(g, a.id, ammo.id, 2), false);
  assert.equal(inventory.transferItem(g, a.id, b.id, ammo.id, 1), true);
  assert.equal(require('../lib/game.ts').ammunitionCount(a.inventory, 'Pistola'), 1);
  assert.equal(require('../lib/game.ts').ammunitionCount(a.inventory, 'Pistola', true), 0);
  assert.equal(inventory.discardItem(g, a.id, ammo.id, 1), false);

  abilities.beginScene(g);
  assert.equal(require('../lib/game.ts').ammunitionCount(a.inventory, 'Pistola'), 0);
  assert.equal(require('../lib/game.ts').ammunitionCount(b.inventory, 'Pistola'), 1);
});

test('campanhas antigas migram contadores de munição para itens sem duplicar', () => {
  const g = campaign(); const a = g.survivors[0];
  a.inventory = [];
  a.ammo = 3; a.ammoType = 'Espingarda';
  g.shelter.inventory = [];
  g.shelter.pistolAmmo = 2;
  g.shelter.ammoStocks = { Pistola: 2, Carabina: 4 };

  preserveKnownSectors(g);
  assert.equal(a.ammo, 0);
  assert.equal(require('../lib/game.ts').ammunitionCount(a.inventory, 'Espingarda'), 3);
  assert.equal(require('../lib/game.ts').ammunitionCount(g.shelter.inventory, 'Pistola'), 2);
  assert.equal(require('../lib/game.ts').ammunitionCount(g.shelter.inventory, 'Carabina'), 4);
  assert.equal(g.shelter.pistolAmmo, 0);
  assert.equal(g.shelter.ammoStocks.Pistola, 0);
  assert.equal(g.shelter.ammoStocks.Carabina, 0);

  preserveKnownSectors(g);
  assert.equal(require('../lib/game.ts').ammunitionCount(a.inventory, 'Espingarda'), 3);
  assert.equal(require('../lib/game.ts').ammunitionCount(g.shelter.inventory, 'Pistola'), 2);
  assert.equal(require('../lib/game.ts').ammunitionCount(g.shelter.inventory, 'Carabina'), 4);
});

test('arma que exige munição não pode disparar sem unidade física livre', () => {
  const g = campaign(); const a = g.survivors[0];
  a.primary = 'Pistola'; a.inventory = [];
  assert.equal(combatResources.attackResourceState(g, a, 'Pistola', 1).ammoReady, false);
  a.inventory.push(item('Munição de Pistola', 1));
  assert.equal(combatResources.attackResourceState(g, a, 'Pistola', 1).ammoReady, true);
  combatResources.applyAttackResources(g, a.id, 'Pistola', 1);
  assert.equal(combatResources.attackResourceState(g, a, 'Pistola', 1).ammoReady, true);
  abilities.beginScene(g);
  assert.equal(combatResources.attackResourceState(g, a, 'Pistola', 1).ammoReady, false);
});


test('sincronização encerra conflito e atualiza recursos sem perder ficha pendente', () => {
  const {PlayerSaveQueue}=require('../lib/player-save-queue.ts');
  const g=campaign(), actor=g.survivors[0].id;
  g.conflict=conflictScene.createConflictScene({name:'Conflito',sceneNumber:1,day:g.day,time:'08:00',survivorIds:[actor]});
  const before=collaboration.projectPlayerGame(g,actor), after=structuredClone(before);
  after.survivors[0].hp=1;
  const queue=new PlayerSaveQueue();assert.equal(queue.enqueue(before,after),true);
  const job=structuredClone(queue.first);
  conflictScene.endConflictScene(g.conflict,g.day,'08:10');g.fear=5;g.noise=3;g.survivors[0].notes='Nota nova do mestre';
  const remote=collaboration.projectPlayerGame(g,actor), view=queue.overlay(remote);
  assert.equal(view.publicConflict,undefined);assert.equal(view.fear,5);assert.equal(view.noise,3);
  assert.equal(view.survivors[0].hp,1);assert.equal(view.survivors[0].notes,'Nota nova do mestre');
  assert.deepEqual(queue.first,job);assert.notEqual(remote.survivors[0].hp,1);
  queue.complete(job.id);assert.deepEqual(queue.overlay(remote),remote);
});

test('salvamentos rápidos preservam cada clique, rolagem e custo em ordem', async () => {
  const {PlayerSaveQueue}=require('../lib/player-save-queue.ts');
  const {applyPlayerSheetEdit}=require('../lib/player-sheet-edit.ts');
  let g=campaign();let view=collaboration.projectPlayerGame(g,g.survivors[0].id);const queue=new PlayerSaveQueue();
  for(let i=0;i<3;i++) {
    const next=structuredClone(view);next.survivors[0].stress=i+1;next.fear++;
    next.log.unshift({id:'rapid-'+i,day:g.day,time:'08:00',kind:'dados',text:'Rolagem rápida '+i});
    assert.equal(queue.enqueue(view,next),true);view=next;
  }
  assert.equal(queue.length,3);
  while(queue.length) {const job=queue.first;const result=await applyPlayerSheetEdit(g,g.survivors[0].id,job);assert.equal(result.ok,true);g=result.state;queue.complete(job.id);}
  assert.equal(g.survivors[0].stress,3);assert.equal(g.fear,3);
  assert.equal(g.log.filter(row=>row.text.startsWith('Rolagem rápida')).length,3);
});
test('reenvio após perda de resposta não duplica Medo, barulho ou registros e não aceita outro conteúdo', async () => {
  const {PlayerSaveQueue}=require('../lib/player-save-queue.ts');const {applyPlayerSheetEdit}=require('../lib/player-sheet-edit.ts');
  let g=campaign();const actor=g.survivors[0].id;const before=collaboration.projectPlayerGame(g,actor),after=structuredClone(before);
  after.survivors[0].hope=3;after.fear++;after.noise++;after.log.unshift({id:'lost',day:g.day,time:'08:00',kind:'dados',text:'Resposta perdida'});
  const queue=new PlayerSaveQueue();queue.enqueue(before,after);const job=queue.first;
  const first=await applyPlayerSheetEdit(g,actor,job);assert.equal(first.ok,true);g=first.state;
  const replay=await applyPlayerSheetEdit(g,actor,job);assert.equal(replay.ok,true);assert.equal(replay.replay,true);
  assert.equal(replay.state.fear,1);assert.equal(replay.state.noise,1);assert.equal(replay.state.log.filter(row=>row.text==='Resposta perdida').length,1);
  const altered={...job,after:{...job.after,hope:4}};assert.equal((await applyPlayerSheetEdit(g,actor,altered)).ok,false);
  const changed=structuredClone(g);changed.survivors[0].stress=2;
  const otherJob={...job,id:'other'};assert.equal((await applyPlayerSheetEdit(changed,actor,otherJob)).ok,false);
});

test('PV salva com dados legados inalterados e preserva edições paralelas em outros campos', async () => {
  const {applyPlayerSheetEdit}=require('../lib/player-sheet-edit.ts');
  let game=campaign(); const actor=game.survivors[0].id;
  game.survivors[0].inventory=[{id:'legacy',name:'Comida antiga',load:1,qty:0,condition:'Íntegro'}];
  game.survivors[0].legacyTag='antigo';
  game.survivors[0].restPlan={kind:'short',choices:[{action:'hp',targetId:'ausente'},{action:'stress',targetId:actor}]};
  const before=structuredClone(game.survivors[0]); const after={...before,hp:1};
  game.survivors[0].notes='Anotação do mestre durante o clique';
  const result=await applyPlayerSheetEdit(game,actor,{id:'mark-hp',day:game.day,before,after,logs:[]});
  assert.equal(result.ok,true);game=result.state;
  assert.equal(game.survivors[0].hp,1);assert.equal(game.survivors[0].notes,'Anotação do mestre durante o clique');
  assert.deepEqual(game.survivors[0].inventory,before.inventory);assert.equal(game.survivors[0].legacyTag,'antigo');
  for (const patch of [{hp:999},{name:'Outro nome'},{legacyTag:'alterado'},{inventory:[{...before.inventory[0],qty:-1}]}]) {
    const current=structuredClone(game.survivors[0]);
    assert.equal(collaboration.applyPlayerChange(game,actor,current,{...current,...patch},0,[]),null);
  }
  const stale=structuredClone(game.survivors[0]);game.survivors[0].hp=2;
  assert.equal(collaboration.applyPlayerChange(game,actor,stale,{...stale,hp:3},0,[]),null);
});
