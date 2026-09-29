import { createId } from "./id";
import content from "./content.json";
import type { GameState, InventoryItem, ProvisionLot, StockHolder } from "./game";

type Resource = "food" | "water";

/** R expires at the next dawn; F at the second dawn. Prepared frozen food becomes R. */
export function provisionDeadline(shelf: string | undefined, foundDay: number): number | null {
  const code = shelf?.trim().toUpperCase();
  if (code === "R" || code === "C") return foundDay + 1;
  if (code === "F") return foundDay + 2;
  return null;
}

export function recordProvisionLot(holder: StockHolder, resource: Resource, qty: number, label: string, expiresDay: number | null) {
  holder[resource] += qty;
  if (expiresDay === null) return;
  holder.provisionLots ??= [];
  const existing = holder.provisionLots.find(lot => lot.resource === resource && lot.expiresDay === expiresDay && lot.label === label);
  if (existing) existing.qty += qty;
  else holder.provisionLots.push({ id: createId(), resource, qty, expiresDay, label });
}

/** Withdraws expiring portions first and retains provenance for a transfer. */
export function withdrawPortions(holder: StockHolder, resource: Resource, quantity: number): ProvisionLot[] {
  const count = Math.min(Math.max(0, Math.trunc(quantity)), holder[resource]);
  let remaining = count;
  const removed: ProvisionLot[] = [];
  holder.provisionLots ??= [];
  holder.provisionLots.sort((a, b) => a.expiresDay - b.expiresDay);
  for (const lot of holder.provisionLots) {
    if (lot.resource !== resource || remaining === 0) continue;
    const taken = Math.min(remaining, lot.qty);
    removed.push({ ...lot, qty: taken });
    lot.qty -= taken;
    remaining -= taken;
  }
  holder.provisionLots = holder.provisionLots.filter(lot => lot.qty > 0);
  holder[resource] -= count;
  return removed;
}

export function adjustProvisionCount(holder: StockHolder, resource: Resource, newValue: number) {
  const value = Math.max(0, Math.trunc(newValue));
  if (value < holder[resource]) withdrawPortions(holder, resource, holder[resource] - value);
  else holder[resource] = value;
}

export function transferPortionLots(source: StockHolder, target: StockHolder, resource: Resource, quantity: number) {
  const before = source[resource];
  const lots = withdrawPortions(source, resource, quantity);
  target[resource] += before - source[resource];
  target.provisionLots ??= [];
  for (const lot of lots) {
    const match = target.provisionLots.find(x => x.resource === lot.resource && x.expiresDay === lot.expiresDay && x.label === lot.label);
    if (match) match.qty += lot.qty;
    else target.provisionLots.push({ ...lot, id: createId() });
  }
}

export function expirePortionLots(holder: StockHolder, morningDay: number): string[] {
  const expired: string[] = [];
  holder.provisionLots ??= [];
  for (const lot of holder.provisionLots) {
    if (lot.expiresDay > morningDay) continue;
    holder[lot.resource] = Math.max(0, holder[lot.resource] - lot.qty);
    expired.push(`${lot.qty} ${lot.resource === "food" ? "Comida" : "Água"} (${lot.label})`);
  }
  holder.provisionLots = holder.provisionLots.filter(lot => lot.expiresDay > morningDay);
  return expired;
}

/** Preserve a spoiled object for disposal; it cannot be converted to portions. */
export function expirePhysicalFood(game: GameState, items: InventoryItem[], cold = false): string[] {
  const expired: string[] = [];
  for (const item of items) {
    if (item.condition === "Estragado" || item.category !== "Alimentos" || !item.foundDay) continue;
    // The catalog lookup lives here to keep both the shelter and personal inventory on the same clock.
    const shelf = catalogShelf(item);
    const preparedExpiry = item.expiresDay ?? null;
    if (shelf === "C" && cold && preparedExpiry === null && !item.prepared) continue;
    const deadline = preparedExpiry ?? provisionDeadline(shelf, item.foundDay);
    if (deadline !== null && game.day >= deadline) {
      item.condition = "Estragado";
      expired.push(`${item.qty}× ${item.name}`);
    }
  }
  return expired;
}

function catalogShelf(item: InventoryItem) {
  const entry = content.catalog.find(x => `${x.category}::${x.name}` === item.catalogKey)
    ?? content.catalog.find(x => x.name === item.name && x.category === item.category);
  return entry?.fields.find(field => field.label === "Prazo")?.value;
}
