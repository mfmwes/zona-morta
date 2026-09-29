"use client";

import { useState } from "react";
import { Crosshair, Dice5, Sparkles, Swords, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Pick } from "@/components/game-controls";
import { addLog, content, traits, type GameState } from "@/lib/game";
import { equipmentModifiers, getPrimary, getSecondary, weaponAmmoType } from "@/lib/equipment";
import { ammoTypeFor } from "@/lib/inventory";
import { parseWeaponDamage, resolveActionRoll, resolveRollResources, resolveWeaponDamage, rollDie, type ActionOutcome, type Edge, type RollKind } from "@/lib/rolls";

type Edit = (fn: (draft: GameState) => void) => void;
export type RollRequest = { survivorId?: string; kind?: RollKind; trait?: string; weapon?: "primary" | "secondary"; experience?: "origin" | "free" };
type RollRecord = { outcome: ActionOutcome; kind: RollKind; trait: string; traitBonus: number; weaponName: string | null; actorId: string; experiences: string[]; symptom: number; other: number; equipment: number };
type DamageRecord = ReturnType<typeof resolveWeaponDamage> & { weaponName: string; formula: string; critical: boolean; equipment: number };

function outcomeLabel(roll: RollRecord) {
  if (roll.outcome.critical) return "Sucesso crítico";
  if (roll.outcome.success === null) return `Total com ${roll.outcome.with} · aguarda dificuldade`;
  return `${roll.outcome.success ? "Sucesso" : "Falha"} com ${roll.outcome.with}`;
}

