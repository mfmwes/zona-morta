"use client";

import { toast } from "sonner";
import { Brain, Clapperboard, Clock3, Compass, Droplets, Ear, Moon, Package, SlidersHorizontal, Sun, Utensils, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Counter } from "@/components/game-controls";
import { beginExpedition, beginScene } from "@/lib/abilities";
import { displayTime, type GameState } from "@/lib/game";
import { adjustProvisionCount } from "@/lib/provisions";
import { advanceExpeditionTime } from "@/lib/expedition-clock";
import { groupReserves } from "@/lib/group-reserves";

export function MapSessionBar({ game, edit, onAdjustTime, activeHex }: {
  game: GameState; edit: (fn: (draft: GameState) => void) => void; onAdjustTime?: () => void; activeHex?: string;
}) {
  const reserves = groupReserves(game, activeHex);
  const night = game.minutes < 360 || game.minutes >= 1080;
  const LightIcon = night ? Moon : Sun;
  function advance(minutes: number) {
    edit(draft => {
      const before = draft.day;
      const result = advanceExpeditionTime(draft, minutes);
      if (!result.ok || result.issue) { toast.info("Avanço interrompido", { description: result.issue ?? "Não foi possível avançar o relógio." }); return; }
      toast.success(`Dia ${draft.day} · ${displayTime(draft.minutes)}`, { description: draft.day !== before ? "O dia virou sem descanso. Consumo diário e privações registrados." : `+${minutes} minutos na expedição.` });
    });
  }
  return <section className="map-session-bar" aria-label="Controles da exploração">
    <div className="map-session-time">
      <div className="map-session-group-title"><Clock3 size={13} aria-hidden="true" /><span>Ritmo da expedição</span><LightIcon className="map-session-daylight" size={14} aria-label={night ? "Noite" : "Dia"} /></div>
      <div className="map-session-clock-row"><b>Dia {game.day} · <strong>{displayTime(game.minutes)}</strong></b>
        {onAdjustTime && <Button className="map-session-adjust" size="sm" variant="ghost" title="Corrigir horário" aria-label="Corrigir horário" onClick={onAdjustTime}><SlidersHorizontal size={14} /></Button>}</div>
      <div className="map-session-buttons map-session-time-steps">{[30, 60, 120].map(minutes => <Button key={minutes} size="sm" variant="outline" onClick={() => advance(minutes)}>+{minutes === 30 ? "30 min" : `${minutes / 60} h`}</Button>)}</div>
      <small className="map-session-clock-note"><Moon size={11} aria-hidden="true" />Meia-noite: consumo e privação; sem descanso.</small>
    </div>
    <div className="map-session-pressure">
      <div className="map-session-group-title"><Ear size={13} aria-hidden="true" /><span>Pressão da cena</span></div>
      <div className="map-session-counters">
        <div className={`map-session-metric metric-noise${game.noise >= 3 ? " is-high" : ""}`}><Ear size={15} aria-hidden="true" /><Counter compact label="Barulho" value={game.noise} max={5} onChange={value => edit(d => { d.noise = value; })} />
          <div className="map-session-meter" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <i key={i} className={i < game.noise ? "is-filled" : ""} />)}</div></div>
        <div className="map-session-metric metric-fear"><Brain size={15} aria-hidden="true" /><Counter compact label="Medo" value={game.fear} max={12} tone="fear" onChange={value => edit(d => { d.fear = value; })} />
          <div className="map-session-meter" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} className={i < game.fear ? "is-filled" : ""} />)}</div></div>
      </div>
      <div className="map-session-buttons map-session-scene-actions"><Button size="sm" variant="ghost" onClick={() => edit(beginScene)}><Clapperboard size={13} aria-hidden="true" />Nova cena</Button><Button size="sm" variant="ghost" onClick={() => edit(beginExpedition)}><Compass size={13} aria-hidden="true" />Nova expedição</Button></div>
    </div>
    <div className="map-session-reserves"><div className="map-session-group-title"><Package size={13} aria-hidden="true" /><span>Recursos do grupo ativo</span><span className="map-session-unit">Porções / unidades</span></div>
      <div className="map-session-counters" aria-live="polite">{([['food', 'Comida', Utensils], ['water', 'Água', Droplets], ['parts', 'Peças', Wrench]] as const).map(([key, label, Icon]) => <div className={`map-session-metric metric-${key}`} key={key}><Icon size={15} aria-hidden="true" />
        <div><span className="font-bold">{label}</span><div className="number-control"><output aria-label={`${label} disponível ao grupo ativo`}>{reserves.total[key]}</output></div></div>
        <small className="map-reserve-composition">{key === 'parts' ? "Compartilhadas aqui" : <>{reserves.personal[key]} mochilas + {reserves.shared[key]} aqui</>}</small>
      </div>)}</div>
      <div className="map-reserve-footer"><small>Prontos para consumo · inclui itens</small>{reserves.local && <details className="map-reserve-adjust"><summary><SlidersHorizontal size={12} aria-hidden="true" />Ajustar compartilhado</summary>
        <div className="map-reserve-editors">{([['food', 'Comida compartilhada'], ['water', 'Água compartilhada'], ['parts', 'Peças compartilhadas']] as const).map(([key, label]) => <Counter key={key} compact editable label={label} value={game.shelter[key]} max={key === 'parts' ? 99 : 999} quickStep={key === 'parts' ? undefined : 4}
          onChange={value => edit(draft => { if (key === 'parts') draft.shelter.parts = value; else adjustProvisionCount(draft.shelter, key, value); })} />)}</div><small>Comida e água: ajustar apenas porções soltas. Itens e mochilas mantêm seus próprios estoques.</small>
      </details>}</div>
      {reserves.remote && <small className="map-reserve-remote">{game.shelter.hex ? "Abrigo distante" : "Reservas do grupo principal"}: {reserves.remote.food} comida · {reserves.remote.water} água · {reserves.remote.parts} peças — fora do total.</small>}
    </div>
  </section>;
}
