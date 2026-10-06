/* eslint-disable @typescript-eslint/no-require-imports -- existing Node test loader */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, path);
const { defaultState, initialSurvivor, content, survivorStats } = require('../lib/game.ts');
const { assignCustomSector } = require('../lib/sectors.ts');
const { projectPlayerGame } = require('../lib/collaboration.ts');
const { validWorld } = require('../lib/world.ts');
const { eventTriggerReady } = require('../lib/hex-generators.ts');
const { recordSearch } = require('../lib/exploration.ts');
const { prepareSuggestedEventAction } = require('../lib/hex-event-actions.ts');
const { moveSurvivors } = require('../lib/hex-actions.ts');
const { abilityAvailable } = require('../lib/abilities.ts');
const { catalogKey, itemFromCatalog } = require('../lib/inventory.ts');
const auto = require('../lib/hex-automation.ts');
const shelterProjects = require('../lib/shelter-projects.ts');
const campaignTime = require('../lib/time.ts');
const { validExplorationPreferences } = require('../lib/hex-automation-validation.ts');
function campaign(origin = content.origins[1].name) {
  const game = defaultState();
  const archetype = content.archetypes[0];
  const actor = initialSurvivor({ name: 'Nina', origin, past: '', archetype: archetype.name, specialty: archetype.specialties[0].name, freeExperience: 'Resgates', techniques: [], attributes: { Agilidade: 2, Força: 1, Finesse: 1, Instinto: 0, Presença: 0, Conhecimento: -1 }, primary: '', secondary: '', protection: '', personal: '' });
  actor.hex = '0,0'; actor.inventory = []; actor.hope = 3; actor.stress = 2;
  game.survivors = [actor];
  assignCustomSector(game, '0,0', 'Bairro residencial', 'explorado');
  game.hexes['0,0'].points = [{ id: 'market', name: 'Mercado', kind: 'comércio', signal: 'Prateleiras acessíveis', access: 'Reservado', notes: 'Segredo', revealed: true, lootTable: content.lootTables[1].name, searches: [] }];
  const point = game.hexes['0,0'].points[0]; auto.prepareLocation(point);
  return { game, point, actor, area: point.preparation.areas[0] };
}
function input(fixture, changes = {}) {
  return { id: 'search-1', hexId: '0,0', pointId: 'market', areaId: fixture.area.id, participants: [fixture.actor.id], mode: 'open', objective: '', purpose: 'Suprimentos para a viagem', ...changes };
}
function die(...values) { return () => { const next = values.shift(); assert.ok(next, 'Não deve repetir uma rolagem'); return next; }; }
function entry(key) { return content.catalog.find(row => catalogKey(row) === key); }

test('168 definições mantêm os 14 d12 e todos os achados correspondem ao catálogo', () => {
  assert.equal(auto.lootDefinitions.length, 14);
  for (const table of auto.lootDefinitions) {
    assert.equal(table.entries.length, 12);
    assert.deepEqual(table.entries.map(row => row.roll), Array.from({length: 12}, (_,i) => i+1));
    assert.ok(content.lootTables.some(row => row.name === table.table));
    for (const row of table.entries) for (const item of [...row.items, ...(row.fallback ?? []), ...(row.choices ?? []).map(catalogKey => ({ catalogKey, qty: 1 }))]) {
      assert.ok(entry(item.catalogKey), item.catalogKey); assert.ok(Number.isInteger(item.qty) && item.qty > 0);
    }
  }
});
test('preparação idempotente conserva fatos, cria áreas privadas e não movimenta o mundo', () => {
  const {game,point,actor} = campaign();
  const minutes = game.minutes;
  auto.prepareHex(game,'0,0');
  const before = structuredClone(game);
  auto.prepareHex(game,'0,0'); assert.deepEqual(game,before);
  assert.equal(game.minutes,minutes); assert.equal(actor.hex,'0,0'); assert.equal(game.conflict,undefined);
  assert.ok(point.preparation.areas.length > 1); assert.equal(game.hexes['0,0'].events[0].revealed,false);
  assert.equal(validWorld(game.hexes),true);
  const visible = projectPlayerGame(game,actor.id);
  assert.equal(visible.hexes['0,0'].points[0].preparation,undefined);
  assert.equal(visible.hexes['0,0'].events.length,0);
});

test('porte do local controla profundidade sem transformar toda área em nova rolagem de saque', () => {
  const game = defaultState();
  const condo = { id:'condo', name:'Condomínio de casas', kind:'local', signal:'Portaria aberta', access:'', notes:'', revealed:true,
    lootTable:'Residências / condomínios', searches:[] };
  auto.prepareLocation(condo);
  assert.equal(condo.preparation.scale,'large');
  assert.equal(condo.preparation.areas.length,6);
  assert.equal(condo.preparation.areas.filter(area=>area.searchable!==false).length,auto.locationScaleSearchCaps.large);
  assert.equal(condo.preparation.areas.find(area=>area.name==='Área principal').minutes,60);
  assert.equal(condo.preparation.areas.find(area=>area.name==='Cozinha').minutes,30);
  assert.ok(condo.preparation.areas.some(area=>area.name==='Cozinha' && area.table==='Restaurantes / cozinhas'));
  assert.ok(condo.preparation.areas.some(area=>area.name==='Garagem' && area.table==='Oficinas / postos de serviço'));
  assert.ok(condo.preparation.areas.some(area=>area.searchable===false));

  const hospital = { id:'hospital', name:'Hospital central', kind:'local', signal:'Recepção vazia', access:'', notes:'', revealed:true,
    lootTable:'Hospitais / laboratórios', searches:[] };
  auto.prepareLocation(hospital);
  assert.equal(hospital.preparation.scale,'complex');
  assert.equal(hospital.preparation.areas.length,8);
  assert.equal(hospital.preparation.areas.filter(area=>area.searchable!==false).length,auto.locationScaleSearchCaps.complex);
  assert.ok(hospital.preparation.areas.some(area=>area.name==='Farmácia interna' && area.table==='Farmácias / consultórios'));
  assert.ok(hospital.preparation.areas.some(area=>area.name==='Manutenção' && area.table==='Oficinas / postos de serviço'));
});


