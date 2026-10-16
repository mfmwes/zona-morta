import { survivorHex, type GameState } from "./game";
import { adjacentHexes, worldConnection } from "./world";
import { shelterTravelMinutes } from "./shelter-projects";
import { dailyExtraWater, groupTravelMultiplier } from "./survivor-conditions";
import { provisionBreakdown } from "./provision-items";

export type JourneyMode = "roads" | "any";
export type JourneyStage = { day: number; from: string; to: string; minutes: number; hexes: string[] };
export type JourneyPlan = {
  path: string[]; minutes: number; distanceKm: number; stages: JourneyStage[];
  people: number; companions: number; days: number; food: number; water: number;
  carriedFood: number; carriedWater: number; walkedToday: number; error: string | null;
};

/** Read-only itinerary: only known areas; a blocked edge is never traversable. */
export function planJourney(game: GameState, input: {
  from: string; to: string; survivorIds: string[]; mode: JourneyMode; dailyHours: number; reserveDays: number;
}): JourneyPlan {
  const members = game.survivors.filter(person => input.survivorIds.includes(person.id) && survivorHex(game, person) === input.from);
  const ids = members.map(person => person.id);
  const walkedToday = Math.max(0, ...ids.map(id => (game.activities ?? []).filter(activity => activity.type === "travel"
    && activity.day === game.day && activity.status === "completed" && activity.participantIds.includes(id))
    .reduce((sum, activity) => sum + activity.endMinute - activity.startMinute, 0)));
  const wholeGroup = members.length === game.survivors.filter(person => survivorHex(game, person) === input.from).length;
  const companions = (game.npcs ?? []).filter(npc => npc.active && npc.hex === input.from && !["Morto", "Desaparecido"].includes(npc.status)
    && ((npc.accompaniesSurvivorIds?.length && npc.accompaniesSurvivorIds.every(id => ids.includes(id)))
      || (!npc.accompaniesSurvivorIds?.length && npc.accompaniesParty && input.from === game.partyHex && wholeGroup)));
  const carried = (resource: "food" | "water") => members.reduce((sum, person) => {
    const inventory = person.inventory.filter(item => item.expiresDay === undefined || item.expiresDay > game.day);
    const expired = (person.provisionLots ?? []).filter(lot => lot.resource === resource && lot.expiresDay !== null && lot.expiresDay <= game.day).reduce((total, lot) => total + lot.qty, 0);
    return sum + provisionBreakdown({ ...person, [resource]: Math.max(0, person[resource] - expired), inventory }, resource).total;
  }, 0);
  const result: JourneyPlan = { path: [], minutes: 0, distanceKm: 0, stages: [], people: members.length + companions.length,
    companions: companions.length, days: 0, food: 0, water: 0, carriedFood: carried("food"), carriedWater: carried("water"), walkedToday, error: null };
  if (!members.length) return { ...result, error: "Escolha um grupo de sobreviventes para planejar a viagem." };
  if (!game.hexes[input.from] || !game.hexes[input.to] || game.hexes[input.to].discovery === "desconhecido")
    return { ...result, error: "Escolha um destino avistado ou explorado." };
  if (input.from === input.to) return { ...result, error: "Escolha um destino diferente da posição do grupo." };
  const multiplier = groupTravelMultiplier(game, ids);
  const duration = (from: string, to: string) => Math.ceil(shelterTravelMinutes(game, from, to, game.hexes[to].routeHours * 60) * multiplier);
  const costs = new Map([[input.from, 0]]), previous = new Map<string, string>(), pending = new Set([input.from]);
  while (pending.size) {
    let current = "", lowest = Infinity;
    for (const id of pending) if (costs.get(id)! < lowest) { current = id; lowest = costs.get(id)!; }
    pending.delete(current);
    if (current === input.to) break;
    for (const neighbor of adjacentHexes(current)) {
      const target = game.hexes[neighbor.id];
      if (!target || target.discovery === "desconhecido") continue;
      const link = worldConnection(game.hexes, current, neighbor.id);
      if (link?.blocked || (input.mode === "roads" && !link)) continue;
      const next = lowest + duration(current, neighbor.id);
      if (next >= (costs.get(neighbor.id) ?? Infinity)) continue;
      costs.set(neighbor.id, next); previous.set(neighbor.id, current); pending.add(neighbor.id);
    }
  }
  if (!costs.has(input.to)) return { ...result, error: input.mode === "roads"
    ? "Não há uma sequência de vias conhecidas e abertas até este destino. Conecte os trechos, resolva bloqueios ou permita caminhar fora das vias."
    : "Não há caminho conhecido e aberto até este destino." };
  const path = [input.to];
  while (path[0] !== input.from) path.unshift(previous.get(path[0])!);
  const dailyMinutes = Math.max(4, Math.min(12, Math.trunc(input.dailyHours) || 8)) * 60;
  const reserveDays = Math.max(0, Math.min(10, Math.trunc(input.reserveDays) || 0));
  let day = game.day, capacity = Math.min(Math.max(0, dailyMinutes - walkedToday), Math.max(0, 1439 - game.minutes));
  let stage: JourneyStage = { day, from: input.from, to: input.from, minutes: 0, hexes: [input.from] };
  for (let i = 1; i < path.length; i++) {
    const minutes = duration(path[i - 1], path[i]);
    if (stage.minutes + minutes > capacity) {
      if (stage.minutes) result.stages.push(stage);
      day++; capacity = dailyMinutes;
      stage = { day, from: path[i - 1], to: path[i - 1], minutes: 0, hexes: [path[i - 1]] };
    }
    stage.minutes += minutes; stage.to = path[i]; stage.hexes.push(path[i]);
  }
  if (stage.minutes) result.stages.push(stage);
  const days = result.stages.length + reserveDays;
  return { ...result, path, minutes: costs.get(input.to)!, distanceKm: (path.length - 1) * 2, days,
    food: days * result.people,
    water: days * (members.reduce((sum, person) => sum + 1 + dailyExtraWater(person), 0) + companions.length) };
}
