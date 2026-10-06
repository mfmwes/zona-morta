"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, Crosshair, Crown, Dice5, Dumbbell, Eye, Gauge, HeartPulse, Plus, RotateCcw, Shield, ShieldAlert, Skull, Swords, Tag, Trash2, UserPlus, Users, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Counter, Field, Pick } from "@/components/game-controls";
import { SpotlightRequestButton } from "@/components/spotlight-request-button";
import { ConflictTrail } from "@/components/conflict-trail";
import { addLog, displayTime, survivorIsDown, survivorStats, survivorsAtHex, type GameState } from "@/lib/game";
import {
  addThreatCondition,
  addThreatInstances,
  clearConflictSpotlight,
  createConflictScene,
  endConflictScene,
  removeConflictParticipant,
  removeThreatCondition,
  resolveSurvivorDamageTier,
  grantConflictSpotlight,
  cancelConflictSpotlightRequest,
  parseThreatDamageFormula,
  queueSurvivorDamage,
  setConflictSpotlight,
  setThreatHpMarked,
  setThreatStressMarked,
  publicConflictScene,
  type ConflictParticipantRef,
  type PublicConflictScene,
} from "@/lib/conflict";
import { threatLibrary } from "@/lib/threats";
import { rollDie } from "@/lib/rolls";

type Edit = (fn: (draft: GameState) => void) => void;

function ResourceMeter({ label, value, max, tone, icon }: { label: string; value: number; max: number | null; tone: "hp" | "stress" | "hope"; icon?: ReactNode }) {
  if (max === null) return <span className={`conflict-resource conflict-resource--${tone}`}><span><small>{icon}{label}</small><b>—</b></span></span>;
  const current = Math.max(0, Math.min(max, value));
  const percent = max > 0 ? Math.round((current / max) * 100) : 0;
  return <span className={`conflict-resource conflict-resource--${tone}`} aria-label={`${label} ${current} de ${max}`}>
    <span><small>{icon}{label}</small><b>{current}/{max}</b></span>
    <span className="conflict-resource-track" aria-hidden="true"><span style={{ width: `${percent}%` }} /></span>
  </span>;
}

function ThreatStat({ label, value, tone, icon }: { label: string; value: ReactNode; tone: "difficulty" | "threshold"; icon: ReactNode }) {
  return <span className={`conflict-stat conflict-stat--${tone}`} aria-label={`${label}: ${typeof value === "string" || typeof value === "number" ? value : ""}`}>
    <small title={label}>{icon}<span>{label}</span></small>
    <b>{value}</b>
  </span>;
}

function ThreatRoleIcon({ role, size = 17 }: { role: string; size?: number }) {
  const value = role.toLocaleLowerCase("pt-BR");
  if (value.includes("bruto") || value.includes("solo")) return <Dumbbell size={size} aria-hidden="true" />;
  if (value.includes("atir")) return <Crosshair size={size} aria-hidden="true" />;
  if (value.includes("embosc") || value.includes("furt")) return <Eye size={size} aria-hidden="true" />;
  if (value.includes("líder") || value.includes("lider") || value.includes("chefe")) return <Crown size={size} aria-hidden="true" />;
  if (value.includes("horda") || value.includes("grupo") || value.includes("minion")) return <Users size={size} aria-hidden="true" />;
  return <ShieldAlert size={size} aria-hidden="true" />;
}

function participantLabel(game: GameState, ref: ConflictParticipantRef | null) {
  if (!ref) return null;
  if (ref.kind === "survivor") return game.survivors.find(person => person.id === ref.id)?.name ?? "Sobrevivente removido";
  return game.conflict?.threats.find(threat => threat.id === ref.id)?.name ?? "Ameaça removida";
}


function publicParticipantLabel(conflict: PublicConflictScene, ref: ConflictParticipantRef | null) {
  if (!ref) return null;
  if (ref.kind === "survivor") return conflict.survivors.find(person => person.id === ref.id)?.name ?? null;
  return conflict.threats.find(threat => threat.id === ref.id)?.name ?? null;
}