test('todas as tabelas respeitam orçamento de áreas, buscas e tempo por porte', () => {
  const maxNormalMinutes = { small:90, medium:120, large:180, complex:210 };
  for (const table of content.lootTables) {
    const point={ id:'audit', name:'Local genérico', kind:'local', signal:'Sinal', access:'', notes:'', revealed:true,
      lootTable:table.name, searches:[] };
    auto.prepareLocation(point);
    for (const scale of ['small','medium','large','complex']) {
      assert.equal(auto.resizeLocationPreparation(point,scale),true, table.name + ' · ' + scale);
      assert.equal(point.preparation.areas.length,auto.locationScaleAreaCounts[scale], table.name + ' · ' + scale + ' · áreas');
      const searchable=point.preparation.areas.filter(area=>area.searchable!==false);
      assert.ok(searchable.length<=auto.locationScaleSearchCaps[scale], table.name + ' · ' + scale + ' · buscas');
      assert.ok(searchable.reduce((sum,area)=>sum+area.minutes,0)<=maxNormalMinutes[scale], table.name + ' · ' + scale + ' · tempo');
      assert.equal(auto.deepSearchLimit(point),auto.locationScaleDeepSearchLimits[scale]);
    }
  }
});
test('atalhos de busca usam categorias do catálogo e respeitam a tabela de cada área', () => {
  assert.equal(auto.quickSearchResourceForKey('Bebidas::Suco em caixa fechado'),'water');
  assert.equal(auto.quickSearchResourceForKey('Alimentos::Barra de cereal'),'food');
  assert.equal(auto.quickSearchResourceForKey('Medicamentos e cuidado::Kit médico de campo'),'medicine');
  assert.equal(auto.quickSearchResourceForKey('Suprimentos abstratos::Peças (1 unidade)'),'parts');
  assert.equal(auto.quickSearchResourceForKey('Suprimentos abstratos::Combustível (1 unidade)'),'fuel');
  assert.equal(auto.quickSearchResourceForKey('Ferramentas, acesso e reparo::Alicate'),undefined);

  const condo = { id:'condo-fast', name:'Condomínio de casas', kind:'local', signal:'Portaria', access:'', notes:'', revealed:true,
    lootTable:'Residências / condomínios', searches:[] };
  auto.prepareLocation(condo);
  const main=auto.quickSearchOptions(condo.preparation.areas.find(area=>area.name==='Área principal'));
  assert.equal(main.find(option=>option.id==='water').available,true);
  assert.equal(main.find(option=>option.id==='medicine').available,true);
  assert.equal(main.find(option=>option.id==='food').available,false);
  assert.match(main.find(option=>option.id==='food').reason,/não aparece entre os achados previstos/);

  const kitchen=auto.quickSearchOptions(condo.preparation.areas.find(area=>area.name==='Cozinha'));
  assert.equal(kitchen.find(option=>option.id==='water').available,true);
  assert.equal(kitchen.find(option=>option.id==='food').available,true);

  const garage=auto.quickSearchOptions(condo.preparation.areas.find(area=>area.name==='Garagem'));
  assert.equal(garage.find(option=>option.id==='parts').available,true);
  assert.equal(garage.find(option=>option.id==='fuel').available,true);
});

test('interface explica atalhos indisponíveis em vez de depender de regex no nome do item', () => {
  const source=fs.readFileSync(require.resolve('../components/hex-search-dialog.tsx'),'utf8');
  assert.match(source,/Busca rápida nesta área/);
  assert.match(source,/quickSearchOptions/);
  assert.match(source,/Toque nos apagados para entender/);
  assert.match(source,/Atualizar áreas contextuais/);
  assert.doesNotMatch(source,/pattern:\s*\/água|pattern:\s*\/ração|pattern:\s*\/tratamento/);
  assert.match(source,/Busca específica encontra no máximo/);
  assert.doesNotMatch(source,/Quantidade prometida/);
  assert.match(source,/profundas \{deepUsed\}\/\{deepLimit\}/);
});


test('local já preparado sem histórico pode atualizar as áreas contextuais com o mesmo porte', () => {
  const condo = { id:'condo-old', name:'Condomínio de casas', kind:'local', signal:'Portaria', access:'', notes:'', revealed:true,
    lootTable:'Residências / condomínios', searches:[] };
  auto.prepareLocation(condo);
  const kitchen=condo.preparation.areas.find(area=>area.name==='Cozinha');
  kitchen.table='Residências / condomínios';
  const scale=condo.preparation.scale;
  assert.equal(auto.resizeLocationPreparation(condo,scale),true);
  assert.equal(condo.preparation.areas.find(area=>area.name==='Cozinha').table,'Restaurantes / cozinhas');
  assert.equal(condo.preparation.areas.find(area=>area.name==='Garagem').table,'Oficinas / postos de serviço');
});

test('porte pode ser ajustado antes da primeira busca e fica estável depois que o local ganha histórico', () => {
  const f=campaign();
  assert.equal(f.point.preparation.scale,'medium');
  assert.equal(f.point.preparation.areas.length,4);
  assert.equal(auto.resizeLocationPreparation(f.point,'large'),true);
  assert.equal(f.point.preparation.areas.length,6);
  f.area=f.point.preparation.areas[0];
  assert.equal(auto.resolvePreparedSearch(f.game,input(f),die(1)),null);
  const current=f.game.hexes['0,0'].points[0];
  const before=structuredClone(current.preparation);
  assert.equal(auto.resizeLocationPreparation(current,'small'),false);
  assert.deepEqual(current.preparation,before);
});

test('sugestão de item aparente é leve, contextual e não oferece equipamento de combate gratuito', () => {
  const f=campaign();
  const area=f.point.preparation.areas[0];
  const item=auto.suggestVisibleStock(area,(()=>{ const values=[0,0]; return ()=>values.shift() ?? 0; })());
  assert.equal(item.kind,'item');
  assert.equal(item.table,area.table);
  assert.ok(item.catalogKey);
  const category=item.catalogKey.split('::')[0];
  assert.ok(!['Armas primárias','Armas secundárias','Munição','Proteções'].includes(category));
  assert.ok(item.quantity>=1 && item.quantity<=2);

  const none=auto.suggestVisibleStock(area,()=>0.99);
  assert.equal(none.kind,'none');

  const narrative={...area,searchable:false};
  const narrativeSuggestion=auto.suggestVisibleStock(narrative,(()=>{ const values=[0.5,0]; return ()=>values.shift() ?? 0; })());
  assert.equal(narrativeSuggestion.kind,'item');
});

