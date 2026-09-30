import {
  absoluteMinutes,
  addLog,
  survivorHex,
  survivorsAtHex,
  type GameState,
  type InventoryItem,
  type StockHolder,
  type Survivor,
} from "./game";
import { consumeProvisionPortionFromItems } from "./inventory";
import { provisionBreakdown, provisionItemInfo } from "./provision-items";
import { expirePhysicalFood, expirePortionLots, provisionDeadline, withdrawPortions } from "./provisions";

export type DailyResource = "food" | "water";
export type DayProvisionSource = "already" | "shared" | "personal" | "other" | "none";
export type DayCloseSurvivorPlan = {
  survivorId: string;
  food: DayProvisionSource;
  water: DayProvisionSource;
};
export type DayClosePlan = {
  expectedDay: number;
  residentsFood: number;
  residentsWater: number;
  survivors: DayCloseSurvivorPlan[];
};
export type DayCloseDeprivation = {
  survivorId: string;
  name: string;
  resource: DailyResource;
  reason: "none" | "unavailable" | "remote";
};
export type DayCloseInspection = {
  shared: Record<DailyResource, { available: number; demand: number; missing: number }>;
  residentMissing: Record<DailyResource, number>;
  deprivations: DayCloseDeprivation[];
  stale: boolean;
};
export type DayCloseResult = DayCloseInspection & { ok: boolean };

type ProvisionHolder = StockHolder & { inventory?: InventoryItem[] };

function dayKey(resource: DailyResource) {
  return resource === "food" ? "foodConsumedDay" : "waterConsumedDay";
}
function resourceLabel(resource: DailyResource) {
  return resource === "food" ? "Comida" : "Água";
}
export function provisionConsumedToday(game: GameState, person: Survivor, resource: DailyResource) {
  return person[dayKey(resource)] === game.day;
}

export function consumeDailyProvision(game: GameState, survivorId: string, resource: DailyResource) {
  const survivor = game.survivors.find(s => s.id === survivorId);
  const key = dayKey(resource);
  if (!survivor || survivor[resource] < 1 || survivor[key] === game.day) return false;
  withdrawPortions(survivor, resource, 1);
  survivor[key] = game.day;
  addLog(game, "provisões", `${survivor.name} consumiu 1 porção pessoal de ${resourceLabel(resource)} no dia ${game.day}.`, survivor.id);
  return true;
}

