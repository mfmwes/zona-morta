import {
  addLog,
  content,
  establishShelter,
  hexDistance,
  hexKey,
  survivorHex,
  survivorPositionGroups,
  survivorsAtHex,
  type GameState,
} from "./game";
import { revealSector } from "./sectors";

export type HexQuickAction =
  | { type: "observe" }
  | { type: "travel" }
  | { type: "establish" }
  | { type: "infestation"; value: number | null };


export function movementSources(game: GameState, destination: string) {
  const target = content.hexes.find(hex => hexKey(hex.q, hex.r) === destination);
  if (!target) return [];
  return survivorPositionGroups(game).filter(group => {
    if (group.hex === destination || group.members.length === 0) return false;
    const source = content.hexes.find(hex => hexKey(hex.q, hex.r) === group.hex);
    return Boolean(source && hexDistance(target.q - source!.q, target.r - source!.r) === 1);
  });
}

function revealAround(game: GameState, id: string) {
  const area = content.hexes.find(hex => hexKey(hex.q, hex.r) === id);
  if (!area) return;
  const destination = revealSector(game, id);
  game.hexes[id].discovery = "explorado";
  for (const neighbor of content.hexes) {
    if (hexDistance(neighbor.q - area.q, neighbor.r - area.r) !== 1) continue;
    const key = hexKey(neighbor.q, neighbor.r);
    if (game.hexes[key].discovery === "desconhecido") {
      revealSector(game, key);
      game.hexes[key].discovery = "avistado";
    }
  }
  return destination;
}

export function moveSurvivors(game: GameState, destination: string, survivorIds: string[]) {
  const record = game.hexes[destination];
  if (!record || record.discovery === "desconhecido") return { ok: false, message: "" };
  const ids = [...new Set(survivorIds)];
  if (!ids.length) return { ok: false, message: "" };
  const members = ids.map(id => game.survivors.find(person => person.id === id));
  if (members.some(member => !member)) return { ok: false, message: "" };
  const people = members.filter(Boolean) as NonNullable<(typeof members)[number]>[];
  const sourceHex = survivorHex(game, people[0]);
  if (!people.every(person => survivorHex(game, person) === sourceHex)) return { ok: false, message: "" };

  const source = content.hexes.find(hex => hexKey(hex.q, hex.r) === sourceHex);
  const target = content.hexes.find(hex => hexKey(hex.q, hex.r) === destination);
  if (!source || !target || hexDistance(target.q - source.q, target.r - source.r) !== 1) return { ok: false, message: "" };

  const travelMinutes = record.routeHours * 60;
  if (game.minutes + travelMinutes >= 1440) return { ok: false, message: "" };

  const wholeSourceGroup = people.length === survivorsAtHex(game, sourceHex).length;
  game.minutes += travelMinutes;
  for (const person of people) person.hex = destination;
  for (const npc of game.npcs ?? []) {
    if (!npc.active || npc.status === "Morto" || npc.status === "Desaparecido" || npc.hex !== sourceHex) continue;
    const companions = npc.accompaniesSurvivorIds ?? [];
    // An NPC assigned to a subgroup moves only when that named group moves as a
    // whole. The GM can always relocate an NPC directly from the community panel.
    const followsCompanions = companions.length > 0 && companions.every(id => ids.includes(id));
    const followsMain = sourceHex === game.partyHex && npc.accompaniesParty && wholeSourceGroup;
    if (followsCompanions || followsMain) npc.hex = destination;
  }

  if (sourceHex === game.partyHex && survivorsAtHex(game, sourceHex).length === 0) game.partyHex = destination;
  if (game.survivors.length > 0 && game.survivors.every(person => survivorHex(game, person) === destination))
    game.partyHex = destination;

  const sector = revealAround(game, destination);
  const names = people.map(person => person.name);
  const subject = names.length === 1 ? names[0] : names.join(", ");
  const message = `${subject} ${names.length === 1 ? "entrou" : "entraram"} em ${sector?.name ?? `hex ${destination}`} após ${record.routeHours} h de trajeto.`;
  addLog(game, "travessia", message);
  return { ok: true, message, sourceHex, destination, survivorIds: ids };
}

