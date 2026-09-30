import {
  addLog,
  content,
  establishShelter,
  hexDistance,
  hexKey,
  type GameState,
} from "./game";
import { revealSector } from "./sectors";

export type HexQuickAction =
  | { type: "observe" }
  | { type: "travel" }
  | { type: "establish" }
  | { type: "infestation"; value: number | null };

export function hexActionOptions(game: GameState, id: string) {
  const area = content.hexes.find(hex => hexKey(hex.q, hex.r) === id);
  const record = game.hexes[id];
  if (!area || !record) return null;

  const [partyQ, partyR] = (game.partyHex || "0,0").split(",").map(Number);
  const nearby = hexDistance(area.q - partyQ, area.r - partyR) === 1;
  const travelMinutes = record.routeHours * 60;
  const atParty = id === game.partyHex;
  const canObserve = nearby && record.discovery === "desconhecido";
  const canTravel = nearby && record.discovery !== "desconhecido" && game.minutes + travelMinutes < 1440;
  const canEstablish = atParty && record.discovery === "explorado" && !game.shelter.hex;
  const canRelocate = atParty && record.discovery === "explorado"
    && Boolean(game.shelter.hex) && game.shelter.hex !== id;

  return {
    area,
    record,
    nearby,
    travelMinutes,
    atParty,
    canObserve,
    canTravel,
    canEstablish,
    canRelocate,
  };
}

export function performHexAction(game: GameState, id: string, action: HexQuickAction) {
  const options = hexActionOptions(game, id);
  if (!options) return { ok: false, message: "" };
  const { area, record } = options;

  if (action.type === "observe") {
    if (!options.canObserve) return { ok: false, message: "" };
    const sector = revealSector(game, id);
    game.hexes[id].discovery = "avistado";
    const message = `Do limite do hex, o grupo avistou ${sector.name}.`;
    addLog(game, "avistamento", message);
    return { ok: true, message };
  }

  if (action.type === "travel") {
    if (!options.canTravel) return { ok: false, message: "" };
    game.minutes += options.travelMinutes;
    game.partyHex = id;
    for (const npc of game.npcs ?? []) {
      if (npc.active && npc.accompaniesParty && npc.status !== "Morto" && npc.status !== "Desaparecido") npc.hex = id;
    }
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
    const message = `O grupo entrou em ${destination.name} após ${record.routeHours} h de trajeto.`;
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
