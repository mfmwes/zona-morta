"use client";
/* eslint-disable @next/next/no-img-element -- local portraits are reduced to small data URLs before storage. */

import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import {
  Activity, Backpack, BookOpen, Check, Crosshair, Dice5, Droplets, Footprints, Heart, Search,
  HeartPulse, History, Minus, Plus, Shield, ShieldCheck, Sparkles,
  Moon, ShoppingCart, Stethoscope, Swords, Upload, Utensils, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CharacterWizard } from "@/components/character-wizard";
import { AddItemDialog, ItemActionsDialog, ProvisionTransferDialog } from "@/components/inventory-workflow";
import { ItemContextMenu } from "@/components/item-context-menu";
import { SurvivorContextMenu } from "@/components/survivor-context-menu";
import { EmptyItemArt, ItemArt } from "@/components/item-art";
import { AbilityArt } from "@/components/ability-art";
import { RollDialog, type RollRequest } from "@/components/roll-dialog";
import { SurvivorConflictHud } from "@/components/survivor-conflict-hud";
import { Counter, Field, Pick } from "@/components/game-controls";
import { traitLabel, localizeRollLog } from "@/lib/terminology";
import { absoluteMinutes, addLog, ammunitionCount, ammunitionItemType, ammunitionTypes, content, survivorHex, survivorIsDown, survivorStats, traits, type EquipmentSlot, type GameState, type Infection, type Survivor } from "@/lib/game";
import { activeCart, atSharedStorage, batteryStateFor, cartStoredLoad, catalogForItem, countsAsMedication, discardItem, stowSlot } from "@/lib/inventory";
import { provisionBreakdown, provisionDisplay, provisionItemInfo } from "@/lib/provision-items";
import { equipmentModifiers, getPrimary, getProtection, getSecondary, unarmedAttack, weaponAmmoType } from "@/lib/equipment";
import { rollDie } from "@/lib/rolls";
import { consumeDailyProvision } from "@/lib/survival";
import { adjustProvisionCount } from "@/lib/provisions";
import { abilityCosts, abilityPeriod, costLabels, periodLabels, recordAbilityUse, resolveGroupRest, restActionLabels, restActionsFor, restDurationMinutes, type AbilityCost, type RestAction, type RestChoice, type RestKind } from "@/lib/abilities";
import { abilityUseOptions, abilityUseState } from "@/lib/ability-presentation";
import { shelterTreatmentBonus } from "@/lib/shelter-projects";
import { advanceParticipantTime } from "@/lib/time";
import { participantTimePreview, survivorTimedCommitment } from "@/lib/activity";

type Edit = (fn: (draft: GameState) => void) => void;
const infectionStates: Infection[] = ["Saudável", "Exposto", "Infectado", "Sintomático", "Terminal"];
const tabs = [
  { id: "resumo", label: "Resumo", icon: Activity },
  { id: "atributos", label: "Atributos", icon: Crosshair },
  { id: "combate", label: "Combate", icon: Swords },
  { id: "habilidades", label: "Habilidades", icon: Sparkles },
  { id: "inventario", label: "Inventário", icon: Backpack },
  { id: "condicoes", label: "Condições", icon: HeartPulse },
  { id: "historia", label: "História", icon: History },
] as const;

function SectionHeading({ index, title, aside }: { index: string; title: string; aside?: ReactNode }) {
  return <div className="character-section-heading"><div><span>{index}</span><h3>{title}</h3></div>{aside}</div>;
}

function DamageThresholds({ major, severe }: { major: number; severe: number }) {
  return <div className="character-thresholds" role="group" aria-label={`Limiares de dano: leve abaixo de ${major}, maior a partir de ${major}, severo a partir de ${severe}`}>
    <span className="character-thresholds-title">LIMIARES DE DANO</span>
    <div className="character-thresholds-track">
      <span className="character-threshold-light"><small>LEVE</small><strong>&lt; {major}</strong></span>
      <span className="character-threshold-major"><small>MAIOR</small><strong>≥ {major}</strong></span>
      <span className="character-threshold-severe"><small>SEVERO</small><strong>≥ {severe}</strong></span>
    </div>
  </div>;
}

function Portrait({ survivor, editable, onUpload, onClear }: {
  survivor: Survivor; editable: boolean; onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}) {
  const initials = survivor.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "ZM";
  return <div className="character-portrait-wrap">
    <div className="character-portrait" role="img" aria-label={`Retrato de ${survivor.name}`}>
      {survivor.portrait ? <img src={survivor.portrait} alt="" /> : <span aria-hidden="true">{initials}</span>}
    </div>
    {editable && <div className="character-portrait-actions">
      <label className="character-portrait-upload" title="Enviar retrato" aria-label="Enviar retrato">
        <Upload size={13} aria-hidden="true" /><span>Retrato</span>
        <input type="file" accept="image/*" aria-label="Escolher retrato" onChange={onUpload} />
      </label>
      {survivor.portrait && <button type="button" onClick={onClear} aria-label="Remover retrato" title="Remover retrato">×</button>}
    </div>}
  </div>;
}

function ResourceControl({ label, icon: Icon, current, max, onChange, tone, reverse = false }: {
  label: string; icon: typeof Heart; current: number; max: number;
  onChange: (value: number) => void; tone: string; reverse?: boolean;
}) {
  const safeMax = Math.max(0, max);
  const value = Math.max(0, Math.min(current, safeMax));
  return <div className={`character-resource character-resource-${tone}${safeMax > 0 && value >= safeMax ? " is-maxed" : ""}`}>
    <div className="character-resource-top"><span><Icon size={17} aria-hidden="true" /> {label}</span><strong aria-label={`${label}: ${value} de ${safeMax}`}>{value}<small> / {safeMax}</small></strong></div>
    <div className="character-resource-bottom">
      <div className="character-pips" aria-hidden="true">{Array.from({ length: safeMax }, (_, i) => <span key={i} className={i < value ? "filled" : ""} />)}</div>
      <div className="character-stepper">
        <button type="button" aria-label={`Diminuir ${label}`} title={`Diminuir ${label}`} disabled={value <= 0} onClick={() => onChange(value - 1)}><Minus size={16} /></button>
        <button type="button" aria-label={`Aumentar ${label}`} title={`Aumentar ${label}`} disabled={value >= safeMax} onClick={() => onChange(value + 1)}><Plus size={16} /></button>
      </div>
    </div>
    {reverse && <span className="sr-only">O valor exibido corresponde aos espaços disponíveis; os danos marcados são registrados automaticamente.</span>}
  </div>;
}

export type RestPeer = {
  id: string;
  name: string;
  portrait?: string;
  archetype?: string;
  specialty?: string;
  hex?: string;
  infection?: Infection;
  hp?: number;
  hpMax?: number;
  stress?: number;
  hope?: number;
};

