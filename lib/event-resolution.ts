import { addLog, survivorHex, survivorStats, type GameState, type NPC, type HexEvent } from "./game";
import { eventStatus } from "./hex-generators";
import { eventOutcomeLabels, eventResolutionCommandSchema, type EventResolution, type EventResolutionCommand } from "./event-resolution-types";
import { scheduleActivity } from "./activity-timeline";
import { registerActivityHandler } from "./activity-handlers";
import { completeSingleGroupActivity } from "./time";
import { eventGuide } from "./event-guides";
import { provisionBreakdown } from "./provision-items";
import { withdrawPortions } from "./provisions";
import { consumeReadyProvisionPortions } from "./inventory";
import { beginEventClock, concludeEventClock, eventClockIssue } from "./event-clocks";

const dispositionOrder: NPC["disposition"][] = ["Hostil","Desconfiado","Neutro","Aliado","Leal"];
export function eventProvisionShare(total: number, count: number, index: number) {
  if(!count)return 0;
  const value=Math.abs(total);
  return Math.sign(total)*(Math.floor(value/count)+(index<value%count?1:0));
}
export function eventNpcDisposition(npc: NPC, effect: NonNullable<EventResolution["npcEffect"]>) {
  if(effect.mode === "keep")return npc.disposition;
  if(effect.mode === "at-least")return dispositionOrder[Math.max(dispositionOrder.indexOf(npc.disposition),dispositionOrder.indexOf(effect.disposition))];
  return effect.disposition;
}
export function eventRewardRemaining(event: HexEvent, ignoreResolutionId?: string) {
  const stock=eventGuide(event).rewardStock;
  if(!stock)return null;
  const used={food:0,water:0};
  for(const r of event.resolutions??[]){
    if(r.id===ignoreResolutionId || r.status==="cancelled")continue;
    for(const e of r.personalEffects??[]){used.food+=Math.max(0,e.food);used.water+=Math.max(0,e.water);}
  }
  return {food:Math.max(0,stock.food-used.food),water:Math.max(0,stock.water-used.water)};
}
function applyProvisionDelta(person: GameState["survivors"][number], resource: "food"|"water", delta: number) {
  if(delta>=0){person[resource]+=delta;return;}
  const loose=Math.min(person[resource],-delta);
  withdrawPortions(person,resource,loose);
  consumeReadyProvisionPortions(person.inventory,resource,-delta-loose);
}

