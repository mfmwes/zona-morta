"use client";

import { useState } from "react";
import { Crosshair, Dice5, Sparkles, Swords, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Pick } from "@/components/game-controls";
import { addLog, content, traits, type GameState } from "@/lib/game";
import { equipmentModifiers, getPrimary, getSecondary } from "@/lib/equipment";
import { applyAttackResources, attackResourceState } from "@/lib/combat-resources";
import { parseWeaponDamage, resolveActionRoll, resolveAttackHit, resolveRollResources, resolveWeaponDamage, rollDie, type ActionOutcome, type Edge, type RollKind } from "@/lib/rolls";

type Edit = (fn: (draft: GameState) => void) => void;
export type RollRequest = { survivorId?: string; kind?: RollKind; trait?: string; weapon?: "primary" | "secondary"; experience?: "origin" | "free" };
type RollRecord = { outcome: ActionOutcome; kind: RollKind; trait: string; traitBonus: number; weaponName: string | null; actorId: string; experiences: string[]; symptom: number; other: number; equipment: number };
type DamageRecord = ReturnType<typeof resolveWeaponDamage> & { weaponName: string; formula: string; critical: boolean; equipment: number };

function outcomeLabel(roll: RollRecord) {
  if (roll.outcome.critical) return "Sucesso crítico";
  if (roll.outcome.success === null) return `Total com ${roll.outcome.with} · ${roll.kind === "attack" ? "acerto a confirmar" : "aguarda dificuldade"}`;
  return `${roll.outcome.success ? "Sucesso" : "Falha"} com ${roll.outcome.with}`;
}