function RestPlanner({ game, edit, selected, playerMode, playerPreview, restPeers = [] }: {
  game: GameState; edit: Edit; selected: Survivor; playerMode: boolean; playerPreview: boolean; restPeers?: RestPeer[];
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<RestKind>("short");
  const [choices, setChoices] = useState<Record<string, [RestChoice, RestChoice]>>({});
  const personalPlanning = playerMode || playerPreview;
  const canResolve = !personalPlanning;
  const actors = personalPlanning ? [selected] : game.survivors;
  const busyActors = actors.map(person => ({ person, commitment: survivorTimedCommitment(game, person.id) })).filter(row => row.commitment);
  const longRestPreview = participantTimePreview(game, canResolve ? game.survivors.map(person => person.id) : actors.map(person => person.id), restDurationMinutes.long);
  const longCrossesDay = kind === "long" && !longRestPreview.ok;
  const peers = playerMode
    ? (restPeers.some(person => person.id === selected.id)
      ? restPeers
      : [{ id: selected.id, name: selected.name, hex: survivorHex(game, selected) }, ...restPeers])
    : game.survivors.map(person => ({ id: person.id, name: person.name, hex: survivorHex(game, person) }));
  const targetsFor = (person: Survivor) => peers
    .filter(peer => (peer.hex ?? game.partyHex) === survivorHex(game, person))
    .map(peer => ({ value: peer.id, label: peer.name }));

  function defaultChoices(person: Survivor, nextKind: RestKind): [RestChoice, RestChoice] {
    const planned = person.restPlan;
    const targetIds = new Set(targetsFor(person).map(option => option.value));
    if (planned?.kind === nextKind && planned.choices.length === 2 && planned.choices.every(choice =>
      restActionsFor(nextKind).includes(choice.action as RestAction) && targetIds.has(choice.targetId))) {
      return planned.choices as [RestChoice, RestChoice];
    }
    const action = restActionsFor(nextKind)[0]!;
    return [{ action, targetId: person.id }, { action, targetId: person.id }];
  }

  function begin(nextKind: RestKind) {
    setKind(nextKind);
    setChoices(Object.fromEntries(actors.map(person => [person.id, defaultChoices(person, nextKind)])) as Record<string, [RestChoice, RestChoice]>);
    setOpen(true);
  }
  function updateChoice(survivorId: string, index: 0 | 1, field: keyof RestChoice, value: string) {
    setChoices(current => {
      const actor = actors.find(person => person.id === survivorId) ?? selected;
      const existing = current[survivorId] ?? defaultChoices(actor, kind);
      const next: [RestChoice, RestChoice] = [...existing] as [RestChoice, RestChoice];
      next[index] = { ...next[index], [field]: field === "action" ? value as RestAction : value };
      return { ...current, [survivorId]: next };
    });
  }
  function savePersonalPlan() {
    const personalChoices = choices[selected.id] ?? defaultChoices(selected, kind);
    edit(draft => {
      const person = draft.survivors.find(candidate => candidate.id === selected.id);
      if (person) person.restPlan = { kind, choices: personalChoices };
    });
    toast.success("Escolhas de descanso registradas", { description: "O mestre verá as suas duas ações ao concluir o descanso da mesa." });
    setOpen(false);
  }
  function resolve() {
    const selections = game.survivors.map(person => ({ survivorId: person.id, choices: choices[person.id] ?? defaultChoices(person, kind) }));
    if (kind === "long" && longCrossesDay) {
      edit(draft => {
        for (const selection of selections) {
          const person = draft.survivors.find(candidate => candidate.id === selection.survivorId);
          if (person) person.restPlan = { kind: "long", choices: structuredClone(selection.choices) };
        }
      });
      toast.success("Descanso longo preparado para a noite", { description: "As escolhas foram salvas. Use Encerrar dia para aplicar o descanso durante a noite e iniciar o próximo amanhecer." });
      setOpen(false);
      return;
    }
    let completed = false;
    let failure = "Não foi possível aplicar este descanso.";
    let fear = 0;
    let minutes = 0;
    edit(draft => {
      const result = resolveGroupRest(draft, kind, selections);
      if (result.ok) { completed = true; fear = result.fear; minutes = result.minutes; }
      else failure = result.message;
    });
    if (!completed) { toast.error(failure); return; }
    toast.success(`Descanso ${kind === "short" ? "curto" : "longo"} concluído`, { description: `As duas escolhas de cada sobrevivente foram aplicadas. +${minutes / 60}h no relógio · Medo +${fear}.` });
    setOpen(false);
  }

  return <section className="character-surface character-rest-panel"><SectionHeading index="05" title={personalPlanning ? "Seu descanso" : "Descanso da mesa"} aside={<span className="character-micro">2 AÇÕES POR PESSOA</span>} />
    <p className="character-section-intro">Curto leva <b>1h</b> e recupera recursos com d4+1; longo leva <b>6h</b> e limpa o recurso escolhido. Cada ação pode beneficiar você ou outra pessoa no mesmo hex. Preparar concede Esperança automaticamente.</p>
    {busyActors.length > 0 && <p className="character-rule-note"><b>Ocupado:</b> {busyActors.map(row => `${row.person.name} · ${row.commitment!.label}`).join(" · ")}. Um personagem não pode usar as mesmas horas em trabalho e descanso.</p>}
    <div className="character-rest-actions"><Button size="sm" variant="outline" disabled={!actors.length} onClick={() => begin("short")}><Moon size={16} /> Descanso curto · 1h</Button>
      <Button size="sm" disabled={!actors.length} onClick={() => begin("long")}><Moon size={16} /> Descanso longo · 6h</Button></div>
    {personalPlanning && selected.restPlan && <p className="character-rest-status">Escolhas de descanso {selected.restPlan.kind === "short" ? "curto" : "longo"} registradas. Você pode alterá-las antes da conclusão.</p>}
    {playerPreview && !playerMode && <p className="character-rest-preview-note">Prévia interativa: as escolhas são registradas para o sobrevivente selecionado, como aconteceria no acesso do jogador.</p>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="rest-planner-dialog"><DialogHeader><DialogTitle>{personalPlanning ? "Escolher seu" : "Organizar"} descanso {kind === "short" ? "curto" : "longo"}</DialogTitle>
      <DialogDescription>{personalPlanning ? `Defina as duas ações e quem receberá cada benefício. ${kind === "short" ? "O descanso curto consome 1h." : "O descanso longo consome 6h; se atravessar o fim do dia, o mestre o conclui em Encerrar dia."}` : longCrossesDay ? "Este descanso longo atravessaria o fim do dia. Confirmar agora salva as escolhas para serem aplicadas durante Encerrar dia." : `As escolhas já registradas pelos jogadores aparecem aqui. Ao concluir, o relógio avança ${kind === "short" ? "1h" : "6h"}, além de aplicar valores, Medo e renovação de habilidades.`}</DialogDescription></DialogHeader>
      <div className="rest-planner-list">{actors.map(person => {
        const selectedChoices = choices[person.id] ?? defaultChoices(person, kind);
        const options = restActionsFor(kind).map(action => ({ value: action, label: restActionLabels[action] }));
        const targetOptions = targetsFor(person);
        return <div className="rest-planner-row" key={person.id}><b>{person.name} · Hex {survivorHex(game, person)}</b><div className="rest-planner-choices">
          {[0, 1].map(index => <div className="rest-planner-action" key={index}>
            <span className="rest-planner-action-title">{index === 0 ? "AÇÃO 1" : "AÇÃO 2"}</span>
            <Pick label="O que fazer" value={selectedChoices[index as 0 | 1].action} options={options} onChange={value => updateChoice(person.id, index as 0 | 1, "action", value)} />
            <Pick label="Quem recebe o benefício" value={selectedChoices[index as 0 | 1].targetId} options={targetOptions} onChange={value => updateChoice(person.id, index as 0 | 1, "targetId", value)} />
          </div>)}
        </div></div>;
      })}</div>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={canResolve ? resolve : savePersonalPlan}>{canResolve ? (longCrossesDay ? "Preparar para Encerrar dia" : `Aplicar descanso · +${restDurationMinutes[kind] / 60}h`) : "Registrar escolhas"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}

function AbilityUseControl({ game, edit, survivorId, abilityId, name, effect, hopeFeature = false, buttonLabel, context: controlledContext, onContextChange }: {
  game: GameState; edit: Edit; survivorId: string; abilityId: string; name: string; effect: string; hopeFeature?: boolean; buttonLabel?: string;
  context?: string; onContextChange?: (value: string) => void;
}) {
  const period = abilityPeriod(effect);
  const costs = abilityCosts(effect, hopeFeature);
  const [open, setOpen] = useState(false);
  const [cost, setCost] = useState<AbilityCost>(costs[0]);
  const [localContext, setLocalContext] = useState("");
  const context = controlledContext ?? localContext;
  const setContext = onContextChange ?? setLocalContext;
  const person = game.survivors.find(s => s.id === survivorId);
  const placeOrPatient = period === "place" || period === "patient";
  const { currentHex, target, available, used, label } = abilityUseState(game, survivorId, abilityId, effect, context);
  const canPay = person && (cost === "free" || cost === "hope1" && person.hope >= 1 || cost === "hope3" && person.hope >= 3 ||
    cost === "stress1" && person.stress < 6 || cost === "armor1" && (person.armorMarked ?? 0) < survivorStats(person).armor);
  if (!period && costs.length === 1 && costs[0] === "free" && !hopeFeature) return null;
  function register() {
    let succeeded = false;
    edit(draft => { succeeded = recordAbilityUse(draft, survivorId, abilityId, name, effect, cost, target, hopeFeature); });
    if (!succeeded) { toast.error("Uso não registrado. Confira o custo e o limite da habilidade."); return; }
    toast.success(`${name}: uso registrado.`, { description: `Custo: ${costLabels[cost]}. Resolva o efeito na cena.` });
    setOpen(false);
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button size="sm" variant="outline" className={used ? "character-ability-used-control" : undefined} disabled={(!placeOrPatient && !available) || (hopeFeature && !canPay)}>
      {used ? <><Check size={14} aria-hidden="true" />{label}</>
        : hopeFeature && !canPay ? "Exige 3 Esperança" : buttonLabel ?? "Registrar uso"}
    </Button></DialogTrigger>
    <DialogContent className="ability-use-dialog"><DialogHeader><DialogTitle>Usar {name}</DialogTitle>
      <DialogDescription>Confirme que o gatilho ocorreu. O aplicativo desconta o recurso e guarda o limite de uso; resolva o efeito descrito com o grupo.</DialogDescription></DialogHeader>
      <p className="character-rule-note">{effect}</p>
      {period && <p className="inventory-hint"><b>Limite:</b> {periodLabels[period]}{period === "place" ? " identificado abaixo" : period === "patient" ? /durante um descanso curto/i.test(effect) ? " por descanso curto" : " por cena" : ""}.</p>}
      {placeOrPatient && <Field label={period === "patient" ? "Nome do paciente" : "Hex ou local da descoberta"} value={context}
        onChange={setContext} placeholder={period === "patient" ? "Ex.: Joana" : `hex ${currentHex}`} />}
      {costs.length > 1 && <Pick label="Custo desta opção" value={cost} options={costs.map(value => ({ value, label: costLabels[value] }))} onChange={value => setCost(value as AbilityCost)} />}
      {costs.length === 1 && <p className="inventory-hint"><b>Custo:</b> {costLabels[cost]}.</p>}
      {used && <p className="inventory-danger" role="status">{label}. {placeOrPatient ? "Você pode indicar outro alvo/local acima." : "Aguarde a renovação do limite para usar novamente."}</p>}
      {!canPay && <p className="inventory-danger" role="status">O recurso disponível não cobre o custo escolhido.</p>}
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
        <Button disabled={!available || !canPay} onClick={register}>Confirmar uso</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function AbilityCard({ game, edit, survivorId, abilityId, name, category, effect }: {
  game: GameState; edit: Edit; survivorId: string; abilityId: string; name: string; category: string; effect?: string;
}) {
  const text = effect || "Nenhuma descrição registrada.";
  const period = abilityPeriod(text);
  const frequency = period ? periodLabels[period] : undefined;
  const cost = text.match(/(?:gaste|marque) \d+ (?:Hope|Stress|Esperança|Estresse)/i)?.[0];
  const reaction = /reaç[aã]o|ap[oó]s .* rolagem|antes de um ataque/i.test(text);
  const [contexts, setContexts] = useState<Record<string, string>>({});
  const options = abilityUseOptions(abilityId, name, text);
  const usedOptions = options.map(option => ({ ...option, ...abilityUseState(game, survivorId, option.abilityId, option.effect, contexts[option.abilityId]) })).filter(option => option.used);
  const usage = usedOptions.length === 0 ? "available" : usedOptions.length === options.length ? "used" : "partial";
  return <AccordionItem value={`${category}-${name}`} className={`character-ability${usedOptions.length ? " character-ability--used" : ""}`} data-usage={usage}>
    <AccordionTrigger className="character-ability-trigger">
      <AbilityArt abilityId={abilityId} />
      <span className="character-ability-main"><span className="character-ability-title">{name}</span>
        <span className="character-ability-meta"><span>{category}</span>{frequency && <span>{frequency}</span>}{cost && <span>{cost}</span>}{reaction && <span>Reação</span>}</span>
        {usedOptions.length > 0 && <span className="character-ability-status" role="status">{usedOptions.map(option => <span className="character-ability-used-label" key={option.abilityId}><Check size={13} aria-hidden="true" />{option.scope && `${option.scope}: `}{option.label}</span>)}{usage === "partial" && <span>Outro uso disponível</span>}</span>}
        <span className="character-ability-preview">{text}</span>
      </span>
    </AccordionTrigger>
    <AccordionContent className="character-ability-detail"><p>{text}</p>
      {effect && <div className="character-ability-actions">{options.map(option => <AbilityUseControl key={option.abilityId} game={game} edit={edit} survivorId={survivorId}
        {...option} context={contexts[option.abilityId] ?? ""} onContextChange={value => setContexts(previous => ({ ...previous, [option.abilityId]: value }))} />)}</div>}
    </AccordionContent>
  </AccordionItem>;
}

function deadlineLabel(deadline: number | null | undefined) {
  if (deadline == null) return "—";
  return `dia ${Math.floor(deadline / 1440) + 1}, ${String(Math.floor((deadline % 1440) / 60)).padStart(2, "0")}:${String(deadline % 60).padStart(2, "0")}`;
}

export function SurvivorPanel({ game, edit, playerPreview, playerMode = false, restPeers = [], onOpenConflict }: { game: GameState; edit: Edit; playerPreview: boolean; playerMode?: boolean; restPeers?: RestPeer[]; onOpenConflict?: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("resumo");
  const [notesDraft, setNotesDraft] = useState<{ id: string; source: string; value: string } | null>(null);
  const [portraitError, setPortraitError] = useState("");
  const [treatmentOpen, setTreatmentOpen] = useState(false);
  const [treatmentSource, setTreatmentSource] = useState("");
  const [cleanWaterConfirmed, setCleanWaterConfirmed] = useState(false);
  const [rollRequest, setRollRequest] = useState<RollRequest | null>(null);
  const [combatTargetId, setCombatTargetId] = useState("");
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [inventoryCategory, setInventoryCategory] = useState("Todas");
  const selected = game.survivors.find(s => s.id === selectedId) ?? game.survivors[0];
  const notes = notesDraft && selected && notesDraft.id === selected.id && notesDraft.source === selected.notes
    ? notesDraft.value : selected?.notes ?? "";
  const stats = selected ? survivorStats(selected) : null;
  const down = selected ? survivorIsDown(selected) : false;
  const cart = selected ? activeCart(selected) : null;
  const cartLoad = cart ? cartStoredLoad(cart.cartItems ?? []) : 0;
  const origin = selected ? content.origins.find(o => o.name === selected.origin) : null;
  const archetype = selected ? content.archetypes.find(a => a.name === selected.archetype) : null;
  const hopeFeature = archetype?.hopeFeature ?? "";
  const hopeSeparator = hopeFeature.indexOf(":");
  const hopeName = hopeSeparator >= 0 ? hopeFeature.slice(0, hopeSeparator).trim() : "Característica de Esperança";
  const hopeEffect = hopeSeparator >= 0 ? hopeFeature.slice(hopeSeparator + 1).trim() : hopeFeature;
  const primary = selected ? getPrimary(selected.primary) : null;
  const secondary = selected ? getSecondary(selected.secondary) : null;
  const quickAttack = primary
    ? { slot: "primary" as const, name: selected?.primary || primary.name, category: "Armas primárias", details: `${primary.damage} · ${primary.range} · ${traitLabel(primary.trait)}` }
    : secondary
      ? { slot: "secondary" as const, name: selected?.secondary || secondary.name, category: "Armas secundárias", details: `${secondary.damage} · ${secondary.range} · ${traitLabel(secondary.trait)}` }
      : { slot: "unarmed" as const, name: unarmedAttack.name, category: "", details: `${unarmedAttack.damage} · ${unarmedAttack.range} · Força ou Acuidade` };
  const primaryAmmoType = selected ? weaponAmmoType(selected.primary) : null;
  const primaryAmmoTotal = selected && primaryAmmoType ? ammunitionCount(selected.inventory, primaryAmmoType) : 0;
  const primaryAmmoAvailable = selected && primaryAmmoType ? ammunitionCount(selected.inventory, primaryAmmoType, true) : 0;
  const primaryAmmoCommitted = Math.max(0, primaryAmmoTotal - primaryAmmoAvailable);
  const totalAmmoUnits = selected ? ammunitionTypes.reduce((sum, type) => sum + ammunitionCount(selected.inventory, type), 0) : 0;
  const protection = selected ? getProtection(selected.protection) : null;
  const modifiers = selected ? equipmentModifiers(selected) : null;
  const personal = selected ? content.personal.find(a => a.name === selected.personal) : null;
  const recentRolls = selected ? game.log.filter(entry => ["dados", "dano"].includes(entry.kind) &&
    (entry.actorId === selected.id || (!entry.actorId && entry.text.startsWith(`${selected.name}:`)))).slice(0, 4) : [];
  const teamPeers = playerMode
    ? (restPeers.length ? restPeers : game.survivors.map(person => {
        const personStats = survivorStats(person);
        return {
          id: person.id, name: person.name, portrait: person.portrait, archetype: person.archetype,
          specialty: person.specialty, hex: person.hex ?? game.partyHex, infection: person.infection,
          hp: Math.max(0, Math.min(personStats.hp, person.hp)), hpMax: personStats.hp,
          stress: person.stress, hope: person.hope,
        } satisfies RestPeer;
      }))
    : [];
  const rosterCount = playerMode ? teamPeers.length : game.survivors.length;

  const inventoryGroups = useMemo(() => {
    if (!selected) return [];
    const grouped = new Map<string, typeof selected.inventory>();
    for (const item of selected.inventory) {
      const category = catalogForItem(item)?.category ?? item.category ?? "Outros";
      const searchText = [item.name, category, item.condition ?? ""].join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
      const query = inventoryQuery.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
      if ((inventoryCategory !== "Todas" && category !== inventoryCategory) || !searchText.includes(query)) continue;
      grouped.set(category, [...(grouped.get(category) ?? []), item]);
    }
    return [...grouped.entries()];
  }, [selected, inventoryQuery, inventoryCategory]);
  const categoryOptions = ["Todas", ...new Set(selected?.inventory.map(item => catalogForItem(item)?.category ?? item.category ?? "Outros"))];
  const medicineSources = [
    ...(!playerMode && selected && atSharedStorage(game, selected.id) && game.shelter.medications > 0 ? [{ value: "shared", label: "Reservas compartilhadas · " + game.shelter.medications }] : []),
    ...(selected?.inventory.filter(item => countsAsMedication(item)).map(item => ({ value: item.id, label: item.name + " · " + item.qty })) ?? []),
  ];
  const chosenMedicine = medicineSources.some(option => option.value === treatmentSource) ? treatmentSource : medicineSources[0]?.value ?? "";
  const treatmentSupport = selected ? shelterTreatmentBonus(game, selected.id) : { bonus: 0, sources: [] as string[] };
  const foodProvision = selected ? provisionBreakdown(selected, "food") : null;
  const waterProvision = selected ? provisionBreakdown(selected, "water") : null;

  function change(id: string, fn: (s: Survivor) => void) {
    edit(draft => { const s = draft.survivors.find(x => x.id === id); if (s) fn(s); });
  }
  function openSurvivor(id: string, tab = "resumo") {
    setSelectedId(id); setActiveTab(tab); setPortraitError(""); setInventoryQuery(""); setInventoryCategory("Todas");
  }


  function beginRoll(request: RollRequest) {
    const actor = game.survivors.find(person => person.id === request.survivorId);
    if (request.kind === "attack" && actor && survivorIsDown(actor)) {
      toast.error("Sobrevivente caído", { description: "Reduza os PV marcados antes de realizar novos ataques." });
      return;
    }
    const targetThreatId = request.kind === "attack" && combatTargetId ? combatTargetId : undefined;
    setRollRequest(targetThreatId ? { ...request, targetThreatId } : request);
  }
  function storeActive(slot: EquipmentSlot) {
    if (!selected) return;
    edit(draft => {
      const s = draft.survivors.find(x => x.id === selected.id);
      if (!s || !s[slot]) return;
      const name = s[slot];
      if (stowSlot(s, slot)) { addLog(draft, "inventário", s.name + " guardou " + name + " do kit ativo.", s.id);
        toast.success(`${name} guardado.`, { description: "Disponível na lista de itens do inventário." }); }
    });
  }

  async function uploadPortrait(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selected) return;
    if (!file.type.startsWith("image/") || file.size > 8_000_000) { setPortraitError("Escolha uma imagem de até 8 MB."); return; }
    const id = selected.id;
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(); image.src = url; });
      let encoded = "";
      for (const size of [160, 128, 96]) {
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas");
        const side = Math.min(image.naturalWidth, image.naturalHeight);
        ctx.drawImage(image, (image.naturalWidth-side)/2, (image.naturalHeight-side)/2, side, side, 0, 0, size, size);
        for (const quality of [0.7, 0.5, 0.35]) {
          encoded = canvas.toDataURL("image/webp", quality);
          if (encoded.length <= 9_000) break;
        }
        if (encoded.length <= 9_000) break;
      }
      if (encoded.length > 9_000) { setPortraitError("A imagem não pôde ser reduzida; tente outra."); return; }
      change(id, s => { s.portrait = encoded; });
      setPortraitError("");
    } catch { setPortraitError("Não foi possível abrir essa imagem."); }
    finally { URL.revokeObjectURL(url); }
  }

  function treatExposure() {
    if (!selected || selected.infection !== "Exposto" || selected.treatmentAttempted ||
        (selected.exposureDeadline ?? 0) < absoluteMinutes(game) || !chosenMedicine || !cleanWaterConfirmed) return;
    const commitment = survivorTimedCommitment(game, selected.id);
    if (commitment) { toast.error("Tratamento indisponível", { description: commitment.label + "." }); return; }
    const treatmentPreview = participantTimePreview(game, [selected.id], 30);
    if (!treatmentPreview.ok || (game.day - 1) * 1440 + treatmentPreview.endMinute > (selected.exposureDeadline ?? 0)) {
      toast.error("Não há tempo suficiente", { description: "O tratamento leva 30 min e precisa terminar dentro da janela de Exposição e antes da passagem de dia." });
      return;
    }
    const hope = rollDie(12), fear = rollDie(12);
    const support = shelterTreatmentBonus(game, selected.id);
    const total = hope + fear + (selected.attributes.Conhecimento ?? 0) + support.bonus;
    const success = hope === fear || total >= 13;
    let applied = false;
    let failure = "Não foi possível concluir o tratamento.";
    edit(draft => {
      const s = draft.survivors.find(x => x.id === selected.id);
      if (!s || s.infection !== "Exposto" || s.treatmentAttempted) return;
      const busy = survivorTimedCommitment(draft, s.id);
      if (busy) { failure = busy.label; return; }
      const treatmentPreview = participantTimePreview(draft, [s.id], 30);
      if (!treatmentPreview.ok || (draft.day - 1) * 1440 + treatmentPreview.endMinute > (s.exposureDeadline ?? 0)) {
        failure = "A janela de Exposição termina antes dos 30 min necessários para o tratamento."; return;
      }
      if (chosenMedicine === "shared") {
        if (!atSharedStorage(draft, s.id) || draft.shelter.medications < 1) { failure = "A fonte de Medicamentos não está mais acessível."; return; }
      } else {
        const item = s.inventory.find(x => x.id === chosenMedicine);
        if (!item || !countsAsMedication(item) || item.qty < 1) { failure = "O item de tratamento não está mais disponível."; return; }
      }
      if (!advanceParticipantTime(draft, [s.id], 30, `Tratamento de Exposição de ${s.name}: 30 min reservados.`).ok) {
        failure = "Não foi possível avançar o relógio para o tratamento."; return;
      }
      let sourceLabel = "";
      if (chosenMedicine === "shared") {
        draft.shelter.medications -= 1;
        sourceLabel = "reservas compartilhadas";
      } else {
        const item = s.inventory.find(x => x.id === chosenMedicine)!;
        sourceLabel = item.name;
        if (!discardItem(draft, s.id, item.id, 1)) { failure = "Não foi possível consumir o Medicamentos selecionado."; return; }
      }
      s.treatmentAttempted = true;
      if (success) { s.infection = "Saudável"; s.exposureDeadline = null; }
      if (hope === fear) { s.hope = Math.min(6, s.hope + 1); s.stress = Math.max(0, s.stress - 1); }
      else if (hope > fear) s.hope = Math.min(6, s.hope + 1);
      else draft.fear = Math.min(12, draft.fear + 1);
      addLog(draft, "tratamento", s.name + ": limpeza de Exposição (" + hope + " Esperança / " + fear + " Medo + Conhecimento" +
        (support.bonus ? " + " + support.bonus + " infraestrutura [" + support.sources.join(" + ") + "]" : "") + " = " + total +
        ", Dificuldade 13). " + (success ? "Saudável" : "Permanece Exposto") + ". Gastou 1 Medicamentos de " + sourceLabel + ".", s.id);
      applied = true;
    });
    if (!applied) { toast.error("Tratamento não concluído", { description: failure }); return; }
    toast.success("Tratamento concluído", { description: "30 min foram consumidos no relógio da campanha." });
    setTreatmentOpen(false); setCleanWaterConfirmed(false);
  }

  return <div className="character-sheet">
    <div className="character-roster" aria-label="Sobreviventes da campanha" title={playerMode ? "A equipe mostra a situação pública de todos os sobreviventes. Sua própria ficha continua sendo a única editável." : "No computador, clique com o botão direito em um sobrevivente para ações rápidas."}>
      <div className="character-roster-label"><span>Equipe</span><b>{rosterCount.toString().padStart(2, "0")}</b></div>
      <div className="character-roster-scroll">
        {playerMode ? teamPeers.map(peer => {
          const own = game.survivors.find(person => person.id === peer.id);
          if (own) {
            const st = survivorStats(own);
            return <SurvivorContextMenu key={own.id}
              game={game} edit={edit} survivor={own} canControl masterMode={false}
              onOpenTab={tab => openSurvivor(own.id, tab)}
              onRoll={request => { openSurvivor(own.id, request.kind === "attack" ? "combate" : "atributos"); beginRoll(request); }}>
              <button type="button" onClick={() => openSurvivor(own.id)}
                aria-current={selected?.id === own.id ? "true" : undefined} className="character-roster-person survivor-context-target">
                <span className="character-roster-avatar">{own.portrait ? <img src={own.portrait} alt="" /> : own.name.charAt(0).toUpperCase()}</span>
                <span><b>{own.name}</b>
                  <small><Heart size={12} aria-hidden="true" /> {own.hp}/{st.hp} PV marcados<span aria-hidden="true"> · </span>{own.archetype}</small>
                  <small className="character-roster-state"><Activity size={11} aria-hidden="true" /> {own.infection}<span aria-hidden="true"> · </span>Hex {survivorHex(game, own)}<span aria-hidden="true"> · </span>Estresse {own.stress}<span aria-hidden="true"> · </span>Esperança {own.hope}</small>
                </span>
              </button>
            </SurvivorContextMenu>;
          }
          return <div key={peer.id} className="character-roster-person character-roster-peer" title={`${peer.name}: ficha de outro jogador, exibida apenas como resumo da equipe.`}>
            <span className="character-roster-avatar">{peer.portrait ? <img src={peer.portrait} alt="" /> : peer.name.charAt(0).toUpperCase()}</span>
            <span><b>{peer.name}</b>
              <small><Heart size={12} aria-hidden="true" /> {peer.hp ?? "—"}/{peer.hpMax ?? "—"} PV marcados<span aria-hidden="true"> · </span>{peer.archetype ?? "Sobrevivente"}</small>
              <small className={`character-roster-state ${peer.infection && peer.infection !== "Saudável" ? "at-risk" : ""}`}><Activity size={11} aria-hidden="true" /> {peer.infection ?? "Estado não informado"}<span aria-hidden="true"> · </span>Hex {peer.hex ?? "—"}<span aria-hidden="true"> · </span>Estresse {peer.stress ?? "—"}<span aria-hidden="true"> · </span>Esperança {peer.hope ?? "—"}</small>
            </span>
          </div>;
        }) : game.survivors.map(s => { const st = survivorStats(s); const canControl = !playerPreview; const masterMode = !playerPreview; return <SurvivorContextMenu key={s.id}
          game={game} edit={edit} survivor={s} canControl={canControl} masterMode={masterMode}
          onOpenTab={tab => openSurvivor(s.id, tab)}
          onRoll={request => { openSurvivor(s.id, request.kind === "attack" ? "combate" : "atributos"); beginRoll(request); }}>
          <button type="button" onClick={() => openSurvivor(s.id)}
            aria-current={selected?.id === s.id ? "true" : undefined} className="character-roster-person survivor-context-target">
            <span className="character-roster-avatar">{s.portrait ? <img src={s.portrait} alt="" /> : s.name.charAt(0).toUpperCase()}</span>
            <span><b>{s.name}</b><small><Heart size={12} aria-hidden="true" /> {s.hp}/{st.hp} PV marcados<span aria-hidden="true"> · </span>{s.archetype}</small>
              <small className="character-roster-state"><Footprints size={11} aria-hidden="true" /> Hex {survivorHex(game, s)}<span aria-hidden="true"> · </span>{s.infection}</small></span>
          </button>
        </SurvivorContextMenu>; })}
        {rosterCount === 0 && <span className="character-roster-empty">Nenhum dossiê aberto. Crie o primeiro sobrevivente.</span>}
      </div>
      {!playerPreview && <CharacterWizard onCreate={survivor => {
        edit(draft => { draft.survivors.push(survivor); addLog(draft, "sobrevivente", `${survivor.name} entrou para a equipe.`); });
        setSelectedId(survivor.id); setActiveTab("resumo"); setPortraitError("");
      }} />}
    </div>

    {!selected || !stats ? <div className="panel character-empty"><BookOpen size={36} aria-hidden="true" /><h2>O dossiê começa aqui</h2><p>A origem define o passado; o arquétipo define como a pessoa atua agora.</p></div> : <>
      <header className="character-hero">
        <Portrait survivor={selected} editable={!playerPreview || playerMode} onUpload={uploadPortrait} onClear={() => change(selected.id, s => { delete s.portrait; })} />
        <div className="character-identity">
          <p className="character-serial">ZONA MORTA <span aria-hidden="true">/</span> DOSSIÊ DE SOBREVIVENTE</p>
          <h2>{selected.name}</h2>
          <div className="character-identity-meta"><span>{selected.origin}</span><span>{selected.archetype} · {selected.specialty}</span><span>Nível {selected.level ?? 1}</span></div>
        </div>
        <div className="character-hero-status">
          <div className="character-hero-condition-block">
            {down && <span className="character-condition fallen"><HeartPulse size={15} aria-hidden="true" /> CAÍDO · {selected.hp}/{stats.hp} PV</span>}
            <span className={selected.infection === "Saudável" ? "character-condition healthy" : "character-condition at-risk"}><Activity size={15} aria-hidden="true" /> {selected.infection}</span>
            {selected.infection === "Exposto" && <span className="character-condition-detail">{selected.treatmentAttempted ? "Tratamento já tentado" : <>Tratamento até <b>{deadlineLabel(selected.exposureDeadline)}</b></>}</span>}
          </div>
          <span className="character-hero-code">REGISTRO {selected.id.slice(0, 6).toUpperCase()}</span>
        </div>
      </header>
      {portraitError && <p className="character-portrait-error" role="alert">{portraitError}</p>}
      <SurvivorConflictHud
        game={game}
        survivor={selected}
        playerMode={playerMode}
        playerPreview={playerPreview}
        targetId={combatTargetId}
        onTargetChange={setCombatTargetId}
        onAttack={targetId => beginRoll({ survivorId: selected.id, kind: "attack", weapon: quickAttack.slot, targetThreatId: targetId })}
        onOpenConflict={onOpenConflict}
      />

      <div className="character-layout">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="character-main">
          <div className="character-tabs-scroll"><TabsList className="character-tabs" aria-label="Áreas da ficha">{tabs.map(tab => <TabsTrigger key={tab.id} value={tab.id} className="character-tab"><tab.icon size={16} aria-hidden="true" />{tab.label}</TabsTrigger>)}</TabsList></div>
          <TabsContent value="resumo" className="character-tab-content">
            <div className="character-summary-grid">
              <section className="character-surface character-summary-action"><SectionHeading index="01" title="Pronto para agir" aside={<span className="character-micro">KIT ATIVO</span>} />
                <div className="character-active-weapon">{quickAttack.category ? <ItemArt name={quickAttack.name} category={quickAttack.category} /> : <EmptyItemArt />}<div><span>{primary ? "Arma principal" : secondary ? "Arma disponível" : "Sem arma equipada"}</span><strong>{quickAttack.name}</strong><small>{quickAttack.details}</small></div>
                  <Button size="sm" variant="outline" className="character-weapon-roll" disabled={down} onClick={() => beginRoll({ survivorId: selected.id, kind: "attack", weapon: quickAttack.slot })}><Dice5 size={16} /> {quickAttack.slot === "unarmed" ? "Desarmado" : "Atacar"}</Button></div>
                {selected.secondary && <div className="character-info-row"><ItemArt name={selected.secondary} category="Armas secundárias" size="small" /><span>Secundária</span><b>{selected.secondary}</b></div>}
                <div className="character-info-row">{selected.protection ? <ItemArt name={selected.protection} category="Proteções" size="small" /> : <EmptyItemArt />}<span>Proteção</span><b>{selected.protection || "Sem proteção"}</b></div>
                {selected.outfit && <div className="character-info-row"><ItemArt name={selected.outfit} category="Trajes e acessórios" size="small" /><span>Traje</span><b>{selected.outfit}</b></div>}
                {cart && <div className="character-info-row"><ShoppingCart size={18} aria-hidden="true" /><span>Carrinho</span><b>{cartLoad}/4 espaços · duas mãos</b></div>}
                <div className="character-info-row">{selected.personal ? <ItemArt name={selected.personal} category="Abrigo, transporte e mochilas" size="small" /> : <EmptyItemArt />}<span>Item pessoal</span><b>{selected.personal || "Nenhum item pessoal"}</b></div>
                <button className="character-text-link" type="button" onClick={() => setActiveTab("combate")}>Abrir detalhes de combate <span aria-hidden="true">↗</span></button>
              </section>
              <section className="character-surface character-summary-resources"><SectionHeading index="02" title="Recursos de campo" />
                <div className="character-provision-grid">
                  <span><Utensils size={18} aria-hidden="true" /><b>{selected.food}</b><small>Comida</small></span>
                  <span><Droplets size={18} aria-hidden="true" /><b>{selected.water}</b><small>Água</small></span>
                  <span><Crosshair size={18} aria-hidden="true" /><b>{totalAmmoUnits}</b><small>Munição</small></span>
                </div>
                <div className="character-load-line"><span><Backpack size={16} aria-hidden="true" /> Carga pessoal</span><b>{stats.carried}/{stats.capacity}</b></div>
                <Progress value={Math.min(100, stats.carried / Math.max(1, stats.capacity) * 100)} />
                {cart && <div className="character-load-line"><span><ShoppingCart size={16} aria-hidden="true" /> Carrinho conduzido</span><b>{cartLoad}/4</b></div>}
                {stats.carried > stats.capacity && <p className="character-alert">Acima da capacidade. Redistribua antes de atravessar.</p>}
                <button className="character-text-link" type="button" onClick={() => setActiveTab("inventario")}>Abrir inventário <span aria-hidden="true">↗</span></button>
              </section>
              <section className="character-surface character-summary-tests"><SectionHeading index="03" title="Testes rápidos" aside={<span className="character-micro">DADOS DE DUALIDADE</span>} />
                <p className="character-section-intro">Escolha um atributo para abrir a rolagem já configurada. Ajustes de equipamento entram automaticamente.</p>
                <div className="character-summary-attributes">
                  {traits.map(trait => {
                    const base = selected.attributes[trait];
                    const equipment = modifiers?.traits[trait] ?? 0;
                    const total = base + equipment;
                    return <button type="button" key={trait} className="character-summary-attribute"
                      onClick={() => beginRoll({ survivorId: selected.id, kind: "action", trait })}
                      aria-label={`Rolar ${traitLabel(trait)}, modificador total ${total}`}
                      title={equipment ? `${traitLabel(trait)}: ${base >= 0 ? "+" : ""}${base} base ${equipment >= 0 ? "+" : ""}${equipment} equipamento` : `Rolar ${traitLabel(trait)}`}>
                      <span><small>{traitLabel(trait)}</small><strong>{total > 0 ? "+" : ""}{total}</strong></span>
                      <Dice5 size={16} aria-hidden="true" />
                    </button>;
                  })}
                </div>
                <button className="character-text-link" type="button" onClick={() => setActiveTab("atributos")}>Abrir atributos e Experiências <span aria-hidden="true">↗</span></button>
              </section>
              <section className="character-surface character-summary-specialties"><SectionHeading index="04" title="Especialidades" />
                <div className="character-specialties-layout">
                  <div className="character-specialties-experiences">
                    <div className="character-experience"><b>{origin?.experience || selected.origin}</b><span>Experiência de origem · +2 por 1 Esperança</span></div>
                    <div className="character-experience"><b>{selected.freeExperience}</b><span>Experiência livre · +2 por 1 Esperança</span></div>
                  </div>
                  <button className="character-hope-teaser" type="button" onClick={() => setActiveTab("habilidades")}
                    aria-label={`Ler habilidade de Esperança: ${hopeName}`}>
                    <AbilityArt abilityId={`hope:${selected.archetype}`} /><span className="character-hope-teaser-copy"><small>HABILIDADE DE ESPERANÇA</small><b>{hopeName}</b></span><strong>3 Esperança</strong>
                  </button>
                </div>
                <div className="character-specialties-footer">
                  <div className="character-technique-preview">{selected.techniques.map(name => <span key={name}><AbilityArt abilityId={`technique:${name}`} size="tiny" />{name}</span>)}</div>
                  <button className="character-text-link" type="button" onClick={() => setActiveTab("habilidades")}>Consultar habilidades <span aria-hidden="true">↗</span></button>
                </div>
              </section>
              <RestPlanner game={game} edit={edit} selected={selected} playerMode={playerMode} playerPreview={playerPreview} restPeers={restPeers} />
            </div>
          </TabsContent>
          <TabsContent value="atributos" className="character-tab-content">
            <section className="character-surface"><SectionHeading index="01" title="Atributos e testes" aside={<span className="character-micro">DADOS DE DUALIDADE</span>} />
              <p className="character-section-intro">Clique em um atributo para rolar. Uma Experiência pertinente acrescenta +2 ao gastar 1 Esperança; declare seu uso antes da rolagem.</p>
              <div className="character-attributes">{traits.map(trait => <button type="button" key={trait} className="character-attribute" onClick={() => beginRoll({ survivorId: selected.id, kind: "action", trait })} aria-label={`Rolar ${traitLabel(trait)}, modificador ${selected.attributes[trait]}`}><span>{traitLabel(trait)}</span><strong>{selected.attributes[trait] > 0 ? "+" : ""}{selected.attributes[trait]}</strong><Dice5 size={15} aria-hidden="true" /></button>)}</div>
              {Object.entries(modifiers?.traits ?? {}).some(([, value]) => value !== 0) && <p className="character-rule-note">Equipamento: {Object.entries(modifiers?.traits ?? {}).filter(([, value]) => value !== 0).map(([name, value]) => `${value} em ${traitLabel(name)}`).join(" · ")}. Os atributos acima são os valores base; os ajustes entram automaticamente ao rolar.</p>}
              <div className="character-experience-list"><button type="button" onClick={() => beginRoll({ survivorId: selected.id, kind: "action", experience: "origin" })} aria-label={`Rolar com Experiência ${origin?.experience || selected.origin}, custa 1 Esperança`}><BookOpen size={18} aria-hidden="true" /><span>{origin?.experience || selected.origin}</span><b>+2 · 1 Esperança</b></button><button type="button" onClick={() => beginRoll({ survivorId: selected.id, kind: "action", experience: "free" })} aria-label={`Rolar com Experiência ${selected.freeExperience}, custa 1 Esperança`}><BookOpen size={18} aria-hidden="true" /><span>{selected.freeExperience}</span><b>+2 · 1 Esperança</b></button></div>
            </section>
            <section className="character-surface"><SectionHeading index="02" title="Origem" /><div className="character-feature-callout"><b>{selected.origin} · {origin?.feature}</b><p>{origin?.effect}</p></div></section>
            <section className="character-surface"><SectionHeading index="03" title="Últimas rolagens" />{recentRolls.length ? <div className="character-roll-history">{recentRolls.map(entry => <div key={entry.id}><span>Dia {entry.day} · {entry.time} · {entry.kind}</span><p>{localizeRollLog(entry.text)}</p></div>)}</div> : <p className="character-empty-list">Nenhuma rolagem deste sobrevivente registrada ainda.</p>}</section>
          </TabsContent>
          <TabsContent value="combate" className="character-tab-content">
            <section className="character-mobile-resources" aria-label="Ajustar recursos de combate">
              <ResourceControl label="PV marcados" icon={Heart} current={selected.hp} max={stats.hp} onChange={value => change(selected.id, s => { s.hp = value; })} tone="health" />
              <ResourceControl label="Estresse" icon={Zap} current={selected.stress} max={6} onChange={value => change(selected.id, s => { s.stress = value; })} tone="stress" />
              <ResourceControl label="Esperança" icon={Sparkles} current={selected.hope} max={6} onChange={value => change(selected.id, s => { s.hope = value; })} tone="hope" />
              <ResourceControl label="Armadura marcada" icon={Shield} current={selected.armorMarked ?? 0} max={stats.armor} onChange={value => change(selected.id, s => { s.armorMarked = value; })} tone="armor" />
            </section>
            <section className="character-surface"><SectionHeading index="01" title="Ataque e proteção" /><div className="character-defense-overview">
              <div className="character-defense-card"><ShieldCheck size={21} aria-hidden="true" /><span>Evasão<small>para evitar ataques</small></span><strong>{stats.evasion}</strong></div>
              <div className="character-defense-card"><Shield size={21} aria-hidden="true" /><span>Armadura marcada<small>{Math.max(0, stats.armor - (selected.armorMarked ?? 0))} espaço(s) livre(s)</small></span><strong>{selected.armorMarked ?? 0}<small>/{stats.armor}</small></strong></div>
              <DamageThresholds major={stats.major} severe={stats.severe} />
            </div>
              <div className="character-proficiency"><ShieldCheck size={18} aria-hidden="true" /><span>Proficiência registrada</span>{playerMode ? <b>{selected.proficiency ?? 1}</b> : <Counter compact label="Proficiência" value={selected.proficiency ?? 1} min={1} max={9} onChange={value => change(selected.id, s => { s.proficiency = value; })} />}</div>
            </section>
            <section className="character-surface"><SectionHeading index="02" title="Armas e kit ativo" />
              <div className="character-equipment">{selected.primary ? <ItemArt name={selected.primary} category="Armas primárias" size="large" /> : <EmptyItemArt size="large" />}<div><span>PRIMÁRIA</span><h4>{selected.primary || "Sem arma principal"}</h4>{primary ? <><p><b>{primary.damage}</b> dano · {primary.range} · {traitLabel(primary.trait)} · {primary.hands === "Uma" ? "uma mão" : "duas mãos"}</p><div className="character-chips"><span>Ruído: {primary.noise}</span><span>Carga guardada: {primary.stored}</span></div><p>{primary.note}</p>
                <Button size="sm" className="mt-2" disabled={down} onClick={() => beginRoll({ survivorId: selected.id, kind: "attack", weapon: "primary" })}><Dice5 size={16} /> Rolar ataque</Button></> : <><p><b>{unarmedAttack.damage}</b> dano · {unarmedAttack.range} · Força ou Acuidade</p><p>Ataques desarmados usam a Proficiência para determinar a quantidade de d4.</p>
                <Button size="sm" variant="outline" className="mt-2" disabled={down} onClick={() => beginRoll({ survivorId: selected.id, kind: "attack", weapon: "unarmed" })}><Dice5 size={16} /> Ataque desarmado</Button><button type="button" className="character-text-link" onClick={() => setActiveTab("inventario")}>Equipar uma arma no inventário ↗</button></>}{Boolean(modifiers?.primaryDamage) && <p>+{modifiers?.primaryDamage} ao dano pela Faca pequena (automático).</p>}</div></div>
              {selected.secondary && <div className="character-equipment"><ItemArt name={selected.secondary} category="Armas secundárias" size="large" /><div><span>SECUNDÁRIA</span><h4>{selected.secondary}</h4>{secondary && <><p><b>{secondary.damage}</b> dano · {secondary.range} · {traitLabel(secondary.trait)}</p><div className="character-chips"><span>Carga guardada: {secondary.stored}</span></div><p>{secondary.effect}</p></>}
                <Button size="sm" variant="outline" className="mt-2" disabled={down} onClick={() => beginRoll({ survivorId: selected.id, kind: "attack", weapon: "secondary" })}><Dice5 size={16} /> Rolar secundária</Button></div></div>}
              <div className="character-equipment">{selected.protection ? <ItemArt name={selected.protection} category="Proteções" size="large" /> : <EmptyItemArt size="large" />}<div><span>PROTEÇÃO VESTIDA</span><h4>{selected.protection || "Sem proteção"}</h4>{protection && <><p>Limiar maior {stats.major} · severo {stats.severe} · {stats.armor} espaços de armadura</p><p>{protection.effect}</p></>}</div></div>
              {selected.outfit && <div className="character-equipment"><ItemArt name={selected.outfit} category="Trajes e acessórios" size="large" /><div><span>TRAJE VESTIDO</span><h4>{selected.outfit}</h4><p>Em uso · não conta novamente como carga guardada.</p></div></div>}
              {cart && <div className="character-equipment"><ItemArt name={cart.name} category="Abrigo, transporte e mochilas" size="large" /><div><span>CARRINHO EM USO</span><h4>Carrinho dobrável</h4><p><b>{cartLoad}/4 espaços</b> no carrinho · exige as duas mãos livres enquanto é conduzido.</p></div></div>}
              <div className="character-equipment">{selected.personal ? <ItemArt name={selected.personal} category="Abrigo, transporte e mochilas" size="large" /> : <EmptyItemArt size="large" />}<div><span>ITEM PESSOAL</span><h4>{selected.personal || "Nenhum item pessoal"}</h4>{personal && <p>{personal.effect} · Carga guardada {personal.load}</p>}</div></div>
              {(["pocket1", "pocket2"] as const).map((slot, index) => {
                const pocketItem = selected.equippedItems?.[slot];
                return <div className="character-equipment" key={slot}>{selected[slot] ? <ItemArt name={selected[slot]!} category={pocketItem?.category} size="large" /> : <EmptyItemArt size="large" />}<div><span>BOLSO {index + 1}</span><h4>{selected[slot] || "Bolso vazio"}</h4><p>{selected[slot] ? "Item de acesso rápido · 0 carga enquanto ativo." : "Aceita objetos compactos marcados com Carga guardada 0."}</p></div></div>;
              })}
            </section>
            <p className="character-rule-note">Sem arma, o sobrevivente ainda pode fazer um <b>Ataque desarmado</b>: escolha Força ou Acuidade e role Proficiência d4 de dano físico. Munição é um item físico do inventário. O primeiro disparo de cada categoria na cena compromete 1 unidade compatível; ela permanece visível e bloqueada até a próxima cena, quando é consumida. Até 4 unidades do mesmo tipo ocupam 1 espaço de carga. Armas, proteção e traje em uso não ocupam espaço guardado.</p>
          </TabsContent>
          <TabsContent value="habilidades" className="character-tab-content">
            <section className="character-hope-feature" aria-labelledby="hope-feature-title">
              <div className="character-hope-feature-top"><span><Sparkles size={17} aria-hidden="true" /> HABILIDADE DE ESPERANÇA</span><span>ARQUÉTIPO · {selected.archetype}</span></div>
              <div className="character-hope-feature-body"><AbilityArt abilityId={`hope:${selected.archetype}`} size="large" />
                <div><h3 id="hope-feature-title">{hopeName}</h3><p>{hopeEffect}</p></div></div>
              <div className="character-hope-feature-foot"><span className="character-hope-cost"><Sparkles size={15} aria-hidden="true" /> Custo: 3 Esperança</span><span>Esperança atual: <b>{selected.hope}/6</b></span>
                <AbilityUseControl game={game} edit={edit} survivorId={selected.id} abilityId={`hope:${selected.archetype}`}
                  name={hopeName} effect={hopeEffect} hopeFeature /></div>
            </section>
            <section className="character-surface"><SectionHeading index="02" title="Outras características e técnicas" aside={<span className="character-micro">TOQUE PARA LER</span>} /><p className="character-section-intro">Abra um card para consultar o efeito completo, inclusive gatilho, custo e limites.</p>
              <Accordion type="multiple" className="character-abilities">
                <AbilityCard game={game} edit={edit} survivorId={selected.id} abilityId={`origin:${selected.origin}`} name={origin?.feature || selected.origin} category={`Origem · ${selected.origin}`} effect={origin?.effect} />
                <AbilityCard game={game} edit={edit} survivorId={selected.id} abilityId={`archetype:${selected.archetype}`} name={archetype?.feature || selected.archetype} category={`Arquétipo · ${selected.archetype}`} effect={archetype?.effect} />
                <AbilityCard game={game} edit={edit} survivorId={selected.id} abilityId={`specialty:${selected.specialty}`} name={selected.specialty} category="Especialização" effect={archetype?.specialties.find(s => s.name === selected.specialty)?.effect} />
                {selected.techniques.map(name => { const technique = content.techniques.find(t => t.name === name); return <AbilityCard key={name} game={game} edit={edit} survivorId={selected.id} abilityId={`technique:${name}`} name={name} category={`Trilha · ${technique?.track ?? "Técnica"}`} effect={technique?.effect} />; })}
              </Accordion>
            </section>
          </TabsContent>
          <TabsContent value="inventario" className="character-tab-content">
            <div className="character-inventory-dashboard">
            <section className="character-surface"><SectionHeading index="01" title="Carga e provisões" aside={<b className="character-load-badge">{stats.carried} / {stats.capacity} espaços</b>} />
              <div className="character-load-meter"><Progress value={Math.min(100, stats.carried / Math.max(1, stats.capacity) * 100)} />{stats.carried > stats.capacity && <p className="character-alert">Acima da capacidade. Redistribua a carga antes de uma travessia.</p>}</div>
              <div className="character-inventory-top"><div><Backpack size={19} aria-hidden="true" /><span>{selected.bag || "Sem bolsa ou mochila"}</span></div>{selected.bag && <Button size="sm" variant="outline" onClick={() => storeActive("bag")}>Guardar mochila</Button>}</div>
              <details className="character-load-details"><summary>Como esta carga foi calculada</summary><dl><div><dt>Itens guardados</dt><dd>{stats.load.items}</dd></div><div><dt>Comida e água</dt><dd>{stats.load.food + stats.load.water}</dd></div><div><dt>Munição de reserva</dt><dd>{stats.load.ammo}</dd></div><div><dt>Kit pessoal</dt><dd>{stats.load.personal}</dd></div></dl>
                <p>Até 2 porções pessoais de Comida e até 2 de Água não ocupam espaço. Da 3ª em diante, cada grupo adicional de até 4 porções ocupa 1. O item físico continua identificado no inventário e seu conteúdo restante entra automaticamente no total disponível.</p><p>Itens que exigem preparo ou verificação só entram no total <b>disponível</b> depois de resolvidos. Traje vestido não conta novamente como carga. O Carrinho dobrável aberto deixa de contar como carga pessoal e passa a armazenar até 4 espaços separadamente.</p></details>
              {cart && <div className="character-rule-note"><b>Carrinho em uso:</b> {cartLoad}/4 espaços · duas mãos ocupadas. Coloque e retire itens pelo menu <b>Ações</b> ou pelo clique direito no inventário.</div>}
              <div className="character-stock-grid">
                <div className="metric"><span className="smallcaps subtle">Comida disponível</span><strong>{foodProvision?.total ?? selected.food}</strong><p className="text-xs subtle mt-2">{foodProvision?.loose ?? selected.food} soltas · {foodProvision?.itemsReady ?? 0} em itens{foodProvision?.itemsWaiting ? ` · ${foodProvision.itemsWaiting} aguardando preparo/verificação` : ""}</p><Counter compact label="Porções soltas" value={selected.food} max={99} onChange={value => change(selected.id, s => { adjustProvisionCount(s, "food", value); })} /></div>
                <div className="metric"><span className="smallcaps subtle">Água disponível</span><strong>{waterProvision?.total ?? selected.water}</strong><p className="text-xs subtle mt-2">{waterProvision?.loose ?? selected.water} soltas · {waterProvision?.itemsReady ?? 0} em itens{waterProvision?.itemsWaiting ? ` · ${waterProvision.itemsWaiting} aguardando verificação` : ""}</p><Counter compact label="Porções soltas" value={selected.water} max={99} onChange={value => change(selected.id, s => { adjustProvisionCount(s, "water", value); })} /></div>
                <div className="metric"><span className="smallcaps subtle">Munição física</span><strong>{totalAmmoUnits}</strong><p className="text-xs subtle mt-2">{ammunitionTypes.filter(type => ammunitionCount(selected.inventory, type) > 0).map(type => `${type}: ${ammunitionCount(selected.inventory, type)}`).join(" · ") || "Nenhuma unidade no inventário"}</p></div>
              </div>
              {(selected.provisionLots ?? []).length > 0 && <p className="character-rule-note">Perecíveis: {selected.provisionLots!.map(lot => `${lot.qty} porção(ões) de ${lot.resource === "food" ? "comida" : "água"} (${lot.label}) · vence no amanhecer do dia ${lot.expiresDay}`).join("; ")}.</p>}
              <div className="character-consume-actions"><Button size="sm" variant="outline" disabled={selected.food < 1 || selected.foodConsumedDay === game.day} onClick={() => edit(draft => {
                if (consumeDailyProvision(draft, selected.id, "food")) toast.success("Comida solta de hoje registrada.");
              })}><Utensils size={15} /> {selected.foodConsumedDay === game.day ? "Comida de hoje registrada" : "Comer 1 porção solta"}</Button>
                <Button size="sm" variant="outline" disabled={selected.water < 1 || selected.waterConsumedDay === game.day} onClick={() => edit(draft => {
                  if (consumeDailyProvision(draft, selected.id, "water")) toast.success("Água solta de hoje registrada.");
                })}><Droplets size={15} /> {selected.waterConsumedDay === game.day ? "Água de hoje registrada" : "Beber 1 porção solta"}</Button></div>
              <p className="roll-hint">Para registrar alimentação/hidratação do dia, use <b>Comer/Beber</b> ou <b>Ações → Consumir</b> no item. Alterar o contador manualmente corrige o estoque, mas não registra que o personagem consumiu.</p>
              <div className="character-provision-actions">{!playerMode && <ProvisionTransferDialog key={selected.id} game={game} edit={edit} survivorId={selected.id} />}</div>
            </section>
            <section className="character-surface"><SectionHeading index="02" title="Kit ativo" />
              {([ ["primary","Arma principal","Armas primárias"], ["secondary","Arma secundária","Armas secundárias"], ["protection","Proteção","Proteções"], ["outfit","Traje vestido","Trajes e acessórios"], ["personal","Item pessoal","Abrigo, transporte e mochilas"], ["bag","Bolsa / mochila","Abrigo, transporte e mochilas"] ] as const)
                .filter(([slot]) => slot !== "personal" || selected.personal !== selected.bag)
                .map(([slot,label,category]) =>
                <div className="character-kit-line" key={slot}>{selected[slot] ? <ItemArt name={selected[slot]} category={category} size="small" /> : <EmptyItemArt />}<span>{label}</span><b>{selected[slot] || "Vazio"}</b>{selected[slot] && <Button size="sm" variant="ghost" aria-label={`Guardar ${selected[slot]}`} onClick={() => storeActive(slot)}>Guardar</Button>}</div>)}
              {(["pocket1", "pocket2"] as const).map((slot, index) => {
                const pocketItem = selected.equippedItems?.[slot];
                return <div className="character-kit-line" key={slot}>{selected[slot] ? <ItemArt name={selected[slot]!} category={pocketItem?.category} size="small" /> : <EmptyItemArt />}<span>Bolso {index + 1} · 0 carga</span><b>{selected[slot] || "Vazio"}</b>{selected[slot] && <Button size="sm" variant="ghost" aria-label={`Guardar ${selected[slot]}`} onClick={() => storeActive(slot)}>Guardar</Button>}</div>;
              })}
              <p className="roll-hint">Para trocar o kit, use <b>Ações → Equipar</b>. Trajes vestidos saem da carga guardada. O Carrinho dobrável não ocupa um slot: aberto, exige duas mãos e leva até 4 espaços próprios. Objetos com Carga guardada 0 podem ocupar os bolsos.</p>
            </section>
            </div>
            <section className="character-surface"><SectionHeading index="03" title="Itens guardados" aside={<AddItemDialog game={game} edit={edit} ownerId={selected.id} />} />
              {selected.inventory.length > 0 && <div className="character-inventory-toolbar"><div className="field"><label htmlFor="inventory-search"><Search size={14} aria-hidden="true" /> Buscar no inventário</label><input id="inventory-search" type="search" placeholder="Nome, categoria ou estado" value={inventoryQuery} onChange={event => setInventoryQuery(event.target.value)} /></div><Pick label="Categoria" value={inventoryCategory} options={categoryOptions} onChange={setInventoryCategory} /></div>}
              {inventoryGroups.length === 0 && <p className="character-empty-list">{selected.inventory.length ? "Nenhum item com esse filtro." : "Nenhum item guardado. Registre um achado ou guarde algo do kit ativo."}{selected.inventory.length > 0 && <button type="button" className="character-text-link" onClick={() => { setInventoryQuery(""); setInventoryCategory("Todas"); }}>Limpar filtros</button>}</p>}
              {inventoryGroups.map(([category, items]) => <div className="character-inventory-group" key={category}><h4>{category}</h4>
                <Accordion type="multiple">{items.map(item => { const catalog = catalogForItem(item); const provisionState = provisionItemInfo(item); return <AccordionItem value={item.id} key={item.id} className="character-item">
                  <ItemContextMenu game={game} edit={edit} ownerId={selected.id} item={item} selfOnly={playerMode}>
                    <div className="character-item-row inventory-context-target"><AccordionTrigger className="character-item-trigger"><ItemArt name={item.name} category={category} /><span className="character-item-name">{item.name}<small>{provisionState.resource ? provisionDisplay(item) : ammunitionItemType(item)
  ? `${Math.ceil(item.qty / 4)} espaço(s) por este stack${item.committedAmmo ? ` · ${item.committedAmmo} comprometida(s) nesta cena` : ""}`
  : `${item.condition || "Estado não registrado"} · ${item.load * item.qty} espaço(s)${batteryStateFor(item) ? ` · bateria ${batteryStateFor(item)?.toLowerCase()}` : ""}`}</small></span><span className="character-item-meta">×{item.qty}</span></AccordionTrigger>
                      <ItemActionsDialog game={game} edit={edit} ownerId={selected.id} item={item} allowCorrection={!playerPreview} selfOnly={playerMode} /></div>
                  </ItemContextMenu>
                  <AccordionContent className="character-item-detail"><div className="character-chips"><span>{category}</span><span>Estado: {item.condition || "Sem registro"}</span>{provisionState.resource ? <><span>{provisionState.remaining} porção(ões) restantes</span><span>{provisionState.status}</span>{item.opened && <span>Aberto</span>}{item.expiresDay && <span>Vence no dia {item.expiresDay}</span>}</>
  : ammunitionItemType(item) ? <><span>Tipo: {ammunitionItemType(item)}</span><span>Até 4 unidades = 1 espaço</span>{item.committedAmmo ? <span>{item.committedAmmo} unidade(s) bloqueada(s) até a próxima cena</span> : null}</>
  : <span>{item.load + " espaço(s) por unidade"}</span>}{item.armorMarked ? <span>Armadura marcada: {item.armorMarked}</span> : null}{batteryStateFor(item) && <span>Bateria: {batteryStateFor(item)}</span>}{item.foundDay && <span>Encontrado no dia {item.foundDay}</span>}</div>
                    {catalog && <dl>{catalog.fields.map(field => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>}
                    {item.name === "Carrinho dobrável" && <div className="character-rule-note mt-3"><b>{item.cartDeployed ? "Aberto e sendo conduzido" : "Dobrado"}</b>{item.cartDeployed ? ` · ${cartStoredLoad(item.cartItems ?? [])}/4 espaços · exige duas mãos` : " · ocupa 1 espaço de carga"}{(item.cartItems?.length ?? 0) > 0 && <span> · Conteúdo: {item.cartItems!.map(entry => `${entry.qty}× ${entry.name}`).join(", ")}</span>}</div>}
                  </AccordionContent>
                </AccordionItem>; })}</Accordion>
              </div>)}
              {selected.inventory.length > 0 && <><p className="roll-hint inventory-context-hint">No computador, clique com o botão direito em um item para abrir as ações rápidas. O botão <b>Ações</b> continua disponível para edição e opções avançadas.</p>
                <p className="roll-hint inventory-count" role="status">{inventoryGroups.reduce((sum, [, items]) => sum + items.length, 0)} de {selected.inventory.length} registros · {selected.inventory.reduce((sum, item) => sum + item.qty, 0)} unidades no total</p></>}
            </section>
          </TabsContent>
          <TabsContent value="condicoes" className="character-tab-content">
            <section className="character-surface"><SectionHeading index="01" title="Exposição e infecção" /><div className="character-condition-banner"><HeartPulse size={24} aria-hidden="true" /><div><b>{selected.infection}</b><p>{selected.infection === "Saudável" ? "Nenhuma exposição registrada." : "Acompanhe o estado e as escolhas de tratamento."}</p></div></div>
              {!playerPreview && <div className="character-condition-edit"><Pick label="Estado" value={selected.infection} options={infectionStates} onChange={value => change(selected.id, s => {
                s.infection = value as Infection;
                if (value === "Exposto") { s.exposureDeadline = absoluteMinutes(game) + 120; s.treatmentAttempted = false; }
                else s.exposureDeadline = null;
                if (value === "Terminal") s.terminalScenes = 3;
              })} /></div>}
              <p className="character-rule-note">Mordida anunciada contra alvo Restrito ou indefeso pode causar Exposição. Ataques comuns não causam. A limpeza exige 1 Medicamentos, água limpa, <b>30 min</b> e uma tentativa concluída em até 2 horas.</p>
              {selected.infection === "Exposto" && <div className="character-treatment"><b>Janela: até {deadlineLabel(selected.exposureDeadline)}</b><span>{selected.treatmentAttempted ? "Tentativa já usada" : "Uma tentativa possível"} · {medicineSources.length} fonte(s) de Medicamentos acessível(is)</span>
                {!playerMode ? <>
                <Dialog open={treatmentOpen} onOpenChange={value => { setTreatmentOpen(value); if (!value) setCleanWaterConfirmed(false); }}><DialogTrigger asChild><Button size="sm" disabled={selected.treatmentAttempted || (selected.exposureDeadline ?? 0) < absoluteMinutes(game) || !chosenMedicine}><Stethoscope size={16} /> Tentar limpar exposição</Button></DialogTrigger>
                  <DialogContent><DialogHeader><DialogTitle>Tratamento imediato · 30 min</DialogTitle><DialogDescription>Escolha 1 Medicamentos acessível, confirme água limpa e role Conhecimento contra 13. O procedimento consome 30 min e precisa terminar dentro da janela de Exposição. Uma tentativa por Exposição.{treatmentSupport.bonus ? ` Infraestrutura do abrigo: +${treatmentSupport.bonus} (${treatmentSupport.sources.join(" + ")}).` : ""}</DialogDescription></DialogHeader>
                    <Pick label="Fonte do tratamento" value={chosenMedicine} options={medicineSources} onChange={setTreatmentSource} />
                    <label className="inventory-ready"><input type="checkbox" checked={cleanWaterConfirmed} onChange={event => setCleanWaterConfirmed(event.target.checked)} /><span>Há água limpa e condições de cuidar da ferida nesta cena.</span></label>
                    <DialogFooter><Button variant="outline" onClick={() => setTreatmentOpen(false)}>Cancelar</Button><Button disabled={!cleanWaterConfirmed || !chosenMedicine} onClick={treatExposure}>Confirmar e rolar</Button></DialogFooter></DialogContent>
                </Dialog></> : <p className="text-sm subtle">Peça ao mestre para registrar a tentativa de tratamento e o resultado da infecção.</p>}
              </div>}
              {selected.infection === "Terminal" && !playerPreview && <div className="character-terminal"><Counter compact label="Cenas significativas restantes" value={selected.terminalScenes} max={3} onChange={value => change(selected.id, s => { s.terminalScenes = value; })} /></div>}
              {selected.infection === "Terminal" && playerPreview && <p className="character-terminal">Cenas significativas restantes: <b>{selected.terminalScenes}</b></p>}
            </section>
            <section className="character-surface"><SectionHeading index="02" title="Estado de combate" /><div className="character-combat-metrics"><div><Heart size={17} aria-hidden="true" /><span>PV marcados</span><b>{selected.hp}/{stats.hp}</b></div><div><Zap size={17} aria-hidden="true" /><span>Estresse marcado</span><b>{selected.stress}/6</b></div><div><Shield size={17} aria-hidden="true" /><span>Armadura marcada</span><b>{selected.armorMarked ?? 0}/{stats.armor}</b></div></div><p className="character-rule-note">Ajuste os recursos no painel lateral. Em telas menores, toque em Combate na barra de consulta rápida.</p></section>
          </TabsContent>
          <TabsContent value="historia" className="character-tab-content">
            <section className="character-surface"><SectionHeading index="01" title="Antes e depois" /><div className="character-story-grid"><div><span>ORIGEM</span><b>{selected.origin}</b><p>{origin?.past}</p></div><div><span>ATUAÇÃO</span><b>{selected.archetype} · {selected.specialty}</b><p>Trilhas: {archetype?.tracks.join(" e ")}</p></div></div>
              <div className="character-backstory"><span>PESSOA IMPORTANTE, PERDA OU PROMESSA</span><p>{selected.past || "Nada registrado por enquanto."}</p></div>
            </section>
            <section className="character-surface"><SectionHeading index="02" title="Anotações" />{!playerPreview || playerMode ? <><Field label="Notas do sobrevivente" value={notes} onChange={value => setNotesDraft({ id: selected.id, source: selected.notes, value })} multiline /><Button size="sm" variant="outline" className="mt-3" onClick={() => { change(selected.id, s => { s.notes = notes.trim(); }); setNotesDraft(null); }}>Salvar notas</Button></> : <p className="character-notes">{selected.notes || "Nenhuma anotação registrada."}</p>}</section>
            {!playerPreview && <section className="character-surface"><SectionHeading index="03" title="Identificação" /><div className="character-identity-edit"><Field label="Nome do sobrevivente" value={selected.name} onChange={value => change(selected.id, s => { s.name = value; })} /><Field label="Pessoa importante, perda ou promessa" value={selected.past} onChange={value => change(selected.id, s => { s.past = value; })} /></div><p className="character-rule-note">Origem, arquétipo e kit inicial foram definidos na criação. O nível atualiza os limiares da proteção. Outras escolhas de evolução continuam sob controle da mesa.</p><Counter compact label="Nível registrado" value={selected.level ?? 1} min={1} max={20} onChange={value => change(selected.id, s => { s.level = value; })} /></section>}
          </TabsContent>
        </Tabs>

        <aside className="character-quick" aria-label="Consulta rápida do sobrevivente">
          <div className="character-quick-desktop"><div className="character-quick-heading"><span>CONSULTA RÁPIDA</span><small>RECURSOS EM CENA</small></div>
            <ResourceControl label="PV marcados" icon={Heart} current={selected.hp} max={stats.hp} onChange={value => change(selected.id, s => { s.hp = value; })} tone="health" />
            <ResourceControl label="Estresse" icon={Zap} current={selected.stress} max={6} onChange={value => change(selected.id, s => { s.stress = value; })} tone="stress" />
            <ResourceControl label="Esperança" icon={Sparkles} current={selected.hope} max={6} onChange={value => change(selected.id, s => { s.hope = value; })} tone="hope" />
            <ResourceControl label="Armadura marcada" icon={Shield} current={selected.armorMarked ?? 0} max={stats.armor} onChange={value => change(selected.id, s => { s.armorMarked = value; })} tone="armor" />
            <div className="character-quick-defenses">
              <div className="character-quick-stat"><ShieldCheck size={20} aria-hidden="true" /><span>Evasão<small>evitar ataques</small></span><strong>{stats.evasion}</strong></div>
              <div className="character-quick-stat"><Dice5 size={20} aria-hidden="true" /><span>Proficiência<small>dados de dano</small></span><strong>{selected.proficiency ?? 1}</strong></div>
              <DamageThresholds major={stats.major} severe={stats.severe} />
            </div>
            <div className="character-quick-attack"><span><Swords size={17} aria-hidden="true" /> ATAQUE PRONTO</span><strong>{selected.primary || "Sem arma principal"}</strong><small>{primary ? `${primary.damage} · ${primary.range}` : "Veja o kit de combate"}</small><div><span>{primaryAmmoType ? `Munição · ${primaryAmmoType}` : "Munição"}</span><b>{primaryAmmoType ? `${primaryAmmoAvailable} livre(s)${primaryAmmoCommitted ? ` + ${primaryAmmoCommitted} comprometida` : ""}` : "não usa"}</b></div></div>
            <div className="character-quick-rolls"><button type="button" onClick={() => beginRoll({ survivorId: selected.id, kind: "action" })}><Dice5 size={16} aria-hidden="true" /> Teste</button><button type="button" disabled={!primary || down} onClick={() => beginRoll({ survivorId: selected.id, kind: "attack", weapon: "primary" })}><Crosshair size={16} aria-hidden="true" /> Ataque</button></div>
          </div>
          <div className="character-quick-mobile"><span title="PV marcados"><Heart size={16} aria-hidden="true" /><b>{selected.hp}/{stats.hp}</b><small>PV</small></span><span title="Estresse marcado"><Zap size={16} aria-hidden="true" /><b>{selected.stress}/6</b><small>Estresse</small></span><span title="Esperança"><Sparkles size={16} aria-hidden="true" /><b>{selected.hope}/6</b><small>Esperança</small></span><span title="Evasão"><Crosshair size={16} aria-hidden="true" /><b>{stats.evasion}</b><small>Evasão</small></span><button type="button" onClick={() => setActiveTab("combate")} aria-label="Abrir combate e controles de recursos"><Shield size={16} aria-hidden="true" /><b>{selected.armorMarked ?? 0}/{stats.armor}</b><small>Armadura</small></button><button type="button" className="character-quick-mobile-weapon" onClick={() => setActiveTab("combate")}><Swords size={14} aria-hidden="true" /><strong>{selected.primary || "Sem arma principal"}</strong><span>{primary ? `${primary.damage} · ${primary.range}` : "Ver ataque"}</span><span>{primaryAmmoType ? `${primaryAmmoAvailable} livre(s)` : "sem munição"}</span></button></div>
        </aside>
      </div>
      {rollRequest && <RollDialog game={game} edit={edit} request={rollRequest} hideThreatSecrets={playerMode || playerPreview} open onOpenChange={opened => { if (!opened) setRollRequest(null); }} />}
    </>}
  </div>;
}
