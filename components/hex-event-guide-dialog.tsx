"use client";
import { useState } from "react";
import { BookOpen, Clock3, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Pick, Counter } from "@/components/game-controls";
import { displayTime, hasMultipleSurvivorGroups, survivorsAtHex, type GameState } from "@/lib/game";
import { eventGuide, eventOutcomeSuggestion } from "@/lib/event-guides";
import { eventStatus } from "@/lib/hex-generators";
import { eventOutcomeLabels, type EventOutcome } from "@/lib/event-resolution-types";
import { eventResolutionFingerprint, resolveHexEvent } from "@/lib/event-resolution";
import { survivorTimedCommitment } from "@/lib/activity";
import { createId } from "@/lib/id";
import type { MasterActionControls } from "@/components/player-actions-panel";

export function HexEventGuideDialog({game,hexId,eventId,controls,edit,onClose}:{game:GameState;hexId:string;eventId:string;controls?:MasterActionControls;edit:(fn:(draft:GameState)=>void)=>void;onClose:()=>void}) {
  const event=game.hexes[hexId]?.events.find(e=>e.id===eventId);
  const guide=eventGuide(event??{id:"removed",text:"Evento removido",trigger:"",revealed:false});
  const [expectedEvent]=useState(()=>event?eventResolutionFingerprint(event):"");
  const [approachId,setApproachId]=useState(guide.approaches[0].id);
  const [outcome,setOutcome]=useState<EventOutcome>("success");
  const [summary,setSummary]=useState(eventOutcomeSuggestion(guide,guide.approaches[0].id,"success").summary);
  const [continuity,setContinuity]=useState(eventOutcomeSuggestion(guide,guide.approaches[0].id,"success").continuity);
  const [minutes,setMinutes]=useState(guide.approaches[0].minutes);
  const [noise,setNoise]=useState(0),[fear,setFear]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [summaryEdited,setSummaryEdited]=useState(false),[continuityEdited,setContinuityEdited]=useState(false);
  const [minutesEdited,setMinutesEdited]=useState(false),[noiseEdited,setNoiseEdited]=useState(false),[fearEdited,setFearEdited]=useState(false);
  const people=survivorsAtHex(game,hexId);
  const [ids,setIds]=useState(()=>people.filter(p=>!survivorTimedCommitment(game,p.id)).map(p=>p.id));
  const approach=guide.approaches.find(a=>a.id===approachId)??guide.approaches[0];
  const scheduled=event?.resolutions?.find(r=>r.status==="scheduled");
  const canResolve=Boolean(event&&["pending","active"].includes(eventStatus(event))&&!scheduled);
  const disabled=busy||Boolean(controls&&(!controls.canAct||controls.pending));
  function updateSuggestions(nextApproach:string,nextOutcome:EventOutcome){
    const suggestion=eventOutcomeSuggestion(guide,nextApproach,nextOutcome);
    if(!summaryEdited)setSummary(suggestion.summary);
    if(!continuityEdited)setContinuity(suggestion.continuity);
    if(!noiseEdited)setNoise(suggestion.noise);
    if(!fearEdited)setFear(0);
  }
  function chooseOutcome(value:EventOutcome){setOutcome(value);updateSuggestions(approachId,value);}
  function chooseApproach(id:string){setApproachId(id);updateSuggestions(id,outcome);if(!minutesEdited)setMinutes(guide.approaches.find(a=>a.id===id)!.minutes);}
  function restoreTextSuggestion(){const suggestion=eventOutcomeSuggestion(guide,approachId,outcome);setSummary(suggestion.summary);setContinuity(suggestion.continuity);setSummaryEdited(false);setContinuityEdited(false);}
  async function confirm(){
    if(disabled||!event)return;
    const command={type:"resolve-event" as const,id:createId(),day:game.day,expectedMinute:game.minutes,expectedEvent,hexId,eventId,approachId,outcome,summary,continuity,participantIds:ids,minutes,noise,fear};
    setBusy(true);setError("");
    try{
      if(controls)await controls.send(command);
      else{let issue="";edit(draft=>{const result=resolveHexEvent(draft,command);if(!result.ok)issue=result.message;});if(issue)throw new Error(issue);}
      toast.success(minutes>0&&hasMultipleSurvivorGroups(game)?"Resolução iniciada":"Desfecho registrado");onClose();
    }catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível registrar o desfecho.");}finally{setBusy(false);}
  }
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="hex-event-guide-dialog">
    <DialogHeader><DialogTitle><BookOpen size={19}/> Conduzir evento · {guide.title}</DialogTitle><DialogDescription>Hex {hexId} · Guia reservado ao mestre. Escolha o desfecho conforme a ação e os testes já resolvidos.</DialogDescription></DialogHeader>
    <div className="event-guide-scene"><p>{event?.text??"O evento foi removido."}</p><b>O que está em jogo</b><p>{guide.stakes}</p>{event?.guidance&&<p className="subtle">{event.guidance}</p>}</div>
    <div className="event-guide-columns">
      <section className="event-guide-approaches" aria-label="Abordagens e resolução sugerida"><h3>Como conduzir <span className="tag">{guide.format==="brief"?"Ocorrência breve":"Cena"}</span></h3><p className="subtle text-xs">{guide.format==="brief"?"Uma decisão pode bastar. ":""}Sugestões editáveis. Proponha teste somente quando houver risco e incerteza.</p>{guide.legacy&&<p className="subtle text-xs">Guia compatível com o texto já salvo neste evento.</p>}{guide.setup&&<details className="event-guide-options"><summary>Preparação sugerida para o mestre</summary><p>{guide.setup}</p></details>}
        {guide.approaches.map(a=><button type="button" className={`event-guide-approach${a.id===approachId?" is-selected":""}`} key={a.id} aria-pressed={a.id===approachId} disabled={disabled||!canResolve} onClick={()=>chooseApproach(a.id)}>
          <b>{a.label}</b><span>{a.description}</span><small>{a.minutes?`${a.minutes} min sugeridos`:"Sem custo de tempo sugerido"}{a.test?` · Se necessário: ${a.test.trait}, Dificuldade ${a.test.difficulty}`:" · Sem teste se a abordagem bastar"}</small>
        </button>)}
        {approach.timeNote&&<p className="subtle text-xs">{approach.timeNote}</p>}
        {approach.test&&<details className="event-guide-options"><summary>Quando propor um teste nesta abordagem</summary><p>{approach.test.when}</p>{approach.test.alternative&&<p><b>Outra ação: {approach.test.alternative.trait}, Dificuldade {approach.test.alternative.difficulty}.</b> {approach.test.alternative.when}</p>}<p className="subtle">Atributo e dificuldade dependem da ação descrita e do risco anunciado. Estes valores são referências.</p></details>}
        <details className="event-guide-options"><summary>Possíveis desfechos desta abordagem</summary>{Object.keys(guide.outcomes).map(key=><p key={key}><b>{eventOutcomeLabels[key as EventOutcome]}:</b> {eventOutcomeSuggestion(guide,approachId,key as EventOutcome).summary}</p>)}</details>
      </section>
      <section className="event-guide-resolution" aria-label="Desfecho e consequências"><h3>Desfecho e consequências</h3>
        {scheduled?<div className="event-guide-preview"><Clock3 size={17}/><p>Resolução em andamento até {displayTime(scheduled.endMinute)}. Os efeitos serão aplicados na conclusão.</p></div>:canResolve?<>
          <Pick label="Desfecho escolhido" value={outcome} options={Object.entries(eventOutcomeLabels).map(([value,label])=>({value,label}))} onChange={value=>chooseOutcome(value as EventOutcome)} disabled={disabled}/>
          <Field label="O que aconteceu" value={summary} onChange={value=>{setSummary(value);setSummaryEdited(true);}} multiline/>
          <Field label="O que permanece para próximas visitas" value={continuity} onChange={value=>{setContinuity(value);setContinuityEdited(true);}} multiline/>
          {(summaryEdited||continuityEdited)&&<div className="event-guide-draft-note"><span className="subtle text-xs">Seu relato editado é preservado ao trocar abordagem ou desfecho.</span><Button size="sm" variant="ghost" disabled={disabled} onClick={restoreTextSuggestion}>Usar sugestão do desfecho</Button></div>}
          <details className="event-guide-effects" open><summary>Revisar efeitos e participantes</summary><div className="event-guide-counters">
            <Counter compact editable label="Tempo (min)" value={minutes} max={360} onChange={value=>{setMinutes(value);setMinutesEdited(true);}}/><Counter compact editable label="Barulho" value={noise} min={-5} max={5} onChange={value=>{setNoise(value);setNoiseEdited(true);}}/><Counter compact editable label="Medo" value={fear} min={-12} max={12} onChange={value=>{setFear(value);setFearEdited(true);}}/>
          </div><fieldset><legend>Quem dedica esse tempo?</legend><div className="event-guide-participants">{people.map(p=>{const commitment=survivorTimedCommitment(game,p.id);return <label key={p.id} title={commitment?.label}><input type="checkbox" checked={ids.includes(p.id)} disabled={disabled||Boolean(minutes&&commitment)} onChange={e=>setIds(e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/>{p.name}{commitment&&minutes?" · ocupado":""}</label>;})}{!people.length&&<p className="subtle">Nenhum sobrevivente presente neste hex.</p>}</div></fieldset></details>
          <div className="event-guide-preview"><CheckCircle2 size={17}/><div><b>{minutes>0&&hasMultipleSurvivorGroups(game)?`Conclusão prevista: ${displayTime(game.minutes+minutes)}`:"Aplicar ao confirmar"}</b><p>{minutes} min · Barulho {noise>=0?"+":""}{noise} · Medo {fear>=0?"+":""}{fear}</p><small>Barulho: {game.noise} → {Math.max(0,Math.min(5,game.noise+noise))} · Medo: {game.fear} → {Math.max(0,Math.min(12,game.fear+fear))}</small></div></div>
          <p className="subtle text-xs">Este registro não movimenta pessoas nem entrega itens. Use os controles do mapa e do inventário para essas ações, com seus custos e condições.</p>
        </>:<p className="subtle">Consulte o desfecho registrado abaixo. Para uma nova ocorrência, reabra o evento no setor.</p>}
        {error&&<p role="alert" className="event-guide-error">{error}</p>}
      </section>
    </div>
    {Boolean(event?.resolutions?.length)&&<details className="event-guide-history" open={!canResolve}><summary>Histórico de desfechos ({event!.resolutions!.length})</summary>{[...event!.resolutions!].reverse().map(r=><article key={r.id}><b>{eventOutcomeLabels[r.outcome]} · {r.status==="completed"?"Registrado":r.status==="scheduled"?"Em andamento":"Interrompido"}</b><small>Dia {r.day} · {displayTime(r.startMinute)} → {displayTime(r.endMinute)}</small><p>{r.summary}</p><p className="subtle">{r.continuity}</p><small>{r.minutes} min previstos · Barulho {r.appliedNoise??r.noise} · Medo {r.appliedFear??r.fear}</small></article>)}</details>}
    <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>Fechar</Button>{canResolve&&<Button className="whitespace-nowrap" disabled={disabled||!summary.trim()||summary.length>1600||continuity.length>1600||Boolean(minutes&&(!ids.length||game.minutes+minutes>=1440||game.conflict?.active))} onClick={()=>void confirm()}>{minutes>0&&hasMultipleSurvivorGroups(game)?"Iniciar resolução":"Registrar desfecho"}</Button>}</DialogFooter>
  </DialogContent></Dialog>;
}
