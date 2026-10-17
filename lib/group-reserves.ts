import { survivorHex, type GameState, type StockHolder, type InventoryItem } from "./game";
import { provisionBreakdown } from "./provision-items";

/** Read-only view of ready provisions physically accessible to the selected group. */
export function groupReserves(game: GameState, hex = game.partyHex) {
  const ready = (holder: StockHolder & { inventory?: InventoryItem[] }, resource: "food" | "water") => {
    const expired = (holder.provisionLots ?? []).filter(lot => lot.resource === resource && lot.expiresDay !== null && lot.expiresDay <= game.day)
      .reduce((sum, lot) => sum + lot.qty, 0);
    return provisionBreakdown({ ...holder, [resource]: Math.max(0, holder[resource] - expired),
      inventory: holder.inventory?.filter(item => item.expiresDay === undefined || item.expiresDay > game.day) }, resource).total;
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
