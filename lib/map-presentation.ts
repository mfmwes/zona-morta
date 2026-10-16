import type { GameState, HexState } from "./game";

export type MapFilter = "all" | "stock" | "events";
export function mapHexSummary(game: GameState, id: string, player: boolean) {
  const hex = game.hexes[id];
  if (!hex || (player && hex.discovery === "desconhecido")) return { stock: 0, events: 0 };
  const stock = player
    ? (game.publicPlayerActions?.locations ?? []).filter(p => p.hexId === id && hex.points.some(point => point.id === p.pointId && point.revealed)).reduce((n, p) => n + p.stockUnits, 0)
    : hex.points.reduce((n, p) => n + (p.preparation?.stock ?? []).reduce((sum, item) => sum + Math.max(0, item.remaining), 0), 0);
  const events = hex.events.filter(e => (!player || e.revealed) && (e.status === undefined || e.status === "active" || (!player && e.status === "pending"))).length;
  return { stock, events };
}

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
export function findMapLocations(hexes: Record<string, HexState>, query: string, player: boolean) {
  const term = normalize(query.trim());
  if (!term) return [];
  return Object.entries(hexes).flatMap(([id, hex]) => {
    const known = hex.discovery !== "desconhecido" || !player;
    const name = known ? hex.sector?.name ?? "Setor sem nome" : "Desconhecido";
    const point = known ? hex.points.find(p => (!player || p.revealed) && normalize(p.name).includes(term)) : undefined;
    return id.includes(term) || (known && normalize(name).includes(term)) || point
      ? [{ id, name, pointName: point?.name }] : [];
  }).slice(0, 8);
}

/** Artwork is chosen only from the visible sector, never its hidden points or events. */
export function mapArtworkIndex(hex: HexState): number | null {
  if (hex.discovery === "desconhecido") return null;
  const terrain = hex.terrain ?? "urban";
  if (terrain !== "urban") return { rural: 12, forest: 13, mountain: 14, swamp: 15 }[terrain];
  const name = normalize(hex.sector?.name ?? "");
  const categories: [RegExp, number][] = [
    [/reservat|agua|bombeamento/, 1], [/praca|monumento/, 2], [/estacao|ferrovi/, 3],
    [/industr|oficina|fabrica|conteiner|deposit/, 4], [/mercado|feira|comerc/, 5],
    [/canal|\brio\b|margem|porto/, 6], [/hospital|clinic|saude/, 7], [/univers|escola|colegio/, 8],
    [/parque|jardim|cemiter|esport/, 9], [/rodovi|viaduto|estrada/, 10], [/obra|construc/, 11],
  ];
  return categories.find(([pattern]) => pattern.test(name))?.[1] ?? 0;
}
