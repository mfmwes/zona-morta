"use client";
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
  type DailyResource,
  type DayClosePlan,
  type DayCloseResult,
  type DayProvisionSource,
} from "@/lib/survival";
import { provisionBreakdown } from "@/lib/provision-items";
import { survivorHex, type GameState, type NPC, type Survivor } from "@/lib/game";

type Edit = (fn: (draft: GameState) => void) => void;

const sourceLabels: Record<DayProvisionSource, string> = {
  already: "Já consumiu hoje",
  shared: "Reservas compartilhadas",
  personal: "Provisão pessoal",
  other: "Outra fonte / dispensado",
  none: "Sem consumir · registrar privação",
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

  const storageHex = game.shelter.hex ?? game.partyHex;
  const currentPlan = plan ?? defaultDayClosePlan(game);
  const inspection = inspectDayClosePlan(game, currentPlan);
  const hasWarnings = inspection.deprivations.length > 0
    || inspection.residentMissing.food > 0
    || inspection.residentMissing.water > 0;
  const residents = Math.max(0, Math.trunc(game.shelter.residents));
  const fieldNpcList = fieldNpcs(game);
  const npcsAtReserve = (game.npcs ?? []).filter(npc => npc.active && npc.status !== "Morto" && npc.status !== "Desaparecido" && npc.hex === storageHex);

  function prepare() {
    setPlan(defaultDayClosePlan(game));
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

    const personal = provisionBreakdown(person, resource).total;
    const shared = provisionBreakdown(game.shelter, resource).total;
    const atStorage = survivorHex(game, person) === storageHex;
    const options: { value: string; label: string }[] = [];
    if (atStorage && shared > 0)
      options.push({ value: "shared", label: `${sourceLabels.shared} · ${shared} disponível(is)` });
    if (personal > 0)
      options.push({ value: "personal", label: `${sourceLabels.personal} · ${personal} disponível(is)` });
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
    let result: DayCloseResult | null = null;
    edit(draft => {
      result = closeDayWithPlan(draft, currentPlan);
    });
    if (!result?.ok) {
      toast.error("Não foi possível encerrar o dia.", {
        description: "O estado da campanha mudou. Reabra o painel para recalcular o consumo.",
      });
      return;
    }

    const missingResidents = result.residentMissing.food + result.residentMissing.water;
    const missingSurvivors = result.deprivations.length;
    if (missingResidents || missingSurvivors) {
      toast.warning("Novo amanhecer registrado com privações", {
        description: `${missingSurvivors} necessidade(s) de sobreviventes e ${missingResidents} de moradores ficaram sem recurso. Consulte o diário.`,
      });
    } else {
      toast.success("Novo amanhecer registrado", {
        description: `Dia ${game.day + 1}, 08:00. Consumo, validade e progressão diária foram processados.`,
      });
    }
    setOpen(false);
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
          Revise quem já consumiu, de onde virá cada porção e quem ficará sem recurso. Confirmar avança a campanha para o próximo amanhecer às 08:00; nenhum descanso é realizado automaticamente.
        </DialogDescription>
      </DialogHeader>

      <div className="day-close-summary">
        <div><span>AGORA</span><b>Dia {game.day}</b><small>horário atual da campanha</small></div>
        <Moon size={20} aria-hidden="true" />
        <div><span>PRÓXIMO</span><b>Dia {game.day + 1} · 08:00</b><small>novo amanhecer</small></div>
      </div>

      <div className="day-close-reserve-summary">
        {(["food", "water"] as const).map(resource => <div key={resource}>
          {resource === "food" ? <Utensils size={17} /> : <Droplets size={17} />}
          <span><small>{resourceName(resource).toUpperCase()} · RESERVAS</small>
            <b>{inspection.shared[resource].demand} previstas / {inspection.shared[resource].available} disponíveis</b></span>
          {inspection.shared[resource].missing > 0
            ? <strong className="is-warning">−{inspection.shared[resource].missing}</strong>
            : <CheckCircle2 size={17} className="is-ok" />}
        </div>)}
      </div>

      <section className="day-close-section">
        <div className="day-close-section-heading">
          <div><small>MORADORES DO ABRIGO</small><b>{residents} registrado(s)</b></div>
          <span>Quantos usarão as reservas hoje?</span>
        </div>
        <div className="day-close-resident-controls">
          <Counter compact editable label="Comida" value={currentPlan.residentsFood} min={0} max={residents} onChange={value => updateResident("food", value)} />
          <Counter compact editable label="Água" value={currentPlan.residentsWater} min={0} max={residents} onChange={value => updateResident("water", value)} />
        </div>
        <p className="text-xs subtle">Moradores não incluídos nesses contadores são tratados como atendidos por outra fonte; o sistema não cria privação para eles automaticamente.</p>
        {(inspection.residentMissing.food > 0 || inspection.residentMissing.water > 0) && <p className="day-close-warning">
          <AlertTriangle size={15} /> As reservas não cobrem {inspection.residentMissing.food} porção(ões) de comida e {inspection.residentMissing.water} de água previstas para moradores.
        </p>}
      </section>

      <section className="day-close-section">
        <div className="day-close-section-heading">
          <div><small>SOBREVIVENTES</small><b>Prestação de contas individual</b></div>
          <span>Consumo já registrado nunca é cobrado novamente.</span>
        </div>
        <div className="day-close-people">
          {game.survivors.map(person => {
            const entry = planFor(person);
            const atStorage = survivorHex(game, person) === storageHex;
            const foodWarning = warningFor(person, "food");
            const waterWarning = warningFor(person, "water");
            return <article className={`day-close-person ${foodWarning || waterWarning ? "has-warning" : ""}`} key={person.id}>
              <header>
                <span className="day-close-avatar">{person.portrait ? <img src={person.portrait} alt="" /> : person.name.charAt(0).toUpperCase()}</span>
                <span><b>{person.name}</b><small><MapPin size={12} /> Hex {survivorHex(game, person)} · {atStorage ? "junto às reservas" : "em campo"}</small></span>
              </header>

              <div className="day-close-person-resources">
                {(["food", "water"] as const).map(resource => {
                  const consumed = provisionConsumedToday(game, person, resource);
                  const warning = warningFor(person, resource);
                  const personal = provisionBreakdown(person, resource).total;
                  return <div className="day-close-resource-row" key={resource}>
                    <span className="day-close-resource-label">
                      {resource === "food" ? <Utensils size={15} /> : <Droplets size={15} />}
                      <b>{resourceName(resource)}</b>
                      {consumed && <small className="is-ok"><CheckCircle2 size={12} /> já registrado</small>}
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
            </article>;
          })}
          {game.survivors.length === 0 && <p className="character-rule-note">Nenhum sobrevivente registrado. Apenas o consumo dos moradores será processado.</p>}
        </div>
      </section>

      {(npcsAtReserve.length > 0 || fieldNpcList.length > 0) && <section className="day-close-section">
        <div className="day-close-section-heading"><div><small>NPCS IDENTIFICADOS</small><b>{npcsAtReserve.length} junto às reservas · {fieldNpcList.length} em campo</b></div>
          <span>Todo consumo é nominal e auditável.</span></div>
        <p className="text-xs subtle mb-3">NPCs no abrigo podem usar reservas compartilhadas. Quem está em campo só pode usar uma porção portada por sobrevivente no mesmo hex, outra fonte declarada pelo mestre ou terá a privação registrada.</p>
        <div className="day-close-people">{[...npcsAtReserve, ...fieldNpcList].map(npc => {
          const entry = npcPlanFor(npc);
          const carriers = game.survivors.filter(person => survivorHex(game, person) === npc.hex);
          return <article className={`day-close-person ${npcWarningFor(npc, "food") || npcWarningFor(npc, "water") ? "has-warning" : ""}`} key={npc.id}><header>
            <span className="day-close-avatar">{npc.portrait ? <img src={npc.portrait} alt="" /> : npc.name.charAt(0).toUpperCase()}</span><span><b>{npc.name}</b><small><MapPin size={12} /> Hex {npc.hex} · {npc.hex === storageHex ? "junto às reservas" : "em campo"}</small></span>
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
      </section>}

      <p className="character-rule-note">
        O sistema consome primeiro as provisões com maior risco de perda: unidades abertas e recursos que vencem antes. Se alguém ficar sem comida ou água, a privação será registrada no diário, mas nenhuma consequência mecânica nova será aplicada automaticamente.
      </p>

      {inspection.stale && <p className="day-close-warning"><AlertTriangle size={15} /> O dia mudou desde que este painel foi aberto. Feche e abra novamente para recalcular.</p>}
      {hasWarnings && !inspection.stale && <p className="day-close-warning">
        <AlertTriangle size={15} /> Há pendências ou privações previstas. Você ainda pode encerrar o dia; elas serão registradas nominalmente no diário.
      </p>}

      <DialogFooter>
        <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
        <Button disabled={inspection.stale} onClick={nextMorning}>
          {hasWarnings ? "Confirmar com pendências" : `Confirmar e iniciar dia ${game.day + 1}`}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