export function hexActionOptions(game: GameState, id: string) {
  const area = content.hexes.find(hex => hexKey(hex.q, hex.r) === id);
  const record = game.hexes[id];
  if (!area || !record) return null;

  const [partyQ, partyR] = (game.partyHex || "0,0").split(",").map(Number);
  const nearby = hexDistance(area.q - partyQ, area.r - partyR) === 1;
  const sources = movementSources(game, id);
  const travelMinutes = record.routeHours * 60;
  const atParty = id === game.partyHex;
  const peopleHere = survivorsAtHex(game, id);
  const canObserve = (sources.length > 0 || (game.survivors.length === 0 && nearby)) && record.discovery === "desconhecido";
  const canTravel = nearby && record.discovery !== "desconhecido" && game.minutes + travelMinutes < 1440;
  const canMoveSurvivors = sources.length > 0 && record.discovery !== "desconhecido" && game.minutes + travelMinutes < 1440;
  const canEstablish = (peopleHere.length > 0 || (game.survivors.length === 0 && atParty))
    && record.discovery === "explorado" && !game.shelter.hex;
  const canRelocate = (peopleHere.length > 0 || (game.survivors.length === 0 && atParty))
    && record.discovery === "explorado" && Boolean(game.shelter.hex) && game.shelter.hex !== id;

  return {
    area,
    record,
    nearby,
    sources,
    peopleHere,
    travelMinutes,
    atParty,
    canObserve,
    canTravel,
    canMoveSurvivors,
    canEstablish,
    canRelocate,
  };
}

export function performHexAction(game: GameState, id: string, action: HexQuickAction) {
  const options = hexActionOptions(game, id);
  if (!options) return { ok: false, message: "" };
  const { record } = options;

  if (action.type === "observe") {
    if (!options.canObserve) return { ok: false, message: "" };
    const sector = revealSector(game, id);
    game.hexes[id].discovery = "avistado";
    const message = `Do limite do hex, sobreviventes próximos avistaram ${sector.name}.`;
    addLog(game, "avistamento", message);
    return { ok: true, message };
  }

  if (action.type === "travel") {
    if (!options.canTravel) return { ok: false, message: "" };
    const mainGroup = survivorsAtHex(game, game.partyHex);
    if (mainGroup.length > 0) return moveSurvivors(game, id, mainGroup.map(person => person.id));

    // Compatibilidade com campanhas sem sobreviventes criados.
    game.minutes += options.travelMinutes;
    game.partyHex = id;
    for (const npc of game.npcs ?? []) {
      if (npc.active && npc.accompaniesParty && npc.status !== "Morto" && npc.status !== "Desaparecido") npc.hex = id;
    }
    const destination = revealAround(game, id);
    const message = `O grupo entrou em ${destination?.name ?? `hex ${id}`} após ${record.routeHours} h de trajeto.`;
    addLog(game, "travessia", message);
    return { ok: true, message };
  }

  if (action.type === "establish") {
    if (!options.canEstablish || !establishShelter(game, id)) return { ok: false, message: "" };
    return { ok: true, message: `Abrigo estabelecido em ${game.hexes[id].sector?.name ?? `hex ${id}`}.` };
  }

  if (action.type === "infestation") {
    if (action.value !== null && (!Number.isInteger(action.value) || action.value < 0 || action.value > 5))
      return { ok: false, message: "" };
    game.hexes[id].infestation = action.value;
    const message = action.value === null
      ? `Infestação do hex ${id} voltou a ficar em aberto.`
      : `Infestação do hex ${id} definida como ${action.value}/5.`;
    addLog(game, "mapa", message);
    return { ok: true, message };
  }

  return { ok: false, message: "" };
}
