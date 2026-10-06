"use client";
import { usePlayerSimulation } from "@/components/player-simulation";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Crosshair, Search, ShieldAlert, Swords, Target, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SpotlightRequestButton } from "@/components/spotlight-request-button";
import { ConflictTrail } from "@/components/conflict-trail";
import { publicConflictScene } from "@/lib/conflict";
import { survivorIsDown, survivorStats, type GameState, type Survivor } from "@/lib/game";

type Props = {
  game: GameState;
  survivor: Survivor;
  playerMode: boolean;
  playerPreview?: boolean;
  targetId: string;
  onTargetChange: (targetId: string) => void;
  onAttack: (targetId?: string) => void;
  onOpenConflict?: () => void;
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export function SurvivorConflictHud({
  game, survivor, playerMode, playerPreview = false, targetId, onTargetChange, onAttack, onOpenConflict,
}: Props) {
  const simulation = usePlayerSimulation();
  const conflict = game.publicConflict
    ?? (game.conflict?.active ? publicConflictScene(game.conflict, game.survivors, survivor.id) : undefined);
  const playerPerspective = playerMode || playerPreview;

  const [targetOpen, setTargetOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [damageBusy, setDamageBusy] = useState(false);
  const [isStuck, setIsStuck] = useState(false);
  const [error, setError] = useState("");
  const stickySentinelRef = useRef<HTMLDivElement | null>(null);

  const storageKey = `zona-morta:target:${game.campaignId}:${survivor.id}`;
  const recentKey = `zona-morta:targets-recent:${game.campaignId}:${survivor.id}`;

  useEffect(() => {
    if (!conflict?.active) return;
    try {
      const stored = window.localStorage.getItem(storageKey) ?? "";
      const recent = JSON.parse(window.localStorage.getItem(recentKey) ?? "[]") as unknown;
      // Sincroniza a lista recente com o armazenamento externo ao abrir outra cena.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(recent)) setRecentIds(recent.filter(value => typeof value === "string").slice(0, 5));
      if (stored && conflict.threats.some(threat => threat.id === stored && !threat.defeated)) onTargetChange(stored);
    } catch {}
  // Carregar somente quando a Cena de Conflito muda.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflict?.id]);

  useEffect(() => {
    if (!targetId) return;
    const target = conflict?.threats.find(threat => threat.id === targetId);
    if (!target || target.defeated) {
      onTargetChange("");
      try { window.localStorage.removeItem(storageKey); } catch {}
    }
  }, [conflict?.threats, onTargetChange, storageKey, targetId]);


  useEffect(() => {
    const sentinel = stickySentinelRef.current;
    if (!sentinel) return;
    const update = () => {
      const stickyTop = window.innerWidth <= 1000 ? 64 : 8;
      setIsStuck(sentinel.getBoundingClientRect().top <= stickyTop);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [conflict?.id]);

  const livingThreats = useMemo(() => (conflict?.threats ?? []).filter(threat => !threat.defeated), [conflict?.threats]);
  const selectedTarget = livingThreats.find(threat => threat.id === targetId) ?? null;
  const spotlightName = !conflict?.spotlight ? null
    : conflict.spotlight.kind === "survivor"
      ? conflict.survivors.find(person => person.id === conflict.spotlight?.id)?.name ?? "Sobrevivente"
      : conflict.threats.find(threat => threat.id === conflict.spotlight?.id)?.name ?? "Ameaça";
  const ownSpotlight = conflict?.spotlight?.kind === "survivor" && conflict.spotlight.id === survivor.id;
  const pendingDamage = conflict?.pendingDamage ?? [];
  const firstDamage = pendingDamage[0] ?? null;
  const stats = survivorStats(survivor);
  const freeArmor = Math.max(0, stats.armor - (survivor.armorMarked ?? 0));
  const down = survivorIsDown(survivor);

  const recentThreats = recentIds.flatMap(id => {
    const threat = livingThreats.find(row => row.id === id);
    return threat ? [threat] : [];
  });

  const groups = useMemo(() => {
    const needle = normalize(query.trim());
    const filtered = livingThreats.filter(threat => !needle || normalize(`${threat.name} ${threat.groupName}`).includes(needle));
    const map = new Map<string, typeof filtered>();
    for (const threat of filtered) map.set(threat.groupName, [...(map.get(threat.groupName) ?? []), threat]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  }, [livingThreats, query]);

  if (!conflict?.active) return null;
  const participating = conflict.survivors.some(person => person.id === survivor.id);

  function chooseTarget(id: string) {
    onTargetChange(id);
    setTargetOpen(false);
    setQuery("");
    if (!id) {
      try { window.localStorage.removeItem(storageKey); } catch {}
      return;
    }
    const nextRecent = [id, ...recentIds.filter(value => value !== id)].slice(0, 5);
    setRecentIds(nextRecent);
    try {
      window.localStorage.setItem(storageKey, id);
      window.localStorage.setItem(recentKey, JSON.stringify(nextRecent));
    } catch {}
  }

  async function resolveDamage(resolution: "hp" | "armor") {
    if (!firstDamage || damageBusy) return;
    if (simulation) {
      try { simulation.damage(firstDamage.id, resolution); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Dano indisponível."); }
      return;
    }
    setDamageBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaign/damage?campanha=${encodeURIComponent(game.campaignId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: firstDamage.id, resolution }),
      });
      const payload = await response.json() as { error?: string; resolution?: { hpMarks: number } };
      if (!response.ok) throw new Error(payload.error || "Não foi possível resolver o dano.");
      toast.success(resolution === "armor" ? "Armadura usada" : "Dano marcado", {
        description: `${payload.resolution?.hpMarks ?? 0} PV marcados.`,
      });
      window.dispatchEvent(new CustomEvent("zona-morta:campaign-refresh"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível resolver o dano.");
    } finally {
      setDamageBusy(false);
    }
  }

  return <>
    <div ref={stickySentinelRef} className="character-conflict-sticky-sentinel" aria-hidden="true" />
    <section className={`character-conflict-hud character-conflict-hud--trail${isStuck ? " is-stuck" : ""}${ownSpotlight ? " is-own-spotlight" : ""}${firstDamage ? " has-damage" : ""}`}>
    <div className="character-conflict-trail-header">
      <div className="character-conflict-trail-title">
        <span className="character-conflict-kicker"><Swords size={14} /> TRILHA DE CONFLITO</span>
        <span className="character-conflict-trail-summary" role="status">
          <span><Crosshair size={12} /> Spotlight <b>{ownSpotlight ? "VOCÊ" : spotlightName ?? "sem foco"}</b></span>
          <span><Target size={12} /> Alvo <b>{selectedTarget?.name ?? "nenhum"}</b></span>
          <span>{livingThreats.length} ameaça{livingThreats.length === 1 ? "" : "s"} ativa{livingThreats.length === 1 ? "" : "s"}</span>
        </span>
      </div>

      <div className="character-conflict-actions">
        <Popover open={targetOpen} onOpenChange={setTargetOpen}>
          <PopoverTrigger asChild><Button size="sm" variant="outline"><Search size={14} /> Localizar</Button></PopoverTrigger>
          <PopoverContent align="end" className="character-target-popover">
            <div className="character-target-heading"><div><span>ALVOS DA CENA</span><b>{livingThreats.length} disponíveis</b></div>{targetId && <button type="button" onClick={() => chooseTarget("")} aria-label="Limpar alvo"><X size={15} /></button>}</div>
            <label className="character-target-search"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar ameaça…" autoFocus /></label>
            {!query && recentThreats.length > 0 && <div className="character-target-section"><small>RECENTES</small><div className="character-target-recents">{recentThreats.map(threat => <button type="button" key={threat.id} onClick={() => chooseTarget(threat.id)}>{threat.name}</button>)}</div></div>}
            <div className="character-target-groups">
              {groups.map(([groupName, threats]) => <details key={groupName} open={groups.length <= 4 || Boolean(query)}>
                <summary><span>{groupName}</span><b>{threats.length}</b></summary>
                <div>{threats.map(threat => <button type="button" key={threat.id} className={threat.id === targetId ? "is-selected" : ""} onClick={() => chooseTarget(threat.id)}>
                  <span>{threat.name}</span>{threat.conditions.length > 0 && <small>{threat.conditions.join(" · ")}</small>}<ChevronRight size={14} />
                </button>)}</div>
              </details>)}
              {!groups.length && <p>Nenhuma ameaça encontrada.</p>}
            </div>
          </PopoverContent>
        </Popover>

        <Button size="sm" disabled={!selectedTarget || down} onClick={() => onAttack(selectedTarget?.id)}><Swords size={14} /> {down ? "Caído" : "Atacar"}</Button>

        {playerPerspective && participating && <SpotlightRequestButton campaignId={game.campaignId} requested={conflict.spotlightRequested}
          ownSpotlight={ownSpotlight} down={down} preview={playerPreview && !playerMode} />}
        {onOpenConflict && <button type="button" className="character-conflict-link" onClick={onOpenConflict}>Ver cena ↗</button>}
      </div>
    </div>

    {down && <div className="character-conflict-fallen" role="status"><ShieldAlert size={16} /><span><b>CAÍDO</b> · PV marcados {survivor.hp}/{stats.hp}. Reduza os PV marcados para voltar a agir no conflito.</span></div>}

    <ConflictTrail
      survivors={conflict.survivors.map(person => ({ ...person, requested: person.id === survivor.id && conflict.spotlightRequested }))}
      threats={conflict.threats}
      spotlight={conflict.spotlight}
      selfId={survivor.id}
      targetId={targetId}
      mode="player"
      onThreatTarget={chooseTarget}
    />

    {firstDamage && <div className="character-conflict-damage">
      <div className="character-conflict-damage-heading"><ShieldAlert size={18} /><div><span>DANO PENDENTE{pendingDamage.length > 1 ? ` · ${pendingDamage.length} impactos` : ""}</span><strong>{firstDamage.sourceName} · {firstDamage.attackName}</strong></div><b>{firstDamage.tier.label}</b></div>
      <div className="character-conflict-damage-info"><span><small>Dano</small><b>{firstDamage.damage} {firstDamage.damageType}</b></span><span><small>Sem Armadura</small><b>{firstDamage.tier.hpMarks} PV</b></span><span><small>Armadura livre</small><b>{freeArmor}/{stats.armor}</b></span></div>
      <div className="character-conflict-damage-actions">
        <Button size="sm" disabled={damageBusy} onClick={() => void resolveDamage("hp")}>Marcar {firstDamage.tier.hpMarks} PV</Button>
        <Button size="sm" variant="outline" disabled={damageBusy || freeArmor < 1} onClick={() => void resolveDamage("armor")}><ShieldAlert size={14} /> Usar 1 Armadura → {Math.max(0, firstDamage.tier.hpMarks - 1)} PV</Button>
      </div>
    </div>}

    {error && <p className="character-conflict-error" role="alert">{error}</p>}
    </section>
  </>;
}
