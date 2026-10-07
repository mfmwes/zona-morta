import { validEventResolutions } from "./event-resolution-types";
import type { GameState, HexState } from "./game";
import { validEventActionLinks, validHexEventOrigin } from "./hex-event-links";
import { validLocationPreparation } from "./hex-automation-validation";

export const terrains = { urban: "Urbano", rural: "Rural", forest: "Floresta", mountain: "Montanha", swamp: "Pântano" } as const;
export type Terrain = keyof typeof terrains;
export const passages = { none: "Sem via definida", road: "Estrada", trail: "Trilha", railway: "Ferrovia" } as const;
export type Passage = keyof typeof passages;
export type HexCoordinate = { q: number; r: number; id: string };
export const directions = [
  { q: 1, r: -1, label: "Nordeste" }, { q: 1, r: 0, label: "Leste" },
  { q: 0, r: 1, label: "Sudeste" }, { q: -1, r: 1, label: "Sudoeste" },
  { q: -1, r: 0, label: "Oeste" }, { q: 0, r: -1, label: "Noroeste" },
] as const;
export const MAX_WORLD_HEXES = 2000;

export function coordinate(q: number, r: number): HexCoordinate {
  return { q, r, id: `${q},${r}` };
}
export function parseHex(id: string): HexCoordinate | null {
  if (!/^-?\d+,-?\d+$/.test(id)) return null;
  const [q, r] = id.split(",").map(Number);
  if (!Number.isSafeInteger(q) || !Number.isSafeInteger(r) || Math.max(Math.abs(q), Math.abs(r)) > 10000) return null;
  return `${q},${r}` === id ? coordinate(q, r) : null;
}
export function worldHexes(hexes: Record<string, HexState>): HexCoordinate[] {
  return Object.keys(hexes).map(parseHex).filter((hex): hex is HexCoordinate => hex !== null);
}
export function adjacentHexes(id: string): HexCoordinate[] {
  const source = parseHex(id);
  return source ? directions.map(d => coordinate(source.q + d.q, source.r + d.r)) : [];
}
export function worldFrontier(hexes: Record<string, HexState>): HexCoordinate[] {
  const frontier = new Map<string, HexCoordinate>();
  for (const hex of worldHexes(hexes)) for (const neighbor of adjacentHexes(hex.id)) {
    if (!Object.hasOwn(hexes, neighbor.id) && parseHex(neighbor.id)) frontier.set(neighbor.id, neighbor);
  }
  return [...frontier.values()];
}

export type Expansion = { origin: string; mode: "neighbor" | "direction" | "ring"; direction: number; length: number; terrain: Terrain; passage: Passage };
export function expansionHexes(hexes: Record<string, HexState>, input: Expansion): HexCoordinate[] {
  const source = parseHex(input.origin);
  if (!source || !Object.hasOwn(hexes, input.origin)) return [];
  if (input.mode === "ring") return worldFrontier(hexes);
  if (input.mode !== "neighbor" && input.mode !== "direction") return [];
  const step = directions[input.direction];
  if (!Number.isInteger(input.direction) || !step || !Number.isInteger(input.length) || input.length < 1 || input.length > 12) return [];
  const length = input.mode === "neighbor" ? 1 : input.length;
  return Array.from({ length }, (_, i) => coordinate(source.q + step.q * (i + 1), source.r + step.r * (i + 1)))
    .filter(hex => !Object.hasOwn(hexes, hex.id) && parseHex(hex.id));
}
export function expandWorld(game: GameState, input: Expansion): string[] {
  if (!Object.hasOwn(terrains, input.terrain) || !Object.hasOwn(passages, input.passage)) return [];
  const additions = expansionHexes(game.hexes, input);
  if (Object.keys(game.hexes).length + additions.length > MAX_WORLD_HEXES) return [];
  for (const hex of additions) game.hexes[hex.id] = {
    sector: null, discovery: "desconhecido", infestation: null, signs: "", notes: "",
    terrain: input.terrain, passage: input.passage, routeHours: 1, points: [], events: [],
  };
  return additions.map(hex => hex.id);
}

