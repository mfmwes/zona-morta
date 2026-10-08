import { absoluteMinutes, type GameState } from "./game";
import { eventStatus, eventTriggerReady } from "./hex-generators";

export type CampaignTarget =
  | { tab: "mapa"; hexId: string; eventId?: string; pointId?: string; areaId?: string }
  | { tab: "sobreviventes"; survivorId: string; section?: "resumo" | "condicoes" }
  | { tab: "comunidade"; npcId: string }
  | { tab: "abrigo"; projectId?: string }
  | { tab: "conflito" };
export type CampaignAttention = { id: string; title: string; detail: string; tone: "danger" | "warning"; target: CampaignTarget; due?: number };
export function campaignTargetExists(game: GameState, target: CampaignTarget) {
  if(target.tab === "mapa") {
    const h=game.hexes[target.hexId];
    return Boolean(h && (!target.eventId || h.events.some(e=>e.id===target.eventId)) && (!target.pointId || h.points.some(p=>p.id===target.pointId && (!target.areaId || p.preparation?.areas.some(a=>a.id===target.areaId)))));
  }
  if(target.tab === "sobreviventes")return game.survivors.some(p=>p.id===target.survivorId);
  if(target.tab === "comunidade")return game.npcs.some(p=>p.id===target.npcId);
  if(target.tab === "abrigo")return !target.projectId || Boolean(game.shelter.projects?.some(p=>p.id===target.projectId));
  return Boolean(game.conflict?.active);
}
export function campaignAttention(game: GameState): CampaignAttention[] {
  const rows: CampaignAttention[]=[];const now=absoluteMinutes(game);
  if(game.conflict?.active)rows.push({id:"conflict",title:"Conflito em andamento",detail:game.conflict.name||"Cena ativa",tone:"danger",target:{tab:"conflito"}});
  for(const p of game.survivors){
    if(p.infection==="Exposto")rows.push({id:`exposure:${p.id}`,title:`${p.name} está Exposto`,detail:p.exposureDeadline!==null?`Tratamento: ${Math.max(0,p.exposureDeadline-now)} min restantes.`:"Confira a janela de tratamento.",tone:"danger",due:p.exposureDeadline??undefined,target:{tab:"sobreviventes",survivorId:p.id,section:"condicoes"}});
    if(p.eventConditions?.length)rows.push({id:`condition:${p.id}`,title:`${p.name} · condições ativas`,detail:p.eventConditions.map(c=>c.name).join(", "),tone:"warning",target:{tab:"sobreviventes",survivorId:p.id,section:"condicoes"}});
  }
  for(const p of game.npcs){
    if(!p.active || ["Morto","Desaparecido"].includes(p.status))continue;
    if(p.eventConditions?.length || p.status!=="Bem" || p.infection!=="Saudável")rows.push({id:`npc:${p.id}`,title:`${p.name} · cuidado pendente`,detail:[p.status!=="Bem"?p.status:"",p.infection!=="Saudável"?p.infection:"",...(p.eventConditions??[]).map(c=>c.name)].filter(Boolean).join(" · "),tone:p.status==="Grave"?"danger":"warning",target:{tab:"comunidade",npcId:p.id}});
  }
  for(const [hexId,h] of Object.entries(game.hexes)){
    for(const e of h.events){
      const status=eventStatus(e);if(status==="archived")continue;
      const target:CampaignTarget={tab:"mapa",hexId,eventId:e.id};const place=h.sector?.name??`Hex ${hexId}`;
      if(e.clock?.status==="active" || (e.clock?.status==="expired" && status!=="resolved"))rows.push({id:`event:${hexId}:${e.id}`,title:`${e.clock.label} · ${e.clock.status==="expired"?"prazo vencido":`${Math.max(0,e.clock.dueAbsoluteMinute-now)} min restantes`}`,detail:`${place} · ${e.clock.consequence}`,tone:e.clock.status==="expired"?"danger":"warning",due:e.clock.dueAbsoluteMinute,target});
      else if(status==="active" || (status==="pending" && eventTriggerReady(game,hexId,e)))rows.push({id:`event:${hexId}:${e.id}`,title:status==="active"?"Evento em andamento":"Evento pronto",detail:`${place} · ${e.text}`,tone:"warning",target});
    }
  }
  return rows.sort((a,b)=>(a.tone==="danger"?0:1)-(b.tone==="danger"?0:1)||(a.due??Infinity)-(b.due??Infinity)||a.title.localeCompare(b.title,"pt-BR"));
}
