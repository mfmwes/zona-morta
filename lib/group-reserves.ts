import { survivorHex, type GameState, type StockHolder, type InventoryItem } from "./game";
import { readyStockProvisions } from "./ready-provisions";
import { shelterColdStorageActive } from "./shelter-projects";

/** Read-only view of ready provisions physically accessible to the selected group. */
export function groupReserves(game: GameState, hex = game.partyHex) {
  const ready = (holder: StockHolder & { inventory?: InventoryItem[] }, resource: "food" | "water") => {
    return readyStockProvisions(holder, resource, game.day, holder === game.shelter && shelterColdStorageActive(game, game.shelter));
  };
  const members = game.survivors.filter(person => survivorHex(game, person) === hex);
  const local = hex === (game.shelter.hex ?? game.partyHex);
  const personal = { food: members.reduce((sum, person) => sum + ready(person, "food"), 0),
    water: members.reduce((sum, person) => sum + ready(person, "water"), 0) };
  const storage = { food: ready(game.shelter, "food"), water: ready(game.shelter, "water"), parts: game.shelter.parts };
  const shared = local ? storage : { food: 0, water: 0, parts: 0 };
  return { personal, shared, local, remote: local ? null : storage,
    total: { food: personal.food + shared.food, water: personal.water + shared.water, parts: shared.parts } };
}
