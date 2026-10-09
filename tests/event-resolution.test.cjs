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
const {suggestedEventActionKind,prepareSuggestedEventAction,applyEventAction}=require('../lib/hex-event-actions.ts');
function fixture(split=false){const g=defaultState(),a=content.archetypes[0];g.minutes=540;g.survivors=['Ana','Bia'].map(name=>initialSurvivor({name,origin:content.origins[1].name,past:'',archetype:a.name,specialty:a.specialties[0].name,freeExperience:'',techniques:[],attributes:{Força:1},primary:'',secondary:'',protection:'',personal:''}));g.survivors.forEach((p,i)=>{p.hex=split&&i===1?'1,0':'0,0';});for(const h of Object.values(g.hexes)){h.events=[];}g.hexes['0,0'].discovery='explorado';g.hexes['0,0'].events=[{id:'gate',text:content.generators.eventos[51].text,trigger:'Manual',status:'active',revealed:true,generatorRoll:52,guidance:'Segredo do mestre'}];return g;}
function command(g,extra={}){const e=g.hexes['0,0'].events[0];return {type:'resolve-event',id:'resolution',day:g.day,expectedMinute:g.minutes,expectedEvent:eventResolutionFingerprint(e),hexId:'0,0',eventId:e.id,participantIds:[g.survivors[0].id],approachId:'risk',outcome:'complication',summary:'A grade abriu com ruído.',continuity:'Passagem aberta; vigia ouviu.',minutes:5,noise:1,fear:0,...extra};}
test('100 guias próprios preservam tabela, alternativas, desfechos e continuidade',()=>{
 assert.equal(eventGuides.length,100);assert.equal(new Set(eventGuides.map(g=>g.roll)).size,100);
 for(const g of eventGuides){assert.equal(g.title,content.generators.eventos[g.roll-1].text.split('.')[0]);assert.equal(g.approaches.length,3);assert.ok(Number.isInteger(g.approaches[2].minutes)&&g.approaches[2].minutes>=0);for(const o of ['success','complication','failure','withdrawn']){assert.ok(g.outcomes[o].summary.length>20);assert.ok(g.outcomes[o].continuity.length>20);}}
 assert.equal(new Set(eventGuides.map(g=>g.stakes)).size,100);assert.equal(new Set(eventGuides.map(g=>g.outcomes.success.summary)).size,100);
 assert.equal(eventGuide({text:'Grade emperrada. Texto personalizado'}).roll,undefined);assert.equal(eventGuide({text:'Evento personalizado',guidance:'Um risco próprio'}).stakes,'Um risco próprio');
 assert.equal(suggestedEventActionKind({text:content.generators.eventos[93].text,generatorRoll:94,generatorCategory:'Ameaça'}),null);
 assert.match(eventGuides[36].setup,/não confirma a causa da febre/);assert.match(eventGuides[84].outcomes.withdrawn.continuity,/grade, alcance e posição/);
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
 const child=eventGuides[23];assert.match(eventOutcomeSuggestion(child,'careful','success').summary,/localizar a avó por sua resposta/);
 const exit=eventGuides[98];assert.match(exit.approaches[2].description,/trecho já acessível/);
});
test('220 versões anteriores conservam fatos salvos; todas as versões novas têm preparação própria',()=>{
 assert.equal(legacyEventGuides.length,220);
 const {splitGeneratorText}=require('../lib/hex-generators.ts');
 for(const old of legacyEventGuides){
  const event={text:splitGeneratorText(old.sourceTexts[0]).publicText,generatorRoll:old.roll};const before=structuredClone(event);
  assert.equal(eventGuide(event).legacy,true);assert.equal(eventGuide(event).setup,old.setup);assert.deepEqual(event,before);
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

test('registrar etapas mantém evento ativo, permite intervenção posterior e encerramento explícito',()=>{
 const g=fixture();
 assert.equal(resolveHexEvent(g,command(g,{closeEvent:false,approachId:'careful',minutes:0,noise:0})).ok,true);
 assert.equal(g.hexes['0,0'].events[0].status,'active');
 assert.equal(resolveHexEvent(g,command(g,{id:'intervention',closeEvent:true})).ok,true);
 assert.equal(g.hexes['0,0'].events[0].status,'resolved');
 assert.equal(g.hexes['0,0'].events[0].resolutions.length,2);assert.equal(validWorld(g.hexes),true);
});
test('etapa agendada mantém intenção de continuidade após recarregar e concluir',()=>{
 let g=fixture(true);assert.equal(resolveHexEvent(g,command(g,{closeEvent:false})).completed,false);
 g=JSON.parse(JSON.stringify(g));assert.equal(advanceToNextActivity(g).ok,true);
 assert.equal(g.hexes['0,0'].events[0].status,'active');assert.equal(g.noise,1);
 assert.equal(resolveHexEvent(g,command(g,{id:'finish',minutes:0,noise:0,closeEvent:true})).ok,true);
 assert.equal(g.hexes['0,0'].events[0].status,'resolved');
});
test('todas as entradas têm situação, preparação, continuidade específica e espera com duração',()=>{
 assert.equal(new Set(eventGuides.map(g=>g.setup)).size,100);
 for(const g of eventGuides){assert.ok(g.setup.length>50);assert.ok(g.ignored.length>25);assert.ok(g.returnVisit.length>25);assert.ok(g.observation.length>25);assert.ok(g.application.length>25);assert.ok(Array.isArray(g.requirements));
 for(const a of g.approaches){if(/Esperar/i.test(a.description))assert.ok(a.minutes>0);}
 assert.doesNotMatch(JSON.stringify(g),/Um custo anunciado limita|Se a intervenção encontrar resistência|Registre a condição adicional escolhida/);}
 const heavy=eventGuides[78];assert.match(heavy.outcomes.complication.summary,/liberar capacidade/);assert.doesNotMatch(heavy.outcomes.complication.summary,/retirada funciona/);
 assert.match(eventGuides[57].outcomes.complication.summary,/fonte é interrompida/);
});

function personal(g,extra={}){return {survivorId:g.survivors[0].id,hpMarks:0,armor:false,stress:0,hope:0,food:0,water:0,...extra};}
function npc(g){const n={id:'lia',name:'Lia',role:'Mensageira',description:'',notes:'Contato reservado.',publicNotes:'',hex:'0,0',status:'Bem',infection:'Saudável',disposition:'Neutro',skills:[],active:true,visibleToPlayers:true};g.npcs.push(n);return n;}
const trapped={name:'Restrito',effect:'Não pode sair do vão.',clear:'Um aliado ergue a grade com uma ação.'};
test('dano, recursos, condição e vínculo são persistidos uma vez somente nos alvos',()=>{
 const g=fixture(),p=g.survivors[0],other=structuredClone(g.survivors[1]);p.water=2;p.stress=5;p.hope=5;npc(g);
 const c=command(g,{minutes:0,personalEffects:[personal(g,{hpMarks:2,stress:2,hope:2,water:-1,condition:trapped})],npcEffect:{npcId:'lia',disposition:'Aliado',commitment:'Lia deve uma entrega gratuita até amanhã.'}});
 assert.equal(resolveHexEvent(g,c).ok,true);assert.equal(g.survivors[0].hp,2);assert.equal(g.survivors[0].stress,6);assert.equal(g.survivors[0].hope,6);assert.equal(g.survivors[0].water,1);assert.deepEqual(g.survivors[0].eventConditions,[trapped]);assert.deepEqual(g.survivors[1],other);
 assert.equal(g.npcs[0].disposition,'Aliado');assert.match(g.npcs[0].notes,/Vínculo com Ana.*entrega gratuita/);assert.equal(validWorld(g.hexes),true);
 const view=projectPlayerGame(g,p.id);assert.deepEqual(view.survivors[0].eventConditions,[trapped]);assert.equal(view.npcs[0].disposition,'Aliado');assert.equal(JSON.stringify(view).includes('entrega gratuita'),false);
 const before=structuredClone(g);assert.equal(resolveHexEvent(g,c).ok,false);assert.deepEqual(g,before);
});
test('usar Armadura reduz um nível e registra delta real de PV',()=>{
 const g=fixture();g.survivors[0].protection=content.protections[0].name;
 // Use the actual armor catalog rather than a fabricated armor slot.
 const {survivorStats}=require('../lib/game.ts');
 if(!survivorStats(g.survivors[0]).armor){g.survivors[0].protection=content.protections.find(a=>a.armor>0).name;}
 const c=command(g,{minutes:0,personalEffects:[personal(g,{hpMarks:2,armor:true})]});assert.equal(resolveHexEvent(g,c).ok,true);assert.equal(g.survivors[0].hp,1);assert.equal(g.survivors[0].armorMarked,1);assert.match(g.hexes['0,0'].events[0].resolutions[0].appliedEffects[0],/PV marcados \+1.*Armadura \+1/);
});
test('alvos repetidos, ausentes e custos inexistentes rejeitam todos os efeitos sem mutação',()=>{
 const g=fixture(true);npc(g);const before=structuredClone(g);
 for(const effects of [[personal(g),personal(g)],[personal(g,{water:-10})],[personal(g,{armor:true,hpMarks:2})],[personal(g,{survivorId:g.survivors[1].id})]]){assert.equal(resolveHexEvent(g,command(g,{personalEffects:effects})).ok,false);assert.deepEqual(g,before);}
 assert.equal(resolveHexEvent(g,command(g,{personalEffects:[personal(g,{hpMarks:1})],npcEffect:{npcId:'missing',disposition:'Aliado',commitment:'Vigia por 1 hora.'}})).ok,false);assert.deepEqual(g,before);
});
test('efeitos aguardam conclusão, sobrevivem ao reload e cancelamento não cobra recursos',()=>{
 let g=fixture(true);g.survivors[0].water=2;npc(g);const effects=[personal(g,{hpMarks:1,stress:1,water:-1,condition:trapped})];
 assert.equal(resolveHexEvent(g,command(g,{personalEffects:effects,npcEffect:{npcId:'lia',disposition:'Aliado',commitment:'Um turno de vigia.'}})).completed,false);
 assert.equal(g.survivors[0].hp,0);assert.equal(g.survivors[0].water,2);assert.equal(g.npcs[0].disposition,'Neutro');
 g=JSON.parse(JSON.stringify(g));assert.equal(advanceToNextActivity(g).ok,true);assert.equal(g.survivors[0].hp,1);assert.equal(g.survivors[0].water,1);assert.equal(g.npcs[0].disposition,'Aliado');
 const cancelled=fixture(true);cancelled.survivors[0].water=2;resolveHexEvent(cancelled,command(cancelled,{personalEffects:[personal(cancelled,{hpMarks:1,water:-1})]}));assert.equal(cancelActivity(cancelled,'resolution'),true);assert.equal(cancelled.survivors[0].hp,0);assert.equal(cancelled.survivors[0].water,2);
});
test('estoque ou PNJ alterado durante a espera bloqueia conclusão inteira',()=>{
 const g=fixture(true);g.survivors[0].water=1;npc(g);resolveHexEvent(g,command(g,{personalEffects:[personal(g,{hpMarks:1,water:-1})],npcEffect:{npcId:'lia',disposition:'Aliado',commitment:'Uma entrega.'}}));g.survivors[0].water=0;
 const r=advanceToNextActivity(g);assert.match(r.issue,/provisões/);assert.equal(g.survivors[0].hp,0);assert.equal(g.noise,0);assert.equal(g.npcs[0].disposition,'Neutro');assert.equal(g.hexes['0,0'].events[0].resolutions[0].status,'scheduled');
 g.survivors[0].water=1;g.npcs[0].hex='1,0';assert.match(advanceToNextActivity(g).issue,/PNJ/);assert.equal(g.survivors[0].water,1);assert.equal(g.survivors[0].hp,0);
});
test('condição exige remoção; repetir o nome atualiza causa sem acumular cópias',()=>{
 const g=fixture();assert.equal(eventResolutionCommandSchema.safeParse(command(g,{personalEffects:[personal(g,{condition:{name:'Restrito',effect:'Preso',clear:''}})]})).success,false);
 g.survivors[0].eventConditions=[trapped];assert.equal(resolveHexEvent(g,command(g,{minutes:0,personalEffects:[personal(g,{condition:{...trapped,clear:'Soltar o apoio.'}})]})).ok,true);assert.equal(g.survivors[0].eventConditions.length,1);assert.equal(g.survivors[0].eventConditions[0].clear,'Soltar o apoio.');
});
test('cada intervenção concretiza ganho, custo e falha sem transferir perigo para observação',()=>{
 for(const g of eventGuides){const a=g.approaches.find(a=>a.id==='risk');assert.ok(a.announcedCost.length>30);assert.ok(g.outcomes.complication.summary.length>45);assert.ok(g.outcomes.failure.summary.length>50);const careful=eventOutcomeSuggestion(g,'careful','success');assert.equal(careful.mechanical,undefined);for(const o of Object.values(g.outcomes)){if(o.mechanical?.condition){assert.ok(o.mechanical.condition.effect.length>30);assert.ok(o.mechanical.condition.clear.length>30);}}}
 assert.equal(eventOutcomeSuggestion(eventGuides[51],'risk','failure').mechanical.hpMarks,2);assert.equal(eventOutcomeSuggestion(eventGuides[37],'risk','success').mechanical.npcDisposition,'Aliado');assert.equal(eventOutcomeSuggestion(eventGuides[87],'risk','failure').noise,2);
});

test('socorrista criado pelo evento recebe papel e capacidade coerentes antes do vínculo',()=>{
 const g=fixture();const e=g.hexes['0,0'].events[0];e.generatorRoll=26;e.text=content.generators.eventos[25].text;
 const action=prepareSuggestedEventAction(g,'0,0',e,'npc');assert.equal(action.role,'Socorrista');assert.deepEqual(action.skills,['Medicina']);assert.match(action.notes,/Necessidade:.*recipiente/);
 assert.equal(applyEventAction(g,'0,0',e.id,action).ok,true);const n=g.npcs.find(n=>n.id===e.actionLinks.npcId);assert.ok(n);assert.equal(n.visibleToPlayers,false);
 const c=command(g,{minutes:0,npcEffect:{npcId:n.id,disposition:'Aliado',commitment:'Auxilia em um tratamento com os custos normais.'}});assert.equal(resolveHexEvent(g,c).ok,true);assert.equal(n.disposition,'Neutro');assert.equal(g.npcs.find(p=>p.id===n.id).disposition,'Aliado');
});
