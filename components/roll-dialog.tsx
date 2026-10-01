"use client";

import { useRef, useState } from "react";
import { Crosshair, Dice5, Sparkles, Swords, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Pick } from "@/components/game-controls";
import { ConflictTrail } from "@/components/conflict-trail";
import { traitLabel, dualityLabel } from "@/lib/terminology";
import { addLog, content, traits, type GameState } from "@/lib/game";
import { equipmentModifiers, getPrimary, getSecondary } from "@/lib/equipment";
import { applyAttackResources, attackResourceState } from "@/lib/combat-resources";
import { publicConflictScene, resolveThreatAttack, type ThreatAttackResolution } from "@/lib/conflict";
import { parseWeaponDamage, resolveActionRoll, resolveAttackHit, resolveRollResources, resolveWeaponDamage, rollDie, type ActionOutcome, type Edge, type RollKind } from "@/lib/rolls";

type Edit = (fn: (draft: GameState) => void) => void;
export type RollRequest = { survivorId?: string; kind?: RollKind; trait?: string; weapon?: "primary" | "secondary"; experience?: "origin" | "free"; targetThreatId?: string };
type RollRecord = { outcome: ActionOutcome; kind: RollKind; trait: string; traitBonus: number; weaponName: string | null; actorId: string; experiences: string[]; symptom: number; other: number; equipment: number };
type DamageRecord = ReturnType<typeof resolveWeaponDamage> & { weaponName: string; formula: string; critical: boolean; equipment: number };

function outcomeLabel(roll: RollRecord) {
  if (roll.outcome.critical) return "Sucesso crítico";
  if (roll.outcome.success === null) return `Total com ${dualityLabel(roll.outcome.with)} · ${roll.kind === "attack" ? "acerto a confirmar" : "aguarda dificuldade"}`;
  return `${roll.outcome.success ? "Sucesso" : "Falha"} com ${dualityLabel(roll.outcome.with)}`;
}