function physicalExpiry(item: InventoryItem) {
  const info = provisionItemInfo(item);
  if (!info.resource || !info.ready || info.remaining < 1) return Number.POSITIVE_INFINITY;
  if (info.opened) return -1;
  if (info.expiresDay !== null) return info.expiresDay;
  return item.foundDay ? (provisionDeadline(info.shelf, item.foundDay) ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
}

function bestPhysical(items: InventoryItem[] | undefined, resource: DailyResource) {
  return (items ?? [])
    .filter(item => {
      const info = provisionItemInfo(item);
      return info.resource === resource && info.ready && info.remaining > 0;
    })
    .sort((a, b) => physicalExpiry(a) - physicalExpiry(b)
      || Number(Boolean(b.opened)) - Number(Boolean(a.opened))
      || (a.foundDay ?? 999999) - (b.foundDay ?? 999999))[0];
}

function earliestLooseExpiry(holder: ProvisionHolder, resource: DailyResource) {
  const expiries = (holder.provisionLots ?? [])
    .filter(lot => lot.resource === resource && lot.qty > 0)
    .map(lot => lot.expiresDay);
  return expiries.length ? Math.min(...expiries) : Number.POSITIVE_INFINITY;
}

/** Consumes the source most at risk of being wasted. Loose expiring lots and
 * physical ready items compete by expiry; durable loose portions remain last. */
export function consumeBestProvision(holder: ProvisionHolder, resource: DailyResource) {
  const physical = bestPhysical(holder.inventory, resource);
  const physicalDeadline = physical ? physicalExpiry(physical) : Number.POSITIVE_INFINITY;
  const looseDeadline = holder[resource] > 0 ? earliestLooseExpiry(holder, resource) : Number.POSITIVE_INFINITY;

  if (physical && physicalDeadline < looseDeadline) {
    const result = consumeProvisionPortionFromItems(holder.inventory ?? [], physical.id);
    return result ? { consumed: 1, label: result.name, source: "item" as const } : { consumed: 0, source: "none" as const };
  }
  if (holder[resource] > 0) {
    withdrawPortions(holder, resource, 1);
    return { consumed: 1, label: "porção solta", source: "loose" as const };
  }
  if (physical) {
    const result = consumeProvisionPortionFromItems(holder.inventory ?? [], physical.id);
    return result ? { consumed: 1, label: result.name, source: "item" as const } : { consumed: 0, source: "none" as const };
  }
  return { consumed: 0, source: "none" as const };
}

function consumeMany(holder: ProvisionHolder, resource: DailyResource, quantity: number) {
  let consumed = 0;
  const labels: string[] = [];
  for (let index = 0; index < Math.max(0, Math.trunc(quantity)); index++) {
    const result = consumeBestProvision(holder, resource);
    if (!result.consumed) break;
    consumed += result.consumed;
    if (result.label) labels.push(result.label);
  }
  return { consumed, labels };
}

export function eveningNeeds(game: GameState) {
  const storageHex = game.shelter.hex ?? game.partyHex;
  const present = survivorsAtHex(game, storageHex);
  return {
    food: game.shelter.residents + present.filter(s => !provisionConsumedToday(game, s, "food")).length,
    water: game.shelter.residents + present.filter(s => !provisionConsumedToday(game, s, "water")).length,
  };
}

export function defaultDayClosePlan(game: GameState): DayClosePlan {
  const sharedRemaining: Record<DailyResource, number> = {
    food: Math.max(0, provisionBreakdown(game.shelter, "food").total - game.shelter.residents),
    water: Math.max(0, provisionBreakdown(game.shelter, "water").total - game.shelter.residents),
  };
  const storageHex = game.shelter.hex ?? game.partyHex;

  function sourceFor(person: Survivor, resource: DailyResource): DayProvisionSource {
    if (provisionConsumedToday(game, person, resource)) return "already";
    if (survivorHex(game, person) === storageHex && sharedRemaining[resource] > 0) {
      sharedRemaining[resource] -= 1;
      return "shared";
    }
    if (provisionBreakdown(person, resource).total > 0) return "personal";
    return "none";
  }

  return {
    expectedDay: game.day,
    residentsFood: game.shelter.residents,
    residentsWater: game.shelter.residents,
    survivors: game.survivors.map(person => ({
      survivorId: person.id,
      food: sourceFor(person, "food"),
      water: sourceFor(person, "water"),
    })),
  };
}

function validResidentCount(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 999;
}
function planEntry(plan: DayClosePlan, survivorId: string) {
  return plan.survivors.find(entry => entry.survivorId === survivorId);
}

export function inspectDayClosePlan(game: GameState, plan: DayClosePlan): DayCloseInspection {
  const available: Record<DailyResource, number> = {
    food: provisionBreakdown(game.shelter, "food").total,
    water: provisionBreakdown(game.shelter, "water").total,
  };
  const remaining = { ...available };
  const residentDemand = {
    food: validResidentCount(plan.residentsFood) ? plan.residentsFood : 0,
    water: validResidentCount(plan.residentsWater) ? plan.residentsWater : 0,
  };
  const residentMissing: Record<DailyResource, number> = { food: 0, water: 0 };
  for (const resource of ["food", "water"] as const) {
    const used = Math.min(remaining[resource], residentDemand[resource]);
    remaining[resource] -= used;
    residentMissing[resource] = residentDemand[resource] - used;
  }

  const storageHex = game.shelter.hex ?? game.partyHex;
  const deprivations: DayCloseDeprivation[] = [];
  for (const person of game.survivors) {
    const entry = planEntry(plan, person.id);
    for (const resource of ["food", "water"] as const) {
      if (provisionConsumedToday(game, person, resource)) continue;
      const source = entry?.[resource] ?? "none";
      if (source === "other") continue;
      if (source === "personal") {
        if (provisionBreakdown(person, resource).total < 1)
          deprivations.push({ survivorId: person.id, name: person.name, resource, reason: "unavailable" });
        continue;
      }
      if (source === "shared") {
        if (survivorHex(game, person) !== storageHex) {
          deprivations.push({ survivorId: person.id, name: person.name, resource, reason: "remote" });
        } else if (remaining[resource] > 0) {
          remaining[resource] -= 1;
        } else {
          deprivations.push({ survivorId: person.id, name: person.name, resource, reason: "unavailable" });
        }
        continue;
      }
      deprivations.push({ survivorId: person.id, name: person.name, resource, reason: "none" });
    }
  }

  const sharedDemand = (resource: DailyResource) => plan.survivors.filter(entry => {
    if (entry[resource] !== "shared") return false;
    const person = game.survivors.find(candidate => candidate.id === entry.survivorId);
    return Boolean(person && !provisionConsumedToday(game, person, resource));
  }).length;
  const demand: Record<DailyResource, number> = {
    food: residentDemand.food + sharedDemand("food"),
    water: residentDemand.water + sharedDemand("water"),
  };

  return {
    shared: {
      food: { available: available.food, demand: demand.food, missing: Math.max(0, demand.food - available.food) },
      water: { available: available.water, demand: demand.water, missing: Math.max(0, demand.water - available.water) },
    },
    residentMissing,
    deprivations,
    stale: plan.expectedDay !== game.day,
  };
}

function advanceMorning(game: GameState) {
  game.day += 1;
  game.minutes = 480;
  game.noise = 0;
  game.scene = (game.scene ?? 1) + 1;
  const morning = absoluteMinutes(game);
  const lostAtBase = [...expirePortionLots(game.shelter, game.day),
    ...expirePhysicalFood(game, game.shelter.inventory ?? [], Boolean(game.shelter.coldStorage && game.shelter.energy > 0))];
  if (lostAtBase.length) addLog(game, "provisões", `Ao amanhecer, estragou nas reservas: ${lostAtBase.join(", ")}.`);
  for (const site of game.formerShelters ?? []) {
    const spoiled = [...expirePortionLots(site, game.day),
      ...expirePhysicalFood(game, site.inventory ?? [], Boolean(site.coldStorage && site.energy > 0))];
    if (spoiled.length) addLog(game, "provisões", `Na antiga base do hex ${site.hex}, estragou ${spoiled.join(", ")}.`);
  }
  for (const person of game.survivors) {
    const spoiled = [...expirePortionLots(person, game.day), ...expirePhysicalFood(game, person.inventory)];
    if (spoiled.length) addLog(game, "provisões", `${person.name}: estragou ${spoiled.join(", ")}.`, person.id);
    const prior = person.infection;
    if (prior === "Exposto" && person.exposureDeadline !== null && person.exposureDeadline < morning) person.infection = "Infectado";
    else if (prior === "Infectado") person.infection = "Sintomático";
    else if (prior === "Sintomático") { person.infection = "Terminal"; person.terminalScenes = 3; }
    if (prior !== person.infection) addLog(game, "infecção", `${person.name}: ${prior} → ${person.infection} ao amanhecer.`);
  }
  addLog(game, "dia", `Amanhecer do dia ${game.day}.`);
}

export function closeDayWithPlan(game: GameState, plan: DayClosePlan): DayCloseResult {
  if (game.day !== plan.expectedDay || !validResidentCount(plan.residentsFood) || !validResidentCount(plan.residentsWater))
    return { ok: false, ...inspectDayClosePlan(game, plan), stale: true };

  const inspection = inspectDayClosePlan(game, plan);
  const residentFood = consumeMany(game.shelter, "food", plan.residentsFood);
  const residentWater = consumeMany(game.shelter, "water", plan.residentsWater);
  if (plan.residentsFood || plan.residentsWater) {
    addLog(game, "provisões", `Moradores do abrigo: ${residentFood.consumed}/${plan.residentsFood} porção(ões) de Comida e ${residentWater.consumed}/${plan.residentsWater} de Água consumidas das reservas.`);
  }

  const storageHex = game.shelter.hex ?? game.partyHex;
  const actualDeprivations: DayCloseDeprivation[] = [];

  for (const person of game.survivors) {
    const entry = planEntry(plan, person.id);
    for (const resource of ["food", "water"] as const) {
      const key = dayKey(resource);
      if (person[key] === game.day) continue;
      const source = entry?.[resource] ?? "none";

      if (source === "other") {
        person[key] = game.day;
        addLog(game, "provisões", `${person.name}: ${resourceLabel(resource)} registrada por outra fonte/dispensa do mestre.`, person.id);
        continue;
      }

      if (source === "personal") {
        const result = consumeBestProvision(person, resource);
        if (result.consumed) {
          person[key] = game.day;
          addLog(game, "provisões", `${person.name} consumiu 1 porção pessoal de ${resourceLabel(resource)}${result.label ? ` (${result.label})` : ""}.`, person.id);
          continue;
        }
        actualDeprivations.push({ survivorId: person.id, name: person.name, resource, reason: "unavailable" });
        continue;
      }

      if (source === "shared") {
        if (survivorHex(game, person) !== storageHex) {
          actualDeprivations.push({ survivorId: person.id, name: person.name, resource, reason: "remote" });
          continue;
        }
        const result = consumeBestProvision(game.shelter, resource);
        if (result.consumed) {
          person[key] = game.day;
          addLog(game, "provisões", `${person.name} consumiu 1 porção de ${resourceLabel(resource)} das reservas compartilhadas${result.label ? ` (${result.label})` : ""}.`, person.id);
          continue;
        }
        actualDeprivations.push({ survivorId: person.id, name: person.name, resource, reason: "unavailable" });
        continue;
      }

      // "already" is only valid while the marker still says the resource was
      // consumed. If the state changed before confirmation, it becomes a clear
      // deprivation instead of silently spending another portion.
      actualDeprivations.push({ survivorId: person.id, name: person.name, resource, reason: "none" });
    }
  }

  for (const deprivation of actualDeprivations) {
    addLog(game, "privação", `${deprivation.name} encerrou o dia sem registrar ${deprivation.resource === "food" ? "alimentação" : "hidratação"}. Nenhuma consequência mecânica foi aplicada automaticamente.`, deprivation.survivorId);
  }
  const residentFoodMissing = Math.max(0, plan.residentsFood - residentFood.consumed);
  const residentWaterMissing = Math.max(0, plan.residentsWater - residentWater.consumed);
  if (residentFoodMissing || residentWaterMissing) {
    addLog(game, "privação", `Moradores do abrigo: faltaram ${residentFoodMissing} porção(ões) de Comida e ${residentWaterMissing} de Água. Nenhuma consequência mecânica foi aplicada automaticamente.`);
  }

  advanceMorning(game);
  return {
    ok: true,
    ...inspection,
    residentMissing: { food: residentFoodMissing, water: residentWaterMissing },
    deprivations: actualDeprivations,
    stale: false,
  };
}

/** Legacy numeric flow kept for tests/backward compatibility. New UI uses
 * closeDayWithPlan so shortages are attributed to specific survivors. */
export function closeDay(game: GameState, food: number, water: number, expectedDay = game.day) {
  if (game.day !== expectedDay || ![food, water].every(n => Number.isInteger(n) && n >= 0 && n <= 999)) return false;
  const foodResult = consumeMany(game.shelter, "food", food);
  const waterResult = consumeMany(game.shelter, "water", water);
  const foodMissing = Math.max(0, food - foodResult.consumed);
  const waterMissing = Math.max(0, water - waterResult.consumed);
  const itemUse = [...foodResult.labels, ...waterResult.labels].filter(label => label !== "porção solta");
  addLog(game, "provisões", `Anoitecer: ${foodResult.consumed} porção(ões) de Comida e ${waterResult.consumed} de Água foram consumidas das reservas compartilhadas. ` +
    (itemUse.length ? `Itens usados: ${itemUse.join(", ")}. ` : "") +
    (foodMissing ? `Faltaram ${foodMissing} de Comida. ` : "") + (waterMissing ? `Faltaram ${waterMissing} de Água.` : ""));
  advanceMorning(game);
  return true;
}