test('aceitar item aparente ou nada à vista resolve a camada do cômodo sem consumir busca', () => {
  const f=campaign();
  const beforeMinutes=f.game.minutes;
  const beforeAttempts=f.point.preparation.attempts.length;
  assert.equal(auto.registerVisibleStock(f.game,'0,0','market',f.area.id,'visible-procedural','Bebidas::Garrafa de água lacrada',1),null);
  let point=f.game.hexes['0,0'].points[0];
  let area=point.preparation.areas.find(row=>row.id===f.area.id);
  assert.equal(area.visibleOutcome,'item');
  assert.equal(f.game.minutes,beforeMinutes);
  assert.equal(point.preparation.attempts.length,beforeAttempts);
  assert.match(auto.resolveNoVisibleStock(f.game,'0,0','market',f.area.id),/Já existe um item aparente/);

  const other=point.preparation.areas.find(row=>row.id!==f.area.id);
  assert.ok(other);
  assert.equal(auto.resolveNoVisibleStock(f.game,'0,0','market',other.id),null);
  point=f.game.hexes['0,0'].points[0];
  area=point.preparation.areas.find(row=>row.id===other.id);
  assert.equal(area.visibleOutcome,'none');
  assert.equal(f.game.minutes,beforeMinutes);
  assert.equal(point.preparation.attempts.length,beforeAttempts);
});

test('interface de item aparente oferece aceitar, rerrolar, nada à vista e registro manual', () => {
  const source=fs.readFileSync(require.resolve('../components/hex-search-dialog.tsx'),'utf8');
  assert.match(source,/Sugestão procedural leve/);
  assert.match(source,/Sugerir item aparente/);
  assert.match(source,/Rerrolar/);
  assert.match(source,/Nada à vista/);
  assert.match(source,/Registrar manualmente/);
  assert.match(source,/35% de chance/);
  assert.match(source,/60%/);
});
test('área narrativa aceita elementos à vista, mas não uma busca d12 própria', () => {
  const f=campaign();
  const narrative=f.point.preparation.areas.find(area=>area.searchable===false);
  assert.ok(narrative);
  const before=structuredClone(f.game);
  assert.match(auto.startSearch(f.game,input(f,{areaId:narrative.id})),/não possui uma busca de recursos/);
  assert.deepEqual(f.game,before);
  assert.equal(auto.registerVisibleStock(f.game,'0,0','market',narrative.id,'visible-narrative','Bebidas::Garrafa de água lacrada',1),null);
  assert.equal(f.point.preparation.stock.find(row=>row.id==='visible-narrative').areaId,narrative.id);
});


test('áreas declaradas pelo mestre começam narrativas e não aumentam loot sem confirmação explícita', () => {
  const f=campaign();
  assert.equal(auto.declareSearchArea(f.point,'Mezanino','Escada estreita leva ao piso superior'),true);
  const area=f.point.preparation.areas.find(row=>row.name==='Mezanino');
  assert.ok(area);
  assert.equal(area.searchable,false);
  assert.equal(area.minutes,30);
  assert.match(auto.startSearch(f.game,input(f,{areaId:area.id,id:'manual-search'})),/não possui uma busca de recursos/);
});

test('histórico antigo bloqueia a área e nunca cria inventário ou estoque retroativo', () => {
  const {game,point,actor} = campaign(); delete point.preparation;
  point.searches.push({ id:'old', what:'Comida', why:'Viagem', sector:' MERCADO ', minutes:30, result:'Duas latas' });
  auto.prepareLocation(point);
  assert.equal(point.preparation.attempts[0].areaId,point.preparation.areas[0].id);
  assert.equal(point.preparation.stock.length,0); assert.equal(actor.inventory.length,0);
  assert.match(auto.startSearch(game,input({ game,point,actor,area:point.preparation.areas[0] })),/já tem/);
});
test('busca comum confirma d12, relógio, estoque e ocorrência uma única vez', () => {
  const f = campaign(); const before = f.game.minutes;
  assert.equal(auto.resolvePreparedSearch(f.game,input(f),die(1)),null);
  const point=f.game.hexes['0,0'].points[0];
  assert.equal(f.game.minutes,before+30); assert.equal(point.searches.length,1); assert.equal(point.preparation.stock.length,1);
  const after=structuredClone(f.game);
  assert.equal(auto.resolvePreparedSearch(f.game,input(f),die()),null); assert.deepEqual(f.game,after);
  assert.equal(auto.completeSearch(f.game,'0,0','market','search-1'),null); assert.deepEqual(f.game,after);
  assert.equal(auto.searchSequence(f.game,'0,0'),1);
});

