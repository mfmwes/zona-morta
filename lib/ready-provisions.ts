import type { InventoryItem, StockHolder } from "./game";
import { provisionItemInfo, type ProvisionResource } from "./provision-items";
import { physicalFoodExpired } from "./provisions";

/** Read-only stock total, including ready supplies transported in open carts. */
export function readyStockProvisions(holder: StockHolder & { inventory?: InventoryItem[] }, resource: ProvisionResource, day: number, cold = false) {
  const expired = (holder.provisionLots ?? [])
    .filter(lot => lot.resource === resource && lot.expiresDay !== null && lot.expiresDay <= day)
    .reduce((sum, lot) => sum + lot.qty, 0);
  const readyItems = (items: InventoryItem[], refrigerated: boolean): number => items.reduce((sum, item) => {
    const info = provisionItemInfo(item);
    const usable = info.resource === resource && info.ready
      && (item.expiresDay === undefined || item.expiresDay > day)
      && !physicalFoodExpired(item, day, refrigerated);
    const cart = item.name === "Carrinho dobrável" && item.cartDeployed
      ? readyItems(item.cartItems ?? [], false) : 0;
    return sum + (usable ? info.remaining : 0) + cart;
  }, 0);
  return Math.max(0, holder[resource] - expired) + readyItems(holder.inventory ?? [], cold);
}