export function eventResolutionFingerprint(event: HexEvent) {
  return JSON.stringify({text:event.text,status:eventStatus(event),links:event.actionLinks,clock:event.clock,
    resolutions:(event.resolutions??[]).map(r=>[r.id,r.status])});
}
export function eventEffectsIssue(game: GameState, hexId: string, participantIds: string[], personalEffects: EventResolution["personalEffects"], npcEffect: EventResolution["npcEffect"], event?: HexEvent, ignoreResolutionId?: string) {
  const effects = personalEffects ?? [];
  if (new Set(effects.map(e => e.survivorId)).size !== effects.length) return "Escolha cada alvo apenas uma vez.";
  for (const e of effects) {
    const p = game.survivors.find(p => p.id === e.survivorId);
    if (!p || !participantIds.includes(p.id) || survivorHex(game, p) !== hexId) return "Os alvos dos efeitos precisam participar e estar no hex do evento.";
    if (e.armor && (!e.hpMarks || p.armorMarked >= survivorStats(p).armor)) return "O alvo não tem espaço de Armadura livre para absorver este dano.";
    if (provisionBreakdown(p,"food").total + e.food < 0 || provisionBreakdown(p,"water").total + e.water < 0 || p.food + Math.max(0,e.food) > 99 || p.water + Math.max(0,e.water) > 99) return "Revise as provisões: o custo precisa existir em porções soltas ou itens prontos, e o estoque solto máximo é 99.";
    if (e.condition && (p.eventConditions ?? []).length >= 20 && !(p.eventConditions ?? []).some(c => c.name.toLocaleLowerCase("pt-BR") === e.condition!.name.toLocaleLowerCase("pt-BR"))) return "O alvo já tem 20 condições registradas. Remova uma condição encerrada antes de continuar.";
  }
  if(event){
    const remaining=eventRewardRemaining(event,ignoreResolutionId);
    if(remaining && (["food","water"] as const).some(resource=>effects.reduce((sum,e)=>sum+Math.max(0,e[resource]),0)>remaining[resource]))return "A recompensa excede o estoque restante deste evento. Divida o total entre os destinatários; porções já entregues não podem ser recebidas novamente.";
  }
  if (npcEffect) {
    const npc = game.npcs.find(n => n.id === npcEffect.npcId);
    if (!npc || npc.hex !== hexId || !npc.active || ["Morto", "Desaparecido"].includes(npc.status)) return "Escolha um PNJ ativo presente no hex para registrar o vínculo.";
    if(npcEffect.condition && (npc.eventConditions??[]).length>=20 && !(npc.eventConditions??[]).some(c=>c.name.toLocaleLowerCase("pt-BR")===npcEffect.condition!.name.toLocaleLowerCase("pt-BR")))return "O PNJ já tem 20 condições. Encerre uma condição antes de continuar.";
    const names=game.survivors.filter(p=>participantIds.includes(p.id)).map(p=>p.name).join(", ");
    const note=[npc.notes,`Dia ${game.day} · Vínculo com ${names || "o grupo"}: ${npcEffect.commitment}`].filter(Boolean).join("\n");
    if (note.length > 4000) return "As notas do PNJ estão cheias. Resuma o histórico antes de registrar este vínculo.";
  }
  return "";
}
function applyResolution(game: GameState, event: HexEvent, resolution: EventResolution) {
  resolution.appliedEffects = [];
  for (const e of resolution.personalEffects ?? []) {
    const p = game.survivors.find(p => p.id === e.survivorId)!;
    const stats = survivorStats(p), before = {hp:p.hp,stress:p.stress,hope:p.hope,food:p.food,water:p.water};
    const hpMarks = Math.max(0,e.hpMarks-(e.armor?1:0));
    if(e.armor)p.armorMarked += 1;
    p.hp=Math.min(stats.hp,p.hp+hpMarks);p.stress=Math.max(0,Math.min(6,p.stress+e.stress));p.hope=Math.max(0,Math.min(6,p.hope+e.hope));
    applyProvisionDelta(p,"food",e.food);applyProvisionDelta(p,"water",e.water);
    const parts = [`PV marcados +${p.hp-before.hp}`,`Estresse ${p.stress-before.stress}`,`Esperança ${p.hope-before.hope}`,`Comida ${e.food}`,`Água ${e.water}`];
    if(e.armor)parts.push("Armadura +1");
    if(e.condition){
      p.eventConditions ??= [];
      const index=p.eventConditions.findIndex(c=>c.name.toLocaleLowerCase("pt-BR")===e.condition!.name.toLocaleLowerCase("pt-BR"));
      if(index<0)p.eventConditions.push(structuredClone(e.condition));else p.eventConditions[index]=structuredClone(e.condition);
      parts.push(`${e.condition.name}: ${e.condition.effect} Remover: ${e.condition.clear}`);
    }
    resolution.appliedEffects.push(`${p.name}: ${parts.join(" · ")}`);
  }
  if(resolution.npcEffect){
    const e=resolution.npcEffect,npc=game.npcs.find(n=>n.id===e.npcId)!;const before=npc.disposition;
    npc.disposition=eventNpcDisposition(npc,e);
    if(e.condition){npc.eventConditions??=[];const index=npc.eventConditions.findIndex(c=>c.name.toLocaleLowerCase("pt-BR")===e.condition!.name.toLocaleLowerCase("pt-BR"));if(index<0)npc.eventConditions.push(structuredClone(e.condition));else npc.eventConditions[index]=structuredClone(e.condition);}
    const names=game.survivors.filter(p=>resolution.participantIds.includes(p.id)).map(p=>p.name).join(", ");
    npc.notes=[npc.notes,`Dia ${game.day} · Vínculo com ${names || "o grupo"}: ${e.commitment}`].filter(Boolean).join("\n");
    resolution.appliedEffects.push(`${npc.name}: ${before} → ${npc.disposition}. ${e.commitment}`);
    if(e.condition)resolution.appliedEffects.push(`${npc.name} · ${e.condition.name}: ${e.condition.effect} Remover: ${e.condition.clear}`);
  }
  concludeEventClock(event,resolution.clock);
  if(resolution.clock&&event.clock)resolution.appliedEffects.push(`Prazo: ${event.clock.label} · ${event.clock.status==="cancelled"?"encerrado":`vence no minuto absoluto ${event.clock.dueAbsoluteMinute}`}`);
  const oldNoise=game.noise,oldFear=game.fear;
  game.noise=Math.max(0,Math.min(5,game.noise+resolution.noise));
  game.fear=Math.max(0,Math.min(12,game.fear+resolution.fear));
  resolution.appliedNoise=game.noise-oldNoise;resolution.appliedFear=game.fear-oldFear;
  resolution.status="completed";resolution.endMinute=game.minutes;event.status=resolution.closeEvent===false?"active":"resolved";
  addLog(game,"evento",`${eventOutcomeLabels[resolution.outcome]} — ${resolution.eventText}\n${resolution.summary}\nContinuidade: ${resolution.continuity || "Sem mudança adicional."}\n${resolution.minutes} min · Barulho ${resolution.appliedNoise>=0?"+":""}${resolution.appliedNoise} · Medo ${resolution.appliedFear>=0?"+":""}${resolution.appliedFear}.`,resolution.participantIds[0],resolution.participantIds);
  // Relatos e compromissos do evento ficam no histórico reservado.
  if ((game.noise>=3 || resolution.appliedFear>0 || (resolution.personalEffects??[]).some(e=>e.hpMarks>0||e.condition)) && game.playerActions) game.playerActions.policy.paused=true;
}
export function resolveHexEvent(game: GameState, command: EventResolutionCommand) {
  const parsed=eventResolutionCommandSchema.safeParse(command);
  if(!parsed.success)return {ok:false as const,message:"Revise o desfecho e os efeitos do evento."};
  const c=parsed.data,draft=structuredClone(game),event=draft.hexes[c.hexId]?.events.find(e=>e.id===c.eventId);
  if(!event)return {ok:false as const,message:"O evento não existe mais."};
  const replay=event.resolutions?.find(r=>r.id===c.id);
  if(replay)return {ok:false as const,message:"Este desfecho já foi registrado. Atualize o evento."};
  if(c.day!==draft.day || c.expectedMinute!==draft.minutes || c.expectedEvent!==eventResolutionFingerprint(event))return {ok:false as const,message:"O relógio ou o evento mudou. Revise antes de confirmar."};
  if(!["pending","active"].includes(eventStatus(event)))return {ok:false as const,message:"Reabra o evento antes de registrar um novo desfecho."};
  if(event.resolutions?.some(r=>r.status==="scheduled"))return {ok:false as const,message:"Conclua ou interrompa o desfecho em andamento."};
  if((event.resolutions?.length??0)>=20)return {ok:false as const,message:"Este evento atingiu o limite de desfechos. Prepare um novo evento para continuar."};
  if(new Set(c.participantIds).size!==c.participantIds.length || c.participantIds.some(id=>!draft.survivors.some(p=>p.id===id&&survivorHex(draft,p)===c.hexId)))return {ok:false as const,message:"Escolha participantes presentes no hex do evento."};
  const effectsIssue=eventEffectsIssue(draft,c.hexId,c.participantIds,c.personalEffects,c.npcEffect,event);
  if(effectsIssue)return {ok:false as const,message:effectsIssue};
  const clockIssue=eventClockIssue(event,c.clock);
  if(clockIssue)return {ok:false as const,message:clockIssue};
  if(c.minutes>0 && !c.participantIds.length)return {ok:false as const,message:"Escolha quem dedica tempo a esta resolução."};
  const resolution:EventResolution={id:c.id,approachId:c.approachId,outcome:c.outcome,summary:c.summary,continuity:c.continuity,
    closeEvent:c.closeEvent,clock:c.clock,personalEffects:c.personalEffects,npcEffect:c.npcEffect,participantIds:c.participantIds,minutes:c.minutes,noise:c.noise,fear:c.fear,day:draft.day,startMinute:draft.minutes,
    endMinute:draft.minutes+c.minutes,status:c.minutes?"scheduled":"completed",eventText:event.text};
  beginEventClock(draft,event,c.clock);
  event.resolutions??=[];event.resolutions.push(resolution);
  let completed=true;
  if(c.minutes>0){
    const scheduled=scheduleActivity(draft,{type:"event",eventId:c.eventId,resolutionId:c.id},c.participantIds,c.minutes,"Resolver evento",{id:c.id});
    if(!scheduled.ok)return {ok:false as const,message:scheduled.message};
    if(scheduled.activity.hexId!==c.hexId)return {ok:false as const,message:"Os participantes mudaram de hex."};
    event.status="active";
    completed=completeSingleGroupActivity(draft,scheduled.activity.id);
  }else applyResolution(draft,event,resolution);
  Object.assign(game,draft);
  return {ok:true as const,message:completed?"Desfecho e consequências registrados.":"Resolução iniciada. Os efeitos serão aplicados na conclusão.",completed};
}
registerActivityHandler("event",(game,activity)=>{
  if(activity.type!=="event")return {ok:false,message:"Resolução de evento inválida."};
  const event=game.hexes[activity.hexId]?.events.find(e=>e.id===activity.eventId),resolution=event?.resolutions?.find(r=>r.id===activity.resolutionId);
  if(!event || !resolution || resolution.status!=="scheduled" || event.text!==resolution.eventText || !["pending","active"].includes(eventStatus(event)))return {ok:false,message:"O evento mudou. Revise ou interrompa a resolução pendente."};
  const issue=eventEffectsIssue(game,activity.hexId,resolution.participantIds,resolution.personalEffects,resolution.npcEffect,event,resolution.id);
  if(issue)return {ok:false,message:issue};
  const clockIssue=eventClockIssue(event,resolution.clock);
  if(clockIssue)return {ok:false,message:clockIssue};
  applyResolution(game,event,resolution);return {ok:true,message:"Desfecho e consequências registrados."};
});