export function PlayerConflictScene({ game, selfId = null }: { game: GameState; selfId?: string | null }) {
  const [resolvingDamage, setResolvingDamage] = useState<string | null>(null);
  const [damageError, setDamageError] = useState("");
  const conflict = game.publicConflict
    ?? (game.conflict?.active ? publicConflictScene(game.conflict, game.survivors, selfId) : undefined);
  if (!conflict?.active) return null;

  const spotlightName = publicParticipantLabel(conflict, conflict.spotlight);
  const ownSpotlight = conflict.spotlight?.kind === "survivor" && conflict.spotlight.id === selfId;
  const self = selfId ? game.survivors.find(person => person.id === selfId) ?? null : null;
  const selfStats = self ? survivorStats(self) : null;
  const freeArmor = self && selfStats ? Math.max(0, selfStats.armor - (self.armorMarked ?? 0)) : 0;

  async function resolvePendingDamage(requestId: string, resolution: "hp" | "armor") {
    if (resolvingDamage) return;
    setResolvingDamage(requestId);
    setDamageError("");
    try {
      const response = await fetch(`/api/campaign/damage?campanha=${encodeURIComponent(game.campaignId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, resolution }),
      });
      const payload = await response.json() as { error?: string; resolution?: { hpMarks: number; armorUsed: number } };
      if (!response.ok) throw new Error(payload.error || "Não foi possível resolver o dano.");
      toast.success(resolution === "armor" ? "Armadura usada" : "Dano marcado", {
        description: resolution === "armor"
          ? `1 Armadura marcada · ${payload.resolution?.hpMarks ?? 0} PV recebidos.`
          : `${payload.resolution?.hpMarks ?? 0} PV marcados.`,
      });
      window.dispatchEvent(new CustomEvent("zona-morta:campaign-refresh"));
    } catch (error) {
      setDamageError(error instanceof Error ? error.message : "Não foi possível resolver o dano.");
    } finally {
      setResolvingDamage(null);
    }
  }

  return <div className="conflict-manager conflict-public-view">
    <section className="panel conflict-hero conflict-public-hero">
      <div className="conflict-hero-main">
        <div>
          <p className="dossier-title">Cena {conflict.sceneNumber} · conflito ativo</p>
          <h2>{conflict.name}</h2>
          <p>Iniciado no Dia {conflict.startedDay} · {conflict.startedTime} · {conflict.survivors.length + conflict.threats.length} participante(s)</p>
        </div>
        <span className="conflict-public-badge">VISÃO DA MESA</span>
      </div>

      <div className="conflict-trail-full-status" role="status" aria-live="polite">
        <span><Crosshair size={14} /> Spotlight <b>{ownSpotlight ? "VOCÊ" : spotlightName ?? "sem foco"}</b></span>
        <small>A Trilha de Conflito mostra presença e foco narrativo; não representa iniciativa.</small>
      </div>
      <ConflictTrail
        survivors={conflict.survivors.map(person => ({ ...person, requested: person.id === selfId && conflict.spotlightRequested }))}
        threats={conflict.threats}
        spotlight={conflict.spotlight}
        selfId={selfId}
        mode="player"
      />
      {self && conflict.survivors.some(person => person.id === self.id) && <div className="conflict-player-prompt">
        <SpotlightRequestButton campaignId={game.campaignId} requested={conflict.spotlightRequested} ownSpotlight={ownSpotlight} down={survivorIsDown(self)} />
        <span>{ownSpotlight ? "Você está em foco. Declare sua ação." : conflict.spotlightRequested ? "O mestre recebeu seu pedido." : "Sinalize ao mestre quando quiser agir."}</span>
      </div>}
    </section>

    {conflict.pendingDamage.length > 0 && <section className="panel panel-pad conflict-damage-inbox" aria-live="polite">
      <div className="conflict-damage-inbox-heading">
        <div><p className="dossier-title">Dano pendente</p><h3>Escolha como receber o impacto</h3>
          <p>O dano só é marcado depois da sua decisão. Usar 1 espaço de Armadura reduz a severidade em um passo.</p></div>
        <span className="tag">{conflict.pendingDamage.length}</span>
      </div>
      <div className="conflict-damage-request-list">
        {conflict.pendingDamage.map(request => {
          const armorHp = Math.max(0, request.tier.hpMarks - 1);
          const busy = resolvingDamage !== null;
          return <article key={request.id} className="conflict-damage-request">
            <div className="conflict-damage-source"><span className="conflict-threat-icon"><Swords size={17} /></span>
              <div><small>{request.sourceName}</small><strong>{request.attackName}</strong></div>
              <span className={`conflict-damage-tier is-${request.tier.key}`}>{request.tier.label}</span></div>
            <div className="conflict-damage-numbers">
              <span><small>Dano rolado</small><b>{request.damage}</b><em>{request.damageType}</em></span>
              <span><small>PV sem Armadura</small><b>{request.tier.hpMarks}</b><em>a marcar</em></span>
              <span><small>Armadura livre</small><b>{freeArmor}</b><em>{selfStats ? `de ${selfStats.armor}` : "espaços"}</em></span>
            </div>
            <div className="conflict-damage-actions">
              <Button disabled={busy} onClick={() => void resolvePendingDamage(request.id, "hp")}>Marcar {request.tier.hpMarks} PV</Button>
              <Button variant="outline" disabled={busy || freeArmor < 1} onClick={() => void resolvePendingDamage(request.id, "armor")}>
                <ShieldAlert size={15} /> Usar 1 Armadura → {armorHp} PV
              </Button>
            </div>
          </article>;
        })}
      </div>
      {damageError && <p className="conflict-damage-error" role="alert">{damageError}</p>}
    </section>}

    <div className="conflict-public-grid">
      <section className="panel panel-pad conflict-public-section">
        <div className="conflict-section-heading"><div><p className="dossier-title">Equipe</p><h3>Sobreviventes em cena</h3></div><span className="tag">{conflict.survivors.length}</span></div>
        <div className="conflict-public-list">
          {conflict.survivors.map(person => {
            const isFocused = conflict.spotlight?.kind === "survivor" && conflict.spotlight.id === person.id;
            const isSelf = person.id === selfId;
            return <article key={person.id} data-conflict-kind="survivor" data-conflict-id={person.id} className={`conflict-public-person${isFocused ? " is-focused" : ""}${isSelf ? " is-self" : ""}`}>
              <div className="conflict-avatar">{person.portrait ? <img src={person.portrait} alt="" /> : person.name.slice(0,2).toUpperCase()}</div>
              <div className="conflict-public-copy">
                <div><b>{person.name}</b>{isSelf && <span className="tag">VOCÊ</span>}</div>
                <small>Sobrevivente</small>
              </div>
              {isFocused && <span className="conflict-focus-badge"><Crosshair size={11} /> Spotlight</span>}
            </article>;
          })}
          {!conflict.survivors.length && <p className="conflict-inline-empty">Nenhum sobrevivente público nesta cena.</p>}
        </div>
      </section>

      <section className="panel panel-pad conflict-public-section">
        <div className="conflict-section-heading"><div><p className="dossier-title">Pressão</p><h3>Ameaças visíveis</h3></div><span className="tag">{conflict.threats.length}</span></div>
        <div className="conflict-public-threat-grid">
          {conflict.threats.map(threat => {
            const isFocused = conflict.spotlight?.kind === "threat" && conflict.spotlight.id === threat.id;
            return <article key={threat.id} data-conflict-kind="threat" data-conflict-id={threat.id} className={`conflict-public-threat${isFocused ? " is-focused" : ""}${threat.defeated ? " is-defeated" : ""}`}>
              <span className="conflict-threat-icon">{threat.defeated ? <Skull size={18} /> : <ShieldAlert size={18} />}</span>
              <div className="conflict-public-copy">
                <b>{threat.name}</b>
                <small>{threat.defeated ? "Fora de combate" : "Ameaça em cena"}</small>
                {threat.conditions.length > 0 && <div className="conflict-public-conditions">{threat.conditions.map(condition => <span className="tag" key={condition}>{condition}</span>)}</div>}
              </div>
              <div className="conflict-threat-tags">
                {isFocused && <span className="conflict-focus-badge"><Crosshair size={11} /> Spotlight</span>}
                {threat.defeated && <span className="tag">DERROTADA</span>}
              </div>
            </article>;
          })}
          {!conflict.threats.length && <p className="conflict-inline-empty">Nenhuma ameaça visível nesta cena.</p>}
        </div>
      </section>
    </div>
  </div>;
}

export function ConflictSceneManager({ game, edit }: { game: GameState; edit: Edit }) {
  const conflict = game.conflict;
  const library = threatLibrary(game.threats);
  const sectorName = game.hexes[game.partyHex]?.sector?.name ?? `Hex ${game.partyHex}`;
  const [sceneName, setSceneName] = useState(`Conflito — ${sectorName}`);
  const [survivorToAdd, setSurvivorToAdd] = useState("");
  const [threatToAdd, setThreatToAdd] = useState("");
  const [threatQuantity, setThreatQuantity] = useState(1);
  const [conditionDrafts, setConditionDrafts] = useState<Record<string, string>>({});
  const [actingThreatId, setActingThreatId] = useState<string | null>(null);
  const [threatTargetId, setThreatTargetId] = useState("");
  const [threatActionResult, setThreatActionResult] = useState<{
    d20: number; total: number; evasion: number; hit: boolean; damage: number;
    tier: ReturnType<typeof resolveSurvivorDamageTier>; targetName: string; attackName: string;
  } | null>(null);
  const [threatQuery, setThreatQuery] = useState("");
  const [threatFilter, setThreatFilter] = useState<"active" | "all" | "defeated">("active");
  const [notesDraft, setNotesDraft] = useState(conflict?.notes ?? "");

  useEffect(() => {
    setNotesDraft(conflict?.notes ?? "");
  }, [conflict?.id, conflict?.notes]);

  const availableSurvivors = useMemo(() => game.survivors
    .filter(person => !conflict?.survivorIds.includes(person.id))
    .map(person => ({ value: person.id, label: person.name })), [game.survivors, conflict?.survivorIds]);

  const threatOptions = useMemo(() => [...library]
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name, "pt-BR"))
    .map(threat => ({ value: threat.id, label: `Patamar ${threat.tier} · ${threat.name}` })), [library]);


  const actingThreat = actingThreatId ? conflict?.threats.find(threat => threat.id === actingThreatId) ?? null : null;
  const threatTargets = useMemo(() => (conflict?.survivorIds ?? []).flatMap(id => {
    const person = game.survivors.find(row => row.id === id);
    return person ? [{ value: person.id, label: person.name }] : [];
  }), [conflict?.survivorIds, game.survivors]);

  const threatGroups = useMemo(() => {
    const groups = new Map<string, NonNullable<GameState["conflict"]>["threats"]>();
    const needle = threatQuery.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    for (const threat of conflict?.threats ?? []) {
      if (threatFilter === "active" && threat.defeated || threatFilter === "defeated" && !threat.defeated) continue;
      const text = `${threat.name} ${threat.templateSnapshot.name} ${threat.templateSnapshot.role} ${threat.conditions.join(" ")}`
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
      if (needle && !text.includes(needle)) continue;
      const key = threat.templateSnapshot.id || threat.templateSnapshot.name;
      groups.set(key, [...(groups.get(key) ?? []), threat]);
    }
    return [...groups.entries()].map(([key, rows]) => ({
      key,
      name: rows[0]?.templateSnapshot.name ?? "Ameaças",
      role: rows[0]?.templateSnapshot.role ?? "Ameaça",
      tier: rows[0]?.templateSnapshot.tier ?? 1,
      threats: rows,
      active: rows.filter(row => !row.defeated).length,
      defeated: rows.filter(row => row.defeated).length,
    })).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name, "pt-BR"));
  }, [conflict?.threats, threatQuery, threatFilter]);

  useEffect(() => {
    if (!availableSurvivors.some(option => option.value === survivorToAdd)) setSurvivorToAdd(availableSurvivors[0]?.value ?? "");
  }, [availableSurvivors, survivorToAdd]);

  useEffect(() => {
    if (!threatOptions.some(option => option.value === threatToAdd)) setThreatToAdd(threatOptions[0]?.value ?? "");
  }, [threatOptions, threatToAdd]);


  useEffect(() => {
    if (!threatTargets.some(option => option.value === threatTargetId)) setThreatTargetId(threatTargets[0]?.value ?? "");
  }, [threatTargets, threatTargetId]);

  function startConflict() {
    const present = survivorsAtHex(game, game.partyHex).map(person => person.id);
    edit(draft => {
      draft.conflict = createConflictScene({
        name: sceneName,
        sceneNumber: draft.scene ?? 1,
        day: draft.day,
        time: displayTime(draft.minutes),
        survivorIds: present,
      });
      addLog(draft, "conflito", `Conflito iniciado: ${draft.conflict.name}.`);
    });
    toast.success("Cena de Conflito iniciada", { description: present.length ? `${present.length} sobrevivente(s) presente(s) adicionado(s).` : "Adicione os participantes da cena." });
  }

  function addSurvivor() {
    if (!survivorToAdd || !conflict) return;
    const person = game.survivors.find(row => row.id === survivorToAdd);
    if (!person) return;
    edit(draft => {
      const scene = draft.conflict;
      if (!scene || !scene.active || scene.survivorIds.includes(person.id)) return;
      scene.survivorIds.push(person.id);
      addLog(draft, "conflito", `${person.name} entrou em ${scene.name}.`);
    });
    toast.success("Sobrevivente adicionado", { description: person.name });
  }

  function addThreats() {
    if (!threatToAdd || !conflict) return;
    const template = library.find(threat => threat.id === threatToAdd);
    if (!template) return;
    let names: string[] = [];
    edit(draft => {
      const scene = draft.conflict;
      if (!scene || !scene.active) return;
      const added = addThreatInstances(scene, template, threatQuantity);
      names = added.map(threat => threat.name);
      addLog(draft, "conflito", `${added.length} ameaça(s) adicionada(s) a ${scene.name}: ${names.join(", ")}.`);
    });
    if (names.length) toast.success(names.length === 1 ? "Ameaça adicionada" : "Ameaças adicionadas", { description: names.join(", ") });
  }

  function focus(ref: ConflictParticipantRef, name: string) {
    edit(draft => {
      const scene = draft.conflict;
      if (!scene || !scene.active) return;
      if (setConflictSpotlight(scene, ref, name, draft.day, displayTime(draft.minutes))) {
        addLog(draft, "spotlight", `Spotlight → ${name}.`);
      }
    });
  }


  function grantRequestedSpotlight(survivorId: string) {
    const person = game.survivors.find(row => row.id === survivorId);
    if (!person) return;
    edit(draft => {
      const scene = draft.conflict;
      if (!scene?.active) return;
      grantConflictSpotlight(scene, person.id, person.name, draft.day, displayTime(draft.minutes));
      addLog(draft, "spotlight", `Spotlight → ${person.name}.`);
    });
  }

  function dismissSpotlightRequest(survivorId: string) {
    edit(draft => {
      if (draft.conflict?.active) cancelConflictSpotlightRequest(draft.conflict, survivorId);
    });
  }

  function remove(ref: ConflictParticipantRef, name: string) {
    edit(draft => {
      const scene = draft.conflict;
      if (!scene || !scene.active) return;
      removeConflictParticipant(scene, ref);
      addLog(draft, "conflito", `${name} saiu de ${scene.name}.`);
    });
  }


  function addCondition(threatId: string) {
    const value = (conditionDrafts[threatId] ?? "").trim();
    if (!value) return;
    let added = false;
    let threatName = "Ameaça";
    edit(draft => {
      const threat = draft.conflict?.threats.find(row => row.id === threatId);
      if (!threat) return;
      threatName = threat.name;
      added = addThreatCondition(threat, value);
      if (added) addLog(draft, "conflito", `${threat.name} recebeu a condição ${value}.`);
    });
    if (added) {
      setConditionDrafts(current => ({ ...current, [threatId]: "" }));
      toast.success("Condição adicionada", { description: `${threatName}: ${value}` });
    }
  }

  function removeCondition(threatId: string, condition: string) {
    edit(draft => {
      const threat = draft.conflict?.threats.find(row => row.id === threatId);
      if (!threat) return;
      if (removeThreatCondition(threat, condition))
        addLog(draft, "conflito", `${threat.name} perdeu a condição ${condition}.`);
    });
  }

  function openThreatAction(threatId: string) {
    const threat = conflict?.threats.find(row => row.id === threatId);
    if (!threat?.templateSnapshot.attack) return;
    setActingThreatId(threatId);
    const focusedId = conflict?.spotlight?.kind === "survivor" ? conflict.spotlight.id : "";
    setThreatTargetId(threatTargets.some(target => target.value === focusedId) ? focusedId : threatTargets[0]?.value ?? "");
    setThreatActionResult(null);
  }

  function rollThreatAction() {
    if (!actingThreat?.templateSnapshot.attack || !threatTargetId) return;
    const target = game.survivors.find(person => person.id === threatTargetId);
    if (!target) return;
    const attack = actingThreat.templateSnapshot.attack;
    const stats = survivorStats(target);
    const d20 = rollDie(20);
    const total = d20 + attack.bonus;
    const hit = total >= stats.evasion;
    let damage = 0;
    const parsed = parseThreatDamageFormula(attack.damage);
    if (hit && parsed) {
      damage = parsed.flat;
      for (let index = 0; index < parsed.dice; index++) damage += rollDie(parsed.die);
      damage = Math.max(0, damage);
    }
    const tier = resolveSurvivorDamageTier(stats.major, stats.severe, damage);
    const result = { d20, total, evasion: stats.evasion, hit, damage, tier, targetName: target.name, attackName: attack.name };
    setThreatActionResult(result);
    edit(draft => {
      const scene = draft.conflict;
      if (!scene?.active) return;
      const request = hit && tier.hpMarks > 0 ? queueSurvivorDamage(scene, {
        targetSurvivorId: target.id,
        sourceThreatId: actingThreat.id,
        sourceName: actingThreat.name,
        attackName: attack.name,
        damage,
        damageType: attack.damageType,
        tier,
        day: draft.day,
        time: displayTime(draft.minutes),
      }) : null;
      addLog(draft, "ameaça", `${actingThreat.name}: ${attack.name} contra ${target.name} — d20 ${d20} ${attack.bonus >= 0 ? "+" : "−"} ${Math.abs(attack.bonus)} = ${total} vs Evasão ${stats.evasion}: ${hit ? "ACERTO" : "FALHA"}.${hit ? ` Dano ${damage} ${attack.damageType} → ${tier.label.toUpperCase()} (${tier.hpMarks} PV).${request ? " Aguardando decisão do alvo: PV ou Armadura." : ""}` : ""}`);
    });
  }

  function closeConflict() {
    if (!conflict) return;
    edit(draft => {
      const scene = draft.conflict;
      if (!scene || !scene.active) return;
      const defeated = scene.threats.filter(threat => threat.defeated).length;
      const focuses = scene.spotlightHistory.length;
      endConflictScene(scene, draft.day, displayTime(draft.minutes));
      addLog(draft, "conflito", `Conflito encerrado: ${scene.name}. ${defeated} ameaça(s) derrotada(s), ${focuses} mudança(s) de spotlight.`);
    });
    toast.success("Cena de Conflito encerrada");
  }

  function reopenConflict() {
    edit(draft => {
      if (!draft.conflict || draft.conflict.active) return;
      draft.conflict.active = true;
      delete draft.conflict.endedDay;
      delete draft.conflict.endedTime;
      addLog(draft, "conflito", `Conflito retomado: ${draft.conflict.name}.`);
    });
    toast.success("Conflito retomado");
  }

  if (!conflict) return <section className="conflict-empty panel panel-pad">
    <div className="conflict-empty-icon"><Swords size={28} aria-hidden="true" /></div>
    <div className="conflict-empty-copy">
      <p className="dossier-title">Cena atual · conflito opcional</p>
      <h2 className="section-title mt-1">Nenhum conflito ativo</h2>
      <p className="intro-line mt-2">Inicie um conflito quando a ficção pedir acompanhamento de participantes, ameaças e spotlight. Não há iniciativa, fila ou turno automático.</p>
    </div>
    <div className="conflict-start-controls">
      <Field label="Nome da cena de conflito" value={sceneName} onChange={setSceneName} placeholder="Ex.: Estacionamento do mercado" />
      <Button onClick={startConflict}><Swords size={16} /> Iniciar conflito</Button>
    </div>
  </section>;

  if (!conflict.active) return <div className="conflict-manager">
    <section className="panel panel-pad conflict-summary">
      <div><p className="dossier-title">Conflito encerrado</p><h2 className="section-title mt-1">{conflict.name}</h2>
        <p className="intro-line mt-2">Começou no Dia {conflict.startedDay}, {conflict.startedTime}{conflict.endedDay ? ` · encerrou no Dia ${conflict.endedDay}, ${conflict.endedTime}` : ""}.</p></div>
      <div className="conflict-summary-metrics">
        <span><small>Sobreviventes</small><b>{conflict.survivorIds.length}</b></span>
        <span><small>Ameaças</small><b>{conflict.threats.length}</b></span>
        <span><small>Derrotadas</small><b>{conflict.threats.filter(threat => threat.defeated).length}</b></span>
        <span><small>Spotlights</small><b>{conflict.spotlightHistory.length}</b></span>
      </div>
      <div className="conflict-summary-actions">
        <Button variant="outline" onClick={reopenConflict}>Retomar conflito</Button>
        <Button onClick={() => { setSceneName(`Conflito — ${sectorName}`); edit(draft => { delete draft.conflict; }); }}>Preparar novo conflito</Button>
      </div>
    </section>
  </div>;

  const spotlightName = participantLabel(game, conflict.spotlight);
  const activeThreats = conflict.threats.filter(threat => !threat.defeated).length;
  const defeatedThreats = conflict.threats.length - activeThreats;
  const participantsCount = conflict.survivorIds.length + conflict.threats.length;
  const pendingDamage = (conflict.damageRequests ?? []).filter(request => request.status === "pending");

  return <div className="conflict-manager">
    <section className="panel conflict-hero">
      <div className="conflict-hero-main">
        <div className="conflict-hero-titleblock"><p className="dossier-title">Cena {conflict.sceneNumber} · conflito ativo</p><h2>{conflict.name}</h2>
          <p>Dia {game.day} · {displayTime(game.minutes)} · {participantsCount} participante(s)</p></div>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button size="sm" variant="outline">Encerrar conflito</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Encerrar {conflict.name}?</AlertDialogTitle>
              <AlertDialogDescription>O conflito deixa de ficar ativo, mas participantes, ameaças e histórico de spotlight permanecem registrados. Isso não inicia uma nova cena narrativa.{pendingDamage.length > 0 && ` Há ${pendingDamage.length} impacto(s) pendente(s). Resolva-os antes de encerrar para que os jogadores possam decidir sobre PV e Armadura.`}</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={closeConflict}>Encerrar conflito</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="conflict-overview-metrics" aria-label="Resumo do conflito">
        <span className="conflict-overview-metric is-survivors"><Users size={17} /><small>Sobreviventes</small><b>{conflict.survivorIds.length}</b></span>
        <span className="conflict-overview-metric is-active"><ShieldAlert size={17} /><small>Ameaças ativas</small><b>{activeThreats}</b></span>
        <span className="conflict-overview-metric is-defeated"><Skull size={17} /><small>Derrotadas</small><b>{defeatedThreats}</b></span>
        <span className="conflict-overview-metric is-spotlight"><Crosshair size={17} /><small>Spotlight</small><b>{spotlightName ?? "Sem foco"}</b></span>
      </div>

      <div className="conflict-trail-full-status" role="status" aria-live="polite">
        <span><Crosshair size={14} /> Spotlight <b>{spotlightName ?? "sem foco"}</b></span>
        <small>Clique em um participante para mover o Spotlight. A posição na trilha não muda.</small>
        {conflict.spotlight && <Button size="sm" variant="ghost" onClick={() => edit(draft => { if (draft.conflict) clearConflictSpotlight(draft.conflict); })}>Limpar</Button>}
      </div>
      <ConflictTrail
        survivors={conflict.survivorIds.flatMap(id => {
          const person = game.survivors.find(row => row.id === id);
          return person ? [{ id: person.id, name: person.name, ...(person.portrait ? { portrait: person.portrait } : {}), requested: Boolean(conflict.spotlightRequests?.includes(person.id)) }] : [];
        })}
        threats={conflict.threats.map(threat => ({
          id: threat.id,
          name: threat.name,
          groupName: threat.templateSnapshot.name,
          defeated: threat.defeated,
          conditions: [...threat.conditions],
        }))}
        spotlight={conflict.spotlight}
        mode="master"
        onParticipantSpotlight={(ref, name) => {
          if (ref.kind === "survivor" && conflict.spotlightRequests?.includes(ref.id)) grantRequestedSpotlight(ref.id);
          else focus(ref, name);
        }}
      />
      {(conflict.spotlightRequests?.length ?? 0) > 0 && <div className="conflict-spotlight-requests">
        <span>Querem o Spotlight</span>
        <div>{(conflict.spotlightRequests ?? []).map(id => {
          const person = game.survivors.find(row => row.id === id);
          if (!person) return null;
          return <span key={id} className="conflict-spotlight-request-chip"><b>{person.name}</b>
            <button type="button" onClick={() => grantRequestedSpotlight(id)}>Dar Spotlight</button>
            <button type="button" onClick={() => dismissSpotlightRequest(id)} aria-label={`Dispensar pedido de ${person.name}`}><X size={12} /></button>
          </span>;
        })}</div>
      </div>}
      <p className="conflict-rule-note">Spotlight é apenas um marcador de foco narrativo. Pedidos indicam interesse em agir, mas não criam fila, iniciativa ou prioridade automática.</p>
    </section>

    {pendingDamage.length > 0 && <section className="panel panel-pad conflict-pending-summary" aria-label="Danos aguardando decisão">
      <div><Activity size={18} /><strong>{pendingDamage.length} impacto(s) aguardando decisão</strong><span>Os alvos escolhem entre PV e Armadura na própria ficha ou na visão do conflito.</span></div>
      <ul>{pendingDamage.map(request => <li key={request.id}>
        <b>{game.survivors.find(person => person.id === request.targetSurvivorId)?.name ?? "Sobrevivente indisponível"}</b>
        <span>{request.sourceName} · {request.attackName} · {request.damage} de dano → {request.tier.hpMarks} PV</span>
      </li>)}</ul>
    </section>}

    <div className="conflict-workspace">
      <section className="panel panel-pad conflict-participants conflict-team-panel">
        <div className="conflict-section-heading">
          <div className="conflict-heading-with-icon"><span className="conflict-heading-icon"><Users size={17} /></span><div><p className="dossier-title">Equipe</p><h3>Sobreviventes</h3></div></div>
          <span className="tag">{conflict.survivorIds.length}</span>
        </div>
        <details className="conflict-preparation" open={!conflict.survivorIds.length}>
          <summary><UserPlus size={14} /> Adicionar sobrevivente</summary>
        <div className="conflict-add-row">
          <Pick label="Adicionar sobrevivente" value={survivorToAdd} options={availableSurvivors} onChange={setSurvivorToAdd} placeholder="Todos já estão na cena" disabled={!availableSurvivors.length} />
          <Button size="sm" variant="outline" disabled={!survivorToAdd || !availableSurvivors.length} onClick={addSurvivor}><UserPlus size={15} /> Adicionar</Button>
        </div>
        </details>
        <div className="conflict-survivor-list">
          {conflict.survivorIds.map(id => {
            const person = game.survivors.find(row => row.id === id);
            if (!person) return <article key={id} className="conflict-person is-missing"><Users size={18} /><div><b>Sobrevivente indisponível</b><small>{id}</small></div><Button size="sm" variant="ghost" onClick={() => remove({ kind: "survivor", id }, "Sobrevivente indisponível")}><X size={15} /></Button></article>;
            const stats = survivorStats(person);
            const isFocused = conflict.spotlight?.kind === "survivor" && conflict.spotlight.id === person.id;
            const hasPendingDamage = (conflict.damageRequests ?? []).some(request => request.status === "pending" && request.targetSurvivorId === person.id);
            return <article key={person.id} data-conflict-kind="survivor" data-conflict-id={person.id} className={`conflict-person conflict-person--compact${isFocused ? " is-focused" : ""}${hasPendingDamage ? " has-pending-damage" : ""}`}>
              <div className="conflict-avatar">{person.portrait ? <img src={person.portrait} alt="" /> : person.name.slice(0,2).toUpperCase()}</div>
              <div className="conflict-person-copy">
                <div className="conflict-person-name"><b>{person.name}</b>{isFocused && <span className="conflict-focus-badge"><Crosshair size={11} /> Spotlight</span>}{hasPendingDamage && <span className="conflict-damage-pending-badge"><Activity size={10} /> Dano</span>}</div>
                <small>{person.archetype} · {person.specialty}</small>
                <div className="conflict-survivor-resources">
                  <ResourceMeter icon={<HeartPulse size={10} />} label="PV" value={person.hp} max={stats.hp} tone="hp" />
                  <ResourceMeter icon={<Zap size={10} />} label="Estresse" value={person.stress} max={6} tone="stress" />
                  <ResourceMeter icon={<Activity size={10} />} label="Esperança" value={person.hope} max={6} tone="hope" />
                </div>
              </div>
              <div className="conflict-person-actions">
                <Button size="sm" variant={isFocused ? "default" : "outline"} aria-label={isFocused ? `${person.name} está em Spotlight` : `Dar Spotlight a ${person.name}`} onClick={() => conflict.spotlightRequests?.includes(person.id) ? grantRequestedSpotlight(person.id) : focus({ kind: "survivor", id: person.id }, person.name)}><Crosshair size={14} /><span>{isFocused ? "Em foco" : "Spotlight"}</span></Button>
                <Button size="sm" variant="ghost" aria-label={`Remover ${person.name} do conflito`} onClick={() => remove({ kind: "survivor", id: person.id }, person.name)}><Trash2 size={14} /></Button>
              </div>
            </article>;
          })}
          {!conflict.survivorIds.length && <p className="conflict-inline-empty">Nenhum sobrevivente adicionado.</p>}
        </div>
      </section>

      <section className="panel panel-pad conflict-participants conflict-threat-panel">
        <div className="conflict-section-heading">
          <div className="conflict-heading-with-icon"><span className="conflict-heading-icon is-pressure"><ShieldAlert size={17} /></span><div><p className="dossier-title">Pressão</p><h3>Ameaças em cena</h3></div></div>
          <div className="conflict-heading-counters"><span className="tag">{activeThreats} ativas</span>{defeatedThreats > 0 && <span className="tag is-muted">{defeatedThreats} derrotadas</span>}</div>
        </div>
        <details className="conflict-preparation" open={!conflict.threats.length}>
          <summary><Plus size={14} /> Adicionar ameaças do catálogo</summary>
        <div className="conflict-threat-add">
          <Pick label="Ameaça do catálogo" value={threatToAdd} options={threatOptions} onChange={setThreatToAdd} placeholder="Catálogo vazio" disabled={!threatOptions.length} />
          <Counter compact label="Qtd." value={threatQuantity} min={1} max={12} onChange={setThreatQuantity} />
          <Button size="sm" variant="outline" disabled={!threatToAdd || !threatOptions.length} onClick={addThreats}><Plus size={15} /> Adicionar</Button>
        </div>

        </details>
        <div className="conflict-threat-toolbar">
          <Field label="Buscar ameaças em cena" value={threatQuery} onChange={setThreatQuery} placeholder="Nome, função ou condição…" />
          <div className="conflict-filter-buttons" role="group" aria-label="Filtrar ameaças">
            {([{ value: "active", label: "Ativas", count: activeThreats }, { value: "all", label: "Todas", count: conflict.threats.length }, { value: "defeated", label: "Derrotadas", count: defeatedThreats }] as const).map(filter =>
              <Button key={filter.value} size="sm" variant={threatFilter === filter.value ? "default" : "outline"}
                aria-pressed={threatFilter === filter.value} onClick={() => setThreatFilter(filter.value)}>{filter.label} · {filter.count}</Button>)}
          </div>
        </div>
        <div className="conflict-threat-groups">
          {threatGroups.map(group => <section key={group.key} className="conflict-threat-group">
            <header className="conflict-threat-group-heading">
              <span className="conflict-threat-group-icon"><ThreatRoleIcon role={group.role} size={16} /></span>
              <div><small>Patamar {group.tier} · {group.role}</small><b>{group.name}</b></div>
              <span className="conflict-threat-group-count">{group.active}<small>ativas</small>{group.defeated > 0 && <em>+{group.defeated} fora</em>}</span>
            </header>
            <div className="conflict-threat-grid">
              {group.threats.map(instance => {
                const template = instance.templateSnapshot;
                const isFocused = conflict.spotlight?.kind === "threat" && conflict.spotlight.id === instance.id;
                const isWounded = !instance.defeated && instance.hpMarked > 0;
                const stateClass = instance.defeated ? " is-defeated" : isWounded ? " is-wounded" : " is-intact";
                return <article key={instance.id} data-conflict-kind="threat" data-conflict-id={instance.id} className={`conflict-threat conflict-threat--compact${isFocused ? " is-focused" : ""}${stateClass}`}>
                  <div className="conflict-threat-heading">
                    <span className="conflict-threat-icon">{instance.defeated ? <Skull size={17} /> : <ThreatRoleIcon role={template.role} size={17} />}</span>
                    <div className="conflict-threat-identity"><small>Patamar {template.tier} · {template.role}</small><b>{instance.name}</b></div>
                    <div className="conflict-threat-tags">
                      {isFocused && <span className="conflict-focus-badge"><Crosshair size={11} /> Spotlight</span>}
                      {instance.defeated ? <span className="conflict-state-badge is-defeated"><Skull size={10} /> Derrotada</span>
                        : isWounded ? <span className="conflict-state-badge is-wounded"><HeartPulse size={10} /> Ferida</span>
                        : <span className="conflict-state-badge is-intact">Íntegra</span>}
                    </div>
                  </div>

                  <div className="conflict-threat-stats">
                    <ThreatStat icon={<Shield size={11} />} label="Dificuldade" value={template.difficulty} tone="difficulty" />
                    <ThreatStat icon={<Gauge size={11} />} label="Limiares" value={<>{template.majorThreshold ?? "—"} <span className="conflict-threshold-divider">/</span> {template.severeThreshold ?? "—"}</>} tone="threshold" />
                    <ResourceMeter icon={<HeartPulse size={10} />} label="PV" value={instance.hpMarked} max={template.maxHp} tone="hp" />
                    <ResourceMeter icon={<Zap size={10} />} label="Estresse" value={instance.stressMarked} max={template.maxStress} tone="stress" />
                  </div>

                  <details className="conflict-threat-details">
                    <summary><span><Tag size={12} /> Condições e recursos</span>{instance.conditions.length > 0 && <b>{instance.conditions.length}</b>}</summary>
                    <div className="conflict-threat-detail-body">
                      {(template.maxHp !== null || template.maxStress !== null) && <div className="conflict-threat-controls">
                        {template.maxHp !== null && <Counter compact label="PV marcados" value={instance.hpMarked} min={0} max={template.maxHp} onChange={value => edit(draft => {
                          const row = draft.conflict?.threats.find(threat => threat.id === instance.id);
                          if (row) setThreatHpMarked(row, value);
                        })} />}
                        {template.maxStress !== null && <Counter compact label="Estresse marcado" value={instance.stressMarked} min={0} max={template.maxStress} onChange={value => edit(draft => {
                          const row = draft.conflict?.threats.find(threat => threat.id === instance.id);
                          if (row) setThreatStressMarked(row, value);
                        })} />}
                      </div>}
                      <div className="conflict-condition-block">
                        <span className="field-label">Condições públicas</span>
                        {instance.conditions.length > 0 && <div className="conflict-condition-tags">
                          {instance.conditions.map(condition => <button type="button" key={condition} onClick={() => removeCondition(instance.id, condition)} title="Remover condição"><span>{condition}</span><X size={11} /></button>)}
                        </div>}
                        <div className="conflict-condition-editor">
                          <input value={conditionDrafts[instance.id] ?? ""} maxLength={100} onChange={event => setConditionDrafts(current => ({ ...current, [instance.id]: event.target.value }))} onKeyDown={event => {
                            if (event.key === "Enter") { event.preventDefault(); addCondition(instance.id); }
                          }} placeholder="Ex.: Vulnerável, Preso, Em chamas…" aria-label={`Nova condição para ${instance.name}`} />
                          <Button type="button" size="sm" variant="outline" disabled={!(conditionDrafts[instance.id] ?? "").trim()} onClick={() => addCondition(instance.id)}><Plus size={13} /> Adicionar</Button>
                        </div>
                      </div>
                    </div>
                  </details>

                  <details className="conflict-threat-details conflict-ability-reference">
                    <summary><span><Swords size={12} /> Ataque e habilidades</span><b>{template.features.length}</b></summary>
                    <div className="conflict-threat-detail-body">
                      {template.attack && <div><strong>{template.attack.name}</strong><p>ATQ {template.attack.bonus >= 0 ? "+" : ""}{template.attack.bonus} · {template.attack.range} · {template.attack.damage} {template.attack.damageType}</p></div>}
                      {template.features.map(feature => <div key={feature.id}><strong>{feature.name}</strong><small>{feature.kind}</small><p>{feature.effect}</p></div>)}
                      {!template.attack && !template.features.length && <p>Nenhum ataque ou habilidade registrado.</p>}
                    </div>
                  </details>
                  <div className="conflict-threat-actions">
                    {template.attack && <Button className="conflict-threat-primary-action" size="sm" onClick={() => openThreatAction(instance.id)} disabled={instance.defeated}><Swords size={14} /> Atacar</Button>}
                    <Button size="sm" variant={isFocused ? "default" : "outline"} title={isFocused ? "Esta ameaça está no Spotlight" : "Dar Spotlight"} aria-label={isFocused ? `${instance.name} está no Spotlight` : `Dar Spotlight a ${instance.name}`} disabled={instance.defeated} onClick={() => focus({ kind: "threat", id: instance.id }, instance.name)}><Crosshair size={14} /><span>{isFocused ? "Em foco" : "Spotlight"}</span></Button>
                    <Button size="sm" variant="outline" title={instance.defeated ? "Reativar ameaça" : "Marcar como derrotada"} onClick={() => edit(draft => {
                      const row = draft.conflict?.threats.find(threat => threat.id === instance.id);
                      if (row) row.defeated = !row.defeated;
                    })}>{instance.defeated ? <><RotateCcw size={14} /> Reativar</> : <><Skull size={14} /> Derrotar</>}</Button>
                    <Button size="sm" variant="ghost" title="Remover da cena" aria-label={`Remover ${instance.name} do conflito`} onClick={() => remove({ kind: "threat", id: instance.id }, instance.name)}><Trash2 size={14} /></Button>
                  </div>
                </article>;
              })}
            </div>
          </section>)}
          {!threatGroups.length && <div className="conflict-inline-empty">
            <p>{!conflict.threats.length ? "Nenhuma ameaça adicionada. Abra o catálogo acima para preparar a cena." : "Nenhuma ameaça corresponde aos filtros."}</p>
            {conflict.threats.length > 0 && <Button size="sm" variant="outline" onClick={() => { setThreatQuery(""); setThreatFilter("all"); }}>Mostrar todas</Button>}
          </div>}
        </div>
      </section>
    </div>

    <div className="conflict-bottom-grid">
      <details className="panel panel-pad conflict-secondary-panel">
        <summary>Histórico de spotlight · {conflict.spotlightHistory.length}</summary>
        <div className="conflict-section-heading"><div className="conflict-heading-with-icon"><span className="conflict-heading-icon"><Activity size={17} /></span><div><p className="dossier-title">Ritmo narrativo</p><h3>Histórico de spotlight</h3></div></div><span className="tag">{conflict.spotlightHistory.length}</span></div>
        <div className="conflict-spotlight-history">
          {[...conflict.spotlightHistory].reverse().slice(0,18).map((event, index) => <div key={event.eventId} className="conflict-history-row">
            <span>{conflict.spotlightHistory.length - index}</span>
            <div><b>{event.name}</b><small>{event.kind === "survivor" ? "Sobrevivente" : "Ameaça"} · Dia {event.day} · {event.time}</small></div>
          </div>)}
          {!conflict.spotlightHistory.length && <p className="conflict-inline-empty">O histórico começa quando o mestre atribuir o primeiro spotlight.</p>}
        </div>
      </details>

      <details className="panel panel-pad conflict-secondary-panel">
        <summary>Notas do mestre{notesDraft.trim() ? " · com anotações" : ""}</summary>
        <div className="conflict-section-heading"><div className="conflict-heading-with-icon"><span className="conflict-heading-icon"><Tag size={17} /></span><div><p className="dossier-title">Anotações</p><h3>Estado da cena</h3></div></div></div>
        <Field label="Notas do mestre" multiline value={notesDraft} onChange={setNotesDraft} placeholder="Cobertura, perigos, objetivos, mudanças no ambiente…" />
        <div className="conflict-notes-actions"><Button size="sm" variant="outline" disabled={notesDraft === conflict.notes} onClick={() => {
          const notes = notesDraft.trim().slice(0, 4000);
          edit(draft => { if (draft.conflict) draft.conflict.notes = notes; });
          setNotesDraft(notes);
          toast.success("Notas do conflito salvas");
        }}>Salvar notas</Button></div>
      </details>
    </div>

    <Dialog open={Boolean(actingThreat)} onOpenChange={open => { if (!open) { setActingThreatId(null); setThreatActionResult(null); } }}>
      {actingThreat?.templateSnapshot.attack && <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <p className="dossier-title">Ação da ameaça</p>
          <DialogTitle>{actingThreat.name} · {actingThreat.templateSnapshot.attack.name}</DialogTitle>
          <DialogDescription>Role o ataque da ameaça contra a Evasão de um sobrevivente. O dano é classificado pelos Limiares do alvo, mas PV e Armadura continuam sendo resolvidos na ficha.</DialogDescription>
        </DialogHeader>
        <div className="threat-action-summary">
          <span><small>ATQ</small><b>{actingThreat.templateSnapshot.attack.bonus >= 0 ? "+" : ""}{actingThreat.templateSnapshot.attack.bonus}</b></span>
          <span><small>Alcance</small><b>{actingThreat.templateSnapshot.attack.range}</b></span>
          <span><small>Dano</small><b>{actingThreat.templateSnapshot.attack.damage}</b></span>
          <span><small>Tipo</small><b>{actingThreat.templateSnapshot.attack.damageType}</b></span>
        </div>
        <Pick label="Alvo" value={threatTargetId} options={threatTargets} onChange={value => { setThreatTargetId(value); setThreatActionResult(null); }} placeholder="Nenhum sobrevivente na cena" disabled={!threatTargets.length} />
        {threatActionResult && <div className={`threat-action-result ${threatActionResult.hit ? "is-hit" : "is-miss"}`}>
          <div><span>d20</span><strong>{threatActionResult.d20}</strong></div>
          <div><span>Total</span><strong>{threatActionResult.total}</strong></div>
          <div><span>Evasão</span><strong>{threatActionResult.evasion}</strong></div>
          <div><span>Resultado</span><strong>{threatActionResult.hit ? "ACERTO" : "FALHA"}</strong></div>
          {threatActionResult.hit && <p><b>{threatActionResult.damage} de dano</b> · {threatActionResult.tier.label} → <b>{threatActionResult.tier.hpMarks} PV</b>. O alvo ainda pode usar Armadura conforme as regras.</p>}
        </div>}
        <DialogFooter>
          <Button variant="outline" onClick={() => { setActingThreatId(null); setThreatActionResult(null); }}>Fechar</Button>
          <Button disabled={!threatTargetId} onClick={rollThreatAction}><Dice5 size={15} /> Rolar ataque</Button>
        </DialogFooter>
      </DialogContent>}
    </Dialog>
  </div>;
}
