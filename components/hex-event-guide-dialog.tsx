"use client";
import { useState } from "react";
import { BookOpen, Clock3, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Pick, Counter } from "@/components/game-controls";
import { absoluteMinutes, displayTime, survivorStats, hasMultipleSurvivorGroups, survivorsAtHex, type GameState, type NPC, type HexEventActionKind } from "@/lib/game";
import { eventGuide, eventOutcomeSuggestion } from "@/lib/event-guides";
import { eventStatus } from "@/lib/hex-generators";
import { eventOutcomeLabels, type EventOutcome, type EventPersonalEffect, type EventClockPlan, type EventCondition } from "@/lib/event-resolution-types";
import { eventResolutionFingerprint, resolveHexEvent, eventEffectsIssue, eventRewardRemaining, eventProvisionShare, eventNpcDisposition } from "@/lib/event-resolution";
import { provisionBreakdown } from "@/lib/provision-items";
import { eventClockIssue } from "@/lib/event-clocks";
import { survivorTimedCommitment } from "@/lib/activity";
import { createId } from "@/lib/id";
import { HexEventActionDialog, type HexEventActionRequest } from "@/components/hex-event-action-dialog";
import { eventActionUsed, hexEventActionLabels } from "@/lib/hex-event-actions";
import type { MasterActionControls } from "@/components/player-actions-panel";

