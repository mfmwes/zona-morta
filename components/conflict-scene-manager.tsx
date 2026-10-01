"use client";

import { useEffect, useMemo, useState } from "react";
import { Crosshair, Dice5, Plus, ShieldAlert, Skull, Swords, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Counter, Field, Pick } from "@/components/game-controls";
import { addLog, displayTime, survivorStats, survivorsAtHex, type GameState } from "@/lib/game";
import {
  addThreatCondition,
  addThreatInstances,
  clearConflictSpotlight,
  createConflictScene,
  endConflictScene,
  removeConflictParticipant,
  removeThreatCondition,
  resolveSurvivorDamageTier,
  parseThreatDamageFormula,
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

function ResourceMeter({ label, value, max, tone }: { label: string; value: number; max: number | null; tone: "hp" | "stress" | "hope" }) {
  if (max === null) return <span className={`conflict-resource conflict-resource--${tone}`}><span><small>{label}</small><b>—</b></span></span>;
  const current = Math.max(0, Math.min(max, value));
  const percent = max > 0 ? Math.round((current / max) * 100) : 0;
  return <span className={`conflict-resource conflict-resource--${tone}`} aria-label={`${label} ${current} de ${max}`}>
    <span><small>{label}</small><b>{current}/{max}</b></span>
    <span className="conflict-resource-track" aria-hidden="true"><span style={{ width: `${percent}%` }} /></span>
  </span>;
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
  const conflict = game.publicConflict
    ?? (game.conflict?.active ? publicConflictScene(game.conflict, game.survivors) : undefined);
  if (!conflict?.active) return null;

  const spotlightName = publicParticipantLabel(conflict, conflict.spotlight);
  const ownSpotlight = conflict.spotlight?.kind === "survivor" && conflict.spotlight.id === selfId;

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

      <div className={`conflict-spotlight${conflict.spotlight ? " has-focus" : ""}${ownSpotlight ? " is-self" : ""}`} role="status" aria-live="polite">
        <div className="conflict-spotlight-icon"><Crosshair size={22} aria-hidden="true" /></div>
        <div className="conflict-spotlight-copy">
          <span className="conflict-spotlight-kicker"><span className="conflict-spotlight-dot" aria-hidden="true" /> SPOTLIGHT ATUAL</span>
          <strong>{ownSpotlight ? "Seu personagem" : spotlightName ?? "Sem foco definido"}</strong>
          <span>{conflict.spotlight
            ? ownSpotlight
              ? "Você está com o foco narrativo."
              : conflict.spotlight.kind === "survivor" ? "Sobrevivente em foco narrativo" : "Ameaça em foco narrativo"
            : "O mestre decide livremente quem recebe o foco."}</span>
        </div>
      </div>
      <p className="conflict-rule-note">Esta visão mostra apenas informações públicas da cena. Dados mecânicos das ameaças e controles do mestre permanecem ocultos.</p>
    </section>

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
  const [notesDraft, setNotesDraft] = useState(conflict?.notes ?? "");

  useEffect(() => {
    setNotesDraft(conflict?.notes ?? "");
  }, [conflict?.id, conflict?.notes]);

  useEffect(() => {
    if (!conflict?.spotlight) return;
    const { kind, id } = conflict.spotlight;
    const target = document.querySelector<HTMLElement>(`[data-conflict-kind="${kind}"][data-conflict-id="${id}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [conflict?.spotlight?.kind, conflict?.spotlight?.id]);

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
    setThreatTargetId(threatTargets[0]?.value ?? "");
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
      addLog(draft, "ameaça", `${actingThreat.name}: ${attack.name} contra ${target.name} — d20 ${d20} ${attack.bonus >= 0 ? "+" : "−"} ${Math.abs(attack.bonus)} = ${total} vs Evasão ${stats.evasion}: ${hit ? "ACERTO" : "FALHA"}.${hit ? ` Dano ${damage} ${attack.damageType} → ${tier.label.toUpperCase()} (${tier.hpMarks} PV). Aplique dano ou Armadura na ficha do alvo.` : ""}`);
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
  const participantsCount = conflict.survivorIds.length + conflict.threats.length;

  return <div className="conflict-manager">
    <section className="panel conflict-hero">
      <div className="conflict-hero-main">
        <div><p className="dossier-title">Cena {conflict.sceneNumber} · conflito ativo</p><h2>{conflict.name}</h2>
          <p>Dia {game.day} · {displayTime(game.minutes)} · {participantsCount} participante(s)</p></div>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button size="sm" variant="outline">Encerrar conflito</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Encerrar {conflict.name}?</AlertDialogTitle>
              <AlertDialogDescription>O conflito deixa de ficar ativo, mas participantes, ameaças e histórico de spotlight permanecem registrados. Isso não inicia uma nova cena narrativa.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={closeConflict}>Encerrar conflito</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className={`conflict-spotlight${conflict.spotlight ? " has-focus" : ""}`} role="status" aria-live="polite">
        <div className="conflict-spotlight-icon"><Crosshair size={22} aria-hidden="true" /></div>
        <div className="conflict-spotlight-copy">
          <span className="conflict-spotlight-kicker"><span className="conflict-spotlight-dot" aria-hidden="true" /> SPOTLIGHT ATUAL</span>
          <strong>{spotlightName ?? "Sem foco definido"}</strong>
          <span>{conflict.spotlight ? (conflict.spotlight.kind === "survivor" ? "Sobrevivente em foco narrativo" : "Ameaça em foco narrativo") : "O mestre decide livremente quem recebe o foco."}</span>
        </div>
        {conflict.spotlight && <Button size="sm" variant="ghost" onClick={() => edit(draft => { if (draft.conflict) clearConflictSpotlight(draft.conflict); })}>Limpar</Button>}
      </div>
      <p className="conflict-rule-note">Spotlight é apenas um marcador de foco narrativo. O sistema não bloqueia ações, não calcula iniciativa e não escolhe quem age depois.</p>
    </section>

    <div className="conflict-columns">
      <section className="panel panel-pad conflict-participants">
        <div className="conflict-section-heading"><div><p className="dossier-title">Equipe</p><h3>Sobreviventes</h3></div><span className="tag">{conflict.survivorIds.length}</span></div>
        <div className="conflict-add-row">
          <Pick label="Adicionar sobrevivente" value={survivorToAdd} options={availableSurvivors} onChange={setSurvivorToAdd} placeholder="Todos já estão na cena" disabled={!availableSurvivors.length} />
          <Button size="sm" variant="outline" disabled={!survivorToAdd || !availableSurvivors.length} onClick={addSurvivor}><UserPlus size={15} /> Adicionar</Button>
        </div>
        <div className="conflict-survivor-list">
          {conflict.survivorIds.map(id => {
            const person = game.survivors.find(row => row.id === id);
            if (!person) return <article key={id} className="conflict-person is-missing"><Users size={18} /><div><b>Sobrevivente indisponível</b><small>{id}</small></div><Button size="sm" variant="ghost" onClick={() => remove({ kind: "survivor", id }, "Sobrevivente indisponível")}><X size={15} /></Button></article>;
            const stats = survivorStats(person);
            const isFocused = conflict.spotlight?.kind === "survivor" && conflict.spotlight.id === person.id;
            return <article key={person.id} data-conflict-kind="survivor" data-conflict-id={person.id} className={`conflict-person${isFocused ? " is-focused" : ""}`}>
              <div className="conflict-avatar">{person.portrait ? <img src={person.portrait} alt="" /> : person.name.slice(0,2).toUpperCase()}</div>
              <div className="conflict-person-copy"><div className="conflict-person-name"><b>{person.name}</b>{isFocused && <span className="conflict-focus-badge"><Crosshair size={11} /> Spotlight</span>}</div><small>{person.archetype} · {person.specialty}</small>
                <div className="conflict-survivor-resources">
                  <ResourceMeter label="PV marcados" value={person.hp} max={stats.hp} tone="hp" />
                  <ResourceMeter label="Estresse" value={person.stress} max={6} tone="stress" />
                  <ResourceMeter label="Esperança" value={person.hope} max={6} tone="hope" />
                </div></div>
              <div className="conflict-person-actions">
                <Button size="sm" variant={isFocused ? "default" : "outline"} onClick={() => focus({ kind: "survivor", id: person.id }, person.name)}><Crosshair size={14} /> {isFocused ? "Em foco" : "Spotlight"}</Button>
                <Button size="sm" variant="ghost" aria-label={`Remover ${person.name} do conflito`} onClick={() => remove({ kind: "survivor", id: person.id }, person.name)}><X size={15} /></Button>
              </div>
            </article>;
          })}
          {!conflict.survivorIds.length && <p className="conflict-inline-empty">Nenhum sobrevivente adicionado.</p>}
        </div>
      </section>

      <section className="panel panel-pad conflict-participants">
        <div className="conflict-section-heading"><div><p className="dossier-title">Pressão</p><h3>Ameaças em cena</h3></div><span className="tag">{conflict.threats.length}</span></div>
        <div className="conflict-threat-add">
          <Pick label="Ameaça do catálogo" value={threatToAdd} options={threatOptions} onChange={setThreatToAdd} placeholder="Catálogo vazio" disabled={!threatOptions.length} />
          <Counter compact label="Qtd." value={threatQuantity} min={1} max={12} onChange={setThreatQuantity} />
          <Button size="sm" variant="outline" disabled={!threatToAdd || !threatOptions.length} onClick={addThreats}><Plus size={15} /> Adicionar</Button>
        </div>
        <div className="conflict-threat-list">
          {conflict.threats.map(instance => {
            const template = instance.templateSnapshot;
            const isFocused = conflict.spotlight?.kind === "threat" && conflict.spotlight.id === instance.id;
            return <article key={instance.id} data-conflict-kind="threat" data-conflict-id={instance.id} className={`conflict-threat${isFocused ? " is-focused" : ""}${instance.defeated ? " is-defeated" : ""}`}>
              <div className="conflict-threat-heading">
                <span className="conflict-threat-icon">{instance.defeated ? <Skull size={18} /> : <ShieldAlert size={18} />}</span>
                <div><small>Patamar {template.tier} · {template.role}</small><b>{instance.name}</b></div>
                <div className="conflict-threat-tags">
                  {isFocused && <span className="conflict-focus-badge"><Crosshair size={11} /> Spotlight</span>}
                  {instance.defeated && <span className="tag">DERROTADA</span>}
                </div>
              </div>
              <div className="conflict-threat-stats">
                <span className="conflict-stat conflict-stat--difficulty"><small>Dificuldade</small><b>{template.difficulty}</b></span>
                <span className="conflict-stat conflict-stat--threshold"><small>Limiares</small><b>{template.majorThreshold ?? "—"} / {template.severeThreshold ?? "—"}</b></span>
                <ResourceMeter label="PV marcados" value={instance.hpMarked} max={template.maxHp} tone="hp" />
                <ResourceMeter label="Estresse" value={instance.stressMarked} max={template.maxStress} tone="stress" />
              </div>
              <details className="conflict-threat-details">
                <summary>Recursos e condições{instance.conditions.length ? ` · ${instance.conditions.length}` : ""}</summary>
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
              <div className="conflict-threat-actions">
                {template.attack && <Button size="sm" onClick={() => openThreatAction(instance.id)} disabled={instance.defeated}><Swords size={14} /> Atacar</Button>}
                <Button size="sm" variant={isFocused ? "default" : "outline"} onClick={() => focus({ kind: "threat", id: instance.id }, instance.name)}><Crosshair size={14} /> {isFocused ? "Em foco" : "Spotlight"}</Button>
                <Button size="sm" variant="outline" onClick={() => edit(draft => {
                  const row = draft.conflict?.threats.find(threat => threat.id === instance.id);
                  if (row) row.defeated = !row.defeated;
                })}>{instance.defeated ? "Reativar" : "Marcar derrotada"}</Button>
                <Button size="sm" variant="ghost" aria-label={`Remover ${instance.name} do conflito`} onClick={() => remove({ kind: "threat", id: instance.id }, instance.name)}><X size={15} /></Button>
              </div>
            </article>;
          })}
          {!conflict.threats.length && <p className="conflict-inline-empty">Nenhuma ameaça adicionada.</p>}
        </div>
      </section>
    </div>

    <div className="conflict-bottom-grid">
      <section className="panel panel-pad">
        <div className="conflict-section-heading"><div><p className="dossier-title">Ritmo narrativo</p><h3>Histórico de spotlight</h3></div><span className="tag">{conflict.spotlightHistory.length}</span></div>
        <div className="conflict-spotlight-history">
          {[...conflict.spotlightHistory].reverse().slice(0,18).map((event, index) => <div key={event.eventId} className="conflict-history-row">
            <span>{conflict.spotlightHistory.length - index}</span>
            <div><b>{event.name}</b><small>{event.kind === "survivor" ? "Sobrevivente" : "Ameaça"} · Dia {event.day} · {event.time}</small></div>
          </div>)}
          {!conflict.spotlightHistory.length && <p className="conflict-inline-empty">O histórico começa quando o mestre atribuir o primeiro spotlight.</p>}
        </div>
      </section>

      <section className="panel panel-pad">
        <div className="conflict-section-heading"><div><p className="dossier-title">Anotações</p><h3>Estado da cena</h3></div></div>
        <Field label="Notas do mestre" multiline value={notesDraft} onChange={setNotesDraft} placeholder="Cobertura, perigos, objetivos, mudanças no ambiente…" />
        <div className="conflict-notes-actions"><Button size="sm" variant="outline" disabled={notesDraft === conflict.notes} onClick={() => {
          const notes = notesDraft.trim().slice(0, 4000);
          edit(draft => { if (draft.conflict) draft.conflict.notes = notes; });
          setNotesDraft(notes);
          toast.success("Notas do conflito salvas");
        }}>Salvar notas</Button></div>
      </section>
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
