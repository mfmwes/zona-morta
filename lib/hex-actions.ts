import {
  addLog,
  establishShelter,
  hexDistance,
  hexKey,
  survivorHex,
  survivorPositionGroups,
  survivorsAtHex,
  type GameState,
} from "./game";
import { revealSector } from "./sectors";
import { adjacentHexes, parseHex } from "./world";
import { advanceCampaignTime, advanceParticipantTime, completeSingleGroupActivity } from "./time";
import { shelterTravelMinutes } from "./shelter-projects";
import { parallelTimeLabel, participantTimePreview, survivorTimedCommitment } from "./activity";
import { eventMovementIssue } from "./event-conditions";
import { registerActivityHandler } from "./activity-handlers";
import { scheduleActivity } from "./activity-timeline";
import { eventTriggerReady } from "./hex-generators";
import { prepareHex } from "./hex-automation";

export type HexQuickAction =
  | { type: "observe" }
  | { type: "travel" }
  | { type: "establish" }
  | { type: "infestation"; value: number | null };


function travelDurationLabel(minutes: number) {
  const value = Math.max(1, Math.trunc(minutes));
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (!hours) return `${rest} min`;
  if (!rest) return `${hours} h`;
  return `${hours}h${String(rest).padStart(2, "0")}`;
}

export function movementSources(game: GameState, destination: string) {
  const target = parseHex(destination);
  if (!target || !game.hexes[destination]) return [];
  return survivorPositionGroups(game).filter(group => {
    if (group.hex === destination || group.members.length === 0) return false;
    const source = game.hexes[group.hex] ? parseHex(group.hex) : null;
    return Boolean(source && hexDistance(target.q - source!.q, target.r - source!.r) === 1);
  });
}

function revealAround(game: GameState, id: string) {
  const area = parseHex(id);
  if (!area) return;
  const destination = revealSector(game, id);
  game.hexes[id].discovery = "explorado";
  if (game.explorationPreferences?.autoPrepare) prepareHex(game, id);
  for (const neighbor of adjacentHexes(id)) {
    const key = hexKey(neighbor.q, neighbor.r);
    if (game.hexes[key]?.discovery === "desconhecido") {
      revealSector(game, key);
      game.hexes[key].discovery = "avistado";
    }
  }
  return destination;
}

export function moveSurvivors(game: GameState, destination: string, survivorIds: string[], options: { advanceTime?: boolean; durationMinutes?: number } = {}) {
  const conditionIssue=eventMovementIssue(game,survivorIds);
  if(conditionIssue)return {ok:false,message:conditionIssue};
  const record = game.hexes[destination];
  if (!record || record.discovery === "desconhecido") return { ok: false, message: "" };
  const ids = [...new Set(survivorIds)];
  if (!ids.length) return { ok: false, message: "" };
  const members = ids.map(id => game.survivors.find(person => person.id === id));
  if (members.some(member => !member)) return { ok: false, message: "" };
  const people = members.filter(Boolean) as NonNullable<(typeof members)[number]>[];
  const busy = people.map(person => ({ person, commitment: survivorTimedCommitment(game, person.id) })).find(entry => entry.commitment);
  if (busy?.commitment) return { ok: false, message: `${busy.person.name} está ocupado: trabalhando em ${busy.commitment.projectName} até ${busy.commitment.until}.` };
  const sourceHex = survivorHex(game, people[0]);
  if (!people.every(person => survivorHex(game, person) === sourceHex)) return { ok: false, message: "" };

  const source = game.hexes[sourceHex] ? parseHex(sourceHex) : null;
  const target = parseHex(destination);
  if (!source || !target || hexDistance(target.q - source.q, target.r - source.r) !== 1) return { ok: false, message: "" };

  const travelMinutes = options.durationMinutes ?? shelterTravelMinutes(game, sourceHex, destination, record.routeHours * 60);
  const timePreview = participantTimePreview(game, ids, travelMinutes);
  if (options.advanceTime !== false && !timePreview.ok) return { ok: false, message: "O trajeto não cabe no tempo restante deste dia para este grupo." };

  const wholeSourceGroup = people.length === survivorsAtHex(game, sourceHex).length;
  const timeResult = options.advanceTime === false ? { ok: true, overlapMinutes: 0 } : advanceParticipantTime(game, ids, travelMinutes);
  if (!timeResult.ok) return { ok: false, message: "" };
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
  const timing = timeResult.overlapMinutes ? ` · ${parallelTimeLabel(timeResult as ReturnType<typeof advanceParticipantTime>)}` : "";
  const message = `${subject} ${names.length === 1 ? "entrou" : "entraram"} em ${sector?.name ?? `hex ${destination}`} após ${travelDurationLabel(travelMinutes)} de trajeto${timing}.`;
  addLog(game, "travessia", message, ids[0], ids);
  return { ok: true, message, sourceHex, destination, survivorIds: ids };
}

