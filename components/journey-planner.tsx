"use client";

import { Footprints, MapPin, Tent, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Counter, Pick } from "@/components/game-controls";
import type { GameState } from "@/lib/game";
import type { JourneyMode, JourneyPlan } from "@/lib/journey";

const time = (minutes: number) => `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;

export function JourneyPlanner({ game, source, destination, onDestination, mode, onMode, dailyHours, onDailyHours,
  reserveDays, onReserveDays, plan, onClose, onInspect, onNext, issue }: {
  game: GameState; source: string; destination: string; onDestination: (id: string) => void;
  mode: JourneyMode; onMode: (mode: JourneyMode) => void; dailyHours: number; onDailyHours: (hours: number) => void;
  reserveDays: number; onReserveDays: (days: number) => void; plan: JourneyPlan; onClose: () => void;
  onInspect: (id: string) => void; onNext: () => void; issue: string | null;
}) {
  const name = (id: string) => game.hexes[id]?.sector?.name ?? `Hex ${id}`;
  const next = plan.path[1];
  return <section className="journey-planner" aria-label="Planejamento de viagem">
    <div className="journey-planner-heading"><div><p className="dossier-title">Expedição a pé</p><h3 className="section-title">Planejar viagem</h3></div>
      <Button size="sm" variant="ghost" aria-label="Fechar planejamento" onClick={onClose}><X /></Button></div>
    <p className="text-sm subtle">Partida: {name(source)} · {plan.people} pessoa(s){plan.companions ? `, incluindo ${plan.companions} PNJ(s)` : ""}. Selecione o destino aqui ou no mapa.</p>
    {plan.walkedToday > 0 && <p className="text-sm subtle">Marcha já registrada hoje: {time(plan.walkedToday)}.</p>}
    <div className="journey-planner-controls">
      <Pick label="Destino da viagem" value={destination} placeholder="Escolha um destino" onChange={onDestination}
        options={Object.entries(game.hexes).filter(([id, hex]) => id !== source && hex.discovery !== "desconhecido").map(([id, hex]) => ({ value: id,
          label: `${hex.region ? `${hex.region} · ` : ""}${hex.sector?.name ?? "Área avistada"} (${id})` }))} />
      <Pick label="Caminhos permitidos" value={mode} onChange={value => onMode(value as JourneyMode)} options={[
        { value: "any", label: "Exploração normal entre hexes" }, { value: "roads", label: "Somente vias conectadas" },
      ]} />
      <Counter label="Marcha por dia (horas)" value={dailyHours} min={4} max={12} onChange={onDailyHours} />
      <Counter label="Reserva de mantimentos (dias)" value={reserveDays} min={0} max={10} onChange={onReserveDays} />
    </div>
    {plan.error ? <p className="character-rule-note" role="status">{plan.error}</p> : <>
      <div className="journey-planner-stats" aria-live="polite">
        <div><span>Percurso</span><b>{plan.distanceKm} km · {plan.path.length - 1} hexes</b></div>
        <div><span>Marcha total</span><b>{time(plan.minutes)} · {plan.stages.length} dia(s)</b></div>
        <div title="Inclui comida pronta nas mochilas e carrinhos dos participantes."><span>Comida · porções</span><b>{plan.food} necessárias / {plan.carriedFood} levadas</b><small>{Math.max(0, plan.food - plan.carriedFood)} a separar</small></div>
        <div title="Inclui água pronta nas mochilas e carrinhos dos participantes."><span>Água · porções</span><b>{plan.water} necessárias / {plan.carriedWater} levadas</b><small>{Math.max(0, plan.water - plan.carriedWater)} a separar</small></div>
      </div>
      <ol className="journey-stages">{plan.stages.map((stage, index) => <li key={stage.day}>
        {index < plan.stages.length - 1 ? <Tent size={17} /> : <MapPin size={17} />}
        <div><b>Dia {stage.day} · {time(stage.minutes)}</b><span>{name(stage.from)} → {name(stage.to)}</span>
          <small>{index < plan.stages.length - 1 ? "Parada sugerida; avalie a segurança do local." : "Chegada ao destino."}</small></div>
        <Button size="sm" variant="outline" onClick={() => onInspect(stage.to)}>Ver hex</Button>
      </li>)}</ol>
      <p className="text-sm subtle">Previsão: 1 comida e 1 água por pessoa/dia, com água extra das condições atuais e {reserveDays} dia(s) de reserva. As porções levadas são as pessoais prontas para consumo; confira validade, distribuição e carga antes de partir.</p>
      <div className="journey-next-step"><Button size="sm" disabled={!next || Boolean(issue)} onClick={onNext}><Footprints /> Viajar próximo hex</Button>
        <span className="text-sm subtle">{issue ?? `Próximo: ${name(next)}. A chegada recalcula o restante do percurso.`}</span></div>
      <p className="text-xs subtle mt-2">O planejamento não desconta mantimentos. O consumo e o descanso continuam no fechamento de cada dia.</p>
    </>}
  </section>;
}