export function HexEventGuideDialog({game,hexId,eventId,controls,edit,onClose}:{game:GameState;hexId:string;eventId:string;controls?:MasterActionControls;edit:(fn:(draft:GameState)=>void)=>void;onClose:()=>void}) {
  const event=game.hexes[hexId]?.events.find(e=>e.id===eventId);
  const guide=eventGuide(event??{id:"removed",text:"Evento removido",trigger:"",revealed:false});
  const [expectedEvent,setExpectedEvent]=useState(()=>event?eventResolutionFingerprint(event):"");
  const [approachId,setApproachId]=useState(guide.approaches[0].id);
  const [closeEvent,setCloseEvent]=useState(false);
  const [timeAlreadyCounted,setTimeAlreadyCounted]=useState(false);
  const [elementRequest,setElementRequest]=useState<HexEventActionRequest|null>(null);
  const [outcome,setOutcome]=useState<EventOutcome>("success");
  const [summary,setSummary]=useState(eventOutcomeSuggestion(guide,guide.approaches[0].id,"success").summary);
  const [continuity,setContinuity]=useState(eventOutcomeSuggestion(guide,guide.approaches[0].id,"success").continuity);
  const [minutes,setMinutes]=useState(guide.approaches[0].minutes);
  const [noise,setNoise]=useState(0),[fear,setFear]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [summaryEdited,setSummaryEdited]=useState(false),[continuityEdited,setContinuityEdited]=useState(false);
  const [minutesEdited,setMinutesEdited]=useState(false),[noiseEdited,setNoiseEdited]=useState(false),[fearEdited,setFearEdited]=useState(false);
  const initialMechanical=eventOutcomeSuggestion(guide,guide.approaches[0].id,"success").mechanical;
  const [applyPersonal,setApplyPersonal]=useState(false),[effectIds,setEffectIds]=useState<string[]>([]);
  const [hpMarks,setHpMarks]=useState(initialMechanical?.hpMarks??0),[useArmor,setUseArmor]=useState(false);
  const [stress,setStress]=useState(initialMechanical?.stress??0),[hope,setHope]=useState(initialMechanical?.hope??0);
  const [food,setFood]=useState(initialMechanical?.food??0),[water,setWater]=useState(initialMechanical?.water??0);
  const [conditionName,setConditionName]=useState(initialMechanical?.condition?.name??""),[conditionEffect,setConditionEffect]=useState(initialMechanical?.condition?.effect??""),[conditionClear,setConditionClear]=useState(initialMechanical?.condition?.clear??"");
  const [personalEdited,setPersonalEdited]=useState(false),[npcEdited,setNpcEdited]=useState(false);
  const [applyNpc,setApplyNpc]=useState(false),[npcId,setNpcId]=useState(event?.actionLinks?.npcId??"");
  const [disposition,setDisposition]=useState<NPC["disposition"]>(initialMechanical?.npcDisposition??"Neutro"),[commitment,setCommitment]=useState(initialMechanical?.commitment??"");
  const [npcMode,setNpcMode]=useState<"set"|"at-least"|"keep">(initialMechanical?.npcMode??"set");
  const [npcCondition,setNpcCondition]=useState<EventCondition|null>(initialMechanical?.npcCondition??null);
  const [applyClock,setApplyClock]=useState(Boolean(guide.initialClock)),[clockEdited,setClockEdited]=useState(false);
  const [clockMinutes,setClockMinutes]=useState(guide.initialClock?.minutes??1);
  const clockSuggestion=eventOutcomeSuggestion(guide,approachId,outcome).clock;
  const clock:EventClockPlan|undefined=applyClock&&guide.initialClock?{initial:!event?.clock?{...guide.initialClock,minutes:clockSuggestion?.action==="extend"?guide.initialClock.minutes:clockMinutes}:undefined,action:clockSuggestion?.action??"keep",...(clockSuggestion?.action==="extend"?{minutes:clockMinutes}:{})}:undefined;
  const rewardRemaining=event?eventRewardRemaining(event):null;
  const personalEffects:EventPersonalEffect[]=applyPersonal?effectIds.map((survivorId,index)=>({survivorId,hpMarks,armor:useArmor,stress,hope,food:eventProvisionShare(food,effectIds.length,index),water:eventProvisionShare(water,effectIds.length,index),...(conditionName.trim()?{condition:{name:conditionName.trim(),effect:conditionEffect.trim(),clear:conditionClear.trim(),...(conditionName.trim().toLocaleLowerCase("pt-BR")==="restrito"?{preventsMovement:true}:{})}}:{})})):[];
  const npcEffect=applyNpc?{npcId,disposition,mode:npcMode,...(npcCondition?{condition:npcCondition}:{}),commitment:commitment.trim()}:undefined;
  const mechanicalIssue=applyPersonal&&!effectIds.length?"Escolha quem recebe os efeitos pessoais.":applyPersonal&&conditionName.trim()&&(!conditionEffect.trim()||!conditionClear.trim())?"Descreva o efeito e como remover a condição.":applyNpc&&(!npcId||!commitment.trim())?"Escolha o PNJ e descreva o acordo ou ruptura.":applyPersonal&&(conditionName.length>80||conditionEffect.length>400||conditionClear.length>400)?"Use até 80 caracteres no nome e 400 no efeito e remoção da condição.":applyNpc&&commitment.length>600?"Resuma o compromisso do PNJ para até 600 caracteres.":"";
  const people=survivorsAtHex(game,hexId);
  const [ids,setIds]=useState(()=>people.filter(p=>!survivorTimedCommitment(game,p.id)).map(p=>p.id));
  const approach=approachId==="free"?{id:"free",label:"Abordagem livre",description:"Registre a intenção e o resultado da solução proposta pelo grupo.",minutes:0}:guide.approaches.find(a=>a.id===approachId)??guide.approaches[0];
  const chargedMinutes=timeAlreadyCounted?0:minutes;
  const outdated=Boolean(event&&eventResolutionFingerprint(event)!==expectedEvent);
  const scheduled=event?.resolutions?.find(r=>r.status==="scheduled");
  const canResolve=Boolean(event&&["pending","active"].includes(eventStatus(event))&&!scheduled);
  const disabled=busy||Boolean(controls&&(!controls.canAct||controls.pending));
  function updateSuggestions(nextApproach:string,nextOutcome:EventOutcome){
    const suggestion=eventOutcomeSuggestion(guide,nextApproach,nextOutcome);
    if(!summaryEdited)setSummary(suggestion.summary);
    if(!continuityEdited)setContinuity(suggestion.continuity);
    if(!noiseEdited)setNoise(suggestion.noise);
    if(!fearEdited)setFear(0);
    const m=suggestion.mechanical;
    if(!personalEdited){setHpMarks(m?.hpMarks??0);setUseArmor(false);setStress(m?.stress??0);setHope(m?.hope??0);setFood(m?.food??0);setWater(m?.water??0);setConditionName(m?.condition?.name??"");setConditionEffect(m?.condition?.effect??"");setConditionClear(m?.condition?.clear??"");}
    if(!npcEdited){setDisposition(m?.npcDisposition??"Neutro");setNpcMode(m?.npcMode??"set");setNpcCondition(m?.npcCondition??null);setCommitment(m?.commitment??"");}
    if(!clockEdited)setClockMinutes(suggestion.clock?.action==="extend"?suggestion.clock.minutes??1:guide.initialClock?.minutes??1);
  }
  function chooseOutcome(value:EventOutcome){setOutcome(value);updateSuggestions(approachId,value);if(!minutesEdited&&value!=="withdrawn")setMinutes(approach.minutes+(eventOutcomeSuggestion(guide,approachId,value).extraMinutes??0));}
  function chooseApproach(id:string){setApproachId(id);updateSuggestions(id,outcome);setCloseEvent(false);if(!minutesEdited)setMinutes(id==="free"?0:guide.approaches.find(a=>a.id===id)!.minutes+(eventOutcomeSuggestion(guide,id,outcome).extraMinutes??0));}
  function restoreMechanicalSuggestion(){const m=eventOutcomeSuggestion(guide,approachId,outcome).mechanical;setHpMarks(m?.hpMarks??0);setUseArmor(false);setStress(m?.stress??0);setHope(m?.hope??0);setFood(m?.food??0);setWater(m?.water??0);setConditionName(m?.condition?.name??"");setConditionEffect(m?.condition?.effect??"");setConditionClear(m?.condition?.clear??"");setDisposition(m?.npcDisposition??"Neutro");setNpcMode(m?.npcMode??"set");setNpcCondition(m?.npcCondition??null);setCommitment(m?.commitment??"");setPersonalEdited(false);setNpcEdited(false);}
  function restoreTextSuggestion(){const suggestion=eventOutcomeSuggestion(guide,approachId,outcome);setSummary(suggestion.summary);setContinuity(suggestion.continuity);setSummaryEdited(false);setContinuityEdited(false);}
  const effectIssue=mechanicalIssue||eventEffectsIssue(game,hexId,ids,personalEffects,npcEffect,event)|| (event?eventClockIssue(event,clock):"");
  const blockReason=effectIssue?effectIssue:outdated?"O evento mudou. Confira a versão atual antes de confirmar.":(event?.resolutions?.length??0)>=20?"O histórico atingiu 20 etapas. Crie uma nova ocorrência para continuar.":!summary.trim()?"Descreva o que aconteceu.":summary.length>1600||continuity.length>1600?"Reduza os textos para até 1.600 caracteres por campo.":approachId==="free"&&!summaryEdited?"Descreva o resultado da abordagem livre.":chargedMinutes&&!ids.length?"Escolha quem dedica tempo à etapa.":chargedMinutes&&game.conflict?.active?"Durante um conflito, use seu fluxo de ações ou marque o tempo já contabilizado.":chargedMinutes&&game.minutes+chargedMinutes>=1440?"A duração ultrapassa o dia. Reduza o intervalo ou encerre o dia primeiro.":chargedMinutes&&ids.some(id=>!people.some(p=>p.id===id)||Boolean(survivorTimedCommitment(game,id)))?"Um participante mudou de local ou está ocupado. Revise a seleção.":"";
  async function confirm(){
    if(disabled||blockReason||!event)return;
    const command={type:"resolve-event" as const,id:createId(),day:game.day,expectedMinute:game.minutes,expectedEvent,hexId,eventId,approachId,outcome,summary,continuity,participantIds:ids,minutes:chargedMinutes,noise,fear,closeEvent,personalEffects,npcEffect,clock};
    setBusy(true);setError("");
    try{
      if(controls)await controls.send(command);
      else{let issue="";edit(draft=>{const result=resolveHexEvent(draft,command);if(!result.ok)issue=result.message;});if(issue)throw new Error(issue);}
      toast.success(chargedMinutes>0&&hasMultipleSurvivorGroups(game)?"Etapa iniciada":closeEvent?"Evento encerrado":"Etapa registrada; evento continua ativo");onClose();
    }catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível registrar o desfecho.");}finally{setBusy(false);}
  }
  async function startClock(){
    if(disabled||!canResolve||outdated||!event||event.clock||!guide.initialClock)return;
    const c={type:"resolve-event" as const,id:createId(),day:game.day,expectedMinute:game.minutes,expectedEvent,hexId,eventId,approachId:"careful",outcome:"success" as const,summary:`Prazo anunciado: ${guide.initialClock.label}.`,continuity:guide.initialClock.consequence,participantIds:[],minutes:0,noise:0,fear:0,closeEvent:false,clock:{initial:{...guide.initialClock,minutes:clockSuggestion?.action==="extend"?guide.initialClock.minutes:clockMinutes},action:"keep" as const}};
    setBusy(true);setError("");
    try{if(controls)await controls.send(c);else{let issue="";edit(d=>{const r=resolveHexEvent(d,c);if(!r.ok)issue=r.message;});if(issue)throw new Error(issue);}toast.success("Prazo iniciado no relógio da campanha");onClose();}catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível iniciar o prazo.");}finally{setBusy(false);}
  }
  return <><Dialog open={!elementRequest} onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="hex-event-guide-dialog">
    <DialogHeader><DialogTitle><BookOpen size={19}/> Conduzir evento · {guide.title}</DialogTitle><DialogDescription>Hex {hexId} · Guia reservado ao mestre. Registre cada etapa conforme a ação e os testes resolvidos; encerre quando a situação estiver concluída.</DialogDescription></DialogHeader>
    <div className="event-guide-scene"><p>{event?.text??"O evento foi removido."}</p><b>O que está em jogo</b><p>{guide.stakes}</p>{event?.guidance&&<p className="subtle">{event.guidance}</p>}</div>
    <div className="event-guide-columns">
      <section className="event-guide-approaches" aria-label="Abordagens e resolução sugerida"><h3>Como conduzir <span className="tag">{guide.format==="brief"?"Ocorrência breve":"Cena"}</span></h3><p className="subtle text-xs">{guide.format==="brief"?"Uma decisão pode bastar. ":""}Sugestões editáveis. Proponha teste somente quando houver risco e incerteza.</p>{guide.legacy&&<p className="subtle text-xs">Guia compatível com o texto já salvo neste evento.</p>}{guide.setup&&<details className="event-guide-options"><summary>Preparação sugerida para o mestre</summary><p>{guide.setup}</p></details>}
        {(guide.ignored||guide.returnVisit||guide.contextNote)&&<details className="event-guide-options"><summary>Se ignorarem, retornarem ou adaptarem o local</summary>{guide.ignored&&<p><b>Se ignorarem:</b> {guide.ignored}</p>}{guide.returnVisit&&<p><b>Na próxima visita:</b> {guide.returnVisit}</p>}{guide.contextNote&&<p><b>Compatibilidade:</b> {guide.contextNote}</p>}</details>}
        {[...guide.approaches,{id:"free",label:"Abordagem livre",description:"Uma solução proposta pelos jogadores. Escreva o resultado e revise os custos.",minutes:0}].map(a=><button type="button" className={`event-guide-approach${a.id===approachId?" is-selected":""}`} key={a.id} aria-pressed={a.id===approachId} disabled={disabled||!canResolve} onClick={()=>chooseApproach(a.id)}>
          <b>{a.label}</b><span>{a.description}</span><small>{a.minutes?`${a.minutes} min sugeridos`:"Sem custo de tempo sugerido"}{a.test?` · Se necessário: ${a.test.trait}, Dificuldade ${a.test.difficulty}`:" · Sem teste se a abordagem bastar"}</small>
        </button>)}
        {approachId==="free"&&<p className="subtle text-xs">Atributo, dificuldade e custos dependem da ação descrita. Não há teste automático.</p>}
        {approach.announcedCost&&<p className="character-rule-note"><b>Custo possível a anunciar:</b> {approach.announcedCost}</p>}
        {approach.timeNote&&<p className="subtle text-xs">{approach.timeNote}</p>}
        {approach.test&&<details className="event-guide-options"><summary>Quando propor um teste nesta abordagem</summary><p>{approach.test.when}</p>{approach.test.alternative&&<p><b>Outra ação: {approach.test.alternative.trait}, Dificuldade {approach.test.alternative.difficulty}.</b> {approach.test.alternative.when}</p>}<p className="subtle">Atributo e dificuldade dependem da ação descrita e do risco anunciado. Estes valores são referências.</p></details>}
        <details className="event-guide-options"><summary>Possíveis desfechos desta abordagem</summary>{Object.keys(guide.outcomes).map(key=><p key={key}><b>{eventOutcomeLabels[key as EventOutcome]}:</b> {eventOutcomeSuggestion(guide,approachId,key as EventOutcome).summary}</p>)}</details>
      </section>
      <section className="event-guide-resolution" aria-label="Desfecho e consequências"><h3>Desfecho e consequências</h3>
        {event?.clock&&<div className="event-guide-preview"><Clock3 size={17}/><div><b>{event.clock.label} · {event.clock.status==="active"?`Dia ${Math.floor(event.clock.dueAbsoluteMinute/1440)+1}, ${displayTime(event.clock.dueAbsoluteMinute%1440)}`:event.clock.status==="expired"?"Prazo vencido":"Prazo encerrado"}</b><p>{event.clock.consequence}</p>{event.clock.status==="active"&&<small>Restam {Math.max(0,event.clock.dueAbsoluteMinute-absoluteMinutes(game))} minutos.</small>}</div></div>}
        {scheduled?<div className="event-guide-preview"><Clock3 size={17}/><p>Resolução em andamento até {displayTime(scheduled.endMinute)}. Os efeitos serão aplicados na conclusão.</p></div>:canResolve?<>
          <Pick label="Após esta etapa" value={closeEvent?"close":"continue"} options={[{value:"continue",label:"Manter evento ativo"},{value:"close",label:"Encerrar evento"}]} onChange={value=>setCloseEvent(value==="close")} disabled={disabled}/>
          <Pick label="Desfecho escolhido" value={outcome} options={Object.entries(eventOutcomeLabels).map(([value,label])=>({value,label}))} onChange={value=>chooseOutcome(value as EventOutcome)} disabled={disabled}/>
          <Field label="O que aconteceu" value={summary} onChange={value=>{setSummary(value);setSummaryEdited(true);}} multiline/>
          <Field label="O que permanece para próximas visitas" value={continuity} onChange={value=>{setContinuity(value);setContinuityEdited(true);}} multiline/>
          {(summaryEdited||continuityEdited)&&<div className="event-guide-draft-note"><span className="subtle text-xs">Seu relato editado é preservado ao trocar abordagem ou desfecho.</span><Button size="sm" variant="ghost" disabled={disabled} onClick={restoreTextSuggestion}>Usar sugestão do desfecho</Button></div>}
          {guide.initialClock&&<details className="event-guide-effects" open><summary>Prazo da cena</summary><label><input type="checkbox" checked={applyClock} disabled={disabled} onChange={e=>setApplyClock(e.target.checked)}/> Acompanhar o prazo anunciado no relógio</label><p className="subtle text-xs">A duração abaixo é o tempo gasto na ação. Este prazo determina quando a consequência acontece; prorrogar não gasta o tempo que foi ganho.</p>{(!event?.clock||clockSuggestion?.action==="extend")&&<Counter compact editable label={clockSuggestion?.action==="extend"?"Tempo ganho no prazo (min)":"Prazo inicial (min)"} value={clockMinutes} min={1} max={1440} onChange={v=>{setClockMinutes(v);setClockEdited(true);}}/>}<p>{guide.initialClock.consequence} · Barulho +{guide.initialClock.noise} ao vencer.</p>{clockSuggestion?.action==="cancel"&&<p>Esta resolução encerra o prazo se terminar antes de seu vencimento.</p>}{!event?.clock&&<Button size="sm" variant="outline" disabled={disabled||outdated||!canResolve} onClick={()=>void startClock()}>Iniciar prazo anunciado sem avançar o tempo</Button>}</details>}
          <label className="event-guide-time-choice"><input type="checkbox" checked={timeAlreadyCounted} disabled={disabled} onChange={e=>setTimeAlreadyCounted(e.target.checked)}/> O tempo desta etapa já foi contabilizado</label>
          <details className="event-guide-effects" open><summary>Revisar efeitos e participantes</summary><div className="event-guide-counters">
            <Counter compact editable label="Tempo (min)" value={minutes} max={360} onChange={value=>{setMinutes(value);setMinutesEdited(true);}}/><Counter compact editable label="Barulho" value={noise} min={-5} max={5} onChange={value=>{setNoise(value);setNoiseEdited(true);}}/><Counter compact editable label="Medo" value={fear} min={-12} max={12} onChange={value=>{setFear(value);setFearEdited(true);}}/>
          </div><fieldset><legend>Quem dedica esse tempo?</legend><div className="event-guide-participants">{people.map(p=>{const commitment=survivorTimedCommitment(game,p.id);return <label key={p.id} title={commitment?.label}><input type="checkbox" checked={ids.includes(p.id)} disabled={disabled||Boolean(chargedMinutes&&commitment)} onChange={e=>setIds(e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/>{p.name}{commitment&&chargedMinutes?" · ocupado":""}</label>;})}{!people.length&&<p className="subtle">Nenhum sobrevivente presente neste hex.</p>}</div></fieldset></details>
          <div className="event-guide-preview"><CheckCircle2 size={17}/><div><b>{chargedMinutes>0&&hasMultipleSurvivorGroups(game)?`Conclusão prevista: ${displayTime(game.minutes+chargedMinutes)}`:"Aplicar ao confirmar"}</b><p>{chargedMinutes} min adicionais · Barulho {noise>=0?"+":""}{noise} · Medo {fear>=0?"+":""}{fear}</p><small>Barulho: {game.noise} → {Math.max(0,Math.min(5,game.noise+noise))} · Medo: {game.fear} → {Math.max(0,Math.min(12,game.fear+fear))}</small></div></div>
          <details className="event-guide-effects" open><summary>Efeitos pessoais na ficha</summary>
            <p className="subtle text-xs">Os valores sugeridos abaixo só são aplicados quando você marcar a opção e escolher quem sofreu o efeito. Anuncie os riscos antes da ação. PV, Estresse e Esperança são aplicados por alvo. Comida e Água representam um total dividido entre os alvos selecionados; confira a parcela de cada um na prévia.</p>
            {(personalEdited||npcEdited)&&<Button size="sm" variant="outline" disabled={disabled} onClick={restoreMechanicalSuggestion}>Usar efeitos sugeridos deste desfecho</Button>}
            <label><input type="checkbox" checked={applyPersonal} disabled={disabled} onChange={e=>setApplyPersonal(e.target.checked)}/> Aplicar efeitos pessoais nesta etapa</label>
            {rewardRemaining&&<p className="subtle text-xs">Recompensa restante neste evento: {rewardRemaining.food} Comida · {rewardRemaining.water} Água. Porções já entregues não são renovadas ao registrar outra etapa.</p>}
            <fieldset><legend>Quem recebe estes efeitos?</legend>{people.map(p=><label key={p.id}><input type="checkbox" checked={effectIds.includes(p.id)} disabled={disabled||!applyPersonal} onChange={e=>{setEffectIds(e.target.checked?[...effectIds,p.id]:effectIds.filter(id=>id!==p.id));if(e.target.checked&&!ids.includes(p.id))setIds([...ids,p.id]);}}/>{p.name}</label>)}</fieldset>
            <div className="event-guide-counters"><Counter compact editable label="PV a marcar" value={hpMarks} max={3} onChange={v=>{setHpMarks(v);setPersonalEdited(true);}}/><Counter compact editable label="Estresse pessoal" value={stress} min={-6} max={6} onChange={v=>{setStress(v);setPersonalEdited(true);}}/><Counter compact editable label="Esperança" value={hope} min={-6} max={6} onChange={v=>{setHope(v);setPersonalEdited(true);}}/><Counter compact editable label="Comida (total)" value={food} min={-10} max={10} onChange={v=>{setFood(v);setPersonalEdited(true);}}/><Counter compact editable label="Água (total)" value={water} min={-10} max={10} onChange={v=>{setWater(v);setPersonalEdited(true);}}/></div>
            <label><input type="checkbox" checked={useArmor} disabled={disabled||hpMarks===0} onChange={e=>{setUseArmor(e.target.checked);setPersonalEdited(true);}}/> Marcar 1 Armadura para reduzir o dano em 1 PV (se a proteção cobrir o perigo)</label>
            <p className="subtle text-xs">PV são espaços a marcar, depois de definir a severidade do dano. Não rolar dano novamente. Pagamentos retiram primeiro porções soltas, preservando a validade dos lotes, e depois provisões prontas do inventário. Não registram alimentação diária.</p>
            <Field label="Condição a adicionar (opcional)" value={conditionName} onChange={v=>{setConditionName(v);setPersonalEdited(true);}}/>
            {conditionName.trim()&&<><Field label="Efeito da condição" multiline value={conditionEffect} onChange={v=>{setConditionEffect(v);setPersonalEdited(true);}}/><Field label="Como remover a condição" multiline value={conditionClear} onChange={v=>{setConditionClear(v);setPersonalEdited(true);}}/></>}
            {personalEdited&&<p className="subtle text-xs">Seus efeitos editados serão preservados ao trocar o desfecho. Confira se ainda correspondem à ação.</p>}
          </details>
          <details className="event-guide-effects" open={Boolean(guide.npc)}><summary>Relação com um PNJ</summary>
            {guide.npc&&<p><b>{guide.npc.name}</b> · {guide.npc.role}. Oferta: {guide.npc.offer}</p>}
            <label><input type="checkbox" checked={applyNpc} disabled={disabled} onChange={e=>{setApplyNpc(e.target.checked);if(e.target.checked&&!npcId&&event?.actionLinks?.npcId)setNpcId(event.actionLinks.npcId);}}/> Registrar mudança de disposição e compromisso</label>
            <Pick label="PNJ afetado" value={npcId||"__none"} options={[{value:"__none",label:"Escolha ou crie o PNJ nos elementos do evento"},...game.npcs.filter(n=>n.hex===hexId&&n.active&&!["Morto","Desaparecido"].includes(n.status)).map(n=>({value:n.id,label:`${n.name} · ${n.disposition}`}))]} onChange={v=>setNpcId(v==="__none"?"":v)} disabled={disabled||!applyNpc}/>
            <Pick label="Como alterar o vínculo" value={npcMode} options={[{value:"keep",label:"Preservar disposição e registrar compromisso"},{value:"at-least",label:"Melhorar até o nível escolhido, preservando vínculos mais fortes"},{value:"set",label:"Definir disposição explicitamente"}]} onChange={v=>{setNpcMode(v as typeof npcMode);setNpcEdited(true);}} disabled={disabled||!applyNpc}/>
            <Pick label="Nova disposição" value={disposition} options={["Hostil","Desconfiado","Neutro","Aliado","Leal"]} onChange={v=>{setDisposition(v as NPC["disposition"]);setNpcEdited(true);}} disabled={disabled||!applyNpc||npcMode==="keep"}/>
            {npcCondition&&<div className="list-card"><b>Condição do PNJ: {npcCondition.name}</b><p>{npcCondition.effect}</p><p>Remover: {npcCondition.clear}</p><Button size="sm" variant="outline" disabled={disabled} onClick={()=>{setNpcCondition(null);setNpcEdited(true);}}>Não aplicar condição ao PNJ</Button></div>}
            <Field label="Acordo, dívida ou ruptura (reservado)" multiline value={commitment} onChange={v=>{setCommitment(v);setNpcEdited(true);}}/>
            <p className="subtle text-xs">O vínculo fica na ficha do PNJ com os participantes e o dia. Criar ou vincular um cadastro existente está nos elementos deste evento. Compartilhe acordos usando as notas públicas do PNJ.</p>
          </details>
          {(personalEffects.length>0||npcEffect)&&<div className="event-guide-preview"><div><b>Aplicação nas fichas ao concluir</b>{personalEffects.map(e=>{const p=people.find(p=>p.id===e.survivorId);if(!p)return null;return <p key={p.id}>{p.name}: PV marcados {p.hp} → {Math.min(survivorStats(p).hp,p.hp+Math.max(0,e.hpMarks-(e.armor?1:0)))} · Estresse {p.stress} → {Math.max(0,Math.min(6,p.stress+e.stress))} · Esperança {p.hope} → {Math.max(0,Math.min(6,p.hope+e.hope))} · Comida disponível {provisionBreakdown(p,"food").total} → {provisionBreakdown(p,"food").total+e.food} · Água disponível {provisionBreakdown(p,"water").total} → {provisionBreakdown(p,"water").total+e.water}{e.armor?" · Armadura +1":""}{e.condition?` · ${e.condition.name}`:""}</p>;})}{npcEffect&&<p>{game.npcs.find(n=>n.id===npcEffect.npcId)?.name??"PNJ não selecionado"}: {game.npcs.find(n=>n.id===npcEffect.npcId)?eventNpcDisposition(game.npcs.find(n=>n.id===npcEffect.npcId)!,npcEffect):disposition} · {commitment}{npcCondition?` · ${npcCondition.name}`:""}</p>}</div></div>}
          <p className="subtle text-xs">Movimentos, itens físicos, consertos e descansos usam seus controles próprios. As condições ficam na aba Condições da ficha até o mestre registrar sua remoção.</p>
        </>:<p className="subtle">Consulte o desfecho registrado abaixo. Para uma nova ocorrência, reabra o evento no setor.</p>}
        {guide.application&&<p className="subtle text-xs">{guide.application}</p>}
        {event&&eventStatus(event)!=="archived"&&!scheduled&&<details className="event-guide-options"><summary>Elementos deste evento</summary><div className="event-guide-elements">{(Object.keys(hexEventActionLabels) as HexEventActionKind[]).map(type=><Button key={type} size="sm" variant="outline" disabled={disabled||eventActionUsed(game,hexId,event,type)} onClick={()=>setElementRequest({hexId,eventId,type,suggested:true})}>{hexEventActionLabels[type]}</Button>)}</div><p>Revise e confirme cada elemento; a etapa não cria itens, pessoas ou conflitos automaticamente.</p></details>}
        {outdated&&<Button size="sm" variant="outline" disabled={disabled} onClick={()=>{if(event)setExpectedEvent(eventResolutionFingerprint(event));setError("");}}>Conferi a versão atual; manter meu rascunho</Button>}
        {blockReason&&canResolve&&<p role="status" className="event-guide-error">{blockReason}</p>}
        {error&&<p role="alert" className="event-guide-error">{error}</p>}
      </section>
    </div>
    {Boolean(event?.resolutions?.length)&&<details className="event-guide-history" open={!canResolve}><summary>Histórico de desfechos ({event!.resolutions!.length})</summary>{[...event!.resolutions!].reverse().map(r=><article key={r.id}><b>{r.closeEvent===false?"Etapa · ":""}{eventOutcomeLabels[r.outcome]} · {r.status==="completed"?"Registrado":r.status==="scheduled"?"Em andamento":"Interrompido"}</b><small>Dia {r.day} · {displayTime(r.startMinute)} → {displayTime(r.endMinute)}</small><p>{r.summary}</p><p className="subtle">{r.continuity}</p>{r.appliedEffects?.map((effect,index)=><p className="subtle" key={index}>{effect}</p>)}<small>{r.minutes} min previstos · Barulho {r.appliedNoise??r.noise} · Medo {r.appliedFear??r.fear}</small></article>)}</details>}
    <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>Fechar</Button>{canResolve&&<Button className="whitespace-nowrap" disabled={disabled||Boolean(blockReason)} onClick={()=>void confirm()}>{chargedMinutes>0&&hasMultipleSurvivorGroups(game)?"Iniciar etapa":closeEvent?"Registrar e encerrar":"Registrar etapa"}</Button>}</DialogFooter>
  </DialogContent></Dialog>{elementRequest&&<HexEventActionDialog game={game} edit={edit} request={elementRequest} onClose={()=>{setElementRequest(null);}}/>}</>;
}
