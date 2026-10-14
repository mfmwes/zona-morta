"use client";

import { useMemo, useState } from "react";
import {
  Activity, Droplets, EyeOff, HeartPulse, Lock, Snowflake, Sun, TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlayerActionControls } from "@/components/player-actions-panel";
import { RollDialog } from "@/components/roll-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Field, Pick } from "@/components/game-controls";
import type { GameState, Survivor } from "@/lib/game";
import type { BodyRegion, SurvivorCondition, SurvivorConditionKind, WetExposureSource } from "@/lib/survivor-condition-types";
import { equippedConditionSupport, wetExposureSourceLabels } from "@/lib/condition-item-effects";
import {
  applySurvivorCondition,
  bleedingTrigger,
  bodyRegionLabels,
  conditionDefinitions,
  conditionDetails,
  exposureAdvantageSources,
  reduceExposure,
  removeSurvivorCondition,
  resolveExposureRoll,
  setFractureImmobilized,
  setInjuryAggravated,
  setInjuryTreated,
  severeExposureTrigger,
} from "@/lib/survivor-conditions";

type Edit = (fn: (draft: GameState) => void) => void;

const icons: Record<SurvivorConditionKind, typeof Activity> = {
  restrained: Lock,
  vulnerable: TriangleAlert,
  hidden: EyeOff,
  cold: Snowflake,
  heat: Sun,
  wet: Droplets,
  bleeding: HeartPulse,
  injury: Activity,
  fracture: TriangleAlert,
};

const groups = ["Tático", "Ambiental", "Físico"] as const;

function ConditionIcon({ condition, size = 15 }: { condition: SurvivorCondition; size?: number }) {
  const Icon = icons[condition.kind];
  return <Icon size={size} aria-hidden="true" />;
}

function ConditionProgress({ condition }: { condition: SurvivorCondition }) {
  if (condition.kind === "cold" || condition.kind === "heat") {
    const level = condition.level ?? 1;
    return <span className="survivor-condition-level" aria-label={`Intensidade ${level} de 3`}>
      {[1,2,3].map(step => <i key={step} className={step <= level ? "filled" : ""} />)}
    </span>;
  }
  if (condition.kind === "fracture") {
    const value = Math.max(0, Math.min(4, condition.recovery ?? 0));
    return <span className="survivor-condition-level" aria-label={`Recuperação ${value} de 4`}>
      {[1,2,3,4].map(step => <i key={step} className={step <= value ? "filled" : ""} />)}
    </span>;
  }
  if (condition.kind === "injury" && condition.treated) {
    const needed = condition.aggravated ? 2 : 1;
    const value = Math.max(0, Math.min(needed, condition.recovery ?? 0));
    return <span className="survivor-condition-level" aria-label={`Recuperação ${value} de ${needed}`}>
      {Array.from({ length: needed }, (_, index) => <i key={index} className={index < value ? "filled" : ""} />)}
    </span>;
  }
  return null;
}

function ConditionBadge({ condition, onOpen }: { condition: SurvivorCondition; onOpen: () => void }) {
  const detail = conditionDetails(condition);
  return <Tooltip>
    <TooltipTrigger asChild>
      <button type="button" className={`survivor-condition-badge tone-${detail.tone}`} onClick={onOpen}
        aria-label={`${detail.label}. ${detail.summary}. Abrir detalhes.`}>
        <ConditionIcon condition={condition} /><span>{detail.label}</span><ConditionProgress condition={condition} />
      </button>
    </TooltipTrigger>
    <TooltipContent sideOffset={7} className="survivor-condition-tooltip">
      <b>{detail.label}</b><span>{detail.summary}</span><small>Clique para ler a regra completa.</small>
    </TooltipContent>
  </Tooltip>;
}

function ExposureRollControl({ game, survivor, condition, edit, playerActions }: {
  game: GameState; survivor: Survivor; condition: SurvivorCondition; edit: Edit; playerActions?: PlayerActionControls;
}) {
  const [open, setOpen] = useState(false);
  if (condition.kind !== "cold" && condition.kind !== "heat") return null;
  const sources = exposureAdvantageSources(survivor, condition.id);
  return <div className={`exposure-support-card ${sources.length ? "is-active" : ""}`}>
    <span>Teste de exposição</span>
    <b>{sources.length ? "Vantagem automática disponível" : "Sem apoio automático"}</b>
    <small>{sources.length
      ? `Fontes: ${sources.join(", ")}. A rolagem aplica +d6 automaticamente e não acumula múltiplas Vantagens.`
      : "Força é a sugestão padrão; o atributo pode mudar se a ficção justificar."}</small>
    <div><Button size="sm" onClick={() => setOpen(true)}>Rolar exposição</Button></div>
    <RollDialog game={game} edit={edit} playerActions={playerActions}
      request={{ survivorId: survivor.id, kind: "action", trait: "Força", exposure: { conditionId: condition.id } }}
      open={open} onOpenChange={setOpen} />
  </div>;
}