export function hexActionOptions(game: GameState, id: string) {
  const area = parseHex(id);
  const record = game.hexes[id];
  if (!area || !record) return null;

  const [partyQ, partyR] = (game.partyHex || "0,0").split(",").map(Number);
  const nearby = hexDistance(area.q - partyQ, area.r - partyR) === 1;
  const sources = movementSources(game, id);
  const travelMinutes = shelterTravelMinutes(game, game.partyHex, id, record.routeHours * 60);
  const atParty = id === game.partyHex;
  const peopleHere = survivorsAtHex(game, id);
  const mainGroup = survivorsAtHex(game, game.partyHex);
  const canObserve = (sources.length > 0 || (game.survivors.length === 0 && nearby)) && record.discovery === "desconhecido";
  const canTravel = nearby && record.discovery !== "desconhecido"
    && (mainGroup.length === 0 ? game.minutes + travelMinutes < 1440
      : participantTimePreview(game, mainGroup.map(person => person.id), travelMinutes).ok);
  const canMoveSurvivors = sources.some(group =>
    participantTimePreview(game, group.members.map(person => person.id),
      shelterTravelMinutes(game, group.hex, id, record.routeHours * 60)).ok)
    && record.discovery !== "desconhecido";
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
    if (mainGroup.length > 0) return scheduleSurvivorTravel(game, id, mainGroup.map(person => person.id));

    // Compatibilidade com campanhas sem sobreviventes criados.
    if (!advanceCampaignTime(game, options.travelMinutes).ok) return { ok: false, message: "" };
    game.partyHex = id;
    for (const npc of game.npcs ?? []) {
      if (npc.active && npc.accompaniesParty && npc.status !== "Morto" && npc.status !== "Desaparecido") npc.hex = id;
    }
    const destination = revealAround(game, id);
    const message = `O grupo entrou em ${destination?.name ?? `hex ${id}`} após ${travelDurationLabel(options.travelMinutes)} de trajeto.`;
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

/** Agenda para equipes separadas; uma única equipe viaja com avanço direto. */
export function scheduleSurvivorTravel(game: GameState, destination: string, ids: string[], operationId?: string) {
  const conditionIssue=eventMovementIssue(game,ids);
  if(conditionIssue)return {ok:false,message:conditionIssue};
  const destinationHex = game.hexes[destination];
  const sources = movementSources(game, destination);
  const source = sources.find(group => ids.length > 0 && ids.every(id => group.members.some(p => p.id === id)));
  if (!destinationHex || destinationHex.discovery === "desconhecido" || !source)
    return { ok: false, message: "Escolha sobreviventes no mesmo hex adjacente e um destino revelado." };
  const minutes = shelterTravelMinutes(game, source.hex, destination, destinationHex.routeHours * 60);
  const result = scheduleActivity(game, { type: "travel", destination }, ids, minutes,
    `Viagem para ${destinationHex.sector?.name ?? `Hex ${destination}`}`, { operationId });
  if (!result.ok) return result;
  const completed = completeSingleGroupActivity(game, result.activity.id);
  return { ok: true, completed, message: completed ? `Viagem concluída · chegada às ${String(Math.floor(game.minutes / 60)).padStart(2, "0")}:${String(game.minutes % 60).padStart(2, "0")}.` : `Viagem iniciada · chegada às ${String(Math.floor(result.activity.endMinute / 60)).padStart(2, "0")}:${String(result.activity.endMinute % 60).padStart(2, "0")}.`, destination, sourceHex: source.hex, survivorIds: ids };
}

registerActivityHandler("travel", (game, activity) => {
  if (activity.type !== "travel") return { ok: false, message: "Viagem inválida." };
  const readyBefore = new Set(Object.entries(game.hexes).flatMap(([hexId, hex]) => hex.events.filter(e=>eventTriggerReady(game,hexId,e)).map(e=>e.id)));
  const moved = moveSurvivors(game, activity.destination, activity.participantIds,
    { advanceTime: false, durationMinutes: activity.endMinute - activity.startMinute });
  if (!moved.ok) return { ok: false, message: moved.message || "O destino ou os participantes da viagem mudaram." };
  const triggered = Object.entries(game.hexes).some(([hexId,hex])=>hex.events.some(e=>eventTriggerReady(game,hexId,e)&&!readyBefore.has(e.id)));
  if (triggered && game.playerActions) {
    game.playerActions.policy.paused = true;
    const op = game.playerActions.operations.find(o=>o.id===activity.operationId);
    if (op) op.attention = "Um acontecimento ficou pronto na chegada: o mestre resolve a consequência.";
  }
  return { ok: true, message: moved.message };
});