test('busca profunda só abre depois da busca normal e não usa outro d12 de saque', () => {
  const f=campaign();
  const candidates=auto.deepSearchCandidateKeys(f.area);
  assert.ok(candidates.length>1);
  const early={id:'deep-early',hexId:'0,0',pointId:'market',areaId:f.area.id,participants:[f.actor.id],
    objective:'Item oculto',purpose:'Vasculhar a fundo',catalogKey:candidates[0]};
  assert.match(auto.startDeepSearch(f.game,early),/Conclua a busca normal/);

  assert.equal(auto.resolvePreparedSearch(f.game,input(f),die(1)),null);
  const point=f.game.hexes['0,0'].points[0];
  const area=point.preparation.areas.find(row=>row.id===f.area.id);
  const known=new Set(point.preparation.stock.filter(row=>row.areaId===area.id).map(row=>row.item.catalogKey));
  const key=auto.deepSearchCandidateKeys(area).find(value=>!known.has(value));
  assert.ok(key);
  const beforeMinutes=f.game.minutes;
  const deep={id:'deep-1',hexId:'0,0',pointId:'market',areaId:area.id,participants:[f.actor.id],
    objective:'Compartimento oculto',purpose:'Vasculhar a fundo',catalogKey:key};
  assert.equal(auto.startDeepSearch(f.game,deep),null);
  const attempt=point.preparation.attempts.find(row=>row.id==='deep-1');
  assert.equal(attempt.kind,'deep');
  assert.equal(attempt.mode,'specific');
  assert.equal(attempt.status,'pending');
  assert.equal(attempt.minutes,30);
  assert.ok(attempt.noise>=1);
  assert.equal(attempt.areaSnapshot.difficulty,13);
  assert.equal(attempt.roll,undefined);

  assert.equal(auto.rollSearchAccess(f.game,'0,0','market','deep-1',{actorId:f.actor.id,trait:'Instinto',edge:'none',experiences:[],other:0},die(8,7)),null);
  assert.equal(attempt.status,'ready');
  assert.equal(attempt.roll,undefined);
  assert.equal(auto.finishPreparedSearch(f.game,'0,0','market','deep-1',die()),null);
  assert.equal(f.game.minutes,beforeMinutes+30);
  const persisted=f.game.hexes['0,0'].points[0];
  const deepAttempt=persisted.preparation.attempts.find(row=>row.id==='deep-1');
  assert.equal(deepAttempt.status,'completed');
  assert.equal(deepAttempt.roll,undefined);
  assert.equal(persisted.searches.find(row=>row.id==='deep-1').depth,'deep');
  assert.equal(persisted.preparation.stock.filter(row=>row.attemptId==='deep-1').length,1);
  assert.equal(auto.searchAreaState(persisted,persisted.preparation.areas.find(row=>row.id===area.id)),'exhausted');
  assert.match(auto.startDeepSearch(f.game,{...deep,id:'deep-2'}),/já recebeu uma busca profunda/);
});


test('porte limita buscas profundas no local e força escolha entre áreas', () => {
  const f=campaign();
  assert.equal(auto.deepSearchLimit(f.point),1);
  const first=f.point.preparation.areas.find(area=>area.searchable!==false);
  const second=f.point.preparation.areas.find(area=>area.searchable!==false && area.id!==first.id);
  assert.ok(first && second);

  assert.equal(auto.resolvePreparedSearch(f.game,input(f,{id:'normal-a',areaId:first.id}),die(1)),null);
  assert.equal(auto.resolvePreparedSearch(f.game,input(f,{id:'normal-b',areaId:second.id}),die(2)),null);
  const point=f.game.hexes['0,0'].points[0];
  const freshFirst=point.preparation.areas.find(area=>area.id===first.id);
  const freshSecond=point.preparation.areas.find(area=>area.id===second.id);
  const known=new Set(point.preparation.stock.filter(row=>row.areaId===first.id).map(row=>row.item.catalogKey));
  const key=auto.deepSearchCandidateKeys(freshFirst).find(value=>!known.has(value));
  assert.ok(key);
  assert.equal(auto.startDeepSearch(f.game,{id:'deep-quota',hexId:'0,0',pointId:'market',areaId:first.id,participants:[f.actor.id],
    objective:'Reserva oculta',purpose:'Escolher onde investir tempo',catalogKey:key}),null);
  assert.equal(auto.deepSearchesUsed(f.game.hexes['0,0'].points[0]),1);
  assert.equal(auto.searchAreaState(f.game.hexes['0,0'].points[0],freshSecond),'searched');

  const secondKnown=new Set(point.preparation.stock.filter(row=>row.areaId===second.id).map(row=>row.item.catalogKey));
  const secondKey=auto.deepSearchCandidateKeys(freshSecond).find(value=>!secondKnown.has(value));
  assert.ok(secondKey);
  assert.match(auto.startDeepSearch(f.game,{id:'deep-quota-2',hexId:'0,0',pointId:'market',areaId:second.id,participants:[f.actor.id],
    objective:'Outra reserva',purpose:'Exceder limite',catalogKey:secondKey}),/já usou 1 busca/);
});

test('falha na busca profunda consome tempo e Barulho, mas não cria item', () => {
  const f=campaign();
  assert.equal(auto.resolvePreparedSearch(f.game,input(f),die(1)),null);
  const point=f.game.hexes['0,0'].points[0];
  const area=point.preparation.areas[0];
  const known=new Set(point.preparation.stock.filter(row=>row.areaId===area.id).map(row=>row.item.catalogKey));
  const key=auto.deepSearchCandidateKeys(area).find(value=>!known.has(value));
  assert.ok(key);
  const deep={id:'deep-fail',hexId:'0,0',pointId:'market',areaId:area.id,participants:[f.actor.id],
    objective:'Fundo falso',purpose:'Vasculhar a fundo',catalogKey:key};
  assert.equal(auto.startDeepSearch(f.game,deep),null);
  const beforeMinutes=f.game.minutes;
  const beforeNoise=f.game.noise;
  assert.equal(auto.rollSearchAccess(f.game,'0,0','market','deep-fail',{actorId:f.actor.id,trait:'Instinto',edge:'none',experiences:[],other:0},die(1,2)),null);
  assert.equal(auto.finishPreparedSearch(f.game,'0,0','market','deep-fail',die()),null);
  const persisted=f.game.hexes['0,0'].points[0];
  assert.equal(f.game.minutes,beforeMinutes+30);
  assert.ok(f.game.noise>beforeNoise);
  assert.equal(persisted.preparation.stock.filter(row=>row.attemptId==='deep-fail').length,0);
  assert.equal(persisted.preparation.attempts.find(row=>row.id==='deep-fail').status,'failed');
  assert.match(persisted.preparation.attempts.find(row=>row.id==='deep-fail').result,/não encontrou nada útil/);
});