function DetailActions({ survivor, condition, edit, editable, onClose }: {
  survivor: Survivor; condition: SurvivorCondition; edit: Edit; editable: boolean; onClose: () => void;
}) {
  if (!editable) return null;

  function mutate(fn: (draft: GameState) => void) { edit(fn); }

  if (condition.kind === "cold" || condition.kind === "heat") {
    const level = condition.level ?? 1;
    return <div className="survivor-condition-actions">
      <p className="survivor-condition-action-title">Resolver manualmente</p>
      <div>
        <Button size="sm" variant="outline" onClick={() => mutate(draft => { resolveExposureRoll(draft, survivor.id, condition.id, "failure-hope"); })}>Falha com Esperança</Button>
        <Button size="sm" variant="outline" onClick={() => mutate(draft => { resolveExposureRoll(draft, survivor.id, condition.id, "failure-fear"); })}>Falha com Medo</Button>
        <Button size="sm" variant="outline" onClick={() => mutate(draft => { reduceExposure(draft, survivor.id, condition.id); })}>Recuperou 1 nível</Button>
        {level >= 3 && <Button size="sm" variant="destructive" onClick={() => mutate(draft => { severeExposureTrigger(draft, survivor.id, condition.id); })}>Gatilho grave · +1 PV</Button>}
      </div>
      <small>Use estes controles apenas quando a rolagem foi feita fora da ferramenta acima. A rolagem de exposição integrada já resolve a condição automaticamente.</small>
    </div>;
  }

  if (condition.kind === "bleeding") {
    return <div className="survivor-condition-actions">
      <p className="survivor-condition-action-title">Resolver Sangramento</p>
      <div>
        <Button size="sm" variant="destructive" onClick={() => mutate(draft => { bleedingTrigger(draft, survivor.id, "fim da cena/atividade sem estabilização"); })}>Cobrar gatilho · +1 PV</Button>
        <Button size="sm" variant="outline" onClick={() => { mutate(draft => { removeSurvivorCondition(draft, survivor.id, condition.id, "estabilizado com primeiros socorros"); }); onClose(); }}>Estabilizar</Button>
      </div>
    </div>;
  }

  if (condition.kind === "injury") {
    return <div className="survivor-condition-actions">
      <p className="survivor-condition-action-title">Tratamento da Lesão</p>
      <div>
        <Button size="sm" variant="outline" onClick={() => mutate(draft => { setInjuryTreated(draft, survivor.id, condition.id, !condition.treated); })}>{condition.treated ? "Desfazer tratamento" : "Marcar tratada"}</Button>
        <Button size="sm" variant="outline" onClick={() => mutate(draft => { setInjuryAggravated(draft, survivor.id, condition.id, !condition.aggravated); })}>{condition.aggravated ? "Reduzir para Lesão" : "Marcar agravada"}</Button>
      </div>
      <small>Depois do tratamento, descansos longos preenchem a recuperação automaticamente.</small>
    </div>;
  }

  if (condition.kind === "fracture") {
    return <div className="survivor-condition-actions">
      <p className="survivor-condition-action-title">Tratamento da Fratura</p>
      <div>
        <Button size="sm" variant="outline" onClick={() => mutate(draft => { setFractureImmobilized(draft, survivor.id, condition.id, !condition.immobilized); })}>{condition.immobilized ? "Remover imobilização" : "Imobilizar"}</Button>
      </div>
      <small>Fraturas imobilizadas ganham 1 segmento de recuperação em cada descanso longo. Ao completar 4/4, a condição é removida.</small>
    </div>;
  }

  return null;
}

