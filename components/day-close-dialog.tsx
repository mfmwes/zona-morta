"use client";
import { RuleHelp } from "@/components/rule-help";
/* eslint-disable @next/next/no-img-element -- survivor portraits can be small uploaded data URLs. */

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Droplets, MapPin, Moon, Utensils } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Counter, Pick } from "@/components/game-controls";
import {
  closeDayWithPlan,
  defaultDayClosePlan,
  inspectDayClosePlan,
  fieldNpcs,
  provisionConsumedToday,
  remainingDailyProvisionPortions,
  requiredDailyProvision,
  type DailyResource,
  type DayClosePlan,
  type DayCloseResult,
  type DayProvisionSource,
} from "@/lib/survival";
import { provisionBreakdown } from "@/lib/provision-items";
import { survivorHex, type GameState, type NPC, type Survivor } from "@/lib/game";
import { plannedRestSelections, resolvePlannedOvernightRest } from "@/lib/abilities";
import { currentTableRest, tableRestReadyForNight } from "@/lib/table-rest";
import { eventStatus, eventTriggerReady } from "@/lib/hex-generators";

type Edit = (fn: (draft: GameState) => void) => void;

const sourceLabels: Record<DayProvisionSource, string> = {
  already: "Já consumiu hoje",
  shared: "Reservas compartilhadas",
  personal: "Provisão pessoal",
  mixed: "Reservas + provisão pessoal",
  other: "Outra fonte / dispensado",
  none: "Sem consumir · privação",
};

function resourceName(resource: DailyResource) {
  return resource === "food" ? "Comida" : "Água";
}