function RollForm({ game, edit, request }: { game: GameState; edit: Edit; request?: RollRequest }) {
  const [person, setPerson] = useState(request?.survivorId ?? "");
  const [kind, setKind] = useState<RollKind>(request?.kind ?? "action");
  const [trait, setTrait] = useState(request?.trait ?? "Agilidade");
  const [weaponSlot, setWeaponSlot] = useState<"primary" | "secondary">(request?.weapon ?? "primary");
  const [difficulty, setDifficulty] = useState(request?.survivorId ? "" : "12");
  const [extra, setExtra] = useState("0");
  const [edge, setEdge] = useState<Edge>("none");
  const [experiences, setExperiences] = useState<Array<"origin" | "free">>(request?.experience ? [request.experience] : []);
  const [damageExtra, setDamageExtra] = useState("0");
  const [confirmedHit, setConfirmedHit] = useState(false);
  const [manualCritical, setManualCritical] = useState(false);
  const [last, setLast] = useState<RollRecord | null>(null);
  const [lastDamage, setLastDamage] = useState<DamageRecord | null>(null);
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
  const ammoNeeded = kind === "attack" && weapon ? weaponAmmoType(weapon.name) : null;
  const ammoWarning = ammoNeeded && survivor && (survivor.ammo < 1 || ammoTypeFor(survivor) !== ammoNeeded)
    ? `Sem carga de ${ammoNeeded} registrada. Confira a munição antes de atacar.` : "";
  const target = difficulty.trim() === "" ? null : Number(difficulty);
  const targetValid = target === null || (Number.isInteger(target) && target >= 1 && target <= 99);
  const experienceCost = experiences.length;
  const handConflict = kind === "attack" && weaponSlot === "secondary" && getPrimary(survivor?.primary ?? "")?.hands === "Duas";
  const canRoll = targetValid && experienceCost <= (survivor?.hope ?? 0) && (kind !== "attack" || Boolean(weapon)) && !handConflict;
  const attackResult = last?.kind === "attack" && last.actorId === person && last.weaponName === weapon?.name ? last : null;
  const canRollHitDamage = Boolean(attackResult && (attackResult.outcome.success === true || (attackResult.outcome.success === null && confirmedHit)));

  function clearResult() { setLast(null); setLastDamage(null); setConfirmedHit(false); }

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
    const targetLabel = target === null ? "Dificuldade a definir" : `Dificuldade ${target}`;
    const experienceLabel = used.length ? ` · Experiences: ${used.join(" e ")} (−${used.length} Hope)` : "";
    const fixedBonus = traitBonus + used.length * 2 + other + symptom + equipmentBonus;
    const text = `${lead}: Hope ${result.hopeDie} + Fear ${result.fearDie} ${fixedBonus >= 0 ? "+" : "−"} ${Math.abs(fixedBonus)}${edgeLabel} = ${result.total}; ${targetLabel}. ${outcomeLabel(record)}${experienceLabel}${equipmentBonus ? ` · ${equipmentBonus} por equipamento` : ""}${symptom ? " · −1 por sintomas" : ""}${kind === "reaction" ? " · reação sem ganho de Hope/Fear" : ""}.`;
    edit(draft => {
      const actor = draft.survivors.find(s => s.id === person);
      const resources = resolveRollResources({ hope: actor?.hope ?? null, stress: actor?.stress ?? null,
        fear: draft.fear, experienceCost: used.length, reaction: kind === "reaction", outcome: result });
      if (actor) { actor.hope = resources.hope!; actor.stress = resources.stress!; }
      draft.fear = resources.fear;
      addLog(draft, "dados", text, actor?.id);
    });
    setLast(record); setLastDamage(null); setConfirmedHit(false);
  }

  function rollDamage(standalone: boolean) {
    if (!survivor || !weapon || lastDamage || handConflict || (!standalone && !canRollHitDamage)) return;
    const formula = parseWeaponDamage(weapon.damage);
    if (!formula) return;
    const proficiency = Math.max(1, Math.min(9, Math.trunc(survivor.proficiency ?? 1)));
    const critical = standalone ? manualCritical : Boolean(attackResult?.outcome.critical);
    const equipmentDamage = weaponSlot === "primary" ? modifiers?.primaryDamage ?? 0 : 0;
    const extraDamage = Math.max(-99, Math.min(99, Math.trunc(Number(damageExtra) || 0)));
    const dice = Array.from({ length: proficiency }, () => rollDie(formula.die));
    const result = resolveWeaponDamage(dice, formula.die, formula.flat, extraDamage + equipmentDamage, critical);
    const record: DamageRecord = { ...result, weaponName: weapon.name, formula: `${proficiency}d${formula.die}${formula.flat >= 0 ? "+" : ""}${formula.flat}`, critical, equipment: equipmentDamage };
    const text = `${survivor.name}: ${weapon.name} — ${record.formula}${equipmentDamage ? ` +${equipmentDamage} da Faca pequena` : ""}${extraDamage ? `${extraDamage >= 0 ? "+" : ""}${extraDamage} situacional` : ""}${critical ? ` + ${result.criticalBonus} crítico` : ""} = ${result.total} dano físico (dados: ${dice.join(", ")}). Compare aos limiares do alvo; registre Barulho e carga de munição conforme a cena.`;
    edit(draft => addLog(draft, "dano", text, survivor.id));
    setLastDamage(record);
  }

  return <>
    <DialogHeader><p className="dossier-title">Dados de dualidade</p><DialogTitle>Rolagem de {kind === "attack" ? "ataque" : kind === "reaction" ? "reação" : "ação"}</DialogTitle>
      <DialogDescription>Defina a ação e seus riscos com o mestre. Declare Experiences e modificadores antes de rolar.</DialogDescription></DialogHeader>
    <div className="roll-modes" role="group" aria-label="Tipo de rolagem">
      {([ ["action", "Ação", Dice5], ["reaction", "Reação", Zap], ["attack", "Ataque", Swords] ] as const).map(([id, label, Icon]) =>
        <button type="button" key={id} aria-pressed={kind === id} onClick={() => { setKind(id); clearResult(); }}><Icon size={16} aria-hidden="true" />{label}</button>)}
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      {request?.survivorId ? <div className="roll-locked"><span>Sobrevivente</span><strong>{survivor?.name ?? "Não encontrado"}</strong></div> : <Pick label="Sobrevivente" value={person} options={game.survivors.map(s => ({ value: s.id, label: s.name }))} onChange={value => { setPerson(value); setExperiences([]); setWeaponSlot("primary"); clearResult(); }} placeholder="Rolagem livre" />}
      {kind === "attack" ? <Pick label="Arma equipada" value={weaponSlot} options={[{ value: "primary", label: survivor?.primary || "Primária" }, ...(survivor?.secondary ? [{ value: "secondary", label: survivor.secondary }] : [])]} onChange={value => { setWeaponSlot(value as "primary" | "secondary"); clearResult(); }} disabled={!survivor} />
        : <Pick label="Atributo" value={trait} options={traits} onChange={value => { setTrait(value); clearResult(); }} />}
      <Field label="Dificuldade (opcional)" value={difficulty} onChange={value => { setDifficulty(value); clearResult(); }} type="number" placeholder="Mestre decide" />
      <Field label="Outros modificadores" value={extra} onChange={value => { setExtra(value); clearResult(); }} type="number" />
    </div>
    {kind === "attack" && <div className="roll-weapon-note"><Crosshair size={17} aria-hidden="true" /><span>{weapon ? `${weapon.name} · ${rollTrait} ${survivor && survivor.attributes[rollTrait] >= 0 ? "+" : ""}${survivor?.attributes[rollTrait] ?? 0} · ${weapon.range} · ${weapon.damage}` : "Escolha um sobrevivente e sua arma equipada."}</span></div>}
    {equipmentBonus !== 0 && <p className="roll-hint">{survivor?.protection}: {equipmentBonus} em {rollTrait}, já incluído nesta rolagem.</p>}
    {kind === "attack" && weaponSlot === "primary" && Boolean(modifiers?.primaryDamage) && <p className="roll-hint">Faca pequena: +1 ao dano desta arma, incluído automaticamente.</p>}
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
    {!targetValid && <p className="text-sm text-red-700" role="alert">Informe uma dificuldade inteira entre 1 e 99 ou deixe o campo vazio.</p>}
    <div className="roll-actions"><Button disabled={!canRoll} onClick={rollAction}><Dice5 size={17} /> Rolar {kind === "attack" ? "ataque" : kind === "reaction" ? "reação" : "Hope/Fear"}</Button>
      {survivor && <span>Hope atual: <b>{survivor.hope}/6</b></span>}</div>
    {last && <div className="roll-result" role="status" aria-live="polite">
      <div className="roll-result-heading"><b>{outcomeLabel(last)}</b><span>{last.outcome.difficulty === null ? "Dificuldade não informada" : `contra ${last.outcome.difficulty}`}</span></div>
      <div className="roll-dice"><div className="hope"><Sparkles size={15} aria-hidden="true" /><span>Hope</span><strong>{last.outcome.hopeDie}</strong></div><div className="fear"><Zap size={15} aria-hidden="true" /><span>Fear</span><strong>{last.outcome.fearDie}</strong></div><div className="total"><span>Total</span><strong>{last.outcome.total}</strong></div></div>
      <p className="roll-breakdown">{last.trait}: {last.traitBonus >= 0 ? "+" : ""}{last.traitBonus} · Experiences: +{last.experiences.length * 2}{last.experiences.length ? ` (−${last.experiences.length} Hope)` : ""} · outros: {last.other >= 0 ? "+" : ""}{last.other}{last.equipment ? ` · equipamento: ${last.equipment}` : ""}{last.symptom ? " · sintomas: −1" : ""}{last.outcome.edgeDie ? ` · ${last.outcome.edge === "advantage" ? "vantagem" : "desvantagem"}: ${last.outcome.edge === "advantage" ? "+" : "−"}${last.outcome.edgeDie}` : ""}.</p>
      <p className="roll-hint">{last.kind === "reaction" ? "Reação: nenhum recurso gerado." : last.outcome.critical ? "Crítico: +1 Hope e limpa 1 Stress (respeitando os limites)." : last.outcome.with === "Hope" ? "+1 Hope (até o limite de 6)." : "+1 Fear para o mestre (até o limite de 12)."} O mestre descreve a consequência na ficção.</p>
    </div>}
    {kind === "attack" && weapon && <div className="roll-damage-panel"><div className="roll-damage-heading"><b>Dano da arma</b><span>Proficiência {survivor?.proficiency ?? 1} · {weapon.damage} físico</span></div>
      <div className="roll-damage-settings"><Field label="Bônus situacional ao dano" value={damageExtra} onChange={setDamageExtra} type="number" />
        <label><Checkbox checked={manualCritical} onCheckedChange={checked => setManualCritical(checked === true)} /> Crítico no dano avulso</label></div>
      {attackResult?.outcome.success === null && !attackResult.outcome.critical && <label className="roll-confirm"><Checkbox checked={confirmedHit} onCheckedChange={checked => setConfirmedHit(checked === true)} /> Mestre confirmou o acerto sem dificuldade informada</label>}
      <div className="roll-damage-actions"><Button size="sm" disabled={!canRollHitDamage || Boolean(lastDamage)} onClick={() => rollDamage(false)}>Rolar dano do acerto</Button>
        <Button size="sm" variant="outline" disabled={Boolean(lastDamage) || handConflict} onClick={() => rollDamage(true)}>Dano avulso</Button>
        {lastDamage && <Button size="sm" variant="ghost" onClick={() => setLastDamage(null)}>Novo dano</Button>}</div>
      {lastDamage && <output className="roll-damage-result"><strong>{lastDamage.total} dano físico</strong><span>{lastDamage.formula}{lastDamage.equipment ? ` +${lastDamage.equipment} equipamento` : ""}{lastDamage.extra - lastDamage.equipment ? ` ${lastDamage.extra - lastDamage.equipment >= 0 ? "+" : "−"} ${Math.abs(lastDamage.extra - lastDamage.equipment)} situacional` : ""}{lastDamage.critical ? ` + ${lastDamage.criticalBonus} crítico` : ""} · dados {lastDamage.dice.join(", ")}</span></output>}
      <p className="roll-hint">Compare o dano aos limiares do alvo. Disparos podem gerar Barulho; uma carga de munição cobre a cena, conforme a regra de Zona Morta. Registre-a uma vez por cena.</p>
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