test('acesso sob risco mantém rolagem e recursos ao reabrir e impede d12 após falha', () => {
  const f=campaign(); f.area.access='risk';
  assert.equal(auto.startSearch(f.game,input(f)),null);
  assert.equal(auto.rollSearchAccess(f.game,'0,0','market','search-1',{actorId:f.actor.id,trait:'Instinto',edge:'none',experiences:[],other:0},die(1,2)),null);
  assert.equal(f.game.fear,1); assert.equal(auto.rollSearchLoot(f.game,'0,0','market','search-1',die()),false);
  const after=structuredClone(f.game);
  assert.equal(auto.rollSearchAccess(f.game,'0,0','market','search-1',{actorId:f.actor.id,trait:'Instinto',edge:'none',experiences:[],other:0},die()),null); assert.deepEqual(f.game,after);
  assert.equal(auto.completeSearch(f.game,'0,0','market','search-1'),null);
  assert.equal(f.game.hexes['0,0'].points[0].preparation.stock.length,0);
  assert.equal(f.game.hexes['0,0'].points[0].preparation.attempts[0].status,'failed');
});
test('busca específica limita a uma unidade e sucesso com Medo não cria d12 ou dano automático', () => {
  const f=campaign(); f.area.access='risk';
  const key='Suprimentos abstratos::Peças (1 unidade)';
  assert.match(auto.startSearch(f.game,input(f,{mode:'specific',objective:'Peças',purpose:'Reparar o portão',catalogKey:key,quantity:2})),/no máximo 1 unidade/);
  assert.equal(f.game.hexes['0,0'].points[0].preparation.attempts.length,0);
  assert.equal(auto.startSearch(f.game,input(f,{mode:'specific',objective:'Peças',purpose:'Reparar o portão',catalogKey:key,quantity:1})),null);
  assert.equal(auto.rollSearchAccess(f.game,'0,0','market','search-1',{actorId:f.actor.id,trait:'Instinto',edge:'none',experiences:[],other:0},die(6,8)),null);
  assert.equal(auto.completeSearch(f.game,'0,0','market','search-1'),null);
  assert.equal(f.game.hexes['0,0'].points[0].preparation.stock[0].remaining,1);
  assert.equal(f.game.survivors[0].hp,0); assert.equal(f.game.conflict,undefined);
});
test('central desconta Experiência e aplica crítico conforme as regras existentes', () => {
  const f=campaign(); f.area.access='risk'; auto.startSearch(f.game,input(f));
  auto.rollSearchAccess(f.game,'0,0','market','search-1',{actorId:f.actor.id,trait:'Instinto',edge:'advantage',experiences:['origin'],other:0},die(3,3,2));
  assert.equal(f.actor.hope,3); assert.equal(f.actor.stress,1); assert.equal(f.game.fear,0);
});
test('participante em turno do abrigo não pode iniciar nem concluir busca nas mesmas horas', () => {
  const f=campaign();
  assert.equal(require('../lib/game.ts').establishShelter(f.game,'0,0'),true);
  f.game.shelter.parts=5;
  const project=shelterProjects.createShelterProject('barricades');
  f.game.shelter.projects.push(project);
  assert.equal(shelterProjects.joinShelterProjectAsSurvivor(f.game,project,f.actor.id),null);
  assert.equal(shelterProjects.startProject(f.game.shelter,project),null);
  assert.equal(shelterProjects.scheduleSurvivorWorkShift(f.game,project,f.actor.id,4).ok,true);
  const before=structuredClone(f.game);
  assert.match(auto.startSearch(f.game,input(f)),/ocupado/i);
  assert.deepEqual(f.game,before);

  project.volunteerShifts=[];
  assert.equal(auto.startSearch(f.game,input(f)),null);
  auto.rollSearchLoot(f.game,'0,0','market','search-1',die(1));
  assert.equal(shelterProjects.scheduleSurvivorWorkShift(f.game,project,f.actor.id,4).ok,true);
  const pending=structuredClone(f.game);
  assert.match(auto.completeSearch(f.game,'0,0','market','search-1'),/ocupado/i);
  assert.deepEqual(f.game,pending);
});

test('busca de subgrupo atrasado preenche janela paralela sem avançar novamente o relógio geral', () => {
  const f=campaign();
  const archetype=content.archetypes[0];
  const other=initialSurvivor({ name:'Bia', origin:content.origins[0].name, past:'', archetype:archetype.name,
    specialty:archetype.specialties[0].name, freeExperience:'Vigilância', techniques:[],
    attributes:{ Agilidade:1, Força:1, Finesse:1, Instinto:1, Presença:0, Conhecimento:0 },
    primary:'', secondary:'', protection:'', personal:'' });
  other.hex='0,0'; other.inventory=[];
  f.game.survivors.push(other);

  const start=f.game.minutes;
  const outside=campaignTime.advanceParticipantTime(f.game,[other.id],60);
  assert.equal(outside.ok,true);
  assert.equal(f.game.minutes,start+60);
  assert.equal(f.game.parallelTime.survivorMinutes[f.actor.id],start);

  const beforeSearch=f.game.minutes;
  assert.equal(auto.resolvePreparedSearch(f.game,input(f),die(1)),null);
  assert.equal(f.game.minutes,beforeSearch);
  assert.equal(f.game.parallelTime.survivorMinutes[f.actor.id],start+f.area.minutes);
  assert.ok(f.game.log.some(row=>row.kind==='busca' && /em paralelo/.test(row.text)));
});