export function DayCloseDialog({
  game,
  edit,
  label = "Encerrar dia",
  variant = "default",
  size = "default",
  className,
}: {
  game: GameState;
  edit: Edit;
  label?: string;
  variant?: "default" | "outline";
  size?: "default" | "sm";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<DayClosePlan | null>(null);
  const [overnightRest, setOvernightRest] = useState(false);

  const storageHex = game.shelter.hex ?? game.partyHex;
  const currentPlan = plan ?? defaultDayClosePlan(game);
  const inspection = inspectDayClosePlan(game, currentPlan);
  const pendingRest = currentTableRest(game);
  const awaitingChoices = Boolean(pendingRest && !tableRestReadyForNight(game));
  const hasWarnings = inspection.deprivations.length > 0
    || inspection.residentMissing.food > 0
    || inspection.residentMissing.water > 0;
  const residents = Math.max(0, Math.trunc(game.shelter.residents));
  const fieldNpcList = fieldNpcs(game);
  const npcsAtReserve = (game.npcs ?? []).filter(npc => npc.active && npc.status !== "Morto" && npc.status !== "Desaparecido" && npc.hex === storageHex);
  const overnightSelections = plannedRestSelections(game, "long");
  const overnightRestReady = Boolean(overnightSelections);
  const occupiedHex = (hexId: string) => game.survivors.length
    ? game.survivors.some(person => survivorHex(game, person) === hexId)
    : game.partyHex === hexId;
  const timedEvents = Object.entries(game.hexes).flatMap(([hexId, hex]) => hex.events
    .filter(event => occupiedHex(hexId) && eventStatus(event) === "pending" && (event.triggerType === "night"
      || (event.triggerType === "noise" && eventTriggerReady(game, hexId, event))))
    .map(event => ({ hexId, event, sector: hex.sector?.name ?? `Hex ${hexId}` })));

  function prepare() {
    setPlan(defaultDayClosePlan(game));
    setOvernightRest(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !open) prepare();
    setOpen(nextOpen);
  }

  function updateResident(resource: DailyResource, value: number) {
    setPlan(current => {
      const next = structuredClone(current ?? defaultDayClosePlan(game));
      if (resource === "food") next.residentsFood = value;
      else next.residentsWater = value;
      return next;
    });
  }

  function updateSource(survivorId: string, resource: DailyResource, source: DayProvisionSource) {
    setPlan(current => {
      const next = structuredClone(current ?? defaultDayClosePlan(game));
      const entry = next.survivors.find(row => row.survivorId === survivorId);
      if (entry) entry[resource] = source;
      return next;
    });
  }

  function updateNpcSource(npcId: string, resource: DailyResource, source: DayProvisionSource) {
    setPlan(current => {
      const next = structuredClone(current ?? defaultDayClosePlan(game));
      const entry = next.npcs.find(row => row.npcId === npcId);
      if (entry) entry[resource] = source;
      return next;
    });
  }
  function updateCarrier(npcId: string, resource: DailyResource, carrierId: string) {
    setPlan(current => {
      const next = structuredClone(current ?? defaultDayClosePlan(game));
      const entry = next.npcs.find(row => row.npcId === npcId);
      if (entry) {
        if (resource === "food") entry.foodCarrierId = carrierId || undefined;
        else entry.waterCarrierId = carrierId || undefined;
      }
      return next;
    });
  }

  function sourceOptions(person: Survivor, resource: DailyResource) {
    if (provisionConsumedToday(game, person, resource))
      return [{ value: "already", label: sourceLabels.already }];

    const needed = remainingDailyProvisionPortions(game, person, resource);
    const personal = provisionBreakdown(person, resource).total;
    const shared = provisionBreakdown(game.shelter, resource).total;
    const atStorage = survivorHex(game, person) === storageHex;
    const options: { value: string; label: string }[] = [];
    if (atStorage && shared > 0)
      options.push({ value: "shared", label: `${sourceLabels.shared} · ${shared} disponível(is) · precisa ${needed}` });
    if (personal > 0)
      options.push({ value: "personal", label: `${sourceLabels.personal} · ${personal} disponível(is) · precisa ${needed}` });
    if (atStorage && shared > 0 && personal > 0)
      options.push({ value: "mixed", label: `${sourceLabels.mixed} · ${shared + personal} disponível(is) · precisa ${needed}` });
    options.push({ value: "other", label: sourceLabels.other });
    options.push({ value: "none", label: sourceLabels.none });
    return options;
  }

  function planFor(person: Survivor) {
    return currentPlan.survivors.find(row => row.survivorId === person.id)
      ?? { survivorId: person.id, food: "none" as const, water: "none" as const };
  }
  function npcPlanFor(npc: NPC) {
    return currentPlan.npcs.find(row => row.npcId === npc.id)
      ?? { npcId: npc.id, food: "none" as const, water: "none" as const };
  }

  function warningFor(person: Survivor, resource: DailyResource) {
    return inspection.deprivations.find(row => row.survivorId === person.id && row.resource === resource);
  }
  function npcWarningFor(npc: NPC, resource: DailyResource) {
    return inspection.deprivations.find(row => row.npcId === npc.id && row.resource === resource);
  }
  function npcSourceOptions(npc: NPC, resource: DailyResource) {
    const options: { value: string; label: string }[] = [];
    if (npc.hex === storageHex && provisionBreakdown(game.shelter, resource).total > 0)
      options.push({ value: "shared", label: `${sourceLabels.shared} · ${provisionBreakdown(game.shelter, resource).total} disponível(is)` });
    if (game.survivors.some(person => survivorHex(game, person) === npc.hex))
      options.push({ value: "personal", label: "Provisão portada por alguém do grupo" });
    options.push({ value: "other", label: sourceLabels.other }, { value: "none", label: sourceLabels.none });
    return options;
  }

  function nextMorning() {
    if (game.activities?.some(a => a.day === game.day && a.status === "running")) { toast.error("Conclua ou interrompa as atividades em andamento antes de encerrar o dia."); return; }
    if (awaitingChoices) { toast.error("Aguarde as escolhas do descanso ou cancele a solicitação antes de encerrar o dia."); return; }
    const outcome: { value: DayCloseResult | null } = { value: null };
    let restApplied = false;
    let failure = "";
    edit(draft => {
      if (currentTableRest(draft) && !tableRestReadyForNight(draft)) { failure = "As escolhas do descanso mudaram. Confira as confirmações."; return; }
      const staged = structuredClone(draft);
      outcome.value = closeDayWithPlan(staged, currentPlan);
      if (!outcome.value?.ok) return;
      if (overnightRest || tableRestReadyForNight(draft)) {
        const rest = resolvePlannedOvernightRest(staged);
        if (!rest.ok) { failure = rest.message; outcome.value = null; return; }
        restApplied = true;
      }
      Object.assign(draft, staged);
    });
    if (!outcome.value?.ok) {
      toast.error("Não foi possível encerrar o dia.", {
        description: failure || "O estado da campanha mudou. Reabra o painel para recalcular o consumo.",
      });
      return;
    }

    const missingResidents = outcome.value.residentMissing.food + outcome.value.residentMissing.water;
    const missingSurvivors = outcome.value.deprivations.length;
    const restText = restApplied ? " · descanso longo aplicado" : "";
    if (missingResidents || missingSurvivors) {
      toast.warning("Novo amanhecer registrado com privações", {
        description: `${missingSurvivors} necessidade(s) de sobreviventes e ${missingResidents} de moradores ficaram sem recurso. Consulte o diário.${restText}`,
      });
    } else {
      toast.success("Novo amanhecer registrado", {
        description: `Dia ${game.day + 1}, 08:00. Consumo, validade e progressão diária foram processados${restText}.`,
      });
    }
    setOpen(false);
  }

  const runningActivities = Boolean(game.activities?.some(a => a.day === game.day && a.status === "running"));
  const reasonText = (reason: string) => reason === "remote" ? "reservas fora de alcance" : reason === "unavailable" ? "fonte sem porção" : "sem consumo registrado";
  // Pendências reunidas no topo: o mestre vê de uma vez o que precisa de atenção antes de rolar o diálogo.
  const pendingItems: { key: string; text: string; tone: "warning" | "block" }[] = [
    ...(inspection.stale ? [{ key: "stale", text: "O dia mudou desde que este painel foi aberto. Feche e abra novamente para recalcular.", tone: "block" as const }] : []),
    ...(runningActivities ? [{ key: "activities", text: "Há atividades em andamento. Conclua ou interrompa na linha do tempo antes de encerrar.", tone: "block" as const }] : []),
    ...(awaitingChoices ? [{ key: "rest", text: "Um descanso aguarda as escolhas dos sobreviventes.", tone: "block" as const }] : []),
    ...inspection.deprivations.map(row => ({ key: `dep-${row.survivorId ?? row.npcId}-${row.resource}`, text: `${row.name}: sem ${resourceName(row.resource).toLowerCase()} · ${reasonText(row.reason)}${row.survivorId ? " · +1 Estresse" : ""}`, tone: "warning" as const })),
    ...(inspection.residentMissing.food > 0 || inspection.residentMissing.water > 0 ? [{ key: "residents", text: `Moradores: faltam ${inspection.residentMissing.food} porção(ões) de comida e ${inspection.residentMissing.water} de água nas reservas.`, tone: "warning" as const }] : []),
    ...(timedEvents.length ? [{ key: "events", text: `${timedEvents.length} evento(s) temporal(is) pendente(s) antes do amanhecer: ${timedEvents.slice(0, 3).map(row => `${row.sector} (${row.event.triggerType === "night" ? "noturno" : "Barulho"})`).join(", ")}${timedEvents.length > 3 ? ` +${timedEvents.length - 3}` : ""}.`, tone: "warning" as const }] : []),
  ];
  const shortSource: Record<DayProvisionSource, string> = { already: "já consumiu", shared: "reservas", personal: "provisão pessoal", mixed: "reservas + pessoal", other: "outra fonte", none: "privação" };
  function sourceChip(resource: DailyResource, consumed: boolean, source: DayProvisionSource, warning: boolean) {
    const Icon = resource === "food" ? Utensils : Droplets;
    return <span className={`day-close-chip${warning ? " is-warning" : consumed ? " is-ok" : ""}`}>
      <Icon size={13} aria-hidden="true" />{resourceName(resource)}: {consumed ? "já consumiu" : warning ? "sem recurso" : shortSource[source]}
    </span>;
  }

  return <Dialog open={open} onOpenChange={handleOpenChange}>
    <DialogTrigger asChild>
      <Button size={size} variant={variant} className={className} onClick={prepare}>
        <Moon size={16} /><span className="day-close-label">{label}</span>
      </Button>
    </DialogTrigger>
    <DialogContent className="day-close-dialog">
      <DialogHeader>
        <DialogTitle>Encerrar o dia {game.day}</DialogTitle>
        <DialogDescription>
          Confira de onde vem a comida e a água de cada pessoa e confirme o novo amanhecer. O descanso longo só é aplicado se você ativá-lo e todos tiverem escolhas registradas.
        </DialogDescription>
      </DialogHeader>

      <div className="day-close-body">
        <div className="day-close-overview">
          <div className="day-close-summary">
            <div><span>Agora</span><b>Dia {game.day}</b></div>
            <Moon size={18} aria-hidden="true" />
            <div><span>Próximo</span><b>Dia {game.day + 1} · 08:00</b></div>
          </div>
          <div className="day-close-reserve-summary">
            {(["food", "water"] as const).map(resource => <div key={resource}>
              {resource === "food" ? <Utensils size={17} /> : <Droplets size={17} />}
              <span><small>{resourceName(resource)} nas reservas</small>
                <b>{inspection.shared[resource].demand} previstas / {inspection.shared[resource].available} disponíveis</b></span>
              {inspection.shared[resource].missing > 0
                ? <strong className="is-warning">−{inspection.shared[resource].missing}</strong>
                : <CheckCircle2 size={17} className="is-ok" aria-label="Suficiente" />}
            </div>)}
          </div>
        </div>

        <section className={`day-close-pending${pendingItems.length ? "" : " is-clear"}`} aria-live="polite">
          {pendingItems.length ? <>
            <h3><AlertTriangle size={16} aria-hidden="true" /> {pendingItems.length} pendência(s)</h3>
            <ul>{pendingItems.map(item => <li key={item.key} className={item.tone === "block" ? "is-block" : undefined}>{item.text}</li>)}</ul>
            {hasWarnings && !inspection.stale && <p>Você ainda pode encerrar o dia; privações são registradas nominalmente no diário.</p>}
          </> : <h3><CheckCircle2 size={16} aria-hidden="true" /> Tudo pronto: todos têm comida e água definidas.</h3>}
        </section>

        <section className="day-close-section">
          <div className="day-close-section-heading">
            <div><small>Sobreviventes</small><b>{game.survivors.length} pessoa(s)</b></div>
            <span>Abra para trocar a fonte. Consumo já registrado nunca é cobrado de novo.</span>
          </div>
          <div className="day-close-people">
            {game.survivors.map(person => {
              const entry = planFor(person);
              const atStorage = survivorHex(game, person) === storageHex;
              const foodWarning = warningFor(person, "food");
              const waterWarning = warningFor(person, "water");
              const extraStress = Number(Boolean(foodWarning)) + Number(Boolean(waterWarning));
              return <details className={`day-close-person ${extraStress ? "has-warning" : ""}`} key={person.id} open={extraStress > 0}>
                <summary>
                  <span className="day-close-avatar">{person.portrait ? <img src={person.portrait} alt="" /> : person.name.charAt(0).toUpperCase()}</span>
                  <span className="day-close-person-name"><b>{person.name}</b><small><MapPin size={12} /> Hex {survivorHex(game, person)} · {atStorage ? "junto às reservas" : "em campo"}</small></span>
                  <span className="day-close-chips">
                    {sourceChip("food", provisionConsumedToday(game, person, "food"), entry.food, Boolean(foodWarning))}
                    {sourceChip("water", provisionConsumedToday(game, person, "water"), entry.water, Boolean(waterWarning))}
                  </span>
                </summary>
                <div className="day-close-person-body">
                  {extraStress > 0 && <p className="day-close-inline-warning">Privação prevista: +{extraStress} Estresse · {person.stress} → {Math.min(6, person.stress + extraStress)}/6</p>}
                  <div className="day-close-person-resources">
                    {(["food", "water"] as const).map(resource => {
                      const consumed = provisionConsumedToday(game, person, resource);
                      const warning = warningFor(person, resource);
                      const personal = provisionBreakdown(person, resource).total;
                      const required = requiredDailyProvision(person, resource);
                      const remainingNeed = remainingDailyProvisionPortions(game, person, resource);
                      return <div className="day-close-resource-row" key={resource}>
                        <span className="day-close-resource-label">
                          {resource === "food" ? <Utensils size={15} /> : <Droplets size={15} />}
                          <b>{resourceName(resource)}</b>
                          {consumed && <small className="is-ok"><CheckCircle2 size={12} /> necessidade completa</small>}
                          {!consumed && required > 1 && <small className="is-warning">Calor · faltam {remainingNeed}/{required}</small>}
                          {!consumed && personal > 0 && <small>{personal} pessoal(is)</small>}
                        </span>
                        {consumed
                          ? <span className="day-close-consumed">Já consumiu hoje</span>
                          : <Pick label={`Fonte de ${resourceName(resource).toLowerCase()}`} value={entry[resource]}
                              options={sourceOptions(person, resource)}
                              onChange={value => updateSource(person.id, resource, value as DayProvisionSource)} />}
                        {warning && <small className="day-close-inline-warning"><AlertTriangle size={12} />
                          {warning.reason === "remote" ? "Reservas inacessíveis deste hex."
                            : warning.reason === "unavailable" ? "A fonte escolhida não tem porção disponível."
                            : "Sem consumo registrado para o dia."}</small>}
                      </div>;
                    })}
                  </div>
                </div>
              </details>;
            })}
            {game.survivors.length === 0 && <p className="character-rule-note">Nenhum sobrevivente registrado. Apenas o consumo dos moradores será processado.</p>}
          </div>
        </section>

        <details className="day-close-section day-close-collapsible" open={inspection.residentMissing.food > 0 || inspection.residentMissing.water > 0}>
          <summary className="day-close-section-heading">
            <div><small>Moradores do abrigo</small><b>{residents} registrado(s) · {currentPlan.residentsFood} comem · {currentPlan.residentsWater} bebem</b></div>
            <span>Quantos usarão as reservas hoje?</span>
          </summary>
          <div className="day-close-resident-controls">
            <Counter compact editable label="Comida" value={currentPlan.residentsFood} min={0} max={residents} onChange={value => updateResident("food", value)} />
            <Counter compact editable label="Água" value={currentPlan.residentsWater} min={0} max={residents} onChange={value => updateResident("water", value)} />
          </div>
          <p className="text-xs subtle">Moradores não incluídos nesses contadores são tratados como atendidos por outra fonte; o sistema não cria privação para eles automaticamente.</p>
          {(inspection.residentMissing.food > 0 || inspection.residentMissing.water > 0) && <p className="day-close-warning">
            <AlertTriangle size={15} /> As reservas não cobrem {inspection.residentMissing.food} porção(ões) de comida e {inspection.residentMissing.water} de água previstas para moradores.
          </p>}
        </details>

        {(npcsAtReserve.length > 0 || fieldNpcList.length > 0) && <details className="day-close-section day-close-collapsible" open={inspection.deprivations.some(row => row.npcId)}>
          <summary className="day-close-section-heading"><div><small>PNJs identificados</small><b>{npcsAtReserve.length} junto às reservas · {fieldNpcList.length} em campo</b></div>
            <span>Todo consumo é nominal e auditável.</span></summary>
          <p className="text-xs subtle">PNJs no abrigo podem usar reservas compartilhadas. Quem está em campo só pode usar uma porção portada por sobrevivente no mesmo hex, outra fonte declarada pelo mestre ou terá a privação registrada.</p>
          <div className="day-close-people">{[...npcsAtReserve, ...fieldNpcList].map(npc => {
            const entry = npcPlanFor(npc);
            const carriers = game.survivors.filter(person => survivorHex(game, person) === npc.hex);
            return <article className={`day-close-person is-static ${npcWarningFor(npc, "food") || npcWarningFor(npc, "water") ? "has-warning" : ""}`} key={npc.id}><header>
              <span className="day-close-avatar">{npc.portrait ? <img src={npc.portrait} alt="" /> : npc.name.charAt(0).toUpperCase()}</span><span className="day-close-person-name"><b>{npc.name}</b><small><MapPin size={12} /> Hex {npc.hex} · {npc.hex === storageHex ? "junto às reservas" : "em campo"}</small></span>
            </header><div className="day-close-person-resources">{(["food", "water"] as const).map(resource => {
              const warning = npcWarningFor(npc, resource);
              const consumed = (resource === "food" ? npc.foodConsumedDay : npc.waterConsumedDay) === game.day;
              const carrierId = resource === "food" ? entry.foodCarrierId : entry.waterCarrierId;
              return <div className="day-close-resource-row" key={resource}><span className="day-close-resource-label">{resource === "food" ? <Utensils size={15} /> : <Droplets size={15} />}<b>{resourceName(resource)}</b>{consumed && <small className="is-ok"><CheckCircle2 size={12} /> já registrado</small>}</span>
                {consumed ? <span className="day-close-consumed">Já consumiu hoje</span> : <div className="grid gap-2"><Pick label={`Fonte de ${resourceName(resource).toLowerCase()}`} value={entry[resource]} options={npcSourceOptions(npc, resource)} onChange={value => updateNpcSource(npc.id, resource, value as DayProvisionSource)} />
                  {entry[resource] === "personal" && <Pick label="Quem porta a porção" value={carrierId ?? ""} options={[{ value: "", label: "Selecione a pessoa" }, ...carriers.map(person => ({ value: person.id, label: `${person.name} · ${provisionBreakdown(person, resource).total} porção(ões)` }))]} onChange={value => updateCarrier(npc.id, resource, value)} />}</div>}
                {warning && <small className="day-close-inline-warning"><AlertTriangle size={12} />{warning.reason === "remote" ? "Reserva remota; escolha uma pessoa deste hex." : warning.reason === "unavailable" ? "A fonte escolhida não tem porção disponível." : "Sem consumo registrado para o dia."}</small>}
              </div>;
            })}</div></article>;
          })}</div>
        </details>}

        <section className="day-close-section">
          <div className="day-close-section-heading"><div><small>Descanso da noite</small><b>6h · opcional</b></div>
            <span>{tableRestReadyForNight(game) ? "Descanso solicitado e confirmado por todos." : "Escolha se haverá descanso durante a noite."}</span></div>
          <label className="inventory-ready">
            <input type="checkbox" checked={overnightRest || tableRestReadyForNight(game)} disabled={!overnightRestReady || tableRestReadyForNight(game)}
              onChange={event => setOvernightRest(event.target.checked)} />
            <span><b>Aplicar descanso longo durante a noite</b><small>{overnightRestReady
              ? "Todos os sobreviventes têm duas escolhas de descanso longo registradas. O amanhecer às 08:00 representa o tempo de descanso."
              : "Ainda faltam escolhas de descanso longo. Registre-as nas fichas dos sobreviventes antes de encerrar o dia."}</small></span>
          </label>
        </section>

        <details className="day-close-rules">
          <summary>Como o consumo funciona</summary>
          <p className="character-rule-note">
            O sistema usa primeiro provisões abertas ou próximas do vencimento. Cada sobrevivente marca +1 Estresse por não comer e +1 por não beber no dia: ambas as faltas somam +2, até o limite de 6 Estresse. Voltar a consumir não remove Estresse. PNJs e moradores, que não têm trilha de Estresse, mantêm o registro de faltas.
          </p>
          <RuleHelp topic="day"/>
        </details>
      </div>

      <DialogFooter>
        {awaitingChoices && <p role="status" className="day-close-footer-note">Há um descanso aguardando as escolhas dos sobreviventes.</p>}
        <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
        <Button disabled={inspection.stale || awaitingChoices} onClick={nextMorning}>
          {hasWarnings || timedEvents.length ? "Confirmar com pendências" : `Confirmar e iniciar dia ${game.day + 1}`}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
