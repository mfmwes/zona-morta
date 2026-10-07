/* eslint-disable @typescript-eslint/no-require-imports -- Exercise campaign rules and persisted records. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const {defaultState,initialSurvivor,content}=require('../lib/game.ts');
const {eventGuides,eventGuide,eventOutcomeSuggestion,legacyEventGuides}=require('../lib/event-guides.ts');
const {resolveHexEvent,eventResolutionFingerprint}=require('../lib/event-resolution.ts');
const {eventResolutionCommandSchema}=require('../lib/event-resolution-types.ts');
const {validWorld}=require('../lib/world.ts');
const {projectPlayerGame}=require('../lib/collaboration.ts');
const {advanceToNextActivity}=require('../lib/time.ts');
const {cancelActivity,publicActivities}=require('../lib/activity-timeline.ts');
const {validActivities}=require('../lib/activity-timeline-validation.ts');
const {suggestedEventActionKind}=require('../lib/hex-event-actions.ts');
function fixture(split=false){const g=defaultState(),a=content.archetypes[0];g.minutes=540;g.survivors=['Ana','Bia'].map(name=>initialSurvivor({name,origin:content.origins[1].name,past:'',archetype:a.name,specialty:a.specialties[0].name,freeExperience:'',techniques:[],attributes:{Força:1},primary:'',secondary:'',protection:'',personal:''}));g.survivors.forEach((p,i)=>{p.hex=split&&i===1?'1,0':'0,0';});for(const h of Object.values(g.hexes)){h.events=[];}g.hexes['0,0'].discovery='explorado';g.hexes['0,0'].events=[{id:'gate',text:content.generators.eventos[51].text,trigger:'Manual',status:'active',revealed:true,generatorRoll:52,guidance:'Segredo do mestre'}];return g;}
function command(g,extra={}){const e=g.hexes['0,0'].events[0];return {type:'resolve-event',id:'resolution',day:g.day,expectedMinute:g.minutes,expectedEvent:eventResolutionFingerprint(e),hexId:'0,0',eventId:e.id,participantIds:[g.survivors[0].id],approachId:'risk',outcome:'complication',summary:'A grade abriu com ruído.',continuity:'Passagem aberta; vigia ouviu.',minutes:5,noise:1,fear:0,...extra};}
test('100 guias próprios preservam tabela, alternativas, desfechos e continuidade',()=>{
 assert.equal(eventGuides.length,100);assert.equal(new Set(eventGuides.map(g=>g.roll)).size,100);
 for(const g of eventGuides){assert.equal(g.title,content.generators.eventos[g.roll-1].text.split('.')[0]);assert.equal(g.approaches.length,3);assert.ok(Number.isInteger(g.approaches[2].minutes)&&g.approaches[2].minutes>=0);for(const o of ['success','complication','failure','withdrawn']){assert.ok(g.outcomes[o].summary.length>20);assert.ok(g.outcomes[o].continuity.length>20);}}
 assert.equal(new Set(eventGuides.map(g=>g.stakes)).size,100);assert.equal(new Set(eventGuides.map(g=>g.outcomes.success.summary)).size,100);
 assert.equal(eventGuide({text:'Grade emperrada. Texto legado'}).roll,52);assert.equal(eventGuide({text:'Evento personalizado',guidance:'Um risco próprio'}).stakes,'Um risco próprio');
 assert.equal(suggestedEventActionKind({text:content.generators.eventos[93].text,generatorRoll:94,generatorCategory:'Ameaça'}),null);
 assert.match(eventGuides[36].stakes,/não confirma Exposição/);assert.match(eventGuides[84].outcomes.withdrawn.continuity,/intacta/);
});
test('equipe única confirma, cobra duração, guarda desfecho e aplica limites reais',()=>{
 const g=fixture();g.noise=5;g.fear=11;const c=command(g,{fear:3});assert.equal(resolveHexEvent(g,c).completed,true);
 assert.equal(g.minutes,545);assert.equal(g.noise,5);assert.equal(g.fear,12);const r=g.hexes['0,0'].events[0].resolutions[0];assert.equal(r.appliedNoise,0);assert.equal(r.appliedFear,1);assert.equal(r.status,'completed');assert.equal(g.hexes['0,0'].events[0].status,'resolved');assert.equal(validWorld(g.hexes),true);assert.equal(validActivities(g.activities,g),true);
 const saved=structuredClone(g);assert.equal(resolveHexEvent(g,c).ok,false);assert.deepEqual(g,saved);
});
test('equipes separadas aguardam horário; recarregar preserva conclusão e privacidade',()=>{
 let g=fixture(true);assert.equal(resolveHexEvent(g,command(g)).completed,false);assert.equal(g.minutes,540);assert.equal(g.noise,0);
 assert.equal(g.hexes['0,0'].events[0].status,'active');g=JSON.parse(JSON.stringify(g));assert.equal(advanceToNextActivity(g).ok,true);assert.equal(g.minutes,545);assert.equal(g.noise,1);
 const v=projectPlayerGame(g,g.survivors[0].id);assert.equal(v.hexes['0,0'].events[0].resolutions,undefined);assert.equal(v.hexes['0,0'].events[0].guidance,'');assert.equal(JSON.stringify(v).includes('Passagem aberta; vigia ouviu'),false);
});
test('interromper não aplica consequências nem volta o relógio; nova tentativa preserva histórico',()=>{
 const g=fixture(true);resolveHexEvent(g,command(g));g.minutes=542;assert.equal(cancelActivity(g,'resolution'),true);assert.equal(g.noise,0);assert.equal(g.minutes,542);assert.equal(g.hexes['0,0'].events[0].resolutions[0].status,'cancelled');
 assert.equal(resolveHexEvent(g,command(g,{id:'another'})).ok,true);assert.equal(g.hexes['0,0'].events[0].resolutions.length,2);
});
test('evento ou participantes alterados bloqueiam aplicação sem efeitos parciais',()=>{
 const g=fixture(true),c=command(g);g.hexes['0,0'].events[0].text+=' Mudou.';const saved=structuredClone(g);assert.equal(resolveHexEvent(g,c).ok,false);assert.deepEqual(g,saved);
 c.expectedEvent=eventResolutionFingerprint(g.hexes['0,0'].events[0]);c.participantIds=[g.survivors[1].id];assert.equal(resolveHexEvent(g,c).ok,false);assert.deepEqual(g,saved);
});
test('resolução pendente reserva pessoas, impede duplicação e bloqueia evento alterado na conclusão',()=>{
 const g=fixture(true);resolveHexEvent(g,command(g));assert.equal(resolveHexEvent(g,command(g,{id:'duplicate'})).ok,false);
 g.hexes['0,0'].events[0].text='Texto alterado';const result=advanceToNextActivity(g);assert.match(result.issue,/evento mudou/);assert.equal(g.noise,0);assert.equal(g.hexes['0,0'].events[0].resolutions[0].status,'scheduled');assert.equal(cancelActivity(g,'resolution'),true);
});
test('recuo sem duração registra pendência e não exige pessoas presentes',()=>{
 const g=fixture();assert.equal(resolveHexEvent(g,command(g,{outcome:'withdrawn',minutes:0,noise:0,participantIds:[]})).completed,true);assert.equal(g.minutes,540);assert.equal(g.hexes['0,0'].events[0].status,'resolved');
});
test('eventos ocultos não expõem atividades, desfechos ou orientação reservada',()=>{
 const g=fixture(true);g.hexes['0,0'].events[0].revealed=false;resolveHexEvent(g,command(g));assert.equal(publicActivities(g).length,0);assert.equal(projectPlayerGame(g,g.survivors[0].id).hexes['0,0'].events.length,0);
});
test('dados inválidos, meia-noite e conflitos não criam registros parciais',()=>{
 const g=fixture(),saved=structuredClone(g);assert.equal(resolveHexEvent(g,command(g,{minutes:1.5})).ok,false);assert.deepEqual(g,saved);
 g.minutes=1435;const before=structuredClone(g);assert.equal(resolveHexEvent(g,command(g,{minutes:10})).ok,false);assert.deepEqual(g,before);
 assert.equal(eventResolutionCommandSchema.safeParse(command(g,{noise:6})).success,false);g.hexes['0,0'].events[0].resolutions=[{id:'bogus'}];assert.equal(validWorld(g.hexes),false);
});


test('observar ou planejar não concede reparo, retirada ou identificação que não ocorreu',()=>{
 const tank=eventGuide({text:content.generators.eventos[62].text,generatorRoll:63});
 assert.match(eventOutcomeSuggestion(tank,'careful','success').summary,/reparo continuam por resolver/);
 assert.match(eventOutcomeSuggestion(tank,'risk','success').summary,/perda é contida/);
 const heavy=eventGuides[78];assert.match(eventOutcomeSuggestion(heavy,'risk','success').summary,/só é retirado quando a ação ocorrer/);
 const child=eventGuides[23];assert.match(eventOutcomeSuggestion(child,'careful','success').summary,/só é identificado se estiver perceptível/);
 const exit=eventGuides[98];assert.match(exit.approaches[2].description,/só existe se já tiver sido estabelecida/);
});
test('20 versões antigas conservam fatos salvos; novas versões têm preparação e escolhas concretas',()=>{
 assert.equal(legacyEventGuides.length,20);
 const {splitGeneratorText}=require('../lib/hex-generators.ts');
 for(const old of legacyEventGuides){
  const event={text:splitGeneratorText(old.sourceTexts[0]).publicText,generatorRoll:old.roll};const before=structuredClone(event);
  assert.equal(eventGuide(event).legacy,true);assert.equal(eventGuide(event).setup,undefined);assert.deepEqual(event,before);
  const fresh=eventGuide({text:content.generators.eventos[old.roll-1].text,generatorRoll:old.roll});assert.notEqual(fresh.legacy,true);assert.ok(fresh.setup.length>50);
 }
 const edited=eventGuide({text:'Caixa lacrada. Um evento escrito pelo mestre.',generatorRoll:69,guidance:'Decisão própria'});
 assert.equal(edited.roll,undefined);assert.equal(edited.stakes,'Decisão própria');
 assert.equal(eventGuide({text:legacyEventGuides.find(g=>g.roll===91).sourceTexts[0]}).roll,91);
});
test('dificuldades e duração seguem ação e risco, com cena breve e desvios locais explícitos',()=>{
 const levels=new Set(eventGuides.flatMap(g=>g.approaches.filter(a=>a.test).map(a=>a.test.difficulty)));assert.deepEqual([...levels].sort((a,b)=>a-b),[12,13,15]);
 for(const g of eventGuides)for(const a of g.approaches)if(a.test)assert.ok(a.test.when.length>30);
 assert.equal(eventGuides[55].format,'brief');assert.equal(eventGuides[24].format,'scene');
 assert.ok(eventGuides[51].approaches[2].minutes>0);assert.match(eventGuides[51].approaches[2].timeNote,/custo do mapa/);
 assert.match(eventGuides[68].setup,/peças compatíveis/);assert.match(eventGuides[11].setup,/prazo passar/);
});
