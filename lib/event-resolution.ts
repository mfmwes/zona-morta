import { addLog, survivorHex, type GameState, type HexEvent } from "./game";
import { eventStatus } from "./hex-generators";
import { eventOutcomeLabels, eventResolutionCommandSchema, type EventResolution, type EventResolutionCommand } from "./event-resolution-types";
import { scheduleActivity } from "./activity-timeline";
import { registerActivityHandler } from "./activity-handlers";
import { completeSingleGroupActivity } from "./time";

export function eventResolutionFingerprint(event: HexEvent) {
  return JSON.stringify({text:event.text,status:eventStatus(event),links:event.actionLinks,
    resolutions:(event.resolutions??[]).map(r=>[r.id,r.status])});
}
function applyResolution(game: GameState, event: HexEvent, resolution: EventResolution) {
  const oldNoise=game.noise,oldFear=game.fear;
  game.noise=Math.max(0,Math.min(5,game.noise+resolution.noise));
  game.fear=Math.max(0,Math.min(12,game.fear+resolution.fear));
  resolution.appliedNoise=game.noise-oldNoise;resolution.appliedFear=game.fear-oldFear;
  resolution.status="completed";resolution.endMinute=game.minutes;event.status="resolved";
  addLog(game,"evento",`${eventOutcomeLabels[resolution.outcome]} — ${resolution.eventText}\n${resolution.summary}\nContinuidade: ${resolution.continuity || "Sem mudança adicional."}\n${resolution.minutes} min · Barulho ${resolution.appliedNoise>=0?"+":""}${resolution.appliedNoise} · Medo ${resolution.appliedFear>=0?"+":""}${resolution.appliedFear}.`,resolution.participantIds[0],resolution.participantIds);
  if ((game.noise>=3 || resolution.appliedFear>0) && game.playerActions) game.playerActions.policy.paused=true;
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
  if(c.minutes>0 && !c.participantIds.length)return {ok:false as const,message:"Escolha quem dedica tempo a esta resolução."};
  const resolution:EventResolution={id:c.id,approachId:c.approachId,outcome:c.outcome,summary:c.summary,continuity:c.continuity,
    participantIds:c.participantIds,minutes:c.minutes,noise:c.noise,fear:c.fear,day:draft.day,startMinute:draft.minutes,
    endMinute:draft.minutes+c.minutes,status:c.minutes?"scheduled":"completed",eventText:event.text};
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
  applyResolution(game,event,resolution);return {ok:true,message:"Desfecho e consequências registrados."};
});