function RollForm({ game, edit, request, onCompleted, playerMode = false }: { game: GameState; edit: Edit; request?: RollRequest; onCompleted: () => void; playerMode?: boolean }) {
  const requestedSurvivor = request?.survivorId ? game.survivors.find(s => s.id === request.survivorId) : null;
  const initialWeaponSlot: "primary" | "secondary" = request?.weapon
    ?? (requestedSurvivor && !requestedSurvivor.primary && requestedSurvivor.secondary ? "secondary" : "primary");
  const [person, setPerson] = useState(request?.survivorId ?? "");
  const [kind, setKind] = useState<RollKind>(request?.kind ?? "action");
  const [trait, setTrait] = useState(request?.trait ?? "Agilidade");
  const [weaponSlot, setWeaponSlot] = useState<"primary" | "secondary">(initialWeaponSlot);
  const [difficulty, setDifficulty] = useState(request?.kind === "attack" || request?.survivorId ? "" : "12");
  const [targetThreatId, setTargetThreatId] = useState(request?.targetThreatId ?? "");
  const [extra, setExtra] = useState("0");
  const [edge, setEdge] = useState<Edge>("none");
  const [experiences, setExperiences] = useState<Array<"origin" | "free">>(request?.experience ? [request.experience] : []);
  const [damageExtra, setDamageExtra] = useState("0");
  const [confirmedHit, setConfirmedHit] = useState(false);
  const [manualCritical, setManualCritical] = useState(false);
  const [last, setLast] = useState<RollRecord | null>(null);
  const [lastDamage, setLastDamage] = useState<DamageRecord | null>(null);
  const [lastTargetResolution, setLastTargetResolution] = useState<ThreatAttackResolution | null>(null);
  const [standaloneDamage, setStandaloneDamage] = useState<DamageRecord | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [rollError, setRollError] = useState("");
  const [spotlightBusy, setSpotlightBusy] = useState(false);
  const rollingRef = useRef(false);
  const survivor = game.survivors.find(s => s.id === person);
  const rollConflict = game.publicConflict
    ?? (game.conflict?.active ? publicConflictScene(game.conflict, game.survivors, survivor?.id ?? null) : undefined);
  const survivorInConflict = Boolean(survivor && rollConflict?.survivors.some(row => row.id === survivor.id));
  const origin = survivor ? content.origins.find(o => o.name === survivor.origin) : null;
  const experienceOptions = survivor ? [
    { id: "origin" as const, name: origin?.experience || survivor.origin },
    { id: "free" as const, name: survivor.freeExperience },
  ] : [];
  const weapon = kind === "attack" && survivor ? weaponSlot === "secondary"
    ? getSecondary(survivor.secondary)
    : getPrimary(survivor.primary) : null;
  const modifiers = survivor ? equipmentModifiers(survivor) : null;
  const rollTrait = kind === "attack" ? weapon?.trait ?? trait : trait;
  const equipmentBonus = modifiers?.traits[rollTrait] ?? 0;
  const attackResources = attackResourceState(game, survivor, kind === "attack" ? weapon?.name : undefined,
    kind === "attack" && weapon && "noise" in weapon ? weapon.noise : 0);
  const ammoNeeded = attackResources.ammoType;
  const ammoReady = attackResources.ammoReady;
  const ammoWarning = ammoNeeded && !ammoReady
    ? `Sem Munição de ${ammoNeeded} livre no inventário. O primeiro disparo desta categoria na cena compromete 1 unidade física.` : "";
  const masterThreats = game.conflict?.active ? game.conflict.threats : [];
  const publicThreats = game.publicConflict?.active ? game.publicConflict.threats : [];
  const sceneTargets = (masterThreats.length ? masterThreats : publicThreats).filter(threat => !threat.defeated);
  const targetOptions = sceneTargets.map(threat => ({ value: threat.id, label: threat.name }));
  const selectedMasterThreat = targetThreatId ? masterThreats.find(threat => threat.id === targetThreatId) ?? null : null;
  const selectedPublicThreat = targetThreatId ? publicThreats.find(threat => threat.id === targetThreatId) ?? null : null;
  const selectedTargetName = selectedMasterThreat?.name ?? selectedPublicThreat?.name ?? null;
  const targetSelectionMissing = Boolean(targetThreatId && !selectedTargetName);
  const manualTarget = difficulty.trim() === "" ? null : Number(difficulty);
  const target = targetThreatId ? selectedMasterThreat?.templateSnapshot.difficulty ?? null : manualTarget;
  const targetValid = targetThreatId
    ? !targetSelectionMissing
    : manualTarget === null || (Number.isInteger(manualTarget) && manualTarget >= 1 && manualTarget <= 99);
  const experienceCost = experiences.length;
  const handConflict = kind === "attack" && weaponSlot === "secondary" && getPrimary(survivor?.primary ?? "")?.hands === "Duas";
  const rollIssue = targetSelectionMissing
    ? "O alvo selecionado não está mais disponível nesta Cena de Conflito."
    : !targetValid
      ? `Informe ${kind === "attack" ? "uma defesa" : "uma dificuldade"} inteira entre 1 e 99 ou deixe o campo vazio.`
    : experienceCost > (survivor?.hope ?? 0)
      ? "Esperança insuficiente para as Experiências declaradas."
      : kind === "attack" && !weapon
        ? "Selecione um sobrevivente com uma arma equipada."
        : kind === "attack" && weapon && !parseWeaponDamage(weapon.damage)
          ? "A arma selecionada não possui uma fórmula de dano válida."
          : handConflict
            ? "A arma principal ocupa as duas mãos. Guarde-a antes de usar a secundária."
            : !ammoReady
              ? `Sem Munição de ${ammoNeeded} livre no inventário.`
              : "";
  const canRoll = !rollIssue && !isRolling;
  const attackResult = last?.kind === "attack" && last.actorId === person && last.weaponName === weapon?.name ? last : null;
  const attackHit = attackResult && targetValid
    ? lastTargetResolution?.targetId === targetThreatId && targetThreatId
      ? lastTargetResolution.hit
      : resolveAttackHit(attackResult.outcome, target, confirmedHit)
    : null;
  const displayedLast = last && attackResult ? { ...last, outcome: { ...last.outcome, difficulty: targetThreatId ? null : targetValid ? target : null, success: attackHit } } : last;

  function clearResult() { setLast(null); setLastDamage(null); setLastTargetResolution(null); setStandaloneDamage(null); setConfirmedHit(false); setRollError(""); }


  async function toggleSpotlightRequest() {
    if (!playerMode || !survivor || !rollConflict?.active || spotlightBusy) return;
    setSpotlightBusy(true);
    setRollError("");
    try {
      const action = rollConflict.spotlightRequested ? "cancel" : "request";
      const response = await fetch(`/api/campaign/spotlight?campanha=${encodeURIComponent(game.campaignId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar o pedido de Spotlight.");
      toast.success(action === "request" ? "Spotlight solicitado" : "Pedido de Spotlight cancelado");
      window.dispatchEvent(new CustomEvent("zona-morta:campaign-refresh"));
    } catch (error) {
      setRollError(error instanceof Error ? error.message : "Não foi possível atualizar o pedido de Spotlight.");
    } finally {
      setSpotlightBusy(false);
    }
  }

  function calculateDamage(critical: boolean): DamageRecord | null {
    if (!survivor || !weapon || handConflict) return null;
    const formula = parseWeaponDamage(weapon.damage);
    if (!formula) return null;
    const proficiency = Math.max(1, Math.min(9, Math.trunc(survivor.proficiency ?? 1)));
    const equipmentDamage = weaponSlot === "primary" ? modifiers?.primaryDamage ?? 0 : 0;
    const extraDamage = Math.max(-99, Math.min(99, Math.trunc(Number(damageExtra) || 0)));
    const dice = Array.from({ length: proficiency }, () => rollDie(formula.die));
    const result = resolveWeaponDamage(dice, formula.die, formula.flat, extraDamage + equipmentDamage, critical);
    return { ...result, weaponName: weapon.name, formula: `${proficiency}d${formula.die}${formula.flat >= 0 ? "+" : ""}${formula.flat}`, critical, equipment: equipmentDamage };
  }

  function damageLog(record: DamageRecord, status: string) {
    const situational = record.extra - record.equipment;
    return `${survivor?.name ?? "Sobrevivente"}: ${record.weaponName} — ${record.formula}${record.equipment ? ` +${record.equipment} da Faca pequena` : ""}${situational ? ` ${situational >= 0 ? "+" : "−"}${Math.abs(situational)} situacional` : ""}${record.critical ? ` + ${record.criticalBonus} crítico` : ""} = ${record.total} dano físico (dados: ${record.dice.join(", ")}). ${status} Barulho é aplicado por disparo e uma unidade física de munição é comprometida na primeira ação compatível da cena.`;
  }

  async function resolveSceneTarget(attackTotal: number, critical: boolean, damageTotal: number): Promise<ThreatAttackResolution | null> {
    if (!targetThreatId) return null;
    if (selectedMasterThreat) return resolveThreatAttack(selectedMasterThreat, attackTotal, critical, damageTotal);

    const response = await fetch(`/api/campaign/target?campanha=${encodeURIComponent(game.campaignId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId: targetThreatId, attackTotal, critical, damageTotal }),
    });
    const payload = await response.json() as Partial<ThreatAttackResolution> & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Não foi possível resolver o alvo.");
    if (typeof payload.targetId !== "string" || typeof payload.targetName !== "string" || typeof payload.hit !== "boolean"
      || !payload.damageTier || typeof payload.damageTier.label !== "string" || !Number.isInteger(payload.damageTier.hpMarks)) {
      throw new Error("A resposta do alvo veio incompleta.");
    }
    return payload as ThreatAttackResolution;
  }

  async function rollAction(keepOpen = false) {
    if (rollingRef.current) return;
    if (!canRoll) {
      if (rollIssue) setRollError(rollIssue);
      return;
    }
    rollingRef.current = true;
    setIsRolling(true);
    setRollError("");

    try {
      const traitBonus = survivor?.attributes[rollTrait] ?? 0;
      const symptom = survivor?.infection === "Sintomático" && ["Agilidade", "Força"].includes(rollTrait) ? -1 : 0;
      const other = Math.max(-99, Math.min(99, Math.trunc(Number(extra) || 0)));
      const used = experienceOptions.filter(option => experiences.includes(option.id)).map(option => option.name);
      const result = resolveActionRoll({
        hopeDie: rollDie(12), fearDie: rollDie(12), trait: traitBonus, experience: used.length * 2,
        other: other + equipmentBonus, symptom, edge, edgeDie: edge === "none" ? null : rollDie(6), difficulty: target,
      });
      const damage = kind === "attack" ? calculateDamage(result.critical) : null;
      const sceneResolution = kind === "attack" && damage && targetThreatId
        ? await resolveSceneTarget(result.total, result.critical, damage.total)
        : null;
      const resolvedOutcome = sceneResolution ? { ...result, success: sceneResolution.hit, difficulty: null } : result;
      const record: RollRecord = { outcome: resolvedOutcome, kind, trait: rollTrait, traitBonus, weaponName: weapon?.name ?? null, actorId: person, experiences: used, symptom, other, equipment: equipmentBonus };
      const lead = `${survivor?.name ?? "Rolagem livre"}: ${kind === "attack" ? `ataque com ${weapon?.name}` : kind === "reaction" ? "reação" : "ação"} (${traitLabel(rollTrait)})`;
      const edgeLabel = result.edgeDie ? ` ${edge === "advantage" ? "+" : "−"} d6(${result.edgeDie})` : "";
      const targetLabel = sceneResolution
        ? `Alvo: ${sceneResolution.targetName}. Resultado contra o alvo: ${sceneResolution.hit ? "ACERTO" : "FALHA"}`
        : target === null ? kind === "attack" ? "Defesa a definir" : "Dificuldade a definir" : `${kind === "attack" ? "Defesa" : "Dificuldade"} ${target}`;
      const experienceLabel = used.length ? ` · Experiências: ${used.join(" e ")} (−${used.length} Esperança)` : "";
      const fixedBonus = traitBonus + used.length * 2 + other + symptom + equipmentBonus;
      const text = `${lead}: Esperança ${result.hopeDie} + Medo ${result.fearDie} ${fixedBonus >= 0 ? "+" : "−"} ${Math.abs(fixedBonus)}${edgeLabel} = ${result.total}; ${targetLabel}. ${outcomeLabel(record)}${experienceLabel}${equipmentBonus ? ` · ${equipmentBonus} por equipamento` : ""}${symptom ? " · −1 por sintomas" : ""}${kind === "reaction" ? " · reação sem ganho de Esperança/Medo" : ""}.`;
      const beforeHope = survivor?.hope ?? null;
      const beforeStress = survivor?.stress ?? null;
      const beforeFear = game.fear;
      const resourcePreview = resolveRollResources({
        hope: beforeHope, stress: beforeStress, fear: beforeFear,
        experienceCost: used.length, reaction: kind === "reaction", outcome: result,
      });
      const attackNoise = kind === "attack" ? attackResources.noise : 0;
      const spendsAmmo = kind === "attack" && attackResources.spendsAmmo;
      const tierText = sceneResolution
        ? `Faixa de dano: ${sceneResolution.damageTier.label.toUpperCase()} (${sceneResolution.damageTier.hpMarks} PV).`
        : "";
      const damageStatus = sceneResolution
        ? sceneResolution.hit
          ? `Alvo: ${sceneResolution.targetName}. Acerto confirmado. ${tierText} Dano ainda não aplicado.`
          : `Alvo: ${sceneResolution.targetName}. Falha: dano rolado, não aplicado. Faixa potencial: ${sceneResolution.damageTier.label.toUpperCase()} (${sceneResolution.damageTier.hpMarks} PV).`
        : result.success === false ? "Falha: dano rolado, não aplicado."
          : result.success === null ? "Dano potencial; acerto pendente de confirmação. Compare aos limiares do alvo."
          : "Dano do acerto. Compare aos limiares do alvo.";

      edit(draft => {
        const actor = draft.survivors.find(s => s.id === person);
        if (actor) {
          actor.hope = resourcePreview.hope!;
          actor.stress = resourcePreview.stress!;
        }
        draft.fear = resourcePreview.fear;
        const spent = kind === "attack" && weapon && actor
          ? applyAttackResources(draft, actor.id, weapon.name, "noise" in weapon ? weapon.noise : 0)
          : null;
        if (kind === "attack" && spent && !spent.ok) return;
        if (damage) addLog(draft, "dano", damageLog(damage, damageStatus), actor?.id);
        addLog(draft, "dados", text +
          (spendsAmmo ? ` · 1 unidade de Munição de ${ammoNeeded} comprometida até a próxima cena.` : ammoNeeded ? ` · Munição de ${ammoNeeded} já comprometida nesta cena.` : "") +
          (attackNoise ? ` · Barulho +${attackNoise}.` : ""), actor?.id);
      });

      setLast(record);
      setLastDamage(damage);
      setLastTargetResolution(sceneResolution);
      setStandaloneDamage(null);
      setConfirmedHit(false);
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("zona-morta:roll-completed"));
        if (keepOpen) {
          rollingRef.current = false;
          setIsRolling(false);
        } else {
          onCompleted();
        }
      }, 80);
    } catch (error) {
      setRollError(error instanceof Error ? error.message : "Não foi possível concluir a rolagem.");
      rollingRef.current = false;
      setIsRolling(false);
    }
  }

  function rollStandaloneDamage() {
    if (!survivor || !weapon || standaloneDamage || handConflict) return;
    const record = calculateDamage(manualCritical);
    if (!record) return;
    edit(draft => addLog(draft, "dano", damageLog(record, "Dano avulso; confirme quando se aplica."), survivor.id));
    setStandaloneDamage(record);
  }

  return <div className="roll-form" onKeyDown={event => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    const targetElement = event.target as HTMLElement;
    if (["TEXTAREA", "BUTTON", "SELECT"].includes(targetElement.tagName) || targetElement.isContentEditable) return;
    event.preventDefault();
    rollAction(false);
  }}>
    <DialogHeader><p className="dossier-title">Dados de dualidade</p><DialogTitle>Rolagem de {kind === "attack" ? "ataque" : kind === "reaction" ? "reação" : "ação"}</DialogTitle>
      <DialogDescription>Defina a ação e seus riscos com o mestre. Declare Experiências e modificadores antes de rolar.</DialogDescription></DialogHeader>
    {rollConflict?.active && survivorInConflict && <div className="roll-conflict-dock">
      <div className="roll-conflict-dock-heading">
        <div><span><Swords size={13} /> Conflito ativo</span>
          <small>{kind === "attack" ? (selectedTargetName ? <>Alvo <b>{selectedTargetName}</b></> : "Clique em uma ameaça para escolher o alvo") : "Acompanhe o Spotlight sem sair da rolagem"}</small></div>
        {playerMode && <Button type="button" size="sm" variant={rollConflict.spotlightRequested ? "secondary" : "ghost"} disabled={spotlightBusy || (rollConflict.spotlight?.kind === "survivor" && rollConflict.spotlight.id === survivor?.id)} onClick={() => void toggleSpotlightRequest()}>
          <Crosshair size={13} /> {rollConflict.spotlight?.kind === "survivor" && rollConflict.spotlight.id === survivor?.id ? "Seu Spotlight" : rollConflict.spotlightRequested ? "Spotlight solicitado" : "Pedir Spotlight"}
        </Button>}
      </div>
      <div className="roll-conflict-trail">
        <ConflictTrail
          survivors={rollConflict.survivors.map(row => ({ ...row, requested: row.id === survivor?.id && rollConflict.spotlightRequested }))}
          threats={rollConflict.threats}
          spotlight={rollConflict.spotlight}
          selfId={survivor?.id ?? null}
          targetId={targetThreatId}
          mode="player"
          onThreatTarget={kind === "attack" ? id => { setTargetThreatId(id); setDifficulty(""); clearResult(); } : undefined}
        />
      </div>
    </div>}
    <div className="roll-modes" role="group" aria-label="Tipo de rolagem">
      {([ ["action", "Ação", Dice5], ["reaction", "Reação", Zap], ["attack", "Ataque", Swords] ] as const).map(([id, label, Icon]) =>
        <button type="button" key={id} aria-pressed={kind === id} onClick={() => { setKind(id); setDifficulty(id === "attack" ? "" : "12"); clearResult(); }}><Icon size={16} aria-hidden="true" />{label}</button>)}
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      {request?.survivorId ? <div className="roll-locked"><span>Sobrevivente</span><strong>{survivor?.name ?? "Não encontrado"}</strong></div> : <Pick label="Sobrevivente" value={person} options={game.survivors.map(s => ({ value: s.id, label: s.name }))} onChange={value => {
        const next = game.survivors.find(s => s.id === value);
        setPerson(value); setExperiences([]); setWeaponSlot(next?.primary ? "primary" : next?.secondary ? "secondary" : "primary"); clearResult();
      }} placeholder="Rolagem livre" />}
      {kind === "attack" ? <Pick label="Arma equipada" value={weaponSlot} options={[{ value: "primary", label: survivor?.primary || "Primária" }, ...(survivor?.secondary ? [{ value: "secondary", label: survivor.secondary }] : [])]} onChange={value => { setWeaponSlot(value as "primary" | "secondary"); clearResult(); }} disabled={!survivor} />
        : <Pick label="Atributo" value={trait} options={traits.map(value => ({ value, label: traitLabel(value) }))} onChange={value => { setTrait(value); clearResult(); }} />}
      {kind === "attack" && targetOptions.length > 0 && <Pick label="Alvo da Cena de Conflito" value={targetThreatId} options={targetOptions} onChange={value => { setTargetThreatId(value); setDifficulty(""); clearResult(); }} placeholder="Sem alvo definido" />}
      {(kind !== "attack" || !targetThreatId) && <Field label={kind === "attack" ? "Defesa manual (opcional)" : "Dificuldade (opcional)"} value={difficulty} onChange={value => { setDifficulty(value); if (kind === "attack") setConfirmedHit(false); else clearResult(); }} type="number" placeholder="Mestre decide" />}
      {kind === "attack" && targetThreatId && <div className="roll-target-locked">
        <span>Alvo selecionado</span>
        <strong>{selectedTargetName ?? "Alvo indisponível"}</strong>
        <small>{selectedMasterThreat
          ? `Dificuldade ${selectedMasterThreat.templateSnapshot.difficulty} · Limiares ${selectedMasterThreat.templateSnapshot.majorThreshold ?? "—"} / ${selectedMasterThreat.templateSnapshot.severeThreshold ?? "—"}`
          : "Dificuldade e Limiares são resolvidos em sigilo pelo sistema."}</small>
        <button type="button" onClick={() => { setTargetThreatId(""); clearResult(); }}>Usar defesa manual</button>
      </div>}
    </div>
    {kind === "attack" && <div className="roll-weapon-note"><Crosshair size={17} aria-hidden="true" /><span>{weapon ? `${weapon.name} · ${traitLabel(rollTrait)} ${survivor && survivor.attributes[rollTrait] >= 0 ? "+" : ""}${survivor?.attributes[rollTrait] ?? 0} · ${weapon.range} · ${weapon.damage}` : "Escolha um sobrevivente e sua arma equipada."}</span></div>}
    {equipmentBonus !== 0 && <p className="roll-hint">{survivor?.protection}: {equipmentBonus} em {traitLabel(rollTrait)}, já incluído nesta rolagem.</p>}
    {kind === "attack" && weaponSlot === "primary" && Boolean(modifiers?.primaryDamage) && <p className="roll-hint">Faca pequena: +1 ao dano desta arma, incluído automaticamente.</p>}
    {ammoWarning && <p className="inventory-hint inventory-danger" role="status">{ammoWarning} Disparos seguintes da mesma categoria nesta cena não comprometem outra unidade.</p>}
    {handConflict && <p className="inventory-hint inventory-danger" role="alert">A arma principal ocupa as duas mãos. Guarde-a no inventário para usar a secundária.</p>}
    <details className="roll-advanced">
      <summary>Opções avançadas{kind === "attack" ? " e dano avulso" : ""}</summary>
      <div className="roll-advanced-body">
        <Field label="Outros modificadores" value={extra} onChange={value => { setExtra(value); clearResult(); }} type="number" />
        {kind === "attack" && <>
          <Field label="Bônus situacional ao dano" value={damageExtra} onChange={value => { setDamageExtra(value); setStandaloneDamage(null); }} type="number" />
          <div className="roll-damage-settings"><label><Checkbox checked={manualCritical} onCheckedChange={checked => { setManualCritical(checked === true); setStandaloneDamage(null); }} /> Crítico no dano avulso</label></div>
          <div className="roll-damage-actions"><Button type="button" size="sm" variant="outline" disabled={Boolean(standaloneDamage) || handConflict || !weapon} onClick={rollStandaloneDamage}>Rolar dano avulso</Button>
            {standaloneDamage && <Button type="button" size="sm" variant="ghost" onClick={() => setStandaloneDamage(null)}>Novo dano avulso</Button>}</div>
          {standaloneDamage && <output className="roll-damage-result"><strong>{standaloneDamage.total} dano físico avulso</strong><span>{standaloneDamage.formula}{standaloneDamage.equipment ? ` +${standaloneDamage.equipment} equipamento` : ""}{standaloneDamage.extra - standaloneDamage.equipment ? ` ${standaloneDamage.extra - standaloneDamage.equipment >= 0 ? "+" : "−"} ${Math.abs(standaloneDamage.extra - standaloneDamage.equipment)} situacional` : ""}{standaloneDamage.critical ? ` + ${standaloneDamage.criticalBonus} crítico` : ""} · dados {standaloneDamage.dice.join(", ")}</span></output>}
        </>}
      </div>
    </details>
    <fieldset className="roll-experiences"><legend>Experiências <small>+2 cada · 1 Esperança por Experiência pertinente</small></legend>
      {experienceOptions.length ? experienceOptions.map(option => <label key={option.id} className="roll-experience">
        <Checkbox checked={experiences.includes(option.id)} disabled={!experiences.includes(option.id) && experienceCost >= (survivor?.hope ?? 0)} onCheckedChange={checked => {
          setExperiences(current => checked ? [...current, option.id] : current.filter(id => id !== option.id)); clearResult();
        }} /><span>{option.name}</span><b>+2</b>
      </label>) : <p className="text-sm subtle">Escolha um sobrevivente para utilizar Experiências.</p>}
      {experienceCost > 0 && <p className="roll-cost">Custo declarado: {experienceCost} Esperança · disponível antes da rolagem: {survivor?.hope ?? 0}</p>}
    </fieldset>
    <div className="roll-edge"><span>Condição da rolagem</span><div role="group" aria-label="Vantagem ou desvantagem">
      {([ ["none", "Normal"], ["advantage", "Vantagem +d6"], ["disadvantage", "Desvantagem −d6"] ] as const).map(([value, label]) =>
        <button type="button" key={value} aria-pressed={edge === value} onClick={() => { setEdge(value); clearResult(); }}>{label}</button>)}
    </div></div>
    {kind === "reaction" && <p className="roll-hint">Reações não geram Esperança ou Medo. Um crítico não recupera Estresse.</p>}
    {!targetValid && <p className="text-sm text-red-700" role="alert">{targetSelectionMissing ? "O alvo selecionado não está mais disponível." : <>Informe {kind === "attack" ? "uma defesa" : "uma dificuldade"} inteira entre 1 e 99 ou deixe o campo vazio.</>}</p>}
    {rollError && <p className="roll-error" role="alert">{rollError}</p>}
    <div className="roll-actions"><Button disabled={!canRoll} aria-busy={isRolling} onClick={event => rollAction(event.shiftKey)}><Dice5 size={17} /> {isRolling ? "Rolando…" : <>Rolar {kind === "attack" ? "ataque + dano" : kind === "reaction" ? "reação" : "Esperança/Medo"}{experienceCost ? ` · ${experienceCost} Esperança` : ""}{kind === "attack" && attackResources.spendsAmmo ? " · 1 munição" : ""}</>}</Button>
      {survivor && <span>Esperança atual: <b>{survivor.hope}/6</b></span>}
      <small className="roll-shortcut-hint">Enter rola · Shift + clique mantém aberto</small></div>
    {displayedLast && <div className="roll-result" role="status" aria-live="polite">
      <div className="roll-result-heading"><b>{outcomeLabel(displayedLast)}</b><span>{lastTargetResolution ? `contra ${lastTargetResolution.targetName}` : displayedLast.outcome.difficulty === null ? kind === "attack" ? "Defesa não informada" : "Dificuldade não informada" : `contra ${displayedLast.outcome.difficulty}`}</span></div>
      <div className="roll-dice"><div className="hope"><Sparkles size={15} aria-hidden="true" /><span>Esperança</span><strong>{last.outcome.hopeDie}</strong></div><div className="fear"><Zap size={15} aria-hidden="true" /><span>Medo</span><strong>{last.outcome.fearDie}</strong></div><div className="total"><span>Total</span><strong>{last.outcome.total}</strong></div></div>
      <p className="roll-breakdown">{traitLabel(last.trait)}: {last.traitBonus >= 0 ? "+" : ""}{last.traitBonus} · Experiências: +{last.experiences.length * 2}{last.experiences.length ? ` (−${last.experiences.length} Esperança)` : ""} · outros: {last.other >= 0 ? "+" : ""}{last.other}{last.equipment ? ` · equipamento: ${last.equipment}` : ""}{last.symptom ? " · sintomas: −1" : ""}{last.outcome.edgeDie ? ` · ${last.outcome.edge === "advantage" ? "vantagem" : "desvantagem"}: ${last.outcome.edge === "advantage" ? "+" : "−"}${last.outcome.edgeDie}` : ""}.</p>
      <p className="roll-hint">{last.kind === "reaction" ? "Reação: nenhum recurso gerado." : last.outcome.critical ? "Crítico: +1 Esperança e limpa 1 Estresse (respeitando os limites)." : last.outcome.with === "Hope" ? "+1 Esperança (até o limite de 6)." : "+1 Medo para o mestre (até o limite de 12)."} O mestre descreve a consequência na ficção.</p>
    </div>}
    {kind === "attack" && weapon && <div className="roll-damage-panel"><div className="roll-damage-heading"><b>Dano da arma</b><span>Proficiência {survivor?.proficiency ?? 1} · {weapon.damage} físico</span></div>
      {attackResult && lastDamage && <>
        {attackHit === null && !targetValid ? <p className="roll-hint" role="alert">Corrija a defesa para avaliar o acerto; os dados já rolados serão mantidos.</p> : null}
        {attackHit === null && targetValid && <p className="roll-hint">Acerto a confirmar · dano potencial. Informe a defesa acima ou confirme o acerto com o mestre antes de aplicá-lo.</p>}
        {attackHit === false && <p className="roll-hint" role="status">Falha · dano rolado, não aplicado.</p>}
        {attackHit === true && <p className="roll-hint" role="status">{lastDamage.critical ? "Crítico: acerto automático" : "Acerto confirmado"}{lastTargetResolution ? ` · Dano ${lastTargetResolution.damageTier.label} → ${lastTargetResolution.damageTier.hpMarks} PV a marcar` : " · dano aplicável após comparar aos limiares"}.</p>}
        {target === null && targetValid && !targetThreatId && !attackResult.outcome.critical && <label className="roll-confirm"><Checkbox checked={confirmedHit} onCheckedChange={checked => setConfirmedHit(checked === true)} /> Mestre confirmou o acerto sem defesa informada</label>}
        <output className={`roll-damage-result${attackHit === false ? " is-miss" : attackHit === null ? " is-pending" : ""}`}><strong>{lastDamage.total} dano físico{attackHit === false ? " · não aplicado" : attackHit === null ? " · potencial" : ""}</strong><span>{lastDamage.formula}{lastDamage.equipment ? ` +${lastDamage.equipment} equipamento` : ""}{lastDamage.extra - lastDamage.equipment ? ` ${lastDamage.extra - lastDamage.equipment >= 0 ? "+" : "−"} ${Math.abs(lastDamage.extra - lastDamage.equipment)} situacional` : ""}{lastDamage.critical ? ` + ${lastDamage.criticalBonus} crítico` : ""} · dados {lastDamage.dice.join(", ")}</span></output>
      </>}
      <p className="roll-hint">{lastTargetResolution ? "A faixa de dano foi calculada automaticamente, mas nenhum PV foi marcado no alvo nesta etapa." : "Sem um alvo da Cena de Conflito, compare o dano aos limiares manualmente."} O sistema aplica o Barulho da arma a cada ação de disparo e compromete 1 unidade física compatível apenas na primeira ação daquele tipo de munição na cena; ela é consumida ao iniciar a próxima cena.</p>
    </div>}
  </div>;
}

export function RollDialog({ game, edit, request, open, onOpenChange, playerMode = false }: {
  game: GameState; edit: Edit; request?: RollRequest; open?: boolean; onOpenChange?: (open: boolean) => void; playerMode?: boolean;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const visible = open ?? localOpen;
  function changeOpen(value: boolean) {
    if (open === undefined) setLocalOpen(value);
    onOpenChange?.(value);
  }
  return <Dialog open={visible} onOpenChange={changeOpen}>
    {open === undefined && <DialogTrigger asChild><Button size="sm"><Dice5 /> Rolar dados</Button></DialogTrigger>}
    {visible && <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[720px]"><RollForm game={game} edit={edit} request={request} playerMode={playerMode} onCompleted={() => changeOpen(false)} /></DialogContent>}
  </Dialog>;
}
