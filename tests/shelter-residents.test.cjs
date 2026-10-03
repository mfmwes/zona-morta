/* eslint-disable @typescript-eslint/no-require-imports -- uses the existing Node test loader. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, path);
const { defaultState, communityCapabilities, initialSurvivor, content, shelterPopulation, shelterPopulationBreakdown, resetCityPreservingSurvivors } = require('../lib/game.ts');
const { npcVisibleToPlayers, publicNpcs, npcPlayerView, normalizeNpcCapabilities, setNpcCapability } = require('../lib/npc-presentation.ts');
const { projectPlayerGame, playerEditPayload, applyPlayerChange } = require('../lib/collaboration.ts');
const { createShelterProject, projectBaseOperational } = require('../lib/shelter-projects.ts');
const { eveningNeeds } = require('../lib/survival.ts');
const { preserveKnownSectors } = require('../lib/sectors.ts');
const { generateNpcDrafts } = require('../lib/npc-generator.ts');
function npc(id, options = {}) {
  return { id, name: id, role: 'Enfermeira', description: 'Descrição', notes: 'Segredo', publicNotes: 'Notas públicas',
    hex: '0,0', home: '0,0', status: 'Bem', infection: 'Saudável', disposition: 'Aliado', skills: ['Medicina'], active: true, ...options };
}
function campaign() {
  const game = defaultState({ withShelter: true });
  const archetype = content.archetypes[0];
  game.survivors = [initialSurvivor({ name: 'Nina', origin: content.origins[0].name, past: '', archetype: archetype.name,
    specialty: archetype.specialties[0].name, freeExperience: 'Resgates', techniques: [],
    attributes: { Agilidade: 2, Força: 1, Finesse: 1, Instinto: 0, Presença: 0, Conhecimento: -1 },
    primary: 'Faca resistente', secondary: '', protection: 'Roupa reforçada', personal: 'Mochila urbana' })];
  return game;
}


const {residentCandidates,residentKey,shelterCommunity,updateShelterResidents}=require('../lib/shelter-residents.ts');
test('adicionar jogador e NPC vincula sem mover nem alterar consumo e população presente',()=>{
 const game=campaign();game.shelter.residents=2;game.npcs=[npc('medica',{home:undefined,hex:'1,0'})];
 const refs=[{kind:'survivor',id:game.survivors[0].id},{kind:'npc',id:'medica'}];
 const needs=eveningNeeds(game),population=shelterPopulation(game),before=structuredClone(game);
 assert.equal(updateShelterResidents(game,'0,0',refs,[]),true);
 assert.equal(game.survivors[0].home,'0,0');assert.equal(game.npcs[0].home,'0,0');
 assert.equal(shelterPopulationBreakdown(game).residents,4);assert.equal(shelterPopulationBreakdown(game).field,1);
 assert.equal(game.npcs[0].hex,'1,0');assert.equal(game.survivors[0].hex,before.survivors[0].hex);
 assert.deepEqual(eveningNeeds(game),needs);assert.equal(shelterPopulation(game),population);assert.equal(game.shelter.residents,2);
});
test('transferir e remover alteram apenas vínculo e preservam moradores de outras bases',()=>{
 const game=campaign();game.npcs=[npc('transferir',{home:'1,0'}),npc('ficar',{home:'1,0'})];
 game.survivors[0].home='1,0';const refs=[{kind:'survivor',id:game.survivors[0].id},{kind:'npc',id:'transferir'}];
 assert.equal(updateShelterResidents(game,'0,0',refs,[]),true);assert.equal(game.npcs[1].home,'1,0');
 assert.equal(updateShelterResidents(game,'0,0',[],refs),true);assert.equal(game.npcs[0].home,undefined);assert.equal(game.survivors[0].home,undefined);
 assert.equal(game.npcs.length,2);assert.equal(game.survivors.length,1);assert.equal(game.npcs[1].home,'1,0');
});
test('operação inválida não aplica alterações parciais e base trocada invalida edição',()=>{
 const game=campaign();game.npcs=[npc('inativo',{active:false}),npc('morto',{status:'Morto'})];const before=structuredClone(game);
 const person={kind:'survivor',id:game.survivors[0].id};
 for(const id of ['inativo','morto','inexistente'])assert.equal(updateShelterResidents(game,'0,0',[person,{kind:'npc',id}],[]),false);
 assert.equal(updateShelterResidents(game,'1,0',[person],[]),false);assert.deepEqual(game,before);
});
test('resumo público omite NPCs ocultos e fichas privadas de outros jogadores',()=>{
 const game=campaign();const other=structuredClone(game.survivors[0]);other.id='outro';other.name='Lucas';other.notes='SEGREDO DO JOGADOR';other.home='0,0';other.hex='1,0';game.survivors.push(other);
 game.npcs=[npc('oculto',{visibleToPlayers:false}),npc('visivel'),npc('inativo',{active:false}),npc('morto',{status:'Morto'})];
 const before=structuredClone(game),view=projectPlayerGame(game,game.survivors[0].id);
 assert.deepEqual(view.publicShelterCommunity.residents.map(person=>person.id),['outro','visivel']);
 assert.ok(!JSON.stringify(view).includes('SEGREDO DO JOGADOR'));assert.ok(!JSON.stringify(view).includes('oculto'));
 assert.equal(view.survivors.length,1);assert.ok(view.publicShelterCommunity.residents.every(person=>person.home===undefined));
 assert.equal(shelterCommunity(game,true).residents.length,2);assert.equal(shelterCommunity(game).residents.length,3);
 assert.deepEqual(game,before);
});
test('jogador não altera vínculo nem resumo de moradores, mas continua podendo editar sua ficha',()=>{
 const game=campaign();game.survivors[0].home='0,0';const before=projectPlayerGame(game,game.survivors[0].id);const after=structuredClone(before);
 after.survivors[0].home='1,0';const payload=playerEditPayload(before,after);assert.ok(payload);
 assert.equal(applyPlayerChange(game,game.survivors[0].id,payload.before,payload.after,0,[],0,[]),null);
 const altered=structuredClone(before);altered.publicShelterCommunity.residents=[];assert.equal(playerEditPayload(before,altered),null);
 const legal=structuredClone(before);legal.survivors[0].notes='Nota livre';const valid=playerEditPayload(before,legal);
 assert.ok(applyPlayerChange(game,game.survivors[0].id,valid.before,valid.after,0,[],0,[]));
});
test('vínculos sobrevivem ao salvamento e reset da cidade remove bases antigas',()=>{
 const game=campaign();game.survivors[0].home='0,0';game.npcs=[npc('legado')];
 const restored=preserveKnownSectors(JSON.parse(JSON.stringify(game)));assert.equal(restored.survivors[0].home,'0,0');assert.equal(restored.npcs[0].home,'0,0');
 assert.equal(residentCandidates(restored).length,2);assert.notEqual(residentKey({kind:'npc',id:'mesmo'}),residentKey({kind:'survivor',id:'mesmo'}));
 resetCityPreservingSurvivors(restored);assert.equal(restored.survivors[0].home,undefined);
});