function ConditionDetailDialog({ game, survivor, condition, edit, editable, open, onOpenChange, playerActions }: {
  game: GameState; survivor: Survivor; condition: SurvivorCondition | null; edit: Edit; editable: boolean;
  open: boolean; onOpenChange: (open: boolean) => void; playerActions?: PlayerActionControls;
}) {
  if (!condition) return null;
  const detail = conditionDetails(condition);
  const equippedSupport = equippedConditionSupport(survivor, condition.kind);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="survivor-condition-dialog">
      <DialogHeader>
        <div className={`survivor-condition-dialog-icon tone-${detail.tone}`}><ConditionIcon condition={condition} size={21} /></div>
        <DialogTitle>{detail.label}</DialogTitle>
        <DialogDescription>{detail.category} · condição ativa de {survivor.name}</DialogDescription>
      </DialogHeader>
      <div className="survivor-condition-detail">
        <div><span>EFEITO</span><p>{detail.effect}</p></div>
        <div><span>COMO REMOVER</span><p>{detail.clear}</p></div>
        {condition.source && <div><span>ORIGEM</span><p>{condition.source}</p></div>}
        {condition.kind === "wet" && condition.wetExposureSource && <div><span>FONTE DA ÁGUA</span><p>{wetExposureSourceLabels[condition.wetExposureSource]}</p></div>}
        {(condition.kind === "injury" || condition.kind === "fracture") && <div><span>RECUPERAÇÃO</span><p>{condition.kind === "fracture"
          ? `${condition.recovery ?? 0}/4 descansos longos ${condition.immobilized ? "com a fratura imobilizada" : "— imobilize antes de iniciar a recuperação"}.`
          : condition.treated
            ? `${condition.recovery ?? 0}/${condition.aggravated ? 2 : 1} descansos longos após tratamento.`
            : "Ainda precisa de tratamento antes de progredir com descansos longos."}</p></div>}
        {equippedSupport.length > 0 && <div><span>EQUIPAMENTO ATIVO</span><p>{equippedSupport.map(effect => `${effect.item}: ${effect.summary}`).join(" ")}</p></div>}
        {condition.exposureAdvantageSource && <div><span>PRÓXIMO TESTE DE EXPOSIÇÃO</span><p>Vantagem preparada por <b>{condition.exposureAdvantageSource}</b>. O apoio é consumido ao resolver o próximo teste de exposição.</p></div>}
        {condition.recoveryAdvantageSource && <div><span>PRÓXIMA RECUPERAÇÃO</span><p>Vantagem preparada por <b>{condition.recoveryAdvantageSource}</b>. O apoio é consumido quando a condição for reduzida.</p></div>}
      </div>
      <ExposureRollControl game={game} survivor={survivor} condition={condition} edit={edit} playerActions={playerActions} />
      <DetailActions survivor={survivor} condition={condition} edit={edit} editable={editable} onClose={() => onOpenChange(false)} />
      <DialogFooter>
        {editable && !["cold","heat","bleeding"].includes(condition.kind) && <Button variant="destructive" onClick={() => {
          edit(draft => { removeSurvivorCondition(draft, survivor.id, condition.id); });
          onOpenChange(false);
        }}>Remover condição</Button>}
        <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function SurvivorConditionBadges({ game, survivor, edit, editable = false, empty = false, playerActions }: {
  game: GameState; survivor: Survivor; edit: Edit; editable?: boolean; empty?: boolean; playerActions?: PlayerActionControls;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const conditions = survivor.conditions ?? [];
  const selected = conditions.find(condition => condition.id === selectedId) ?? null;
  if (!conditions.length && !empty) return null;
  return <TooltipProvider delayDuration={220}>
    <div className="survivor-condition-badges" aria-label="Condições ativas">
      {conditions.map(condition => <ConditionBadge key={condition.id} condition={condition} onOpen={() => setSelectedId(condition.id)} />)}
      {!conditions.length && empty && <span className="survivor-condition-empty">Nenhuma condição ativa.</span>}
    </div>
    <ConditionDetailDialog game={game} survivor={survivor} condition={selected} edit={edit} editable={editable}
      open={Boolean(selected)} onOpenChange={value => { if (!value) setSelectedId(null); }} />
  </TooltipProvider>;
}

export function SurvivorConditionPanel({ game, survivor, edit, editable, playerActions }: {
  game: GameState; survivor: Survivor; edit: Edit; editable: boolean; playerActions?: PlayerActionControls;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [kind, setKind] = useState<SurvivorConditionKind>("cold");
  const [bodyRegion, setBodyRegion] = useState<BodyRegion>("left-arm");
  const [level, setLevel] = useState("1");
  const [source, setSource] = useState("");
  const [wetSource, setWetSource] = useState<WetExposureSource>("common-rain");
  const [applyFeedback, setApplyFeedback] = useState("");
  const definition = conditionDefinitions[kind];
  const availableKinds = useMemo(() => Object.entries(conditionDefinitions).map(([value, item]) => ({
    value: value as SurvivorConditionKind,
    label: `${item.category} · ${item.label}`,
  })), []);

  function apply() {
    let result: ReturnType<typeof applySurvivorCondition> | undefined;
    edit(draft => { result = applySurvivorCondition(draft, survivor.id, kind, {
      ...(definition.levels ? { level: Number(level) as 1 | 2 | 3 } : {}),
      ...(definition.bodyRegion ? { bodyRegion } : {}),
      ...(kind === "wet" ? { wetExposureSource: wetSource } : {}),
      ...(source.trim() ? { source: source.trim() } : {}),
    }); });
    if (result?.ok) {
      setAddOpen(false); setSource(""); setApplyFeedback("");
    } else if (result?.message) {
      setApplyFeedback(result.message);
    }
  }

  return <section className="character-surface survivor-condition-panel">
    <div className="survivor-condition-panel-heading">
      <div><span className="dossier-title">ESTADOS E CONDIÇÕES</span><h3>Condições ativas</h3><p>Os marcadores permanecem na ficha até a regra de remoção ser cumprida.</p></div>
      {editable && <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogTrigger asChild><Button size="sm"><HeartPulse size={16} /> Aplicar condição</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Aplicar condição</DialogTitle><DialogDescription>Escolha a condição e registre apenas o que a ficção já estabeleceu.</DialogDescription></DialogHeader>
          <Pick label="Condição" value={kind} options={availableKinds} onChange={value => { setKind(value as SurvivorConditionKind); setApplyFeedback(""); }} />
          {definition.levels && <Pick label="Intensidade inicial" value={level} options={[{value:"1",label:"Nível 1"},{value:"2",label:"Nível 2"},{value:"3",label:"Nível 3"}]} onChange={setLevel} />}
          {definition.bodyRegion && <Pick label="Região afetada" value={bodyRegion} options={Object.entries(bodyRegionLabels).map(([value,label])=>({value,label}))} onChange={value => setBodyRegion(value as BodyRegion)} />}
          {kind === "wet" && <Pick label="Fonte da água" value={wetSource}
            options={Object.entries(wetExposureSourceLabels).map(([value,label]) => ({ value, label }))}
            onChange={value => { setWetSource(value as WetExposureSource); setApplyFeedback(""); }} />}
          <Field label="Origem · opcional" value={source} onChange={setSource} placeholder="Ex.: queda da escada, tempestade, mordida..." />
          <div className="survivor-condition-add-preview"><b>{definition.label}</b><p>{definition.effect}</p><small>Remover: {definition.clear}</small></div>
          {applyFeedback && <p className="inventory-hint" role="status">{applyFeedback}</p>}
          <DialogFooter><Button variant="outline" onClick={()=>setAddOpen(false)}>Cancelar</Button><Button onClick={apply}>Aplicar</Button></DialogFooter>
        </DialogContent>
      </Dialog>}
    </div>
    <SurvivorConditionBadges game={game} survivor={survivor} edit={edit} editable={editable} empty />
    {(survivor.conditions ?? []).length > 0 && <div className="survivor-condition-groups">
      {groups.map(group => {
        const rows = (survivor.conditions ?? []).filter(condition => conditionDefinitions[condition.kind].category === group);
        if (!rows.length) return null;
        return <div key={group}><span>{group}</span>{rows.map(condition => {
          const detail = conditionDetails(condition);
          return <div key={condition.id} className={`survivor-condition-row tone-${detail.tone}`}>
            <ConditionIcon condition={condition} /><span><b>{detail.label}</b><small>{detail.summary}</small></span><ConditionProgress condition={condition} />
          </div>;
        })}</div>;
      })}
    </div>}
    <p className="character-rule-note">Vantagem e Desvantagem de múltiplas condições não acumulam dados adicionais. Quando uma condição depende do contexto da ação, declare sua relevância na rolagem.</p>
  </section>;
}