export function hexCenter(hex: Pick<HexCoordinate, "q" | "r">) {
  return { x: Math.sqrt(3) * 53 * (hex.q + hex.r / 2), y: 1.5 * 53 * hex.r };
}
export function mapBounds(hexes: HexCoordinate[]) {
  const centers = hexes.map(hexCenter);
  const left = Math.min(0, ...centers.map(p => p.x)) - 65;
  const top = Math.min(0, ...centers.map(p => p.y)) - 65;
  const right = Math.max(0, ...centers.map(p => p.x)) + 65;
  const bottom = Math.max(0, ...centers.map(p => p.y)) + 65;
  return { x: (left + right) / 2, y: (top + bottom) / 2, width: right - left, height: bottom - top };
}

/** Optional metadata keeps old snapshots compatible without rewriting them. */
export function validWorld(value: unknown): value is Record<string, HexState> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  const validPoint = (point: HexState["points"][number]) => Boolean(point
    && typeof point.id === "string" && point.id.length <= 120
    && typeof point.name === "string" && point.name.length <= 120
    && ["local", "comércio"].includes(point.kind)
    && typeof point.signal === "string" && point.signal.length <= 2000
    && typeof point.access === "string" && point.access.length <= 1200
    && typeof point.notes === "string" && point.notes.length <= 2400
    && typeof point.revealed === "boolean"
    && validLocationPreparation(point.preparation)
    && validHexEventOrigin(point.eventOrigin)
    && (point.clueTargetHex === undefined || (typeof point.clueTargetHex === "string" && Boolean(parseHex(point.clueTargetHex))))
    && Array.isArray(point.searches) && point.searches.length <= 80
    && (point.generatorKind === undefined || ["locais", "comercios"].includes(point.generatorKind))
    && (point.generatorRoll === undefined || (Number.isInteger(point.generatorRoll) && point.generatorRoll >= 1 && point.generatorRoll <= 100))
    && (point.generatorCategory === undefined || (typeof point.generatorCategory === "string" && point.generatorCategory.length <= 80))
    && (point.condition === undefined || (typeof point.condition === "string" && point.condition.length <= 240))
    && (point.risk === undefined || (typeof point.risk === "string" && point.risk.length <= 240))
    && (point.lootTable === undefined || (typeof point.lootTable === "string" && point.lootTable.length <= 120)));
  const validEvent = (event: HexState["events"][number]) => Boolean(event
    && typeof event.id === "string" && event.id.length <= 120
    && typeof event.text === "string" && event.text.length <= 2400
    && typeof event.trigger === "string" && event.trigger.length <= 240
    && typeof event.revealed === "boolean"
    && validEventActionLinks(event.actionLinks)
    && validEventResolutions(event.resolutions)
    && (event.searchBaseline === undefined || (Number.isSafeInteger(event.searchBaseline) && event.searchBaseline >= 0))
    && (event.triggerType === undefined || ["manual", "enter", "search", "noise", "night"].includes(event.triggerType))
    && (event.triggerValue === undefined || (Number.isInteger(event.triggerValue) && event.triggerValue >= 0 && event.triggerValue <= 1440))
    && (event.status === undefined || ["pending", "active", "resolved", "archived"].includes(event.status))
    && (event.guidance === undefined || (typeof event.guidance === "string" && event.guidance.length <= 1600))
    && (event.generatorKind === undefined || event.generatorKind === "eventos")
    && (event.generatorRoll === undefined || (Number.isInteger(event.generatorRoll) && event.generatorRoll >= 1 && event.generatorRoll <= 100))
    && (event.generatorCategory === undefined || (typeof event.generatorCategory === "string" && event.generatorCategory.length <= 80)));
  return entries.length > 0 && entries.length <= MAX_WORLD_HEXES && entries.every(([id, hex]) =>
    parseHex(id) && hex && typeof hex === "object"
    && ["desconhecido", "avistado", "explorado"].includes(hex.discovery)
    && [1, 2].includes(hex.routeHours) && Array.isArray(hex.points) && hex.points.length <= 120 && hex.points.every(validPoint)
    && (hex.searchSequence === undefined || (Number.isSafeInteger(hex.searchSequence) && hex.searchSequence >= 0))
    && Array.isArray(hex.events) && hex.events.length <= 160 && hex.events.every(validEvent)
    && (hex.terrain === undefined || Object.hasOwn(terrains, hex.terrain))
    && (hex.passage === undefined || Object.hasOwn(passages, hex.passage)));
}
