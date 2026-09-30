import { absoluteMinutes, addLog, type GameState, type NPC } from "./game";
import { atSharedStorage, consumeReadyProvisionPortions } from "./inventory";
import { provisionBreakdown } from "./provision-items";
import { expirePhysicalFood, expirePortionLots, withdrawPortions } from "./provisions";

export function consumeDailyProvision(game: GameState, survivorId: string, resource: "food" | "water") {
  const survivor = game.survivors.find(s => s.id === survivorId);
  const dayKey = resource === "food" ? "foodConsumedDay" : "waterConsumedDay";
  if (!survivor || survivor[resource] < 1 || survivor[dayKey] === game.day) return false;
  withdrawPortions(survivor, resource, 1);
  survivor[dayKey] = game.day;
  addLog(game, "provisões", `${survivor.name} consumiu 1 porção pessoal de ${resource === "food" ? "Comida" : "Água"} no dia ${game.day}.`, survivor.id);
  return true;
}

export function eveningNeeds(game: GameState) {
  const present = atSharedStorage(game) ? game.survivors : [];
  const npcPresent = sharedReserveNpcs(game);
  return {
    food: game.shelter.residents + present.filter(s => s.foodConsumedDay !== game.day).length
      + npcPresent.filter(npc => npc.foodConsumedDay !== game.day).length,
    water: game.shelter.residents + present.filter(s => s.waterConsumedDay !== game.day).length
      + npcPresent.filter(npc => npc.waterConsumedDay !== game.day).length,
  };
}

/** NPCs use shared reserves only when physically at the active base, or with the mobile group. */
export function sharedReserveNpcs(game: GameState): NPC[] {
  return (game.npcs ?? []).filter(npc => npc.active && npc.status !== "Morto" && npc.status !== "Desaparecido"
    && (game.shelter.hex ? npc.hex === game.shelter.hex : npc.hex === game.partyHex));
}

function recordNpcProvision(game: GameState, resource: "food" | "water", portionsSupplied: number) {
  const dayKey = resource === "food" ? "foodConsumedDay" : "waterConsumedDay";
  // Legacy residents and PCs retain their established priority. NPCs are still
  // individually recorded, so a shortage is visible without adding a penalty.
  let remaining = Math.max(0, portionsSupplied - game.shelter.residents);
  if (atSharedStorage(game)) remaining -= game.survivors.filter(person => person[dayKey] !== game.day).length;
  const deprived: string[] = [];
  for (const npc of sharedReserveNpcs(game)) {
    if (npc[dayKey] === game.day) continue;
    if (remaining > 0) { npc[dayKey] = game.day; remaining -= 1; }
    else deprived.push(npc.name);
  }
  if (deprived.length) addLog(game, "provisões", `${deprived.join(", ")}: privação de ${resource === "food" ? "Comida" : "Água"} registrada no dia ${game.day}.`);
}

export function closeDay(game: GameState, food: number, water: number, expectedDay = game.day) {
  if (game.day !== expectedDay || ![food, water].every(n => Number.isInteger(n) && n >= 0 && n <= 999)) return false;
  const foodAvailable = provisionBreakdown(game.shelter, "food").total;
  const waterAvailable = provisionBreakdown(game.shelter, "water").total;
  const foodMissing = Math.max(0, food - foodAvailable);
  const waterMissing = Math.max(0, water - waterAvailable);

  const looseFood = Math.min(food, game.shelter.food);
  const looseWater = Math.min(water, game.shelter.water);
  withdrawPortions(game.shelter, "food", looseFood);
  withdrawPortions(game.shelter, "water", looseWater);
  const foodFromItems = consumeReadyProvisionPortions(game.shelter.inventory, "food", Math.max(0, food - looseFood));
  const waterFromItems = consumeReadyProvisionPortions(game.shelter.inventory, "water", Math.max(0, water - looseWater));

  const itemUse = [...foodFromItems.labels, ...waterFromItems.labels];
  addLog(game, "provisões", `Anoitecer: ${food - foodMissing} porção(ões) de Comida e ${water - waterMissing} de Água foram consumidas das reservas compartilhadas. ` +
    (itemUse.length ? `Itens usados: ${itemUse.join(", ")}. ` : "") +
    (foodMissing ? `Faltaram ${foodMissing} de Comida. ` : "") + (waterMissing ? `Faltaram ${waterMissing} de Água.` : ""));
  recordNpcProvision(game, "food", food - foodMissing);
  recordNpcProvision(game, "water", water - waterMissing);
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
  return true;
}