test('falha de validação e passagem de dia não cobram tempo ou habilidade', () => {
  const f=campaign('Trabalhador(a) de depósito'); f.area.minutes=60;
  auto.startSearch(f.game,input(f,{warehouseWorker:f.actor.id}));
  auto.rollSearchLoot(f.game,'0,0','market','search-1',die(1));
  f.game.minutes=1420; const before=structuredClone(f.game);
  assert.match(auto.completeSearch(f.game,'0,0','market','search-1'),/passagem de dia/); assert.deepEqual(f.game,before);
});
test('habilidade de depósito reduz tempo e usa a mesma chave da ficha', () => {
  const f=campaign('Trabalhador(a) de depósito'); f.area.minutes=60;
  assert.equal(auto.resolvePreparedSearch(f.game,input(f,{warehouseWorker:f.actor.id}),die(1)),null);
  assert.equal(f.game.hexes['0,0'].points[0].preparation.attempts[0].minutes,30);
  const origin=content.origins.find(row=>row.name===f.actor.origin);
  assert.equal(abilityAvailable(f.game,f.actor.id,`origin:${origin.name}`,origin.effect),false);
  assert.equal(auto.warehouseWorkers(f.game,'0,0').length,0);
});
test('apoio de Docente exige seleção, aliado participante e registra Estresse uma vez', () => {
  const f=campaign(); const mentor=structuredClone(f.actor); mentor.id='mentor'; mentor.origin='Docente'; mentor.stress=0; f.game.survivors.push(mentor); f.area.access='risk';
  auto.startSearch(f.game,input(f,{participants:[f.actor.id,mentor.id]}));
  const roll={actorId:f.actor.id,trait:'Instinto',edge:'none',experiences:[],other:0,mentorId:mentor.id};
  assert.equal(auto.rollSearchAccess(f.game,'0,0','market','search-1',roll,die(5,6)),null); assert.equal(mentor.stress,1);
  assert.equal(f.point.preparation.attempts[0].outcome.total,12);
  auto.rollSearchAccess(f.game,'0,0','market','search-1',roll,die()); assert.equal(mentor.stress,1);
});
test('participante ausente, área duplicada e bloqueio não geram operações', () => {
  const f=campaign(); f.actor.hex='1,0'; let before=structuredClone(f.game);
  assert.ok(auto.startSearch(f.game,input(f))); assert.deepEqual(f.game,before);
  f.actor.hex='0,0'; f.area.access='blocked'; before=structuredClone(f.game);
  assert.ok(auto.startSearch(f.game,input(f))); assert.deepEqual(f.game,before);
  assert.equal(auto.declareSearchArea(f.point,' ÁREA   PRINCIPAL ','Outra porta'),false);
  f.area.access='risk'; auto.startSearch(f.game,input(f));
  assert.equal(auto.declareSearchArea(f.point,'Nova sala','Sinal real'),false);
});
test('tabela e condições ficam congeladas na tentativa e ajustes conservam d12 original', () => {
  const f=campaign(); f.area.excludedRolls=[1,2]; f.area.exclusionReason='Estas prateleiras já foram esvaziadas';
  auto.startSearch(f.game,input(f)); f.area.table=content.lootTables[0].name;
  auto.rollSearchLoot(f.game,'0,0','market','search-1',die(1));
  const attempt=f.point.preparation.attempts[0]; assert.equal(attempt.roll,1); assert.equal(attempt.effectiveRoll,3); assert.match(attempt.adjustmentReason,/esvaziadas/);
  auto.completeSearch(f.game,'0,0','market','search-1'); assert.equal(f.game.hexes['0,0'].points[0].searches[0].table,content.lootTables[1].name);
});
test('achados condicionais usam alternativa, e armas encontradas não incluem munição', () => {
  const f=campaign(); const area=f.area;
  area.table='Ruas / veículos abandonados'; assert.match(auto.searchLoot(area,12)[0].catalogKey,/Rádio/);
  area.compatibleOwner=true; assert.match(auto.searchLoot(area,12)[0].catalogKey,/Pistola/);
  area.table='Obras / instalações em reforma'; assert.match(auto.searchLoot(area,12)[0].catalogKey,/Roupa reforçada/);
  area.armedGuard=true; assert.match(auto.searchLoot(area,12)[0].catalogKey,/Colete/);
  for(const table of auto.lootDefinitions) for(const row of table.entries) {
    const items=auto.searchLoot({...area,table:table.table},row.roll);
    if(items.some(item=>entry(item.catalogKey).category.startsWith('Armas'))) assert.equal(items.some(item=>entry(item.catalogKey).category==='Munição'),false);
  }
});
test('recolhimento parcial conserva saldo, estado físico e impede repetição', () => {
  const f=campaign(); const key='Bebidas::Garrafa de água lacrada';
  auto.registerVisibleStock(f.game,'0,0','market',f.area.id,'visible',key,3);
  const beforeTime=f.game.minutes;
  assert.equal(auto.collectLocationStock(f.game,'0,0','market','collect-1',[{stockId:'visible',ownerId:f.actor.id,quantity:1}]),null);
  const p=f.game.hexes['0,0'].points[0]; assert.equal(p.preparation.stock[0].remaining,2); assert.equal(f.game.minutes,beforeTime);
  const item=f.game.survivors[0].inventory[0]; assert.equal(item.foundDay,f.game.day); assert.ok(item.provisionResource); assert.equal(item.catalogKey,key);
  const before=structuredClone(f.game); auto.collectLocationStock(f.game,'0,0','market','collect-1',[{stockId:'visible',ownerId:f.actor.id,quantity:1}]); assert.deepEqual(f.game,before);
});
test('retirada agregada excessiva e carga insuficiente revertem o lote inteiro', () => {
  const f=campaign(); auto.registerVisibleStock(f.game,'0,0','market',f.area.id,'visible','Suprimentos abstratos::Peças (1 unidade)',3);
  const before=structuredClone(f.game);
  assert.ok(auto.collectLocationStock(f.game,'0,0','market','bad',[{stockId:'visible',ownerId:f.actor.id,quantity:2},{stockId:'visible',ownerId:f.actor.id,quantity:2}])); assert.deepEqual(f.game,before);
  f.actor.inventory.push(itemFromCatalog(entry('Suprimentos abstratos::Peças (1 unidade)'),99));
  const full=structuredClone(f.game); assert.ok(auto.collectLocationStock(f.game,'0,0','market','full',[{stockId:'visible',ownerId:f.actor.id,quantity:1}])); assert.deepEqual(f.game,full);
  assert.equal(auto.suggestCollection(f.game,'0,0','market').length,0);
});
test('sugestão distribui somente o que cabe e deixa excedente no local', () => {
  const f=campaign(); auto.registerVisibleStock(f.game,'0,0','market',f.area.id,'visible','Suprimentos abstratos::Peças (1 unidade)',20);
  const before=structuredClone(f.game); const plan=auto.suggestCollection(f.game,'0,0','market'); assert.deepEqual(f.game,before);
  assert.ok(plan.reduce((sum,row)=>sum+row.quantity,0)<20);
  assert.equal(auto.collectLocationStock(f.game,'0,0','market','plan',plan),null);
  const stats=survivorStats(f.game.survivors[0]); assert.ok(stats.carried<=stats.capacity); assert.ok(f.game.hexes['0,0'].points[0].preparation.stock[0].remaining>0);
});
test('posse pendente impede coleta e o abrigo não recebe itens à distância', () => {
  const f=campaign(); auto.registerVisibleStock(f.game,'0,0','market',f.area.id,'visible','Bebidas::Garrafa de água lacrada',1);
  f.point.preparation.stock[0].accessible=false; const before=structuredClone(f.game);
  assert.ok(auto.collectLocationStock(f.game,'0,0','market','blocked',[{stockId:'visible',ownerId:f.actor.id,quantity:1}])); assert.deepEqual(f.game,before);
  f.point.preparation.stock[0].accessible=true; f.game.shelter.hex='1,0'; const remote=structuredClone(f.game);
  assert.ok(auto.collectLocationStock(f.game,'0,0','market','remote',[{stockId:'visible',ownerId:'shared',quantity:1}])); assert.deepEqual(f.game,remote);
});
test('depósito físico exige retorno, preserva munição comprometida e não duplica reservas', () => {
  const f=campaign(); f.actor.inventory.push(itemFromCatalog(entry('Suprimentos abstratos::Peças (1 unidade)'),1));
  f.game.shelter.hex='1,0'; const before=structuredClone(f.game); assert.ok(auto.depositExpeditionItems(f.game,[f.actor.id])); assert.deepEqual(f.game,before);
  f.game.shelter.hex='0,0'; const parts=f.game.shelter.parts;
  assert.equal(auto.depositExpeditionItems(f.game,[f.actor.id]),null); assert.equal(f.game.shelter.inventory.length,1); assert.equal(f.game.shelter.parts,parts); assert.equal(f.game.survivors[0].inventory.length,0);
});
test('eventos de busca novos ignoram histórico anterior, incluindo busca legada posterior', () => {
  const f=campaign(); auto.resolvePreparedSearch(f.game,input(f),die(1)); auto.prepareHex(f.game,'0,0');
  const event=f.game.hexes['0,0'].events[0]; assert.equal(eventTriggerReady(f.game,'0,0',event),false);
  assert.equal(recordSearch(f.game,{hex:'0,0',pointId:'market',sector:'Sala distinta',mode:'specific',what:'Água',result:'Nada',minutes:30}),true);
  assert.equal(eventTriggerReady(f.game,'0,0',event),true); assert.equal(event.status,'pending');
  const publicGame=projectPlayerGame(f.game,f.actor.id); assert.equal(publicGame.hexes['0,0'].searchSequence,undefined);
});
test('entrada com preferência prepara privado sem alterar tempo de viagem ou iniciar conflito', () => {
  const f=campaign(); f.game.explorationPreferences={autoPrepare:true,participantIds:[f.actor.id]}; assignCustomSector(f.game,'1,0','Distrito industrial','avistado');
  const before=f.game.minutes; assert.equal(moveSurvivors(f.game,'1,0',[f.actor.id]).ok,true);
  assert.equal(f.game.minutes,before+60); assert.ok(f.game.hexes['1,0'].points.length); assert.equal(f.game.hexes['1,0'].points[0].revealed,false); assert.equal(f.game.conflict,undefined);
});
test('rascunhos de eventos são estáveis, reservados e nunca criam entidades', () => {
  const f=campaign(); const event={id:'event',text:'Uma pessoa pede ajuda.',trigger:'',revealed:false,generatorCategory:'Pessoas / animais'};
  const before=structuredClone(f.game); const one=prepareSuggestedEventAction(f.game,'0,0',event,'npc'); const two=prepareSuggestedEventAction(f.game,'0,0',event,'npc');
  assert.deepEqual(one,two); assert.ok(one.name); assert.ok(one.role); assert.equal(one.visibleToPlayers,false); assert.deepEqual(f.game,before);
});
test('estado malformado ou acima dos limites não entra na campanha', () => {
  const f=campaign(); assert.equal(validWorld(f.game.hexes),true);
  f.area.noise=6; assert.equal(validWorld(f.game.hexes),false); f.area.noise=0;
  f.area.excludedRolls=Array.from({length:12},(_,i)=>i+1); assert.equal(validWorld(f.game.hexes),false); delete f.area.excludedRolls;
  auto.registerVisibleStock(f.game,'0,0','market',f.area.id,'visible','Bebidas::Garrafa de água lacrada',1);
  f.point.preparation.stock[0].remaining=2; assert.equal(validWorld(f.game.hexes),false);
  assert.equal(validExplorationPreferences({autoPrepare:true,participantIds:['x','x']}),false);
});
test('carrinho já aberto recebe o excedente dentro de quatro espaços sem equipar itens', () => {
 const f=campaign(); const cart=itemFromCatalog(content.catalog.find(row=>row.name==='Carrinho dobrável')); cart.cartDeployed=true; cart.cartItems=[]; f.actor.inventory.push(cart);
 auto.registerVisibleStock(f.game,'0,0','market',f.area.id,'visible','Suprimentos abstratos::Peças (1 unidade)',20);
 const plan=auto.suggestCollection(f.game,'0,0','market'); assert.ok(plan.some(row=>row.cartId===cart.id));
 assert.equal(auto.collectLocationStock(f.game,'0,0','market','cart-plan',plan),null);
 const stats=survivorStats(f.game.survivors[0]); assert.equal(stats.cart.carried,4); assert.ok(stats.carried<=stats.capacity);
});
test('combustível em tanque exige recipiente e preenche galão sem duplicar reserva', () => {
 const f=campaign(); f.area.table='Ruas / veículos abandonados'; auto.resolvePreparedSearch(f.game,input(f),die(11));
 const stock=f.game.hexes['0,0'].points[0].preparation.stock[0]; const line={stockId:stock.id,ownerId:f.actor.id,quantity:1}; const before=structuredClone(f.game);
 assert.match(auto.collectLocationStock(f.game,'0,0','market','fuel',[line]),/galão/); assert.deepEqual(f.game,before);
 f.game.survivors[0].inventory.push(itemFromCatalog(content.catalog.find(row=>row.name==='Galão vazio')));
 const fuel=f.game.shelter.fuel; assert.equal(auto.collectLocationStock(f.game,'0,0','market','fuel',[line]),null);
 const gallon=f.game.survivors[0].inventory.find(row=>row.name==='Galão vazio'); assert.equal(gallon.storedResource,'fuel'); assert.equal(gallon.storedAmount,1); assert.equal(f.game.shelter.fuel,fuel);
 assert.equal(f.game.survivors[0].inventory.some(row=>row.name==='Combustível (1 unidade)'),false);
});
test('alimento deixado no local usa o prazo do catálogo e preserva condição na coleta', () => {
 const f=campaign(); const food=content.catalog.find(row=>row.category==='Alimentos'&&row.fields.some(field=>field.label==='Prazo'&&field.value==='R'));
 assert.ok(food); auto.registerVisibleStock(f.game,'0,0','market',f.area.id,'food',catalogKey(food),1); f.game.day+=3;
 assert.ok(auto.expireLocationFood(f.game).length); assert.equal(f.point.preparation.stock[0].item.condition,'Estragado');
 assert.equal(auto.collectLocationStock(f.game,'0,0','market','spoiled',[{stockId:'food',ownerId:f.actor.id,quantity:1}]),null);
 assert.equal(f.game.survivors[0].inventory[0].condition,'Estragado');
});
test('habilidade usada em outra tela não é cobrada ou duplicada na conclusão', () => {
 const f=campaign('Trabalhador(a) de depósito'); f.area.minutes=60; auto.startSearch(f.game,input(f,{warehouseWorker:f.actor.id})); auto.rollSearchLoot(f.game,'0,0','market','search-1',die(1));
 const {recordAbilityUse}=require('../lib/abilities.ts'); const origin=content.origins.find(row=>row.name===f.actor.origin); recordAbilityUse(f.game,f.actor.id,`origin:${origin.name}`,origin.feature,origin.effect,'free');
 const before=structuredClone(f.game); assert.match(auto.completeSearch(f.game,'0,0','market','search-1'),/outra operação/); assert.deepEqual(f.game,before);
});
test('estoque já conhecido não ganha outra cópia por busca específica', () => {
 const f=campaign(); const key='Bebidas::Garrafa de água lacrada'; auto.registerVisibleStock(f.game,'0,0','market',f.area.id,'visible',key,1);
 const before=structuredClone(f.game); assert.match(auto.startSearch(f.game,input(f,{mode:'specific',objective:'Água',purpose:'Beber',catalogKey:key})),/já é conhecido/); assert.deepEqual(f.game,before);
});
test('plano usa somente participantes escolhidos e respeita preferência de carrinho', () => {
 const f=campaign(); const other=structuredClone(f.actor); other.id='other'; f.game.survivors.push(other);
 const cart=itemFromCatalog(content.catalog.find(row=>row.name==='Carrinho dobrável')); cart.cartDeployed=true; cart.cartItems=[]; f.actor.inventory.push(cart);
 f.game.explorationPreferences={autoPrepare:false,participantIds:[f.actor.id],transport:'cart-first'};
 auto.registerVisibleStock(f.game,'0,0','market',f.area.id,'visible','Suprimentos abstratos::Peças (1 unidade)',10);
 const plan=auto.suggestCollection(f.game,'0,0','market',[f.actor.id]); assert.ok(plan.every(row=>row.ownerId===f.actor.id)); assert.equal(plan[0].cartId,cart.id);
 assert.equal(auto.collectLocationStock(f.game,'0,0','market','preferred',plan),null); assert.equal(f.game.survivors[1].inventory.length,0);
});
test('depósito descarrega carrinho e guarda somente munição livre', () => {
 const f=campaign(); f.game.shelter.hex='0,0';
 const cart=itemFromCatalog(content.catalog.find(row=>row.name==='Carrinho dobrável')); cart.cartDeployed=true; cart.cartItems=[itemFromCatalog(entry('Suprimentos abstratos::Peças (1 unidade)'),2)]; f.actor.inventory.push(cart);
 const ammo=itemFromCatalog(entry('Munição::Munição de Pistola'),2); ammo.committedAmmo=1; f.actor.inventory.push(ammo);
 assert.equal(auto.depositExpeditionItems(f.game,[f.actor.id]),null);
 const actor=f.game.survivors[0]; assert.equal(actor.inventory.find(row=>row.id===cart.id).cartItems.length,0); assert.equal(actor.inventory.find(row=>row.id===ammo.id).qty,1);
 assert.equal(f.game.shelter.inventory.find(row=>row.category==='Munição').qty,1); assert.equal(f.game.shelter.inventory.find(row=>row.name.includes('Peças')).qty,2);
});
test('concluir busca com risco reúne d12 e relógio e preserva o resultado entre confirmações', () => {
 const f=campaign(); f.area.access='risk'; auto.startSearch(f.game,input(f)); auto.rollSearchAccess(f.game,'0,0','market','search-1',{actorId:f.actor.id,trait:'Instinto',edge:'none',experiences:[],other:0},die(6,8));
 const minutes=f.game.minutes; assert.equal(auto.finishPreparedSearch(f.game,'0,0','market','search-1',die(2)),null); assert.equal(f.game.minutes,minutes+30);
 const before=structuredClone(f.game); assert.equal(auto.finishPreparedSearch(f.game,'0,0','market','search-1',die()),null); assert.deepEqual(f.game,before);
});
test('excluir histórico depois de preparar evento não apaga sua referência de ocorrência', () => {
 const f=campaign(); auto.resolvePreparedSearch(f.game,input(f),die(1)); auto.prepareHex(f.game,'0,0'); const event=f.game.hexes['0,0'].events[0];
 f.game.hexes['0,0'].points[0].searches=[];
 assert.equal(recordSearch(f.game,{hex:'0,0',pointId:'market',sector:'Sala separada',mode:'specific',what:'Água',result:'Nada',minutes:30}),true);
 assert.equal(eventTriggerReady(f.game,'0,0',event),true);
});
