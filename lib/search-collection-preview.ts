import type { GameState } from "./game";
import { collectLocationStock, type CollectionLine } from "./hex-automation";
import type { PublicPlayerActions } from "./player-actions-types";
import { createId } from "./id";

/** Run the actual transaction on a disposable state, including portions, carts and containers. */
export function previewSearchCollection(game: GameState, hexId: string, pointId: string, lines: CollectionLine[], publicStock?: PublicPlayerActions["stock"]) {
  const draft = structuredClone(game);
  const point = draft.hexes[hexId]?.points.find(row => row.id === pointId);
  if (publicStock && point) {
    if (publicStock.some(row => lines.some(line => line.stockId === row.stockId) && !row.item)) return { error: null, state: undefined };
    point.preparation = { version: 1, areas: [], attempts: [], collections: [], stock: publicStock.filter(row => row.item).map(row => ({
      id: row.stockId, areaId: row.areaId, item: row.item!, remaining: row.remaining, accessible: row.accessible, requiresFuelContainer: row.requiresFuelContainer,
    })) };
  }
  if (!lines.length) return { error: null, state: draft };
  const error = collectLocationStock(draft, hexId, pointId, createId(), lines);
  return { error, state: error ? undefined : draft };
}
