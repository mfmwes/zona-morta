import {
  absoluteMinutes,
  addLog,
  survivorHex,
  survivorsAtHex,
  type GameState,
  type InventoryItem,
  type NPC,
  type StockHolder,
  type Survivor,
} from "./game";
import { expireEventClocks } from "./event-clocks";
import { consumeProvisionPortionFromItems } from "./inventory";
import { provisionBreakdown, provisionItemInfo } from "./provision-items";
import { expirePhysicalFood, expirePortionLots, provisionDeadline, withdrawPortions } from "./provisions";
import { shelterColdStorageActive, shelterMetrics } from "./shelter-projects";
import { settleScheduledWorkBeforeMorning } from "./time";
import { expireLocationFood } from "./hex-automation";
import { resetParallelTime } from "./activity";
import { dailyExtraWater } from "./survivor-conditions";

export type DailyResource = "food" | "water";
export type DayProvisionSource = "already" | "shared" | "personal" | "mixed" | "other" | "none";
export type DayCloseSurvivorPlan = {
  survivorId: string;
  food: DayProvisionSource;
  water: DayProvisionSource;
};
export type DayCloseNpcPlan = {
  npcId: string;
  food: DayProvisionSource;
  water: DayProvisionSource;
  /** NPCs do not have a hidden inventory: field provisions are charged to this carrier. */
  foodCarrierId?: string;
  waterCarrierId?: string;
};
export type DayClosePlan = {
  expectedDay: number;
  residentsFood: number;
  residentsWater: number;
  survivors: DayCloseSurvivorPlan[];
  npcs: DayCloseNpcPlan[];
};
export type DayCloseDeprivation = {
  survivorId?: string;
  npcId?: string;
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
type ProvisionConsumption = {
  consumed: number;
  source: "item" | "loose" | "none";
  label?: string;
};

function dayKey(resource: DailyResource): "foodConsumedDay" | "waterConsumedDay" {
  return resource === "food" ? "foodConsumedDay" : "waterConsumedDay";
}
function resourceLabel(resource: DailyResource) {
  return resource === "food" ? "Comida" : "Água";
}
export function requiredDailyProvision(person: Survivor, resource: DailyResource) {
  return resource === "water" ? 1 + dailyExtraWater(person) : 1;
}

export function consumedDailyProvisionPortions(game: GameState, person: Survivor, resource: DailyResource) {
  if (resource === "food") return person.foodConsumedDay === game.day ? 1 : 0;
  return (person.waterConsumedDay === game.day ? 1 : 0)
    + (person.extraWaterConsumedDay === game.day ? 1 : 0);
}

export function remainingDailyProvisionPortions(game: GameState, person: Survivor, resource: DailyResource) {
  return Math.max(0, requiredDailyProvision(person, resource) - consumedDailyProvisionPortions(game, person, resource));
}

export function provisionConsumedToday(game: GameState, person: Survivor, resource: DailyResource) {
  return remainingDailyProvisionPortions(game, person, resource) === 0;
}

export function markDailyProvisionConsumed(game: GameState, person: Survivor, resource: DailyResource, quantity = 1) {
  let remaining = Math.max(0, Math.trunc(quantity));
  if (resource === "food") {
    if (remaining > 0 && person.foodConsumedDay !== game.day) { person.foodConsumedDay = game.day; remaining -= 1; }
    return quantity - remaining;
  }
  if (remaining > 0 && person.waterConsumedDay !== game.day) { person.waterConsumedDay = game.day; remaining -= 1; }
  if (remaining > 0 && requiredDailyProvision(person, "water") > 1 && person.extraWaterConsumedDay !== game.day) {
    person.extraWaterConsumedDay = game.day; remaining -= 1;
  }
  return quantity - remaining;
}

function npcConsumedToday(game: GameState, npc: NPC, resource: DailyResource) {
  return npc[dayKey(resource)] === game.day;
}

export function consumeDailyProvision(game: GameState, survivorId: string, resource: DailyResource) {
  const survivor = game.survivors.find(s => s.id === survivorId);
  const remaining = survivor ? remainingDailyProvisionPortions(game, survivor, resource) : 0;
  if (!survivor || survivor[resource] < 1 || remaining < 1) return false;
  withdrawPortions(survivor, resource, 1);
  markDailyProvisionConsumed(game, survivor, resource, 1);
  const consumed = consumedDailyProvisionPortions(game, survivor, resource);
  const required = requiredDailyProvision(survivor, resource);
  addLog(game, "provisões", `${survivor.name} consumiu 1 porção pessoal de ${resourceLabel(resource)} no dia ${game.day} (${consumed}/${required} da necessidade diária).`, survivor.id);
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
export function consumeBestProvision(holder: ProvisionHolder, resource: DailyResource): ProvisionConsumption {
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

/** NPCs use shared reserves only when physically at the active base, or with the mobile group. */
export function sharedReserveNpcs(game: GameState): NPC[] {
  return (game.npcs ?? []).filter(npc => npc.active && npc.status !== "Morto" && npc.status !== "Desaparecido"
    && npc.hex === (game.shelter.hex ?? game.partyHex));
}

/** Active NPCs outside the only shared reserve must be accounted for by their field group. */
export function fieldNpcs(game: GameState): NPC[] {
  const storageHex = game.shelter.hex ?? game.partyHex;
  return (game.npcs ?? []).filter(npc => npc.active && npc.status !== "Morto" && npc.status !== "Desaparecido" && npc.hex !== storageHex);
}

function recordLegacyNpcProvision(game: GameState, resource: DailyResource, portionsSupplied: number) {
  const storageHex = game.shelter.hex ?? game.partyHex;
  let remaining = Math.max(0, portionsSupplied - game.shelter.residents
    - survivorsAtHex(game, storageHex).reduce((sum, person) => sum + remainingDailyProvisionPortions(game, person, resource), 0));
  for (const npc of sharedReserveNpcs(game)) {
    const key = dayKey(resource);
    if (npc[key] === game.day) continue;
    if (remaining > 0) { npc[key] = game.day; remaining -= 1; }
    else addLog(game, "privação", `${npc.name} encerrou o dia sem registrar ${resource === "food" ? "alimentação" : "hidratação"}. Nenhuma consequência mecânica foi aplicada automaticamente.`);
  }
}

export function eveningNeeds(game: GameState) {
  const storageHex = game.shelter.hex ?? game.partyHex;
  const present = survivorsAtHex(game, storageHex);
  const npcs = sharedReserveNpcs(game);
  return {
    food: game.shelter.residents + present.reduce((sum, person) => sum + remainingDailyProvisionPortions(game, person, "food"), 0)
      + npcs.filter(npc => !npcConsumedToday(game, npc, "food")).length,
    water: game.shelter.residents + present.reduce((sum, person) => sum + remainingDailyProvisionPortions(game, person, "water"), 0)
      + npcs.filter(npc => !npcConsumedToday(game, npc, "water")).length,
  };
}

export function defaultDayClosePlan(game: GameState): DayClosePlan {
  const sharedRemaining: Record<DailyResource, number> = {
    food: Math.max(0, provisionBreakdown(game.shelter, "food").total - game.shelter.residents),
    water: Math.max(0, provisionBreakdown(game.shelter, "water").total - game.shelter.residents),
  };
  const storageHex = game.shelter.hex ?? game.partyHex;

  const personalRemaining = new Map(game.survivors.map(person => [person.id, {
    food: provisionBreakdown(person, "food").total,
    water: provisionBreakdown(person, "water").total,
  }]));
  function sourceFor(person: Survivor, resource: DailyResource): DayProvisionSource {
    const needed = remainingDailyProvisionPortions(game, person, resource);
    if (needed === 0) return "already";
    const stock = personalRemaining.get(person.id)!;
    const personal = stock[resource];
    if (survivorHex(game, person) === storageHex && sharedRemaining[resource] >= needed) {
      sharedRemaining[resource] -= needed;
      return "shared";
    }
    if (personal >= needed) { stock[resource] -= needed; return "personal"; }
    if (survivorHex(game, person) === storageHex && sharedRemaining[resource] > 0) {
      const shortfall = needed - sharedRemaining[resource];
      sharedRemaining[resource] = Math.max(0, sharedRemaining[resource] - needed);
      if (personal > 0) { stock[resource] -= Math.min(personal, shortfall); return "mixed"; }
      return "shared";
    }
    if (personal > 0) { stock[resource] = 0; return "personal"; }
    return "none";
  }

  const survivors = game.survivors.map(person => ({
    survivorId: person.id,
    food: sourceFor(person, "food"),
    water: sourceFor(person, "water"),
  }));
  function npcSource(npc: NPC, resource: DailyResource): { source: DayProvisionSource; carrierId?: string } {
    if (npcConsumedToday(game, npc, resource)) return { source: "already" };
    if (npc.hex === storageHex && sharedRemaining[resource] > 0) { sharedRemaining[resource] -= 1; return { source: "shared" }; }
    const carrier = game.survivors.find(person => survivorHex(game, person) === npc.hex
      && personalRemaining.get(person.id)![resource] > 0);
    if (!carrier) return { source: "none" };
    personalRemaining.get(carrier.id)![resource] -= 1;
    return { source: "personal", carrierId: carrier.id };
  }
  return {
    expectedDay: game.day,
    residentsFood: game.shelter.residents,
    residentsWater: game.shelter.residents,
    survivors,
    npcs: (game.npcs ?? []).filter(npc => npc.active && npc.status !== "Morto" && npc.status !== "Desaparecido").map(npc => {
      const food = npcSource(npc, "food"), water = npcSource(npc, "water");
      return { npcId: npc.id, food: food.source, water: water.source,
        foodCarrierId: food.carrierId, waterCarrierId: water.carrierId };
    }),
  };
}

function validResidentCount(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 999;
}
function planEntry(plan: DayClosePlan, survivorId: string) {
  return plan.survivors.find(entry => entry.survivorId === survivorId);
}
function npcPlanEntry(plan: DayClosePlan, npcId: string) { return plan.npcs?.find(entry => entry.npcId === npcId); }

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
  const personalRemaining = new Map(game.survivors.map(person => [person.id, {
    food: provisionBreakdown(person, "food").total,
    water: provisionBreakdown(person, "water").total,
  }]));
  function takePersonal(carrierId: string | undefined, hex: string, resource: DailyResource, quantity = 1) {
    const carrier = carrierId ? game.survivors.find(person => person.id === carrierId) : undefined;
    const remainingPersonal = carrier ? personalRemaining.get(carrier.id) : undefined;
    const needed = Math.max(0, Math.trunc(quantity));
    if (!carrier || survivorHex(game, carrier) !== hex || !remainingPersonal) return false;
    const taken = Math.min(remainingPersonal[resource], needed);
    remainingPersonal[resource] -= taken;
    return taken === needed;
  }
  const mixedSharedDemand: Record<DailyResource, number> = { food: 0, water: 0 };
  for (const person of game.survivors) {
    const entry = planEntry(plan, person.id);
    for (const resource of ["food", "water"] as const) {
      const needed = remainingDailyProvisionPortions(game, person, resource);
      if (needed === 0) continue;
      const source = entry?.[resource] ?? "none";
      if (source === "other") continue;
      if (source === "mixed") {
        if (survivorHex(game, person) !== storageHex) {
          deprivations.push({ survivorId: person.id, name: person.name, resource, reason: "remote" });
        } else {
          const taken = Math.min(remaining[resource], needed);
          remaining[resource] -= taken;
          mixedSharedDemand[resource] += taken;
          if (!takePersonal(person.id, storageHex, resource, needed - taken))
            deprivations.push({ survivorId: person.id, name: person.name, resource, reason: "unavailable" });
        }
        continue;
      }
      if (source === "personal") {
        if (!takePersonal(person.id, survivorHex(game, person), resource, needed))
          deprivations.push({ survivorId: person.id, name: person.name, resource, reason: "unavailable" });
        continue;
      }
      if (source === "shared") {
        if (survivorHex(game, person) !== storageHex) {
          deprivations.push({ survivorId: person.id, name: person.name, resource, reason: "remote" });
        } else {
          const taken = Math.min(remaining[resource], needed);
          remaining[resource] -= taken;
          if (taken < needed) deprivations.push({ survivorId: person.id, name: person.name, resource, reason: "unavailable" });
        }
        continue;
      }
      deprivations.push({ survivorId: person.id, name: person.name, resource, reason: "none" });
    }
  }
  for (const npc of (game.npcs ?? []).filter(npc => npc.active && npc.status !== "Morto" && npc.status !== "Desaparecido")) {
    const entry = npcPlanEntry(plan, npc.id);
    for (const resource of ["food", "water"] as const) {
      if (npcConsumedToday(game, npc, resource)) continue;
      const source = entry?.[resource] ?? "none";
      const carrierId = resource === "food" ? entry?.foodCarrierId : entry?.waterCarrierId;
      if (source === "other") continue;
      if (source === "personal") {
        if (!takePersonal(carrierId, npc.hex, resource)) deprivations.push({ npcId: npc.id, name: npc.name, resource, reason: "unavailable" });
        continue;
      }
      if (source === "shared") {
        if (npc.hex !== storageHex) deprivations.push({ npcId: npc.id, name: npc.name, resource, reason: "remote" });
        else if (remaining[resource] > 0) remaining[resource] -= 1;
        else deprivations.push({ npcId: npc.id, name: npc.name, resource, reason: "unavailable" });
        continue;
      }
      deprivations.push({ npcId: npc.id, name: npc.name, resource, reason: "none" });
    }
  }

  const sharedDemand = (resource: DailyResource) => plan.survivors.reduce((sum, entry) => {
    if (entry[resource] !== "shared") return sum;
    const person = game.survivors.find(candidate => candidate.id === entry.survivorId);
    return person && survivorHex(game, person) === storageHex
      ? sum + remainingDailyProvisionPortions(game, person, resource)
      : sum;
  }, 0);
  const npcSharedDemand = (resource: DailyResource) => (game.npcs ?? []).filter(npc => {
    const entry = npcPlanEntry(plan, npc.id);
    return npc.active && npc.status !== "Morto" && npc.status !== "Desaparecido" && npc.hex === storageHex
      && entry?.[resource] === "shared" && !npcConsumedToday(game, npc, resource);
  }).length;
  const demand: Record<DailyResource, number> = {
    food: residentDemand.food + sharedDemand("food") + mixedSharedDemand.food + npcSharedDemand("food"),
    water: residentDemand.water + sharedDemand("water") + mixedSharedDemand.water + npcSharedDemand("water"),
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

function advanceMorning(game: GameState, transition: "morning" | "midnight" = "morning") {
  settleScheduledWorkBeforeMorning(game);
  game.day += 1;
  game.minutes = transition === "morning" ? 480 : 0;
  expireEventClocks(game);
  resetParallelTime(game);
  if (transition === "morning") {
    game.noise = 0;
    game.scene = (game.scene ?? 1) + 1;
  }
  const morning = absoluteMinutes(game);
  const dayMoment = transition === "morning" ? "Ao amanhecer" : "Na passagem de dia";
  const lostAtLocations = expireLocationFood(game);
  if (lostAtLocations.length) addLog(game, "provisões", `${dayMoment}, estragou nos locais: ${lostAtLocations.join(", ")}.`);
  const lostAtBase = [...expirePortionLots(game.shelter, game.day),
    ...expirePhysicalFood(game, game.shelter.inventory ?? [], shelterColdStorageActive(game, game.shelter))];
  if (lostAtBase.length) addLog(game, "provisões", `${dayMoment}, estragou nas reservas: ${lostAtBase.join(", ")}.`);
  for (const site of game.formerShelters ?? []) {
    const spoiled = [...expirePortionLots(site, game.day),
      ...expirePhysicalFood(game, site.inventory ?? [], Boolean(site.coldStorage && shelterMetrics(site).energy > 0))];
    if (spoiled.length) addLog(game, "provisões", `Na antiga base do hex ${site.hex}, estragou ${spoiled.join(", ")}.`);
  }
  for (const person of game.survivors) {
    const spoiled = [...expirePortionLots(person, game.day), ...expirePhysicalFood(game, person.inventory)];
    if (spoiled.length) addLog(game, "provisões", `${person.name}: estragou ${spoiled.join(", ")}.`, person.id);
    const prior = person.infection;
    if (prior === "Exposto" && person.exposureDeadline !== null && person.exposureDeadline < morning) person.infection = "Infectado";
    else if (prior === "Infectado") person.infection = "Sintomático";
    else if (prior === "Sintomático") { person.infection = "Terminal"; person.terminalScenes = 3; }
    if (prior !== person.infection) addLog(game, "infecção", `${person.name}: ${prior} → ${person.infection} ${transition === "morning" ? "ao amanhecer" : "na passagem de dia"}.`);
  }
  addLog(game, "dia", transition === "morning" ? `Amanhecer do dia ${game.day}.` : `Meia-noite: início do dia ${game.day}, sem descanso. A cena e o Barulho continuam.`);
}

export function closeDayWithPlan(game: GameState, plan: DayClosePlan, transition: "morning" | "midnight" = "morning"): DayCloseResult {
  if (game.activities?.some(a => a.day === game.day && a.status === "running")) return { ok: false, ...inspectDayClosePlan(game, plan) };
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
      const needed = remainingDailyProvisionPortions(game, person, resource);
      if (needed === 0) continue;
      const source = entry?.[resource] ?? "none";

      if (source === "other") {
        markDailyProvisionConsumed(game, person, resource, needed);
        addLog(game, "provisões", `${person.name}: ${needed} porção(ões) de ${resourceLabel(resource)} registrada(s) por outra fonte/dispensa do mestre.`, person.id);
        continue;
      }

      if (source === "mixed") {
        if (survivorHex(game, person) !== storageHex) {
          actualDeprivations.push({ survivorId: person.id, name: person.name, resource, reason: "remote" });
          continue;
        }
        const shared = consumeMany(game.shelter, resource, needed);
        const personal = consumeMany(person, resource, needed - shared.consumed);
        const consumed = shared.consumed + personal.consumed;
        if (consumed) {
          markDailyProvisionConsumed(game, person, resource, consumed);
          addLog(game, "provisões", `${person.name} consumiu ${consumed}/${needed} porção(ões) de ${resourceLabel(resource)}: ${shared.consumed} das reservas e ${personal.consumed} pessoais.`, person.id);
        }
        if (consumed < needed) actualDeprivations.push({ survivorId: person.id, name: person.name, resource, reason: "unavailable" });
        continue;
      }

      if (source === "personal") {
        const result = consumeMany(person, resource, needed);
        if (result.consumed) markDailyProvisionConsumed(game, person, resource, result.consumed);
        if (result.consumed) addLog(game, "provisões", `${person.name} consumiu ${result.consumed}/${needed} porção(ões) pessoais de ${resourceLabel(resource)}${result.labels.length ? ` (${result.labels.join(", ")})` : ""}.`, person.id);
        if (result.consumed < needed) actualDeprivations.push({ survivorId: person.id, name: person.name, resource, reason: "unavailable" });
        continue;
      }

      if (source === "shared") {
        if (survivorHex(game, person) !== storageHex) {
          actualDeprivations.push({ survivorId: person.id, name: person.name, resource, reason: "remote" });
          continue;
        }
        const result = consumeMany(game.shelter, resource, needed);
        if (result.consumed) markDailyProvisionConsumed(game, person, resource, result.consumed);
        if (result.consumed) addLog(game, "provisões", `${person.name} consumiu ${result.consumed}/${needed} porção(ões) de ${resourceLabel(resource)} das reservas compartilhadas${result.labels.length ? ` (${result.labels.join(", ")})` : ""}.`, person.id);
        if (result.consumed < needed) actualDeprivations.push({ survivorId: person.id, name: person.name, resource, reason: "unavailable" });
        continue;
      }

      // "already" só é válido quando toda a necessidade atual já foi registrada.
      actualDeprivations.push({ survivorId: person.id, name: person.name, resource, reason: "none" });
    }
  }
  for (const npc of (game.npcs ?? []).filter(npc => npc.active && npc.status !== "Morto" && npc.status !== "Desaparecido")) {
    const entry = npcPlanEntry(plan, npc.id);
    for (const resource of ["food", "water"] as const) {
      const key = dayKey(resource);
      if (npc[key] === game.day) continue;
      const source = entry?.[resource] ?? "none";
      const carrierId = resource === "food" ? entry?.foodCarrierId : entry?.waterCarrierId;
      if (source === "other") {
        npc[key] = game.day;
        addLog(game, "provisões", `${npc.name}: ${resourceLabel(resource)} registrada por outra fonte/decisão do mestre.`);
        continue;
      }
      if (source === "personal") {
        const carrier = carrierId ? game.survivors.find(person => person.id === carrierId) : undefined;
        if (!carrier || survivorHex(game, carrier) !== npc.hex) {
          actualDeprivations.push({ npcId: npc.id, name: npc.name, resource, reason: "remote" });
          continue;
        }
        const result = consumeBestProvision(carrier, resource);
        if (result.consumed) {
          npc[key] = game.day;
          addLog(game, "provisões", `${npc.name} consumiu 1 porção de ${resourceLabel(resource)} portada por ${carrier.name}${result.label ? ` (${result.label})` : ""}.`, carrier.id);
        } else actualDeprivations.push({ npcId: npc.id, name: npc.name, resource, reason: "unavailable" });
        continue;
      }
      if (source === "shared") {
        if (npc.hex !== storageHex) {
          actualDeprivations.push({ npcId: npc.id, name: npc.name, resource, reason: "remote" });
          continue;
        }
        const result = consumeBestProvision(game.shelter, resource);
        if (result.consumed) {
          npc[key] = game.day;
          addLog(game, "provisões", `${npc.name} consumiu 1 porção de ${resourceLabel(resource)} das reservas compartilhadas${result.label ? ` (${result.label})` : ""}.`);
        } else actualDeprivations.push({ npcId: npc.id, name: npc.name, resource, reason: "unavailable" });
        continue;
      }
      if (source === "already" && npc[key] === game.day) continue;
      actualDeprivations.push({ npcId: npc.id, name: npc.name, resource, reason: "none" });
    }
  }

  for (const deprivation of actualDeprivations) {
    const person = game.survivors.find(p => p.id === deprivation.survivorId);
    const before = person?.stress ?? 0;
    if (person) person.stress = Math.min(6, person.stress + 1);
    const effect = person ? `+1 Estresse por privação (${before} → ${person.stress}/6).` : "PNJ sem trilha de Estresse; falta registrada para condução do mestre.";
    addLog(game, "privação", `${deprivation.name} encerrou o dia sem registrar ${deprivation.resource === "food" ? "alimentação" : "hidratação"}. ${effect}`, deprivation.survivorId);
  }
  const residentFoodMissing = Math.max(0, plan.residentsFood - residentFood.consumed);
  const residentWaterMissing = Math.max(0, plan.residentsWater - residentWater.consumed);
  if (residentFoodMissing || residentWaterMissing) {
    addLog(game, "privação", `Moradores do abrigo: faltaram ${residentFoodMissing} porção(ões) de Comida e ${residentWaterMissing} de Água. Nenhuma consequência mecânica foi aplicada automaticamente.`);
  }

  advanceMorning(game, transition);
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
  if (game.activities?.some(a => a.day === game.day && a.status === "running")) return false;
  if (game.day !== expectedDay || ![food, water].every(n => Number.isInteger(n) && n >= 0 && n <= 999)) return false;
  const foodResult = consumeMany(game.shelter, "food", food);
  const waterResult = consumeMany(game.shelter, "water", water);
  const foodMissing = Math.max(0, food - foodResult.consumed);
  const waterMissing = Math.max(0, water - waterResult.consumed);
  const itemUse = [...foodResult.labels, ...waterResult.labels].filter(label => label !== "porção solta");
  addLog(game, "provisões", `Anoitecer: ${foodResult.consumed} porção(ões) de Comida e ${waterResult.consumed} de Água foram consumidas das reservas compartilhadas. ` +
    (itemUse.length ? `Itens usados: ${itemUse.join(", ")}. ` : "") +
    (foodMissing ? `Faltaram ${foodMissing} de Comida. ` : "") + (waterMissing ? `Faltaram ${waterMissing} de Água.` : ""));
  recordLegacyNpcProvision(game, "food", foodResult.consumed);
  recordLegacyNpcProvision(game, "water", waterResult.consumed);
  advanceMorning(game);
  return true;
}
