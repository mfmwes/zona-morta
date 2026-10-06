"use client";

import { AlertTriangle, Clock3, House, Map, Package, Search, ShieldAlert, Swords, Users, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { absoluteMinutes, displayTime, survivorPositionGroups, type GameState } from "@/lib/game";
import { survivorTimedCommitment } from "@/lib/activity";
import { eventStatus, eventTriggerReady } from "@/lib/hex-generators";
import { projectProgress } from "@/lib/shelter-projects";

type Props = {
  game: GameState;
  onNavigate: (tab: string) => void;
};

function hexLabel(game: GameState, hexId: string) {
  return game.hexes[hexId]?.sector?.name ?? `Hex ${hexId}`;
}

function minutesLabel(minutes: number) {
  if (minutes <= 0) return "agora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

export function MasterOverview({ game, onNavigate }: Props) {
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

  const activeProjects = (game.shelter.projects ?? []).filter(project => project.state === "Em construção");
  const exposed = game.survivors.filter(person => person.infection === "Exposto");
  const nowAbsolute = absoluteMinutes(game);

  const attention = [
    ...(game.conflict?.active ? [{
      id: "conflict",
      tone: "danger",
      title: "Conflito em andamento",
      detail: game.conflict.name || "Há uma cena de conflito ativa.",
      action: "conflito",
      actionLabel: "Abrir conflito",
    }] : []),
    ...exposed.map(person => ({
      id: `exposure-${person.id}`,
      tone: "danger",
      title: `${person.name} está Exposto`,
      detail: person.exposureDeadline
        ? `Janela de tratamento: ${minutesLabel(Math.max(0, person.exposureDeadline - nowAbsolute))} restantes.`
        : "Verifique a janela de tratamento.",
      action: "sobreviventes",
      actionLabel: "Abrir ficha",
    })),
    ...readyEvents.slice(0, 4).map(({ hexId, event }) => ({
      id: `event-${event.id}`,
      tone: "warning",
      title: "Evento pronto",
      detail: `${hexLabel(game, hexId)} · ${event.text}`,
      action: "mapa",
      actionLabel: "Abrir mapa",
    })),
  ];

  return <div className="master-overview">
    <section className="master-overview-hero">
      <div>
        <p className="eyebrow">Situação atual</p>
        <h2>Dia {game.day} · {displayTime(game.minutes)}</h2>
        <p>{groups.length > 1 ? `${groups.length} grupos estão agindo em posições diferentes.` : groups.length === 1 ? "A equipe está reunida." : "Nenhum sobrevivente registrado nesta campanha."}</p>
      </div>
      <div className="master-overview-hero-metrics">
        <span><b>{groups.length}</b><small>grupo{groups.length === 1 ? "" : "s"}</small></span>
        <span><b>{searches.length}</b><small>busca{searches.length === 1 ? "" : "s"} ativa{searches.length === 1 ? "" : "s"}</small></span>
        <span className={readyEvents.length ? "is-warning" : ""}><b>{readyEvents.length}</b><small>evento{readyEvents.length === 1 ? "" : "s"} pronto{readyEvents.length === 1 ? "" : "s"}</small></span>
        <span className={game.conflict?.active ? "is-danger" : ""}><b>{game.conflict?.active ? 1 : 0}</b><small>conflito ativo</small></span>
      </div>
    </section>

    <section className="master-overview-actions" aria-label="Ações rápidas do mestre">
      <Button onClick={() => onNavigate("mapa")}><Map size={16} /> Explorar mapa</Button>
      <Button variant="outline" onClick={() => onNavigate("sobreviventes")}><Users size={16} /> Sobreviventes</Button>
      <Button variant="outline" onClick={() => onNavigate("abrigo")}><House size={16} /> Abrigo</Button>
      <Button variant={game.conflict?.active ? "default" : "outline"} onClick={() => onNavigate("conflito")}><Swords size={16} /> {game.conflict?.active ? "Conflito ativo" : "Conflito"}</Button>
      <Button variant="outline" onClick={() => onNavigate("cena")}><ShieldAlert size={16} /> Cena visual</Button>
    </section>

    <div className="master-overview-grid">
      <section className="master-overview-card master-overview-team">
        <header><div><Users size={18} /><span><b>Equipe agora</b><small>Onde cada grupo está e quem já comprometeu tempo.</small></span></div><Button size="sm" variant="ghost" onClick={() => onNavigate("sobreviventes")}>Ver fichas</Button></header>
        <div className="master-overview-list">
          {groups.length ? groups.map(group => <article key={group.hex} className="master-overview-group">
            <div><Map size={16} /><span><b>{hexLabel(game, group.hex)}</b><small>Hex {group.hex}</small></span></div>
            <ul>{group.members.map(person => {
              const commitment = survivorTimedCommitment(game, person.id);
              return <li key={person.id}><span>{person.name}</span>{commitment
                ? <small className="is-busy"><Clock3 size={12} /> {commitment.projectName} até {commitment.until}</small>
                : <small>Livre para agir</small>}</li>;
            })}</ul>
          </article>) : <p className="master-overview-empty">Cadastre sobreviventes para acompanhar a equipe.</p>}
        </div>
      </section>

      <section className="master-overview-card master-overview-attention">
        <header><div><AlertTriangle size={18} /><span><b>Precisa de atenção</b><small>Estados que podem exigir uma decisão do mestre.</small></span></div></header>
        <div className="master-overview-list">
          {attention.length ? attention.map(item => <article key={item.id} className={`master-overview-attention-item is-${item.tone}`}>
            <span><b>{item.title}</b><small>{item.detail}</small></span>
            <Button size="sm" variant="outline" onClick={() => onNavigate(item.action)}>{item.actionLabel}</Button>
          </article>) : <div className="master-overview-clear"><span>Sem pendências urgentes.</span><small>A mesa pode seguir a exploração normalmente.</small></div>}
        </div>
      </section>

      <section className="master-overview-card">
        <header><div><Search size={18} /><span><b>Em andamento</b><small>Buscas e trabalhos que já foram iniciados.</small></span></div></header>
        <div className="master-overview-list">
          {searches.slice(0, 5).map(search => <button type="button" className="master-overview-row" key={search.id} onClick={() => onNavigate("mapa")}>
            <Search size={15} /><span><b>{search.deep ? "Busca profunda" : "Busca"} · {search.point}</b><small>{search.area} · {hexLabel(game, search.hexId)} · {search.status === "pending" ? "aguarda teste" : "pronta para confirmar"}</small></span>
          </button>)}
          {activeProjects.slice(0, 5).map(project => {
            const progress = projectProgress(project);
            return <button type="button" className="master-overview-row" key={project.id} onClick={() => onNavigate("abrigo")}>
              <Wrench size={15} /><span><b>{project.name}</b><small>{progress.repairing ? "Reparo" : "Construção"} · {progress.value}/{progress.required}</small></span>
            </button>;
          })}
          {!searches.length && !activeProjects.length && <p className="master-overview-empty">Nenhuma busca ou obra está aguardando resolução.</p>}
        </div>
      </section>

      <section className="master-overview-card master-overview-resources">
        <header><div><Package size={18} /><span><b>Reservas principais</b><small>{game.shelter.hex ? game.shelter.name : "Grupo sem abrigo estabelecido"}</small></span></div><Button size="sm" variant="ghost" onClick={() => onNavigate("abrigo")}>Gerenciar</Button></header>
        <div className="master-overview-resource-grid">
          <span><small>Comida</small><b>{game.shelter.food}</b></span>
          <span><small>Água</small><b>{game.shelter.water}</b></span>
          <span><small>Medicamentos</small><b>{game.shelter.medications}</b></span>
          <span><small>Peças</small><b>{game.shelter.parts}</b></span>
          <span><small>Combustível</small><b>{game.shelter.fuel}</b></span>
          <span><small>Medo</small><b>{game.fear}/12</b></span>
        </div>
        {occupied.length > 0 && <p className="master-overview-note"><Clock3 size={14} /> {occupied.length} sobrevivente{occupied.length === 1 ? "" : "s"} trabalhando agora.</p>}
      </section>
    </div>
  </div>;
}
