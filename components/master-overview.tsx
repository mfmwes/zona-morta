"use client";

import { AlertTriangle, ArrowRight, Brain, CheckCircle2, Clock3, Droplets, Fuel, Map, Package, Pill, Search, Swords, Users, Utensils, Wrench } from "lucide-react";
import { MasterContextActions, type MasterActionControls } from "@/components/player-actions-panel";
import { playerActionState } from "@/lib/player-actions";
import { Button } from "@/components/ui/button";
import { displayTime, survivorPositionGroups, type GameState } from "@/lib/game";
import { survivorTimedCommitment } from "@/lib/activity";
import { eventStatus, eventTriggerReady } from "@/lib/hex-generators";
import { projectProgress } from "@/lib/shelter-projects";

import { campaignAttention, type CampaignTarget } from "@/lib/campaign-attention";
import { campaignPlaceLabel, campaignTargetHex, filterCampaignAttention } from "@/lib/campaign-search";
import { CampaignSessions } from "@/components/campaign-sessions";
import type { SessionCommand } from "@/lib/campaign-sessions";
import { CampaignRecap } from "@/components/campaign-recap";
import { useState } from "react";
import { MobileDisclosure } from "@/components/mobile-disclosure";

type Props = {
  mobile?: boolean;
  game: GameState;
  canManageSession?: boolean;
  onSessionAction?: (c: SessionCommand) => Promise<void>;
  masterActions?: MasterActionControls;
  onNavigate: (tab: string) => void;
  onOpen: (target: CampaignTarget) => void;
};

function hexLabel(game: GameState, hexId: string) {
  return game.hexes[hexId]?.sector?.name ?? `Hex ${hexId}`;
}


