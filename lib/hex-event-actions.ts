import { addLog, content, displayTime, survivorsAtHex, type GameState, type HexEvent, type HexEventActionKind, type HexEventOrigin, type NPC, type Point } from "./game";
import { addThreatInstances, createConflictScene } from "./conflict";
import { eventStatus, splitGeneratorText } from "./hex-generators";
import { createId } from "./id";
import { normalizeNpcCapabilities } from "./npc-presentation";
import { threatLibrary } from "./threats";

export type HexEventAction =
  | { type: "point"; existingId?: string; name: string; kind: Point["kind"]; signal: string; access: string; notes: string; revealed: boolean; lootTable: string; condition: string; risk: string }
  | { type: "npc"; existingId?: string; name: string; role: string; description: string; notes: string; publicNotes: string; skills: string[]; status: NPC["status"]; infection: NPC["infection"]; disposition: NPC["disposition"]; visibleToPlayers: boolean }
  | { type: "clue"; existingId?: string; name: string; text: string; targetHex: string; notes: string; revealed: boolean }
  | { type: "threat"; templateId: string; quantity: number; notes: string; conflictId: string | null; sceneName: string };

export const hexEventActionLabels: Record<HexEventActionKind, string> = {
  point: "Criar local", npc: "Criar PNJ", threat: "Adicionar ameaça", clue: "Criar pista",
};

function sameOrigin(origin: HexEventOrigin | undefined, hexId: string, eventId: string, action: HexEventActionKind) {
  return origin?.hexId === hexId && origin.eventId === eventId && origin.action === action;
}

/** O registro sobrevive à exclusão do resultado; a origem protege vínculos incompletos. */
export function eventActionUsed(game: GameState, hexId: string, event: HexEvent, type: HexEventActionKind) {
  const links = event.actionLinks;
  if (type === "point" && links?.pointId || type === "npc" && links?.npcId
    || type === "clue" && links?.cluePointId || type === "threat" && links?.threat) return true;
  const originMatches = (row: { eventOrigin?: HexEventOrigin }) => sameOrigin(row.eventOrigin, hexId, event.id, type);
  if (type === "npc") return (game.npcs ?? []).some(originMatches);
  if (type === "threat") return (game.conflict?.threats ?? []).some(originMatches);
  return Object.values(game.hexes).some(hex => hex.points.some(originMatches));
}

/** Apenas prepara dados de formulário. Nunca altera o estado do mundo. */
export function prepareEventAction(game: GameState, hexId: string, event: HexEvent, type: HexEventActionKind): HexEventAction {
  const split = splitGeneratorText(event.text);
  const text = split.publicText;
  const notes = [event.guidance, split.gmGuidance].filter(Boolean).join("\n");
  const title = text.split(/[.!?\n]/)[0].trim().slice(0, 100);
  switch (type) {
    case "point": return { type, name: title, kind: "local", signal: text, access: "", notes, revealed: false, lootTable: "", condition: "", risk: "" };
    case "npc": return { type, name: "", role: "", description: text, notes, publicNotes: "", skills: [], status: "Bem", infection: "Saudável", disposition: "Neutro", visibleToPlayers: false };
    case "clue": return { type, name: `Pista: ${title}`.slice(0, 120), text, targetHex: "", notes, revealed: false };
    case "threat": return { type, templateId: "", quantity: 1, notes, conflictId: game.conflict?.active ? game.conflict.id : null,
      sceneName: `Evento · ${game.hexes[hexId]?.sector?.name ?? `Hex ${hexId}`}`.slice(0, 100) };
  }
}

