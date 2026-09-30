/* eslint-disable @typescript-eslint/no-require-imports -- Node's test runner loads TS through the CommonJS transpilation hook below. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, path);
const { defaultState, initialSurvivor, survivorStats, content } = require('../lib/game.ts');
const inventory = require('../lib/inventory.ts');
const itemActions = require('../lib/item-actions.ts');
const hexActions = require('../lib/hex-actions.ts');
const equipment = require('../lib/equipment.ts');
const survival = require('../lib/survival.ts');
const provisions = require('../lib/provisions.ts');
const abilities = require('../lib/abilities.ts');
const collaboration = require('../lib/collaboration.ts');
const { createSurvivorFromDraft } = require('../lib/character-creation.ts');
const { explicitItemArtFor, itemArtFor } = require('../lib/item-art.ts');
const exploration = require('../lib/exploration.ts');
const { revealSector, preserveKnownSectors } = require('../lib/sectors.ts');
const { parseWeaponDamage, resolveActionRoll, resolveRollResources } = require('../lib/rolls.ts');

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
function physicalCount(s) { return s.inventory.reduce((sum, x) => sum + x.qty, 0) + ['primary','secondary','protection','bag','personal','pocket1','pocket2'].filter(key => s[key] && !(key === 'personal' && s.personal === s.bag)).length; }

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
  assert.notEqual(created.id, 'roubado'); assert.equal(created.hp, 0); assert.equal(created.hope, 2);
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
    assert.ok(fs.statSync(`public/item-art/${art.sheet}.webp`).size > 1000);
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
  require('../lib/game.ts').addLog(g, 'dados', 'Ana rolou', ana.id);
  require('../lib/game.ts').addLog(g, 'evento', 'Segredo do mestre');
  const visible = collaboration.projectPlayerGame(g, ana.id);
  assert.equal(visible.survivors.length, 1); assert.equal(visible.survivors[0].id, ana.id);
  assert.equal(JSON.stringify(visible).includes(bia.id), false);
  assert.equal(JSON.stringify(visible).includes('Laboratório secreto'), false);
  assert.equal(JSON.stringify(visible).includes('porta escondida'), false);
  assert.equal(JSON.stringify(visible).includes('armadilha'), false);
  assert.equal(JSON.stringify(visible).includes('Porta oculta'), false);
  assert.equal(JSON.stringify(visible).includes('relógio secreto'), false);
  assert.equal(JSON.stringify(visible).includes('reserva secreta'), false);
  assert.equal(visible.hexes['0,0'].points[0].name, 'Depósito');
  assert.equal(visible.hexes['0,0'].points[0].notes, '');
  assert.equal(visible.hexes['0,0'].points[0].searches.length, 0);
  assert.deepEqual(visible.log.map(row => row.text), ['Ana rolou']);
  assert.equal(g.hexes['0,0'].notes, 'armadilha');
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
  bia.hope = 0;
  const short = abilities.resolveGroupRest(g, 'short', [
    { survivorId: ana.id, choices: ['hp', 'stress'] },
    { survivorId: bia.id, choices: ['prepare', 'prepare'] },
  ], () => 3);
  assert.equal(short.ok, true);
  assert.equal(ana.hp, 0);
  assert.equal(ana.stress, 0);
  assert.equal(bia.hope, 2);
  assert.equal(g.fear, 3);
  assert.equal(g.shortRest, 2);
  assert.equal(g.log.filter(entry => entry.kind === 'descanso').length, 4);

  g.shelter.hex = g.partyHex;
  ana.hp = 3; ana.armorMarked = 2; bia.stress = 5; bia.hope = 0;
  const long = abilities.resolveGroupRest(g, 'long', [
    { survivorId: ana.id, choices: ['hp-full', 'prepare'] },
    { survivorId: bia.id, choices: ['stress-full', 'prepare'] },
  ], () => 2);
  assert.equal(long.ok, true);
  assert.equal(ana.hp, 0);
  assert.equal(bia.stress, 0);
  assert.equal(ana.hope, 2);
  assert.equal(bia.hope, 2);
  assert.equal(g.fear, 7);
  assert.equal(g.longRest, 2);
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
  s.kitCondition.secondary = 'Íntegro'; assert.equal(equipment.equipmentModifiers(s).armor, 1);
});

test('tipo de munição não se mistura e um contador vazio recebe o tipo da origem', () => {
  const g = campaign(); const [a,b] = g.survivors;
  a.ammo = 3; a.ammoType = 'Espingarda'; b.ammo = 2; b.ammoType = 'Pistola';
  const before = JSON.stringify(g);
  assert.equal(inventory.transferProvisions(g, a.id, b.id, 'ammo', 1), false);
  assert.equal(JSON.stringify(g), before);
  b.ammo = 0;
  assert.equal(inventory.transferProvisions(g, a.id, b.id, 'ammo', 2), true);
  assert.equal(b.ammoType, 'Espingarda'); assert.equal(b.ammo, 2); assert.equal(a.ammo, 1);
  assert.equal(inventory.transferProvisions(g, b.id, 'shared', 'ammo', 1), false);
  assert.equal(g.shelter.pistolAmmo, 0);
  b.ammo = 0; g.shelter.pistolAmmo = 2;
  assert.equal(inventory.transferProvisions(g, 'shared', b.id, 'ammo', 1), true);
  assert.equal(b.ammoType, 'Pistola'); assert.equal(g.shelter.pistolAmmo, 1);
});

test('munição de armas encontradas é reconhecida no cálculo da carga', () => {
  const s = survivor(); s.primary = 'Pistola compacta'; s.ammoType = 'Pistola'; s.ammo = 2;
  assert.equal(survivorStats(s).load.ammo, 1);
  s.primary = 'Fuzil de patrulha'; assert.equal(survivorStats(s).load.ammo, 2);
  s.ammoType = 'Carabina'; assert.equal(survivorStats(s).load.ammo, 1);
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

test('carga de provisões só aumenta a cada quatro porções completas', () => {
  const s = survivor();
  s.inventory = [];
  s.food = 3; s.water = 3;
  let stats = survivorStats(s);
  assert.equal(stats.load.food, 0);
  assert.equal(stats.load.water, 0);

  s.food = 4; s.water = 4;
  stats = survivorStats(s);
  assert.equal(stats.load.food, 1);
  assert.equal(stats.load.water, 1);

  s.food = 7; s.water = 7;
  stats = survivorStats(s);
  assert.equal(stats.load.food, 1);
  assert.equal(stats.load.water, 1);

  s.food = 8; s.water = 8;
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

test('menu contextual respeita preparo e descarte confirmado pelas regras centrais', () => {
  const g = campaign(); const ana = g.survivors[0];
  ana.food = 0; ana.inventory = [item('Aveia'), item('Pé de cabra')];

  const oats = ana.inventory.find(entry => entry.name === 'Aveia');
  let result = itemActions.performItemAction(g, ana.id, oats.id, { type: 'prepare', quantity: 1 });
  assert.equal(result.ok, true);
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