export function MasterOverview({ mobile = false, game, onNavigate, onOpen, masterActions, canManageSession, onSessionAction }: Props) {
  const groups = survivorPositionGroups(game);
  const occupied = game.survivors
    .map(person => ({ person, commitment: survivorTimedCommitment(game, person.id) }))
    .filter(row => Boolean(row.commitment));

  const searches = Object.entries(game.hexes).flatMap(([hexId, hex]) =>
    hex.points.flatMap(point => (point.preparation?.attempts ?? [])
      .filter(attempt => attempt.status === "pending" || attempt.status === "ready")
      .map(attempt => {
        const area = point.preparation?.areas.find(candidate => candidate.id === attempt.areaId);
        return {
          id: attempt.id,
          pointId: point.id, areaId: attempt.areaId,
          hexId,
          point: point.name,
          area: area?.name ?? "Área",
          deep: attempt.kind === "deep",
          status: attempt.status,
        };
      })));

  const readyEvents = Object.entries(game.hexes).flatMap(([hexId, hex]) =>
    hex.events
      .filter(event => eventStatus(event) === "pending" && eventTriggerReady(game, hexId, event))
      .map(event => ({ hexId, event })));

  const activeProjects = (game.shelter.projects ?? []).filter(project => project.state === "Em construção" || project.requiredRepairProgress || project.workShift || project.volunteerShifts?.length);
  const [showAll,setShowAll]=useState(false);
  const [showAllWork,setShowAllWork]=useState(false);
  const [attentionQuery, setAttentionQuery] = useState("");
  const [attentionType, setAttentionType] = useState("all");
  const [attentionHex, setAttentionHex] = useState("all");
  const attention=campaignAttention(game);
  const filteredAttention = filterCampaignAttention(game, attention, attentionQuery, attentionType, attentionHex);
  const attentionPlaces = [...new Set([...attention.map(item => campaignTargetHex(game, item.target)).filter((hex): hex is string => Boolean(hex)), ...(attentionHex === "all" ? [] : [attentionHex])])];
  const hasFilters = Boolean(attentionQuery.trim() || attentionType !== "all" || attentionHex !== "all");
  const actionState = playerActionState(game);
  const hasActionAttention = actionState.policy.paused || actionState.operations.some(op => op.day === game.day && op.attention);

  return <div className="master-overview">
    <section className="master-overview-hero">
      <div>
        <p className="eyebrow"><Clock3 size={14} /> Situação atual</p>
        <h2>Dia {game.day} · {displayTime(game.minutes)}</h2>
        <p>{groups.length > 1 ? `${groups.length} grupos estão agindo em posições diferentes.` : groups.length === 1 ? "A equipe está reunida." : "Nenhum sobrevivente registrado nesta campanha."}</p>
      </div>
      {/* Indicadores como etiquetas: discretos quando zerados, destacados quando pedem atenção. */}
      <ul className="master-overview-chips" aria-label="Resumo da campanha">
        <li><Users size={14} aria-hidden="true" /><b>{groups.length}</b> grupo{groups.length === 1 ? "" : "s"}</li>
        <li className={searches.length ? "is-active" : "is-zero"}><Search size={14} aria-hidden="true" /><b>{searches.length}</b> busca{searches.length === 1 ? "" : "s"} ativa{searches.length === 1 ? "" : "s"}</li>
        <li className={readyEvents.length ? "is-warning" : "is-zero"}><AlertTriangle size={14} aria-hidden="true" /><b>{readyEvents.length}</b> evento{readyEvents.length === 1 ? "" : "s"} pronto{readyEvents.length === 1 ? "" : "s"}</li>
        <li className={game.conflict?.active ? "is-danger" : "is-zero"}><Swords size={14} aria-hidden="true" />{game.conflict?.active ? "Conflito ativo" : "Sem conflito"}</li>
      </ul>
      <div className="master-overview-hero-actions">
        {/* Atalhos que repetiam o menu lateral saíram; fica o principal e o conflito quando ativo. */}
        <Button onClick={() => onNavigate("mapa")}><Map size={16} /> Explorar mapa</Button>
        {game.conflict?.active && <Button variant="outline" onClick={() => onNavigate("conflito")}><Swords size={16} /> Conflito ativo</Button>}
      </div>
      {masterActions && <div className="master-overview-table-control"><MasterContextActions game={game} controls={masterActions} context={{kind:"overview"}} section="pause" /></div>}
    </section>

    <div className="master-overview-grid">
      <section className="master-overview-card master-overview-team">
        <header><div><Users size={18} /><span><b>Equipe agora</b><small>Onde cada grupo está e quem já comprometeu tempo.</small></span></div><Button size="sm" variant="ghost" className="overview-header-link" onClick={() => onNavigate("sobreviventes")}>Ver fichas <ArrowRight size={14} aria-hidden="true" /></Button></header>
        <div className="master-overview-list">
          {groups.length ? groups.map(group => <article key={group.hex} className="master-overview-group">
            <div><Map size={16} /><span><b>{hexLabel(game, group.hex)}</b><small>Hex {group.hex}</small></span></div>
            <ul>{group.members.map(person => {
              const commitment = survivorTimedCommitment(game, person.id);
              return <li key={person.id}><button type="button" className="overview-person-link text-left hover:underline" onClick={()=>onOpen({tab:"sobreviventes",survivorId:person.id})}><span className="overview-person-initial" aria-hidden="true">{person.name.trim().slice(0,1).toUpperCase()}</span>{person.name}</button>{commitment
                ? <small className="is-busy"><Clock3 size={12} /> {commitment.projectName} até {commitment.until}</small>
                : <small><CheckCircle2 size={12} /> Livre para agir</small>}</li>;
            })}</ul>
          </article>) : <p className="master-overview-empty">Cadastre sobreviventes para acompanhar a equipe.</p>}
        </div>
        <div className="master-overview-work">
          <h3><Search size={15} aria-hidden="true" /> Em andamento{searches.length + activeProjects.length ? ` · ${searches.length + activeProjects.length}` : ""}</h3>
          <div className="master-overview-list">
            {(showAllWork?searches:searches.slice(0, 5)).map(search => <button type="button" className="master-overview-row" key={search.id} onClick={() => onOpen({tab:"mapa",hexId:search.hexId,pointId:search.pointId,areaId:search.areaId})}>
              <Search size={15} /><span><b>{search.deep ? "Busca profunda" : "Busca"} · {search.point}</b><small>{search.area} · {hexLabel(game, search.hexId)} · {search.status === "pending" ? "aguarda teste" : "aguarda horário de conclusão"}</small></span>
            </button>)}
            {(showAllWork?activeProjects:activeProjects.slice(0, 5)).map(project => {
              const progress = projectProgress(project);
              return <button type="button" className="master-overview-row" key={project.id} onClick={() => onOpen({tab:"abrigo",projectId:project.id})}>
                <Wrench size={15} /><span><b>{project.name}</b><small>{progress.repairing ? "Reparo" : "Construção"} · {progress.value}/{progress.required}</small></span>
              </button>;
            })}
            {(searches.length>5||activeProjects.length>5)&&<Button variant="ghost" size="sm" onClick={()=>setShowAllWork(v=>!v)}>{showAllWork?"Mostrar menos":`Ver todas as ${searches.length+activeProjects.length} atividades`}</Button>}
            {!searches.length && !activeProjects.length && <p className="master-overview-work-empty"><CheckCircle2 size={14} aria-hidden="true" /> Nenhuma busca ou obra aguardando resolução.</p>}
          </div>
        </div>
      </section>

      <section className="master-overview-card master-overview-attention">
        <header><div><AlertTriangle size={18} /><span><b>Precisa de atenção{attention.length ? ` · ${attention.length}` : ""}</b><small>Estados que podem exigir uma decisão do mestre.</small></span></div></header>
        {(attention.length > 4 || hasFilters) && <div className="campaign-attention-filters">
          <div className="field"><label htmlFor="attention-search">Buscar pendências</label><input id="attention-search" type="search" value={attentionQuery} placeholder="Pessoa, evento ou local" onChange={event => { setAttentionQuery(event.target.value); setShowAll(false); }} /></div>
          <div className="campaign-filter-pair"><div className="field"><label htmlFor="attention-type">Tipo</label><select id="attention-type" value={attentionType} onChange={event => { setAttentionType(event.target.value); setShowAll(false); }}><option value="all">Todos</option><option value="sobreviventes">Sobreviventes</option><option value="comunidade">PNJs</option><option value="mapa">Eventos</option><option value="conflito">Conflito</option></select></div>
          <div className="field"><label htmlFor="attention-place">Localização</label><select id="attention-place" value={attentionHex} onChange={event => { setAttentionHex(event.target.value); setShowAll(false); }}><option value="all">Todos os locais</option>{attentionPlaces.map(hex => <option key={hex} value={hex}>{campaignPlaceLabel(game, hex)}</option>)}</select></div></div>
          {hasFilters && <div className="campaign-filter-status"><span role="status">{filteredAttention.length} de {attention.length} pendências</span><Button size="sm" variant="ghost" onClick={() => { setAttentionQuery(""); setAttentionType("all"); setAttentionHex("all"); setShowAll(false); }}>Limpar filtros</Button></div>}
        </div>}
        <div className="master-overview-list">
          {attention.length ? (showAll?filteredAttention:filteredAttention.slice(0,8)).map(item => <article key={item.id} className={`master-overview-attention-item is-${item.tone}`}>
            <span><b>{item.title}</b><small>{item.detail}</small></span>
            <Button size="sm" variant="outline" onClick={() => onOpen(item.target)}>Abrir registro</Button>
          </article>) : !hasActionAttention && <div className="master-overview-clear"><span>Sem pendências urgentes.</span><small>A mesa pode seguir a exploração normalmente.</small></div>}
          {attention.length > 0 && !filteredAttention.length && <p className="master-overview-empty">Nenhuma pendência corresponde aos filtros. Limpe os filtros para ver todas.</p>}
          {filteredAttention.length>8&&<Button variant="ghost" size="sm" onClick={()=>setShowAll(v=>!v)}>{showAll?"Mostrar menos":`Ver todas as ${filteredAttention.length} pendências`}</Button>}
          {masterActions && <MasterContextActions game={game} controls={masterActions} context={{kind:"overview"}} section="requests" />}
        </div>
      </section>

      <section className="master-overview-card master-overview-resources">
        <header><div><Package size={18} /><span><b>Reservas principais</b><small>{game.shelter.hex ? game.shelter.name : "Grupo sem abrigo estabelecido"}</small></span></div><Button size="sm" variant="ghost" className="overview-header-link" onClick={() => onNavigate("abrigo")}>Gerenciar <ArrowRight size={14} aria-hidden="true" /></Button></header>
        <div className="master-overview-resource-grid">
          <span><Utensils size={19} /><small>Comida</small><b>{game.shelter.food}</b></span>
          <span><Droplets size={19} /><small>Água</small><b>{game.shelter.water}</b></span>
          <span><Pill size={19} /><small>Medicamentos</small><b>{game.shelter.medications}</b></span>
          <span><Wrench size={19} /><small>Peças</small><b>{game.shelter.parts}</b></span>
          <span><Fuel size={19} /><small>Combustível</small><b>{game.shelter.fuel}</b></span>
          <span><Brain size={19} /><small>Medo</small><b>{game.fear}/12</b></span>
        </div>
        {occupied.length > 0 && <p className="master-overview-note"><Clock3 size={14} /> {occupied.length} sobrevivente{occupied.length === 1 ? "" : "s"} trabalhando agora.</p>}
      </section>
    </div>
    <div className="overview-utilities">
      {onSessionAction && <MobileDisclosure mobile={mobile} title="Sessão da mesa"><CampaignSessions game={game} canAct={Boolean(canManageSession)} onAction={onSessionAction}/></MobileDisclosure>}
      <MobileDisclosure mobile={mobile} title="Retomar acontecimentos"><CampaignRecap game={game} onOpen={onOpen}/></MobileDisclosure>
    </div>
  </div>;
}