function RollForm({ game, edit, request }: { game: GameState; edit: Edit; request?: RollRequest }) {
  const [person, setPerson] = useState(request?.survivorId ?? "");
  const [kind, setKind] = useState<RollKind>(request?.kind ?? "action");
  const [trait, setTrait] = useState(request?.trait ?? "Agilidade");
  const [weaponSlot, setWeaponSlot] = useState<"primary" | "secondary">(request?.weapon ?? "primary");
  const [difficulty, setDifficulty] = useState(request?.kind === "attack" || request?.survivorId ? "" : "12");
  const [extra, setExtra] = useState("0");
  const [edge, setEdge] = useState<Edge>("none");
  const [experiences, setExperiences] = useState<Array<"origin" | "free">>(request?.experience ? [request.experience] : []);
  const [damageExtra, setDamageExtra] = useState("0");
  const [confirmedHit, setConfirmedHit] = useState(false);
  const [manualCritical, setManualCritical] = useState(false);
  const [last, setLast] = useState<RollRecord | null>(null);
  const [lastDamage, setLastDamage] = useState<DamageRecord | null>(null);
  const [standaloneDamage, setStandaloneDamage] = useState<DamageRecord | null>(null);
  const survivor = game.survivors.find(s => s.id === person);
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
    ? `Sem carga de ${ammoNeeded} pronta para esta cena. A primeira ação de disparo da cena consome 1 carga compatível.` : "";
  const target = difficulty.trim() === "" ? null : Number(difficulty);
  const targetValid = target === null || (Number.isInteger(target) && target >= 1 && target <= 99);
  const experienceCost = experiences.length;
  const handConflict = kind === "attack" && weaponSlot === "secondary" && getPrimary(survivor?.primary ?? "")?.hands === "Duas";
  const canRoll = targetValid && experienceCost <= (survivor?.hope ?? 0) && (kind !== "attack" || Boolean(weapon && parseWeaponDamage(weapon.damage))) && !handConflict && ammoReady;
  const attackResult = last?.kind === "attack" && last.actorId === person && last.weaponName === weapon?.name ? last : null;
  const attackHit = attackResult && targetValid ? resolveAttackHit(attackResult.outcome, target, confirmedHit) : null;
  const displayedLast = last && attackResult ? { ...last, outcome: { ...last.outcome, difficulty: targetValid ? target : null, success: attackHit } } : last;

  function clearResult() { setLast(null); setLastDamage(null); setStandaloneDamage(null); setConfirmedHit(false); }

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
    return `${survivor?.name ?? "Sobrevivente"}: ${record.weaponName} — ${record.formula}${record.equipment ? ` +${record.equipment} da Faca pequena` : ""}${situational ? ` ${situational >= 0 ? "+" : "−"}${Math.abs(situational)} situacional` : ""}${record.critical ? ` + ${record.criticalBonus} crítico` : ""} = ${record.total} dano físico (dados: ${record.dice.join(", ")}). ${status} Compare aos limiares do alvo; Barulho é aplicado por disparo e a carga de munição é consumida automaticamente na primeira ação compatível da cena.`;
  }

  function rollAction() {
    if (!canRoll) return;
    const traitBonus = survivor?.attributes[rollTrait] ?? 0;
    const symptom = survivor?.infection === "Sintomático" && ["Agilidade", "Força"].includes(rollTrait) ? -1 : 0;
    const other = Math.max(-99, Math.min(99, Math.trunc(Number(extra) || 0)));
    const used = experienceOptions.filter(option => experiences.includes(option.id)).map(option => option.name);
    const result = resolveActionRoll({
      hopeDie: rollDie(12), fearDie: rollDie(12), trait: traitBonus, experience: used.length * 2,
      other: other + equipmentBonus, symptom, edge, edgeDie: edge === "none" ? null : rollDie(6), difficulty: target,
    });
    const record: RollRecord = { outcome: result, kind, trait: rollTrait, traitBonus, weaponName: weapon?.name ?? null, actorId: person, experiences: used, symptom, other, equipment: equipmentBonus };
    const lead = `${survivor?.name ?? "Rolagem livre"}: ${kind === "attack" ? `ataque com ${weapon?.name}` : kind === "reaction" ? "reação" : "ação"} (${rollTrait})`;
    const edgeLabel = result.edgeDie ? ` ${edge === "advantage" ? "+" : "−"} d6(${result.edgeDie})` : "";
    const targetLabel = target === null ? kind === "attack" ? "Defesa a definir" : "Dificuldade a definir" : `${kind === "attack" ? "Defesa" : "Dificuldade"} ${target}`;
    const experienceLabel = used.length ? ` · Experiences: ${used.join(" e ")} (−${used.length} Hope)` : "";
    const fixedBonus = traitBonus + used.length * 2 + other + symptom + equipmentBonus;
    const text = `${lead}: Hope ${result.hopeDie} + Fear ${result.fearDie} ${fixedBonus >= 0 ? "+" : "−"} ${Math.abs(fixedBonus)}${edgeLabel} = ${result.total}; ${targetLabel}. ${outcomeLabel(record)}${experienceLabel}${equipmentBonus ? ` · ${equipmentBonus} por equipamento` : ""}${symptom ? " · −1 por sintomas" : ""}${kind === "reaction" ? " · reação sem ganho de Hope/Fear" : ""}.`;
    const beforeHope = survivor?.hope ?? null;
    const beforeStress = survivor?.stress ?? null;
    const beforeFear = game.fear;
    const resourcePreview = resolveRollResources({
      hope: beforeHope, stress: beforeStress, fear: beforeFear,
      experienceCost: used.length, reaction: kind === "reaction", outcome: result,
    });
    const damage = kind === "attack" ? calculateDamage(result.critical) : null;
    const attackNoise = kind === "attack" ? attackResources.noise : 0;
    const spendsAmmo = kind === "attack" && attackResources.spendsAmmo;
    const damageStatus = result.success === false ? "Falha: dano rolado, não aplicado."
      : result.success === null ? "Dano potencial; acerto pendente de confirmação."
      : "Dano do acerto.";
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
        (spendsAmmo ? ` · 1 carga de ${ammoNeeded} consumida para a cena.` : ammoNeeded ? ` · carga de ${ammoNeeded} já aberta nesta cena.` : "") +
        (attackNoise ? ` · Barulho +${attackNoise}.` : ""), actor?.id);
    });
    setLast(record); setLastDamage(damage); setStandaloneDamage(null); setConfirmedHit(false);
  }

  function rollStandaloneDamage() {
    if (!survivor || !weapon || standaloneDamage || handConflict) return;
    const record = calculateDamage(manualCritical);
    if (!record) return;
    edit(draft => addLog(draft, "dano", damageLog(record, "Dano avulso; confirme quando se aplica."), survivor.id));
    setStandaloneDamage(record);
  }

  return <>
    <DialogHeader><p className="dossier-title">Dados de dualidade</p><DialogTitle>Rolagem de {kind === "attack" ? "ataque" : kind === "reaction" ? "reação" : "ação"}</DialogTitle>
      <DialogDescription>Defina a ação e seus riscos com o mestre. Declare Experiences e modificadores antes de rolar.</DialogDescription></DialogHeader>
    <div className="roll-modes" role="group" aria-label="Tipo de rolagem">
      {([ ["action", "Ação", Dice5], ["reaction", "Reação", Zap], ["attack", "Ataque", Swords] ] as const).map(([id, label, Icon]) =>
        <button type="button" key={id} aria-pressed={kind === id} onClick={() => { setKind(id); setDifficulty(id === "attack" ? "" : "12"); clearResult(); }}><Icon size={16} aria-hidden="true" />{label}</button>)}
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      {request?.survivorId ? <div className="roll-locked"><span>Sobrevivente</span><strong>{survivor?.name ?? "Não encontrado"}</strong></div> : <Pick label="Sobrevivente" value={person} options={game.survivors.map(s => ({ value: s.id, label: s.name }))} onChange={value => { setPerson(value); setExperiences([]); setWeaponSlot("primary"); clearResult(); }} placeholder="Rolagem livre" />}
      {kind === "attack" ? <Pick label="Arma equipada" value={weaponSlot} options={[{ value: "primary", label: survivor?.primary || "Primária" }, ...(survivor?.secondary ? [{ value: "secondary", label: survivor.secondary }] : [])]} onChange={value => { setWeaponSlot(value as "primary" | "secondary"); clearResult(); }} disabled={!survivor} />
        : <Pick label="Atributo" value={trait} options={traits} onChange={value => { setTrait(value); clearResult(); }} />}
      <Field label={kind === "attack" ? "Defesa do alvo (opcional)" : "Dificuldade (opcional)"} value={difficulty} onChange={value => { setDifficulty(value); if (kind === "attack") setConfirmedHit(false); else clearResult(); }} type="number" placeholder="Mestre decide" />
      <Field label="Outros modificadores" value={extra} onChange={value => { setExtra(value); clearResult(); }} type="number" />
    </div>
    {kind === "attack" && <div className="roll-weapon-note"><Crosshair size={17} aria-hidden="true" /><span>{weapon ? `${weapon.name} · ${rollTrait} ${survivor && survivor.attributes[rollTrait] >= 0 ? "+" : ""}${survivor?.attributes[rollTrait] ?? 0} · ${weapon.range} · ${weapon.damage}` : "Escolha um sobrevivente e sua arma equipada."}</span></div>}
    {equipmentBonus !== 0 && <p className="roll-hint">{survivor?.protection}: {equipmentBonus} em {rollTrait}, já incluído nesta rolagem.</p>}
    {kind === "attack" && weaponSlot === "primary" && Boolean(modifiers?.primaryDamage) && <p className="roll-hint">Faca pequena: +1 ao dano desta arma, incluído automaticamente.</p>}
    {kind === "attack" && <Field label="Bônus situacional ao dano" value={damageExtra} onChange={value => { setDamageExtra(value); setStandaloneDamage(null); }} type="number" />}
    {ammoWarning && <p className="inventory-hint inventory-danger" role="status">{ammoWarning} O aplicativo não desconta uma carga a cada tiro.</p>}
    {handConflict && <p className="inventory-hint inventory-danger" role="alert">A arma principal ocupa as duas mãos. Guarde-a no inventário para usar a secundária.</p>}
    <fieldset className="roll-experiences"><legend>Experiences <small>+2 cada · 1 Hope por Experience pertinente</small></legend>
      {experienceOptions.length ? experienceOptions.map(option => <label key={option.id} className="roll-experience">
        <Checkbox checked={experiences.includes(option.id)} disabled={!experiences.includes(option.id) && experienceCost >= (survivor?.hope ?? 0)} onCheckedChange={checked => {
          setExperiences(current => checked ? [...current, option.id] : current.filter(id => id !== option.id)); clearResult();
        }} /><span>{option.name}</span><b>+2</b>
      </label>) : <p className="text-sm subtle">Escolha um sobrevivente para utilizar Experiences.</p>}
      {experienceCost > 0 && <p className="roll-cost">Custo declarado: {experienceCost} Hope · disponível antes da rolagem: {survivor?.hope ?? 0}</p>}
    </fieldset>
    <div className="roll-edge"><span>Condição da rolagem</span><div role="group" aria-label="Vantagem ou desvantagem">
      {([ ["none", "Normal"], ["advantage", "Vantagem +d6"], ["disadvantage", "Desvantagem −d6"] ] as const).map(([value, label]) =>
        <button type="button" key={value} aria-pressed={edge === value} onClick={() => { setEdge(value); clearResult(); }}>{label}</button>)}
    </div></div>
    {kind === "reaction" && <p className="roll-hint">Reações não geram Hope ou Fear. Um crítico não recupera Stress.</p>}
    {!targetValid && <p className="text-sm text-red-700" role="alert">Informe {kind === "attack" ? "uma defesa" : "uma dificuldade"} inteira entre 1 e 99 ou deixe o campo vazio.</p>}
    <div className="roll-actions"><Button disabled={!canRoll} onClick={rollAction}><Dice5 size={17} /> Rolar {kind === "attack" ? "ataque + dano" : kind === "reaction" ? "reação" : "Hope/Fear"}</Button>
      {survivor && <span>Hope atual: <b>{survivor.hope}/6</b></span>}</div>
    {displayedLast && <div className="roll-result" role="status" aria-live="polite">
      <div className="roll-result-heading"><b>{outcomeLabel(displayedLast)}</b><span>{displayedLast.outcome.difficulty === null ? kind === "attack" ? "Defesa não informada" : "Dificuldade não informada" : `contra ${displayedLast.outcome.difficulty}`}</span></div>
      <div className="roll-dice"><div className="hope"><Sparkles size={15} aria-hidden="true" /><span>Hope</span><strong>{last.outcome.hopeDie}</strong></div><div className="fear"><Zap size={15} aria-hidden="true" /><span>Fear</span><strong>{last.outcome.fearDie}</strong></div><div className="total"><span>Total</span><strong>{last.outcome.total}</strong></div></div>
      <p className="roll-breakdown">{last.trait}: {last.traitBonus >= 0 ? "+" : ""}{last.traitBonus} · Experiences: +{last.experiences.length * 2}{last.experiences.length ? ` (−${last.experiences.length} Hope)` : ""} · outros: {last.other >= 0 ? "+" : ""}{last.other}{last.equipment ? ` · equipamento: ${last.equipment}` : ""}{last.symptom ? " · sintomas: −1" : ""}{last.outcome.edgeDie ? ` · ${last.outcome.edge === "advantage" ? "vantagem" : "desvantagem"}: ${last.outcome.edge === "advantage" ? "+" : "−"}${last.outcome.edgeDie}` : ""}.</p>
      <p className="roll-hint">{last.kind === "reaction" ? "Reação: nenhum recurso gerado." : last.outcome.critical ? "Crítico: +1 Hope e limpa 1 Stress (respeitando os limites)." : last.outcome.with === "Hope" ? "+1 Hope (até o limite de 6)." : "+1 Fear para o mestre (até o limite de 12)."} O mestre descreve a consequência na ficção.</p>
    </div>}
    {kind === "attack" && weapon && <div className="roll-damage-panel"><div className="roll-damage-heading"><b>Dano da arma</b><span>Proficiência {survivor?.proficiency ?? 1} · {weapon.damage} físico</span></div>
      {attackResult && lastDamage && <>
        {attackHit === null && !targetValid ? <p className="roll-hint" role="alert">Corrija a defesa para avaliar o acerto; os dados já rolados serão mantidos.</p> : null}
        {attackHit === null && targetValid && <p className="roll-hint">Acerto a confirmar · dano potencial. Informe a defesa acima ou confirme o acerto com o mestre antes de aplicá-lo.</p>}
        {attackHit === false && <p className="roll-hint" role="status">Falha · dano rolado, não aplicado.</p>}
        {attackHit === true && <p className="roll-hint" role="status">{lastDamage.critical ? "Crítico: acerto automático" : "Acerto confirmado"} · dano aplicável após comparar aos limiares.</p>}
        {target === null && targetValid && !attackResult.outcome.critical && <label className="roll-confirm"><Checkbox checked={confirmedHit} onCheckedChange={checked => setConfirmedHit(checked === true)} /> Mestre confirmou o acerto sem defesa informada</label>}
        <output className={`roll-damage-result${attackHit === false ? " is-miss" : attackHit === null ? " is-pending" : ""}`}><strong>{lastDamage.total} dano físico{attackHit === false ? " · não aplicado" : attackHit === null ? " · potencial" : ""}</strong><span>{lastDamage.formula}{lastDamage.equipment ? ` +${lastDamage.equipment} equipamento` : ""}{lastDamage.extra - lastDamage.equipment ? ` ${lastDamage.extra - lastDamage.equipment >= 0 ? "+" : "−"} ${Math.abs(lastDamage.extra - lastDamage.equipment)} situacional` : ""}{lastDamage.critical ? ` + ${lastDamage.criticalBonus} crítico` : ""} · dados {lastDamage.dice.join(", ")}</span></output>
      </>}
      <div className="roll-damage-settings"><label><Checkbox checked={manualCritical} onCheckedChange={checked => { setManualCritical(checked === true); setStandaloneDamage(null); }} /> Crítico no dano avulso</label></div>
      <div className="roll-damage-actions"><Button size="sm" variant="outline" disabled={Boolean(standaloneDamage) || handConflict} onClick={rollStandaloneDamage}>Dano avulso</Button>
        {standaloneDamage && <Button size="sm" variant="ghost" onClick={() => setStandaloneDamage(null)}>Novo dano avulso</Button>}</div>
      {standaloneDamage && <output className="roll-damage-result"><strong>{standaloneDamage.total} dano físico avulso</strong><span>{standaloneDamage.formula}{standaloneDamage.equipment ? ` +${standaloneDamage.equipment} equipamento` : ""}{standaloneDamage.extra - standaloneDamage.equipment ? ` ${standaloneDamage.extra - standaloneDamage.equipment >= 0 ? "+" : "−"} ${Math.abs(standaloneDamage.extra - standaloneDamage.equipment)} situacional` : ""}{standaloneDamage.critical ? ` + ${standaloneDamage.criticalBonus} crítico` : ""} · dados {standaloneDamage.dice.join(", ")}</span></output>}
      <p className="roll-hint">Compare o dano aos limiares do alvo. O sistema aplica o Barulho da arma a cada ação de disparo e consome 1 carga compatível apenas na primeira ação daquele tipo de munição na cena.</p>
    </div>}
  </>;
}

export function RollDialog({ game, edit, request, open, onOpenChange }: {
  game: GameState; edit: Edit; request?: RollRequest; open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const visible = open ?? localOpen;
  return <Dialog open={visible} onOpenChange={value => { if (open === undefined) setLocalOpen(value); onOpenChange?.(value); }}>
    {open === undefined && <DialogTrigger asChild><Button size="sm"><Dice5 /> Rolar dados</Button></DialogTrigger>}
    {visible && <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[650px]"><RollForm game={game} edit={edit} request={request} /></DialogContent>}
  </Dialog>;
}
