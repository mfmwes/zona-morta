/* eslint-disable @typescript-eslint/no-require-imports -- Run tabletop scenarios against the actual campaign rules. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);
const {defaultState,initialSurvivor,content,survivorStats,absoluteMinutes}=require('../lib/game.ts');
const {eventGuides,eventOutcomeSuggestion}=require('../lib/event-guides.ts');
const {resolveHexEvent,eventResolutionFingerprint,eventProvisionShare,eventRewardRemaining}=require('../lib/event-resolution.ts');
const {prepareSuggestedEventAction,applyEventAction}=require('../lib/hex-event-actions.ts');
const {advanceToNextActivity,advanceCampaignTime,nextActivityMinute}=require('../lib/time.ts');
const {cancelActivity}=require('../lib/activity-timeline.ts');
const {moveSurvivors,scheduleSurvivorTravel}=require('../lib/hex-actions.ts');
const {recordProvisionLot,expirePortionLots}=require('../lib/provisions.ts');
const {physicalProvisionPortions}=require('../lib/provision-items.ts');
const {projectPlayerGame}=require('../lib/collaboration.ts');
const {validWorld}=require('../lib/world.ts');
let serial=0;
const event=g=>g.hexes['0,0'].events[0];
function fixture(roll,split=false){
 const g=defaultState(),a=content.archetypes[0];g.minutes=540;g.noise=0;g.fear=0;g.npcs=[];g.partyHex='0,0';
 g.survivors=['Ana','Bia','Caio'].map((name,i)=>{const p=initialSurvivor({name,origin:content.origins[1].name,past:'',archetype:a.name,specialty:a.specialties[0].name,freeExperience:'',techniques:[],attributes:{Força:1},primary:'',secondary:'',protection:'',personal:''});p.hex=split&&i===2?'1,0':'0,0';p.food=4;p.water=4;return p;});
 for(const h of Object.values(g.hexes))h.events=[];
 g.hexes['0,0'].events=[{id:'scene',text:content.generators.eventos[roll-1].text,generatorRoll:roll,status:'active',trigger:'',revealed:true}];g.hexes['1,0'].discovery='explorado';
 if(eventGuides[roll-1].npc){const e=event(g),r=applyEventAction(g,'0,0',e.id,prepareSuggestedEventAction(g,'0,0',e,'npc'));assert.equal(r.ok,true,r.message);}
 return g;
}
function personal(p,m={}){return {survivorId:p.id,hpMarks:m.hpMarks??0,armor:false,stress:m.stress??0,hope:m.hope??0,food:m.food??0,water:m.water??0,...(m.condition?{condition:m.condition}:{})};}
function command(g,roll,approachId='risk',outcome='success',extra={}){
 const guide=eventGuides[roll-1],o=eventOutcomeSuggestion(guide,approachId,outcome),a=guide.approaches.find(a=>a.id===approachId),e=event(g),m=o.mechanical??{};
 return {type:'resolve-event',id:'simulation-'+(++serial),hexId:'0,0',eventId:e.id,day:g.day,expectedMinute:g.minutes,expectedEvent:eventResolutionFingerprint(e),approachId,outcome,summary:o.summary,continuity:o.continuity,closeEvent:false,participantIds:[g.survivors[0].id],minutes:a.minutes+(o.extraMinutes??0),noise:o.noise,fear:0,
 personalEffects:['hpMarks','stress','hope','food','water','condition'].some(k=>m[k]!==undefined)?[personal(g.survivors[0],m)]:[],
 ...(m.npcDisposition?{npcEffect:{npcId:e.actionLinks.npcId,disposition:m.npcDisposition,mode:m.npcMode,commitment:m.commitment,...(m.npcCondition?{condition:m.npcCondition}:{})}}:{}),
 ...(guide.initialClock?{clock:{initial:e.clock?undefined:guide.initialClock,action:o.clock?.action??'keep',...(o.clock?.minutes?{minutes:o.clock.minutes}:{})}}:{}),...extra};
}
function resolve(g,c){const r=resolveHexEvent(g,c);assert.equal(r.ok,true,r.message);return r;}

test('1.200 combinações: cem cenas, três abordagens e quatro resultados preservam limites e persistência',()=>{
 let count=0;
 for(let roll=1;roll<=100;roll++)for(const approach of ['careful','risk','alternative'])for(const outcome of ['success','complication','failure','withdrawn']){
  const g=fixture(roll),c=command(g,roll,approach,outcome);resolve(g,c);count++;
  assert.equal(validWorld(g.hexes),true,`${roll}/${approach}/${outcome}`);
  for(const p of g.survivors){assert.ok(p.hp>=0&&p.hp<=survivorStats(p).hp);assert.ok(p.stress>=0&&p.stress<=6);assert.ok(p.food>=0&&p.water>=0);}
  if(event(g).clock)assert.ok(['active','expired','cancelled'].includes(event(g).clock.status));
  const before=structuredClone(g);assert.equal(resolveHexEvent(g,c).ok,false);assert.deepEqual(g,before);
 }
 assert.equal(count,1200);
});
test('grade: falha afeta só o operador; um espaço de Armadura reduz 2 PV para 1',()=>{
 const g=fixture(52),c=command(g,52,'risk','failure');g.survivors[0].protection=content.protections.find(p=>p.armor>0).name;c.personalEffects[0].armor=true;resolve(g,c);
 assert.equal(g.survivors[0].hp,1);assert.equal(g.survivors[0].armorMarked,1);assert.equal(g.noise,1);assert.equal(g.survivors[1].hp,0);
});
test('lama: Restrito bloqueia viagem direta e agendada até o mestre encerrar a condição',()=>{
 const g=fixture(48);resolve(g,command(g,48,'risk','failure'));const p=g.survivors[0];const before=structuredClone(g);
 assert.match(moveSurvivors(g,'1,0',[p.id]).message,/Restrito/);assert.deepEqual(g,before);assert.equal(scheduleSurvivorTravel(g,'1,0',[p.id]).ok,false);assert.deepEqual(g,before);
 p.eventConditions=[];assert.equal(moveSurvivors(g,'1,0',[p.id],{durationMinutes:10}).ok,true);assert.equal(g.survivors[0].hex,'1,0');
});
test('moradora: condição da janela pertence ao PNJ, não ao sobrevivente que oferece ajuda',()=>{
 const g=fixture(21);resolve(g,command(g,21,'risk','failure'));assert.equal(g.npcs[0].eventConditions[0].name,'Restrito');assert.equal(g.survivors[0].eventConditions,undefined);
 g.npcs[0].accompaniesSurvivorIds=[g.survivors[0].id];assert.match(scheduleSurvivorTravel(g,'1,0',[g.survivors[0].id]).message,/PNJ|moradora|Joana/);
 g.npcs[0].eventConditions=[];assert.equal(scheduleSurvivorTravel(g,'1,0',[g.survivors[0].id]).ok,true);
});
test('mensageira: pagar o custo alcança o acordo; um vínculo Leal permanece Leal',()=>{
 for(const outcome of ['success','complication']){const g=fixture(38);g.npcs[0].disposition='Leal';resolve(g,command(g,38,'risk',outcome));assert.equal(g.npcs[0].disposition,'Leal');assert.equal(g.survivors[0].food,outcome==='complication'?3:4);}
 const g=fixture(38);resolve(g,command(g,38,'risk','complication'));assert.equal(g.npcs[0].disposition,'Aliado');assert.equal(g.minutes,555);
});
test('negociação falha e inspeção de comida não inventam agressão nem consumo',()=>{
 const g=fixture(80);g.npcs[0].disposition='Aliado';resolve(g,command(g,80,'risk','failure'));assert.equal(g.npcs[0].disposition,'Aliado');assert.equal(g.survivors[0].hp,0);
 const food=fixture(68);resolve(food,command(food,68,'risk','failure'));assert.equal(food.survivors[0].food,4);assert.equal(food.survivors[0].stress,0);assert.equal(food.survivors[0].eventConditions,undefined);
 for(const guide of eventGuides.filter(g=>g.npc)){const failure=guide.outcomes.failure.mechanical;assert.notEqual(failure?.npcDisposition,'Hostil');assert.notEqual(failure?.npcDisposition,'Desconfiado');}
});
test('água: duas porções totais são divididas por três personagens sem multiplicação ou nova entrega',()=>{
 const g=fixture(30);g.survivors.forEach(p=>p.water=0);
 const effects=g.survivors.map((p,index)=>personal(p,{water:eventProvisionShare(2,3,index)}));resolve(g,command(g,30,'risk','success',{participantIds:g.survivors.map(p=>p.id),personalEffects:effects}));
 assert.deepEqual(g.survivors.map(p=>p.water),[1,1,0]);assert.deepEqual(eventRewardRemaining(event(g)),{food:0,water:0});
 const before=structuredClone(g);assert.match(resolveHexEvent(g,command(g,30)).message,/estoque restante/);assert.deepEqual(g,before);
});
test('água: o servidor rejeita multiplicação mesmo fora da interface e permite entregar só o saldo',()=>{
 const g=fixture(30),before=structuredClone(g);const c=command(g,30,'risk','success',{participantIds:g.survivors.map(p=>p.id),personalEffects:g.survivors.map(p=>personal(p,{water:2}))});assert.equal(resolveHexEvent(g,c).ok,false);assert.deepEqual(g,before);
 resolve(g,command(g,30,'risk','complication'));assert.equal(eventRewardRemaining(event(g)).water,1);resolve(g,command(g,30,'risk','success',{personalEffects:[personal(g.survivors[0],{water:1})]}));assert.equal(eventRewardRemaining(event(g)).water,0);
});
test('estoque: pagar com garrafa pronta abre uma porção e não marca hidratação diária',()=>{
 const g=fixture(26),p=g.survivors[0];p.water=0;p.inventory=[{id:'bottle',name:'Água engarrafada',qty:1,load:1,provisionResource:'water',portionsPerUnit:2,verified:true,prepared:true}];resolve(g,command(g,26));
 assert.equal(g.survivors[0].water,0);assert.equal(physicalProvisionPortions(g.survivors[0].inventory,'water',true),1);assert.equal(g.survivors[0].waterConsumedDay,undefined);
});
test('estoque: custo retira o lote antigo; seu vencimento não apaga a água recebida depois',()=>{
 const g=fixture(26);g.survivors[0].water=0;recordProvisionLot(g.survivors[0],'water',1,'Lote antigo',2);resolve(g,command(g,26));assert.deepEqual(g.survivors[0].provisionLots,[]);
 const next=fixture(30);next.survivors=g.survivors;resolve(next,command(next,30));assert.equal(next.survivors[0].water,2);expirePortionLots(next.survivors[0],2);assert.equal(next.survivors[0].water,2);
});
test('socorrista e escada: custos descritos correspondem à água, Estresse e duração total',()=>{
 const g=fixture(26);resolve(g,command(g,26,'risk','complication'));assert.equal(g.minutes,555);assert.equal(g.survivors[0].water,3);assert.equal(g.survivors[0].stress,1);
 const ladder=fixture(74);resolve(ladder,command(ladder,74,'risk','complication'));assert.equal(ladder.minutes,550);assert.equal(ladder.survivors[0].stress,1);
});
test('portão: ganhar dez minutos prorroga o prazo, mas a ação continua custando cinco',()=>{
 const g=fixture(97),start=absoluteMinutes(g);resolve(g,command(g,97,'risk','complication'));assert.equal(g.minutes,545);assert.equal(event(g).clock.dueAbsoluteMinute,start+20);assert.equal(event(g).clock.status,'active');assert.equal(nextActivityMinute(g),560);
 assert.equal(advanceToNextActivity(g).ok,true);assert.equal(g.minutes,560);assert.equal(event(g).clock.status,'expired');const noise=g.noise;advanceCampaignTime(g,1);assert.equal(g.noise,noise);
});
test('alarme: recuo deixa o prazo vencer; desarme na janela cancela sem disparar',()=>{
 const g=fixture(88);resolve(g,command(g,88,'risk','withdrawn'));assert.equal(g.minutes,541);assert.equal(event(g).clock.status,'expired');assert.equal(g.noise,2);
 for(const outcome of ['success','complication']){const d=fixture(88);resolve(d,command(d,88,'risk',outcome));assert.equal(event(d).clock.status,'cancelled');assert.equal(d.noise,0);advanceCampaignTime(d,5);assert.equal(d.noise,0);}
});
test('prazo: uma ação longa para ao vencer e não desarma retroativamente após recarregar',()=>{
 let g=fixture(88,true);resolve(g,command(g,88,'risk','success',{minutes:2}));g=JSON.parse(JSON.stringify(g));const first=advanceToNextActivity(g);assert.equal(first.ok,true);assert.equal(g.minutes,541);assert.equal(g.noise,2);assert.equal(event(g).clock.status,'expired');
 const next=advanceToNextActivity(g);assert.match(next.issue,/prazo já venceu/);assert.equal(event(g).resolutions[0].status,'scheduled');assert.equal(g.noise,2);
 assert.equal(cancelActivity(g,event(g).resolutions[0].id),true);assert.equal(g.noise,2);
});
test('prazo iniciado sem ação permite avançar até a consequência, preserva sigilo e não reinicia',()=>{
 const g=fixture(88);resolve(g,command(g,88,'careful','success',{minutes:0,participantIds:[],summary:'Prazo anunciado.',clock:{initial:eventGuides[87].initialClock,action:'keep'}}));assert.equal(g.minutes,540);assert.equal(nextActivityMinute(g),541);assert.equal(JSON.stringify(projectPlayerGame(g,g.survivors[0].id)).includes('Disparo do alarme'),false);
 assert.equal(advanceToNextActivity(g).ok,true);const due=event(g).clock.dueAbsoluteMinute;resolve(g,command(g,88,'careful','success',{minutes:0,participantIds:[]}));assert.equal(event(g).clock.dueAbsoluteMinute,due);assert.equal(g.noise,2);
});
test('equipes separadas: estoque reservado é liberado ao cancelar e recebido só ao concluir',()=>{
 const g=fixture(30,true);const c=command(g,30);assert.equal(resolve(g,c).completed,false);assert.equal(g.survivors[0].water,4);assert.equal(eventRewardRemaining(event(g)).water,0);assert.equal(cancelActivity(g,c.id),true);assert.equal(eventRewardRemaining(event(g)).water,2);
 const retry=command(g,30);resolve(g,retry);assert.equal(advanceToNextActivity(g).ok,true);assert.equal(g.survivors[0].water,6);assert.equal(eventRewardRemaining(event(g)).water,0);
});

test('dano anunciado nos cem desfechos corresponde ao efeito sugerido e não há dano ou condição ocultos',()=>{
 for(const guide of require('../lib/event-guide-definitions.json')) for(const [kind,outcome] of Object.entries(guide.outcomes)){
  const m=outcome.mechanical??{},label=`Evento ${guide.roll} · ${kind}`;
  const match=outcome.summary.match(/(?:marcar |marca |causa |Marcar )(\d) PV/);
  if(match)assert.equal(m.hpMarks,Number(match[1]),label);
  if(m.hpMarks)assert.match(outcome.summary,/PV/,label);
  if(m.condition)assert.ok(outcome.summary.toLocaleLowerCase('pt-BR').includes(m.condition.name==='Restrito'?'restrit':m.condition.name.toLocaleLowerCase('pt-BR')),label);
 }
});

test('falhar ao sinalizar da cobertura, esperar uma pausa ou preparar retirada não presume exposição ou levantamento inseguro',()=>{
 const guides=require('../lib/event-guide-definitions.json');
 for(const roll of [4,18,79,81,94,100]){
  const fail=guides.find(g=>g.roll===roll).outcomes.failure;
  assert.equal(fail.mechanical?.hpMarks??0,0,`Evento ${roll}`);
  assert.equal(fail.mechanical?.condition,undefined,`Evento ${roll}`);
 }
});