function normalizedName(name: string) {
  return name.trim().replace(/\s+/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export function eventActionError(game: GameState, hexId: string, eventId: string, action: HexEventAction): string | null {
  const hex = game.hexes[hexId];
  const event = hex?.events.find(row => row.id === eventId);
  if (!event) return "O evento não existe mais neste hex.";
  if (!["active", "pending"].includes(eventStatus(event))) return "Reabra o evento antes de preparar uma ação.";
  if (eventActionUsed(game, hexId, event, action.type)) return "Esta ação já foi registrada para o evento. Consulte o vínculo existente.";
  if (action.type === "threat") {
    if (!threatLibrary(game.threats).some(row => row.id === action.templateId)) return "Escolha uma ficha de ameaça disponível.";
    if (!Number.isInteger(action.quantity) || action.quantity < 1 || action.quantity > 20) return "Escolha entre 1 e 20 ameaças.";
    if (action.conflictId === null) {
      if (game.conflict?.active) return "Um conflito foi iniciado enquanto você preparava a ação. Abra a ação novamente.";
      if (!action.sceneName.trim()) return "Informe o nome do novo conflito.";
    } else if (!game.conflict?.active || game.conflict.id !== action.conflictId) {
      return "O conflito mudou ou foi encerrado. Abra a ação novamente.";
    }
    if ((action.conflictId ? game.conflict?.threats.length ?? 0 : 0) + action.quantity > 80) return "O conflito comporta até 80 ameaças.";
    return null;
  }
  if (action.existingId) {
    if (action.type === "npc") return game.npcs?.some(row => row.id === action.existingId && row.hex === hexId) ? null : "O PNJ escolhido não está mais neste hex.";
    const point = hex.points.find(row => row.id === action.existingId);
    if (!point || (action.type === "clue" && !point.clueTargetHex)) return "O ponto escolhido não está mais disponível.";
    return null;
  }
  if (!action.name.trim()) return action.type === "npc" ? "Informe o nome do PNJ." : "Informe o nome do ponto ou pista.";
  if (action.type === "npc") {
    if ((game.npcs?.length ?? 0) >= 300) return "A campanha comporta até 300 PNJs.";
    const name = normalizedName(action.name.trim().slice(0, 80));
    if (game.npcs?.some(row => row.hex === hexId && normalizedName(row.name) === name)) return "Já existe um PNJ com esse nome neste hex. Vincule o cadastro existente.";
  } else {
    if (hex.points.length >= 120) return "Este hex comporta até 120 pontos.";
    const name = normalizedName(action.name.trim().slice(0, 120));
    if (hex.points.some(row => normalizedName(row.name) === name)) return "Já existe um ponto com esse nome neste hex. Vincule o ponto existente ou escolha outro nome.";
    if (action.type === "clue") {
      if (!game.hexes[action.targetHex] || action.targetHex === hexId) return "Escolha outro hex existente como destino da pista.";
      if (!action.text.trim()) return "Informe o texto público da pista.";
    } else if (action.lootTable && !content.lootTables.some(table => table.name === action.lootTable)) return "Escolha uma tabela de busca disponível.";
  }
  return null;
}

export type EventActionResult = { ok: false; message: string } | { ok: true; message: string; ids: string[] };

/** Chamada somente pelo mestre após confirmar o formulário; valida antes de qualquer mutação. */
export function applyEventAction(game: GameState, hexId: string, eventId: string, action: HexEventAction): EventActionResult {
  const error = eventActionError(game, hexId, eventId, action);
  if (error) return { ok: false, message: error };
  const hex = game.hexes[hexId];
  const event = hex.events.find(row => row.id === eventId)!;
  const origin: HexEventOrigin = { hexId, eventId, action: action.type };
  const links = { ...event.actionLinks };
  let ids: string[];
  let message: string;
  if (action.type === "threat") {
    const template = threatLibrary(game.threats).find(row => row.id === action.templateId)!;
    const scene = action.conflictId ? game.conflict! : createConflictScene({ name: action.sceneName,
      sceneNumber: game.scene ?? 1, day: game.day, time: displayTime(game.minutes),
      survivorIds: survivorsAtHex(game, hexId).map(person => person.id) });
    const added = addThreatInstances(scene, template, action.quantity);
    for (const threat of added) { threat.eventOrigin = origin; threat.notes = action.notes.trim().slice(0, 2000); }
    game.conflict = scene;
    ids = added.map(threat => threat.id);
    links.threat = { conflictId: scene.id, threatIds: ids };
    message = `${added.length} ameaça(s) adicionada(s) a ${scene.name}.`;
  } else if (action.type === "npc") {
    let npc = action.existingId ? game.npcs.find(row => row.id === action.existingId)! : undefined;
    if (!npc) {
      npc = { id: createId(), eventOrigin: origin, name: action.name.trim().slice(0, 80),
        role: action.role.trim().slice(0, 80), description: action.description.trim().slice(0, 1200),
        notes: action.notes.trim().slice(0, 4000), publicNotes: action.publicNotes.trim().slice(0, 2000),
        visibleToPlayers: action.visibleToPlayers, hex: hexId, status: action.status, infection: action.infection,
        disposition: action.disposition, skills: normalizeNpcCapabilities(action.skills),
        active: action.status !== "Morto" && action.status !== "Desaparecido", accompaniesParty: false, accompaniesSurvivorIds: [] };
      (game.npcs ??= []).push(npc);
    }
    links.npcId = npc.id;
    ids = [npc.id];
    message = `${npc.name} vinculado(a) ao evento no hex ${hexId}.`;
  } else {
    let point = action.existingId ? hex.points.find(row => row.id === action.existingId)! : undefined;
    if (!point) {
      point = { id: createId(), eventOrigin: origin, name: action.name.trim().slice(0, 120),
        kind: action.type === "point" ? action.kind : "local", signal: (action.type === "point" ? action.signal : action.text).trim().slice(0, 2000),
        access: action.type === "point" ? action.access.trim().slice(0, 1200) : "",
        notes: action.notes.trim().slice(0, 2400), revealed: action.revealed, searches: [],
        ...(action.type === "clue" ? { clueTargetHex: action.targetHex } : {
          condition: action.condition.trim().slice(0, 240), risk: action.risk.trim().slice(0, 240), lootTable: action.lootTable,
        }) };
      hex.points.push(point);
    }
    if (action.type === "clue") links.cluePointId = point.id;
    else links.pointId = point.id;
    ids = [point.id];
    message = `${point.name} vinculado ao evento no hex ${hexId}.`;
  }
  event.actionLinks = links;
  // Logs de evento são reservados ao mestre, inclusive quando o resultado é público.
  addLog(game, "evento", `${hexEventActionLabels[action.type]} · Hex ${hexId}: ${message}`);
  return { ok: true, ids, message };
}

/** Também informa vínculos cujo resultado foi removido ou pertence a uma cena encerrada. */
export function eventActionLinkLabels(game: GameState, hexId: string, event: HexEvent): string[] {
  const links = event.actionLinks;
  if (!links) return [];
  const points = game.hexes[hexId]?.points ?? [];
  const labels: string[] = [];
  if (links.pointId) labels.push(`Ponto: ${points.find(row => row.id === links.pointId)?.name ?? "registro removido"}`);
  if (links.npcId) labels.push(`PNJ: ${game.npcs?.find(row => row.id === links.npcId)?.name ?? "registro removido"}`);
  if (links.cluePointId) labels.push(`Pista: ${points.find(row => row.id === links.cluePointId)?.name ?? "registro removido"}`);
  if (links.threat) labels.push(`Ameaças: ${links.threat.threatIds.length} · ${game.conflict?.id === links.threat.conflictId ? game.conflict.name : "conflito anterior"}`);
  return labels;
}
