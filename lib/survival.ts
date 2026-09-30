import { absoluteMinutes, addLog, survivorsAtHex, type GameState } from "./game";
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
  const storageHex = game.shelter.hex ?? game.partyHex;
  const present = atSharedStorage(game) ? survivorsAtHex(game, storageHex) : [];
  return {
    food: game.shelter.residents + present.filter(s => s.foodConsumedDay !== game.day).length,
    water: game.shelter.residents + present.filter(s => s.waterConsumedDay !== game.day).length,
  };
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
