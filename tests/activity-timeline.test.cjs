/* eslint-disable @typescript-eslint/no-require-imports -- Node loader for project TS. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, path);
const { defaultState, initialSurvivor, content, survivorHex, establishShelter } = require('../lib/game.ts');
const { assignCustomSector } = require('../lib/sectors.ts');
const { scheduleSurvivorTravel } = require('../lib/hex-actions.ts');
const { prepareLocation, schedulePreparedSearch, rollSearchAccess, finishPreparedSearch } = require('../lib/hex-automation.ts');
const { scheduleGroupRest, recordAbilityUse, abilityAvailable } = require('../lib/abilities.ts');
const { requestTableRest, confirmTableRest, currentTableRest } = require('../lib/table-rest.ts');
const { advanceToNextActivity, nextActivityMinute, setCampaignTime } = require('../lib/time.ts');
const { runningActivities, cancelActivity } = require('../lib/activity-timeline.ts');
const { validActivities } = require('../lib/activity-timeline-validation.ts');
const { projectPlayerGame, applyPlayerChange } = require('../lib/collaboration.ts');
const { applyPlayerAction, playerActionState } = require('../lib/player-actions.ts');
const { closeDay } = require('../lib/survival.ts');
const work = require('../lib/shelter-projects.ts');

function fixture() {
  const game = defaultState(); game.minutes = 540;
  game.survivors = ['Ana', 'Bia', 'Caio'].map(name => {
    const archetype = content.archetypes[0];
    const person = initialSurvivor({ name, origin: content.origins[1].name, past: '', archetype: archetype.name, specialty: archetype.specialties[0].name, freeExperience: 'Resgates', techniques: [], attributes: { Agilidade: 2, Força: 1, Finesse: 1, Instinto: 0, Presença: 0, Conhecimento: -1 }, primary: '', secondary: '', protection: '', personal: '' });
    person.hex = '0,0'; person.hope = 3; person.hp = 2; return person;
  });
  game.survivors[2].hex = '1,0';
  assignCustomSector(game, '0,0', 'Mercado', 'explorado');
  assignCustomSector(game, '1,0', 'Garagens', 'avistado');
  game.hexes['1,0'].routeHours = 1; game.hexes['0,0'].events = [];
  const point = { id: 'market', name: 'Mercado', kind: 'comércio', signal: '', access: '', notes: '', revealed: true, lootTable: content.lootTables[1].name, searches: [] };
  game.hexes['0,0'].points = [point]; prepareLocation(point);
  const area = point.preparation.areas[0]; area.minutes = 30; area.access = 'open'; area.noise = 0;
  return { game, ids: game.survivors.map(p => p.id), point, area };
}
function search(f, id = 'search-b', ids = [f.ids[1]]) {
  const key = `${content.catalog[0].category}::${content.catalog[0].name}`;
  return schedulePreparedSearch(f.game, { id, hexId: '0,0', pointId: f.point.id, areaId: f.area.id, participants: ids, mode: 'specific', objective: content.catalog[0].name, purpose: 'Suprimentos', catalogKey: key, quantity: 1 });
}
function plans(ids, action = 'hp') { return ids.map(id => ({ survivorId: id, choices: [{ action, targetId: id }, { action: 'prepare', targetId: id }] })); }

test('viagem e busca compartilham o intervalo; efeitos só entram na conclusão cronológica', () => {
  const f = fixture();
  assert.equal(scheduleSurvivorTravel(f.game, '1,0', [f.ids[0]]).ok, true);
  assert.equal(search(f), null);
  assert.equal(f.game.minutes, 540); assert.equal(survivorHex(f.game, f.ids[0]), '0,0');
  assert.equal(f.point.preparation.stock.length, 0); assert.equal(nextActivityMinute(f.game), 570);
  assert.equal(advanceToNextActivity(f.game, () => 1).ok, true);
  assert.equal(f.game.minutes, 570); assert.equal(survivorHex(f.game, f.ids[0]), '0,0');
  const point = f.game.hexes['0,0'].points[0]; assert.equal(point.preparation.stock.length, 1);
  assert.equal(runningActivities(f.game).length, 1);
  const other = point.preparation.areas.find(a => a.id !== f.area.id && a.searchable !== false);
  other.access = 'open'; other.minutes = 30; other.noise = 0; f.area = other;
  assert.equal(search(f, 'search-b-2'), null);
  assert.equal(advanceToNextActivity(f.game, () => 1).ok, true);
  assert.equal(f.game.minutes, 600); assert.equal(survivorHex(f.game, f.ids[0]), '1,0');
  assert.equal(runningActivities(f.game).length, 0);
  assert.equal(f.game.hexes['0,0'].points[0].preparation.stock.length, 2);
  assert.equal(nextActivityMinute(f.game), null);
});

test('mesmo participante não pode viajar, buscar, descansar ou trabalhar nas mesmas horas', () => {
  const f = fixture(); assert.equal(search(f), null);
  assert.equal(scheduleSurvivorTravel(f.game, '1,0', [f.ids[1]]).ok, false);
  assert.equal(scheduleGroupRest(f.game, 'short', plans([f.ids[1]])).ok, false);
  establishShelter(f.game, '0,0'); f.game.shelter.parts = 10;
  const project = work.createShelterProject('barricades'); f.game.shelter.projects.push(project);
  work.joinShelterProjectAsSurvivor(f.game, project, f.ids[1]); work.startProject(f.game.shelter, project);
  assert.equal(work.scheduleSurvivorWorkShift(f.game, project, f.ids[1], 1).ok, false);
});

test('descanso de subgrupo recupera apenas participantes e renova somente suas habilidades', () => {
  const f = fixture(); const effect = 'Uma vez por descanso curto';
  for (const id of f.ids) assert.equal(recordAbilityUse(f.game, id, 'rest-power', 'Apoio', effect, 'free'), true);
  assert.equal(scheduleGroupRest(f.game, 'short', plans([f.ids[1]])).ok, true);
  assert.equal(f.game.survivors[1].hp, 2); assert.equal(f.game.fear, 0);
  assert.equal(scheduleSurvivorTravel(f.game, '1,0', [f.ids[0]]).ok, true);
  advanceToNextActivity(f.game, () => 1);
  assert.equal(f.game.minutes, 600); assert.equal(f.game.survivors[1].hp, 0);
  assert.equal(f.game.survivors[2].hp, 2);
  assert.equal(abilityAvailable(f.game, f.ids[1], 'rest-power', effect), true);
  assert.equal(abilityAvailable(f.game, f.ids[0], 'rest-power', effect), false);
  assert.equal(abilityAvailable(f.game, f.ids[2], 'rest-power', effect), false);
});

test('descansos independentes aguardam confirmações apenas dos convidados de cada grupo', () => {
  const f = fixture(); f.game.survivors[2].hex = '1,0';
  assert.equal(requestTableRest(f.game, 'short', f.ids[0], [f.ids[0], f.ids[1]]), null);
  assert.equal(requestTableRest(f.game, 'short', f.ids[2], [f.ids[2]]), null);
  const first = currentTableRest(f.game, f.ids[0]); const second = currentTableRest(f.game, f.ids[2]);
  assert.notEqual(first.id, second.id);
  assert.equal(confirmTableRest(f.game, f.ids[0], first.id, plans([f.ids[0]])[0].choices), null);
  assert.equal(runningActivities(f.game).length, 0);
  assert.equal(confirmTableRest(f.game, f.ids[1], first.id, plans([f.ids[1]])[0].choices), null);
  assert.equal(confirmTableRest(f.game, f.ids[2], second.id, plans([f.ids[2]])[0].choices), null);
  assert.equal(runningActivities(f.game).length, 2); assert.equal(f.game.minutes, 540);
  advanceToNextActivity(f.game, () => 1); assert.equal(f.game.minutes, 600);
  assert.equal(f.game.survivors.every(p => p.hp === 0), true);
});

test('resultado pendente de acesso impede salto além do horário; resolver acesso permite retomar', () => {
  const f = fixture(); f.area.access = 'risk';
  assert.equal(search(f), null); assert.equal(scheduleSurvivorTravel(f.game, '1,0', [f.ids[0]]).ok, true);
  const advance = setCampaignTime(f.game, 660); assert.match(advance.issue, /acesso/);
  assert.equal(f.game.minutes, 570); assert.equal(survivorHex(f.game, f.ids[0]), '0,0');
  assert.equal(rollSearchAccess(f.game, '0,0', 'market', 'search-b', { actorId: f.ids[1], trait: 'Agilidade', edge: 'none', experiences: [], other: 0 }, () => 12), null);
  assert.equal(finishPreparedSearch(f.game, '0,0', 'market', 'search-b'), null);
  assert.equal(advanceToNextActivity(f.game, () => 1).ok, true); assert.equal(f.game.minutes, 570);
  assert.equal(f.game.hexes['0,0'].points[0].preparation.stock.length, 1);
  advanceToNextActivity(f.game, () => 1); assert.equal(f.game.minutes, 600);
});

test('interrupção libera participantes sem conceder achados, recuperação ou chegada', () => {
  const f = fixture(); assert.equal(search(f), null);
  setCampaignTime(f.game, 555); assert.equal(f.game.minutes, 555);
  assert.equal(cancelActivity(f.game, 'search-b'), true); assert.equal(cancelActivity(f.game, 'search-b'), false);
  assert.equal(f.game.minutes, 555); assert.equal(f.game.hexes['0,0'].points[0].preparation.stock.length, 0);
  assert.equal(scheduleSurvivorTravel(f.game, '1,0', [f.ids[1]]).ok, true);
  const id = runningActivities(f.game)[0].id; cancelActivity(f.game, id);
  assert.equal(survivorHex(f.game, f.ids[1]), '0,0'); assert.equal(nextActivityMinute(f.game), null);
});

test('ajuste manual conclui em ordem e não permite retroceder com atividades em andamento', () => {
  const f = fixture(); search(f); scheduleSurvivorTravel(f.game, '1,0', [f.ids[0]]);
  const before = structuredClone(f.game); assert.equal(setCampaignTime(f.game, 500).ok, false); assert.deepEqual(f.game, before);
  assert.equal(setCampaignTime(f.game, 660).ok, true); assert.equal(f.game.minutes, 660);
  const completion = f.game.log.filter(log => ['busca', 'travessia'].includes(log.kind)).reverse();
  assert.deepEqual(completion.map(log => log.time), ['09:30', '10:00']);
  assert.equal(setCampaignTime(f.game, 500).ok, true);
});

test('fim do dia não ignora atividade pendente e atividade que alcança meia-noite é rejeitada', () => {
  const f = fixture(); search(f); const before = structuredClone(f.game);
  assert.equal(closeDay(f.game, 0, 0), false); assert.deepEqual(f.game, before);
  cancelActivity(f.game, 'search-b'); f.game.minutes = 1410; f.area = f.game.hexes['0,0'].points[0].preparation.areas.find(a => a.id !== f.area.id && a.searchable !== false); f.area.access = 'open'; f.area.minutes = 30;
  assert.equal(search(f, 'late'), 'A busca precisa terminar antes da passagem de dia para este grupo.');
  assert.equal(scheduleSurvivorTravel(f.game, '1,0', [f.ids[0]]).ok, false);
});

test('reenvios e recarregamento preservam agendamento sem duplicar efeitos', () => {
  const f = fixture(); assert.equal(search(f), null); assert.equal(search(f), null);
  assert.equal(runningActivities(f.game).length, 1);
  f.game = JSON.parse(JSON.stringify(f.game)); assert.equal(validActivities(f.game.activities, f.game), true);
  advanceToNextActivity(f.game, () => 1); const after = structuredClone(f.game);
  assert.equal(advanceToNextActivity(f.game).ok, false); assert.deepEqual(f.game, after);
  assert.equal(f.game.hexes['0,0'].points[0].preparation.stock.length, 1);
});

test('projeção pública mostra atividades sem escolhas privadas, estoque futuro ou estado interno', () => {
  const f = fixture(); search(f); scheduleGroupRest(f.game, 'short', plans([f.ids[0]]));
  const view = projectPlayerGame(f.game, f.ids[1]);
  assert.equal(view.activities, undefined); assert.equal(view.publicActivities.length, 2);
  assert.equal(JSON.stringify(view.publicActivities).includes('selections'), false);
  assert.equal(view.publicPlayerActions.stock.length, 0); assert.match(view.publicPlayerActions.busy, /Busca/);
  const changed = structuredClone(view.survivors[0]); changed.restCounters = { short: 999, long: 999 };
  assert.equal(applyPlayerChange(f.game, f.ids[1], view.survivors[0], changed, 0, []), null);
});

test('schema rejeita dupla ocupação e escolhas de descanso fora dos participantes', () => {
  const f = fixture(); scheduleGroupRest(f.game, 'short', plans([f.ids[0]]));
  assert.equal(validActivities(f.game.activities, f.game), true);
  const duplicate = structuredClone(f.game.activities[0]); duplicate.id = 'another';
  assert.equal(validActivities([...f.game.activities, duplicate], f.game), false);
  duplicate.participantIds = [f.ids[1]];
  assert.equal(validActivities([duplicate], f.game), false);
});

test('jogador inicia viagem sem mover a posição; mestre conclui e publica a chegada', () => {
  const f = fixture(); const state = playerActionState(f.game); state.policy.routes = [{ from: '0,0', to: '1,0' }]; f.game.playerActions = state;
  let result = applyPlayerAction(f.game, f.ids[0], { type: 'travel', id: 'travel-op', day: 1, destination: '1,0' });
  assert.equal(result.ok, true); f.game = result.state;
  result = applyPlayerAction(f.game, f.ids[0], { type: 'execute', id: 'execute-travel', day: 1, operationId: 'travel-op' });
  assert.equal(result.ok, true); f.game = result.state;
  assert.equal(f.game.minutes, 540); assert.equal(survivorHex(f.game, f.ids[0]), '0,0');
  assert.equal(f.game.playerActions.operations[0].status, 'scheduled');
  advanceToNextActivity(f.game, () => 1);
  assert.equal(f.game.playerActions.operations[0].status, 'done');
  assert.equal(projectPlayerGame(f.game, f.ids[0]).survivors[0].hex, '1,0');
});

test('turnos do abrigo usam o mesmo próximo horário das atividades de campo', () => {
  const f = fixture(); establishShelter(f.game, '0,0'); f.game.shelter.parts = 10;
  const project = work.createShelterProject('barricades'); f.game.shelter.projects.push(project);
  assert.equal(work.joinShelterProjectAsSurvivor(f.game, project, f.ids[0]), null);
  assert.equal(work.startProject(f.game.shelter, project), null);
  assert.equal(work.scheduleSurvivorWorkShift(f.game, project, f.ids[0], 1).ok, true);
  assert.equal(search(f), null); advanceToNextActivity(f.game, () => 1);
  assert.equal(f.game.minutes, 570); assert.equal(project.volunteerShifts.length, 1);
  advanceToNextActivity(f.game, () => 1); assert.equal(f.game.minutes, 600);
  assert.equal(f.game.shelter.projects[0].volunteerShifts.length, 0);
});

test('tratamento reserva medicamento e aguarda conclusão sem limpar Exposição antecipadamente', () => {
  const { scheduleExposureTreatment } = require('../lib/treatment.ts');
  const f=fixture(); f.game.survivors[0].infection='Exposto'; f.game.survivors[0].exposureDeadline=700;
  f.game.shelter.hex='0,0';f.game.shelter.medications=1;
  assert.equal(scheduleExposureTreatment(f.game,f.ids[0],'shared',true).ok,true);
  assert.equal(f.game.shelter.medications,0);assert.equal(f.game.survivors[0].infection,'Exposto');
  assert.equal(scheduleSurvivorTravel(f.game,'1,0',[f.ids[0]]).ok,false);
  advanceToNextActivity(f.game,()=>12);assert.equal(f.game.minutes,570);
  assert.equal(f.game.survivors[0].infection,'Saudável');
});

test('busca legada pendente é adotada uma única vez sem liberar estoque nem cobrar tempo', () => {
  const { restorePendingActivities } = require('../lib/activity-timeline.ts');
  const { startSearch } = require('../lib/hex-automation.ts');
  const f=fixture();const key=`${content.catalog[0].category}::${content.catalog[0].name}`;
  assert.equal(startSearch(f.game,{id:'legacy-search',hexId:'0,0',pointId:'market',areaId:f.area.id,participants:[f.ids[0]],mode:'specific',objective:'Teste',purpose:'Suprimentos',catalogKey:key}),null);
  restorePendingActivities(f.game);const saved=structuredClone(f.game);restorePendingActivities(f.game);assert.deepEqual(f.game,saved);
  assert.equal(runningActivities(f.game).length,1);assert.equal(f.game.minutes,540);assert.equal(f.game.hexes['0,0'].points[0].preparation.stock.length,0);
  advanceToNextActivity(f.game,()=>1);assert.equal(f.game.minutes,570);
});

test('acesso pendente não bloqueia outra conclusão no mesmo horário', () => {
  const f=fixture();f.area.access='risk';f.area.minutes=60;
  assert.equal(search(f),null);assert.equal(scheduleSurvivorTravel(f.game,'1,0',[f.ids[0]]).ok,true);
  const result=advanceToNextActivity(f.game,()=>1);assert.match(result.issue,/acesso/);
  assert.equal(f.game.minutes,600);assert.equal(survivorHex(f.game,f.ids[0]),'1,0');assert.equal(runningActivities(f.game).length,1);
});

test('busca com acesso pendente permanece executável após mudar de cena', () => {
  const f=fixture();f.area.access='risk';f.game.playerActions=playerActionState(f.game);
  let result=applyPlayerAction(f.game,f.ids[1],{id:'proposal',day:1,type:'search',hexId:'0,0',pointId:'market',areaId:f.area.id,objective:'open',purpose:'Suprimentos'},()=>1);assert.equal(result.ok,true);f.game=result.state;
  result=applyPlayerAction(f.game,f.ids[1],{id:'begin',day:1,type:'execute',operationId:'proposal'},()=>1);assert.equal(result.ok,true);f.game=result.state;
  f.game.scene=(f.game.scene??1)+1;
  result=applyPlayerAction(f.game,f.ids[1],{id:'access',day:1,type:'roll-access',operationId:'proposal',trait:'Agilidade',experiences:[]},()=>12);assert.equal(result.ok,true,result.error);
  assert.equal(result.state.playerActions.operations[0].status,'scheduled');
});

test('chegada sinaliza acontecimento sem pular o restante da linha do tempo', () => {
  const f=fixture();f.game.survivors[2].hex='-1,0';f.game.playerActions=playerActionState(f.game);
  f.game.hexes['1,0'].events=[{id:'arrival-event',text:'Um encontro',triggerType:'enter',status:'pending'}];
  assert.equal(scheduleSurvivorTravel(f.game,'1,0',[f.ids[0]]).ok,true);
  advanceToNextActivity(f.game,()=>1);assert.equal(f.game.minutes,600);assert.equal(f.game.playerActions.policy.paused,true);
});

test('salto manual para a noite para exatamente no gatilho pendente das 18h', () => {
  const f=fixture();f.game.playerActions=playerActionState(f.game);f.game.minutes=1020;
  f.game.hexes['0,0'].events=[{id:'night-event',text:'Sinais noturnos',triggerType:'night',status:'pending'}];
  const result=setCampaignTime(f.game,1140);assert.match(result.issue,/Anoiteceu/);assert.equal(f.game.minutes,1080);assert.equal(f.game.playerActions.policy.paused,true);
});

function singleGroup() { const f=fixture();f.game.survivors.forEach(p=>{p.hex='0,0';});for(const hex of Object.values(f.game.hexes))hex.events=[];return f; }

test('grupo único viaja e cobra tempo sem exigir avanço separado do mestre',()=>{
 const f=singleGroup();const result=scheduleSurvivorTravel(f.game,'1,0',f.ids);
 assert.equal(result.ok,true);assert.equal(result.completed,true);assert.equal(f.game.minutes,600);
 assert.equal(f.game.survivors.every(p=>survivorHex(f.game,p)==='1,0'),true);assert.equal(runningActivities(f.game).length,0);
});
test('grupo único conclui busca livre, libera achados e cobra tempo na confirmação',()=>{
 const f=singleGroup();assert.equal(search(f),null);assert.equal(f.game.minutes,570);
 assert.equal(f.game.hexes['0,0'].points[0].preparation.stock.length,1);assert.equal(runningActivities(f.game).length,0);
});
test('acesso de grupo único aguarda teste e conclui na própria busca sem agendamento visível',()=>{
 const f=singleGroup();f.area.access='risk';assert.equal(search(f),null);assert.equal(f.game.minutes,540);
 assert.equal(rollSearchAccess(f.game,'0,0','market','search-b',{actorId:f.ids[1],trait:'Agilidade',edge:'none',experiences:[],other:0},()=>12),null);
 assert.equal(finishPreparedSearch(f.game,'0,0','market','search-b',()=>1),null);
 assert.equal(f.game.minutes,570);assert.equal(runningActivities(f.game).length,0);assert.equal(f.game.hexes['0,0'].points[0].preparation.stock.length,1);
});
test('descanso de grupo único conclui após a última confirmação e recupera somente convidados',()=>{
 const f=singleGroup();assert.equal(requestTableRest(f.game,'short',f.ids[0],[f.ids[0],f.ids[1]]),null);
 const op=currentTableRest(f.game,f.ids[0]);assert.equal(confirmTableRest(f.game,f.ids[0],op.id,plans([f.ids[0]])[0].choices,()=>1),null);
 assert.equal(f.game.minutes,540);assert.equal(confirmTableRest(f.game,f.ids[1],op.id,plans([f.ids[1]])[0].choices,()=>1),null);
 assert.equal(f.game.minutes,600);assert.equal(f.game.survivors[0].hp,0);assert.equal(f.game.survivors[2].hp,2);
 assert.equal(f.game.playerActions.operations[0].status,'done');assert.equal(runningActivities(f.game).length,0);
});
test('tratamento de grupo único cobra 30min e aplica a rolagem imediatamente',()=>{
 const {scheduleExposureTreatment}=require('../lib/treatment.ts');const f=singleGroup();const p=f.game.survivors[0];
 p.infection='Exposto';p.exposureDeadline=700;establishShelter(f.game,'0,0');f.game.shelter.medications=1;
 const result=scheduleExposureTreatment(f.game,p.id,'shared',true,()=>12);assert.equal(result.ok,true);assert.equal(result.completed,true);
 assert.equal(f.game.minutes,570);assert.equal(f.game.survivors[0].infection,'Saudável');assert.equal(runningActivities(f.game).length,0);
});
test('primeira separação usa avanço direto; equipes separadas usam paralelo; reunião retorna ao fluxo simples',()=>{
 const {hasMultipleSurvivorGroups}=require('../lib/game.ts');const f=singleGroup();
 assert.equal(hasMultipleSurvivorGroups(f.game),false);assert.equal(scheduleSurvivorTravel(f.game,'1,0',[f.ids[0]]).completed,true);
 assert.equal(hasMultipleSurvivorGroups(f.game),true);assert.equal(f.game.minutes,600);
 assert.equal(scheduleSurvivorTravel(f.game,'0,0',[f.ids[0]]).completed,false);assert.equal(f.game.minutes,600);
 assert.equal(advanceToNextActivity(f.game,()=>1).ok,true);assert.equal(hasMultipleSurvivorGroups(f.game),false);
 assert.equal(search(f),null);assert.equal(runningActivities(f.game).length,0);
 assert.equal(hasMultipleSurvivorGroups(projectPlayerGame(f.game,f.ids[0])),false);
});
