import { content, survivorHex, survivorsAtHex, type EquipmentSlot, type GameState, type InventoryItem, type Survivor } from "./game";
import { getPrimary, getProtection, getSecondary, weaponAmmoType } from "./equipment";
import { createId } from "./id";
import { transferPortionLots } from "./provisions";
import { hydrateProvisionItem, physicalProvisionPortions, provisionItemInfo, type ProvisionResource } from "./provision-items";

type CatalogEntry = (typeof content.catalog)[number];
export const inventoryCategories = [...new Set(content.catalog
  .filter(entry => !["Consulta antes de sair e ao retornar", "Suprimentos abstratos"].includes(entry.category))
  .map(entry => entry.category))];
export const catalogItems = content.catalog.filter(entry => inventoryCategories.includes(entry.category));
export const conditions = ["Íntegro", "Gasto", "Danificado", "Contaminado", "Estragado"];
export const ammoTypes = ["Indefinida", "Pistola", "Espingarda", "Carabina", "Flechas", "Virotes", "Chumbinhos", "Outra"];
export function ammoTypeFor(s: Survivor) {
  return s.ammoType || weaponAmmoType(s.primary) || "Indefinida";
}

export function catalogKey(entry: CatalogEntry) { return entry.category + "::" + entry.name; }
export function catalogForItem(item: InventoryItem) {
  return content.catalog.find(entry => catalogKey(entry) === item.catalogKey)
    ?? content.catalog.find(entry => entry.name === item.name && (!item.category || entry.category === item.category));
}
export function itemFromCatalog(entry: CatalogEntry, qty = 1, condition = "Íntegro", foundDay?: number): InventoryItem {
  const field = entry.fields.find(f => ["Carga", "Guarda", "Carga em viagem"].includes(f.label))?.value ?? "1";
  // "0/1" denotes a loose pocket item; food and drink share the portion load calculation.
  const load = field === "0/1" && ["Alimentos", "Bebidas"].includes(entry.category)
    ? 0 : Number(field.match(/^\d+/)?.[0] ?? 1);
  return hydrateProvisionItem({ id: createId(), name: entry.name, catalogKey: catalogKey(entry), category: entry.category,
    load, qty, condition, ...(["Alimentos", "Bebidas"].includes(entry.category) && foundDay ? { foundDay } : {}) });
}
export function addStack(items: InventoryItem[], incoming: InventoryItem) {
  const match = items.find(item => item.name === incoming.name && item.catalogKey === incoming.catalogKey
    && item.category === incoming.category && item.condition === incoming.condition
    && item.load === incoming.load && item.foundDay === incoming.foundDay
    && item.provisionResource === incoming.provisionResource
    && item.portionsPerUnit === incoming.portionsPerUnit
    && item.portionsRemaining === incoming.portionsRemaining
    && item.prepared === incoming.prepared && item.verified === incoming.verified
    && item.opened === incoming.opened && item.expiresDay === incoming.expiresDay
    && (item.armorMarked ?? 0) === (incoming.armorMarked ?? 0)
    && item.qty + incoming.qty <= 99);
  if (match) match.qty += incoming.qty;
  else items.push({ ...incoming, id: createId() });
}
export function sharedStorageHex(game: GameState) {
  return game.shelter.hex ?? game.partyHex;
}

export function atSharedStorage(game: GameState, survivorId?: string) {
  const storageHex = sharedStorageHex(game);
  if (survivorId) {
    const person = game.survivors.find(entry => entry.id === survivorId);
    return Boolean(person && survivorHex(game, person) === storageHex);
  }
  if (game.survivors.length === 0) return game.partyHex === storageHex;
  return survivorsAtHex(game, storageHex).length > 0;
}

function sharedAccessSurvivor(from: string, to: string) {
  if (from === "shared" && to !== "shared") return to;
  if (to === "shared" && from !== "shared") return from;
  return undefined;
}
export function container(game: GameState, id: string) {
  if (id === "shared") return game.shelter.inventory ?? (game.shelter.inventory = []);
  return game.survivors.find(s => s.id === id)?.inventory;
}
export function transferItem(game: GameState, from: string, to: string, itemId: string, quantity: number) {
  const sharedSurvivor = sharedAccessSurvivor(from, to);
  if (!Number.isInteger(quantity) || quantity < 1 || from === to
    || (sharedSurvivor && !atSharedStorage(game, sharedSurvivor))) return false;
  const source = container(game, from), target = container(game, to);
  const item = source?.find(entry => entry.id === itemId);
  const count = Math.trunc(quantity);
  if (!source || !target || !item || count < 1 || count > item.qty) return false;
  addStack(target, { ...item, qty: count });
  item.qty -= count;
  if (item.qty === 0) source.splice(source.indexOf(item), 1);
  return true;
}
export function discardItem(game: GameState, from: string, itemId: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1 || (from === "shared" && !atSharedStorage(game))) return false;
  const source = container(game, from);
  const item = source?.find(entry => entry.id === itemId);
  const count = Math.trunc(quantity);
  if (!source || !item || count < 1 || count > item.qty) return false;
  item.qty -= count;
  if (item.qty === 0) source.splice(source.indexOf(item), 1);
  return true;
}
export function pocketEligible(item: InventoryItem) {
  const entry = catalogForItem(item);
  if (entry && ["Alimentos", "Bebidas"].includes(entry.category)) return false;
  const loadField = entry?.fields.find(field => ["Carga", "Guarda", "Carga em viagem"].includes(field.label))?.value;
  return item.load === 0 || loadField === "0";
}
export function compatibleSlots(item: InventoryItem): EquipmentSlot[] {
  const name = item.name;
  const slots: EquipmentSlot[] = [];
  if (getPrimary(name)) slots.push("primary");
  if (getSecondary(name)) slots.push("secondary");
  if (getProtection(name)) slots.push("protection");
  if (["Bolsa tiracolo", "Mochila urbana", "Mochila de trilha", "Mochila cargueira"].includes(name)) slots.push("bag");
  if (content.personal.some(x => x.name === name) && !slots.includes("bag")) slots.push("personal");
  if (pocketEligible(item)) slots.push("pocket1", "pocket2");
  return slots;
}
export const slotLabels: Record<EquipmentSlot, string> = {
  primary: "Arma principal", secondary: "Arma secundária", protection: "Proteção", personal: "Item pessoal",
  bag: "Bolsa/mochila", pocket1: "Bolso 1", pocket2: "Bolso 2",
};
export function storedLoad(name: string, slot: EquipmentSlot) {
  const record = slot === "primary" ? getPrimary(name)
    : slot === "secondary" ? getSecondary(name)
    : slot === "protection" ? getProtection(name)
    : slot === "personal" ? content.personal.find(x => x.name === name) : null;
  if (record) {
    const value = "stored" in record ? record.stored : record.load;
    return Number(value === "0/1" ? 1 : value);
  }
  const entry = content.catalog.find(x => x.name === name && (slot !== "bag" || x.category === "Abrigo, transporte e mochilas"));
  const field = entry?.fields.find(x => ["Guarda", "Carga", "Carga em viagem"].includes(x.label))?.value;
  return Number(field?.match(/^\d+/)?.[0] ?? 1);
}
export function stowSlot(s: Survivor, slot: EquipmentSlot) {
  const name = s[slot];
  if (!name) return false;
  if (slot === "personal" && s.bag === name) return stowSlot(s, "bag");
  const entry = content.catalog.find(x => x.name === name && (slot !== "bag" || x.category === "Abrigo, transporte e mochilas"));
  const previous = s.equippedItems?.[slot];
  addStack(s.inventory, { id: createId(), name, load: storedLoad(name, slot),
    condition: s.kitCondition?.[slot] ?? "Íntegro", catalogKey: entry ? catalogKey(entry) : undefined,
    category: entry?.category, ...(previous?.name === name ? previous : {}), qty: 1,
    ...(s.kitCondition?.[slot] ? { condition: s.kitCondition[slot] } : {}),
    ...(slot === "protection" ? { armorMarked: s.armorMarked } : {}) });
  s[slot] = "";
  if (slot === "bag" && s.personal === name) {
    s.personal = "";
    if (s.equippedItems) delete s.equippedItems.personal;
    if (s.kitCondition) delete s.kitCondition.personal;
  }
  if (slot === "personal" && s.bag === name) s.bag = "";
  if (slot === "protection") s.armorMarked = 0;
  if (s.kitCondition) delete s.kitCondition[slot];
  if (s.equippedItems) delete s.equippedItems[slot];
  return true;
}
export function displacedSlots(s: Survivor, item: InventoryItem, slot: EquipmentSlot): EquipmentSlot[] {
  const slots: EquipmentSlot[] = s[slot] ? [slot] : [];
  if (slot === "primary" && getPrimary(item.name)?.hands === "Duas" && s.secondary) slots.push("secondary");
  if (slot === "secondary" && getPrimary(s.primary)?.hands === "Duas") slots.push("primary");
  return slots;
}
export function equipItem(s: Survivor, itemId: string, slot: EquipmentSlot) {
  const item = s.inventory.find(x => x.id === itemId);
  if (!item || item.qty < 1 || !compatibleSlots(item).includes(slot)) return false;
  const incoming = { ...item };
  item.qty -= 1;
  if (item.qty === 0) s.inventory.splice(s.inventory.indexOf(item), 1);
  for (const oldSlot of displacedSlots(s, incoming, slot)) stowSlot(s, oldSlot);
  s[slot] = incoming.name;
  s.equippedItems ??= {};
  s.equippedItems[slot] = { ...incoming, qty: 1 };
  s.kitCondition ??= {};
  s.kitCondition[slot] = incoming.condition ?? "Íntegro";
  if (slot === "protection") s.armorMarked = incoming.armorMarked ?? 0;
  if (slot === "bag" && !s.personal && incoming.name === "Mochila urbana") s.personal = incoming.name;
  return true;
}
export function provisionInfo(item: InventoryItem) {
  const info = provisionItemInfo(item);
  return {
    type: info.resource,
    portions: info.portionsPerUnit,
    remaining: info.remaining,
    preparation: info.preparation,
    shelf: info.shelf,
    needsPreparation: Boolean(info.resource && !info.ready),
    requiresVerification: info.requiresVerification,
    requiresPreparation: info.requiresPreparation,
    ready: info.ready,
    status: info.status,
  };
}
export function automaticProvision(item: InventoryItem) {
  const provision = provisionInfo(item);
  return provision.type && provision.ready ? provision : null;
}

function splitInventoryUnits(items: InventoryItem[], item: InventoryItem, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > item.qty || item.portionsRemaining !== undefined) return null;
  if (quantity === item.qty) return item;
  item.qty -= quantity;
  const split = { ...item, id: createId(), qty: quantity };
  items.push(split);
  return split;
}

export function prepareProvisionItem(game: GameState, ownerId: string, itemId: string, quantity: number) {
  if (ownerId === "shared" && !atSharedStorage(game)) return null;
  const items = container(game, ownerId);
  const item = items?.find(entry => entry.id === itemId);
  if (!items || !item) return null;
  const before = provisionItemInfo(item);
  if (!before.resource || before.ready || item.condition === "Estragado" || item.condition === "Contaminado") return null;
  const target = splitInventoryUnits(items, item, quantity);
  if (!target) return null;
  if (before.requiresPreparation) {
    target.prepared = true;
    target.expiresDay = game.day + 1;
  }
  if (before.requiresVerification) target.verified = true;
  const after = provisionItemInfo(target);
  return after.ready ? { item: target, info: after } : null;
}

function consumePortionFromItems(items: InventoryItem[], itemId: string) {
  const item = items.find(entry => entry.id === itemId);
  if (!item) return null;
  const info = provisionItemInfo(item);
  if (!info.resource || !info.ready || info.remaining < 1) return null;

  let remainingInOpenedUnit = 0;
  if (item.portionsRemaining !== undefined) {
    item.portionsRemaining = Math.max(0, item.portionsRemaining - 1);
    item.opened = true;
    remainingInOpenedUnit = item.portionsRemaining;
    if (item.portionsRemaining === 0) items.splice(items.indexOf(item), 1);
  } else if (item.qty > 1) {
    item.qty -= 1;
    remainingInOpenedUnit = Math.max(0, info.portionsPerUnit - 1);
    if (remainingInOpenedUnit > 0) {
      items.push({ ...item, id: createId(), qty: 1, portionsRemaining: remainingInOpenedUnit, opened: true });
    }
  } else {
    remainingInOpenedUnit = Math.max(0, info.portionsPerUnit - 1);
    if (remainingInOpenedUnit > 0) {
      item.portionsRemaining = remainingInOpenedUnit;
      item.opened = true;
    } else {
      items.splice(items.indexOf(item), 1);
    }
  }
  return { resource: info.resource, name: item.name, remainingInOpenedUnit };
}

export function consumeProvisionItem(game: GameState, ownerId: string, itemId: string, consumerId?: string) {
  if (ownerId === "shared" && !atSharedStorage(game)) return null;
  const items = container(game, ownerId);
  if (!items) return null;
  const result = consumePortionFromItems(items, itemId);
  if (!result) return null;
  const consumer = consumerId ? game.survivors.find(person => person.id === consumerId)
    : game.survivors.find(person => person.id === ownerId);
  if (consumer) {
    const dayKey = result.resource === "food" ? "foodConsumedDay" : "waterConsumedDay";
    if (consumer[dayKey] !== game.day) consumer[dayKey] = game.day;
  }
  return {
    ...result,
    remainingReady: physicalProvisionPortions(items, result.resource, true),
  };
}

export function consumeReadyProvisionPortions(items: InventoryItem[] | undefined, resource: ProvisionResource, quantity: number) {
  if (!items || quantity <= 0) return { consumed: 0, labels: [] as string[] };
  let remaining = Math.max(0, Math.trunc(quantity));
  const labels: string[] = [];
  while (remaining > 0) {
    const candidates = items
      .filter(item => {
        const info = provisionItemInfo(item);
        return info.resource === resource && info.ready && info.remaining > 0;
      })
      .sort((a, b) => Number(Boolean(b.opened)) - Number(Boolean(a.opened))
        || (a.expiresDay ?? 999999) - (b.expiresDay ?? 999999)
        || (a.foundDay ?? 999999) - (b.foundDay ?? 999999));
    const next = candidates[0];
    if (!next) break;
    const result = consumePortionFromItems(items, next.id);
    if (!result) break;
    labels.push(result.name);
    remaining -= 1;
  }
  return { consumed: Math.max(0, Math.trunc(quantity)) - remaining, labels };
}

export type Provision = "food" | "water" | "ammo";
export function provisionTransferError(game: GameState, from: string, to: string, resource: Provision, quantity: number): string | null {
  if (!Number.isInteger(quantity) || quantity < 1) return "Informe uma quantidade inteira maior que zero.";
  if (!to || from === to) return "Escolha dois destinos diferentes.";
  const sharedSurvivor = sharedAccessSurvivor(from, to);
  if (sharedSurvivor && !atSharedStorage(game, sharedSurvivor))
    return "Esse sobrevivente precisa estar no mesmo hex das reservas compartilhadas.";
  const source = from === "shared" ? game.shelter : game.survivors.find(s => s.id === from);
  const target = to === "shared" ? game.shelter : game.survivors.find(s => s.id === to);
  if (!source || !target) return "Sobrevivente não encontrado.";
  const available = resource === "ammo" && "pistolAmmo" in source ? source.pistolAmmo : (source as Survivor)[resource];
  const receiving = resource === "ammo" && "pistolAmmo" in target ? target.pistolAmmo : (target as Survivor)[resource];
  if (available < quantity) return "A origem não tem essa quantidade disponível.";
  if (receiving + quantity > (to === "shared" && resource !== "ammo" ? 999 : 99)) return "O destino atingiria o limite do contador.";
  if (resource === "ammo") {
    const sourceType = "pistolAmmo" in source ? "Pistola" : ammoTypeFor(source);
    const targetType = "pistolAmmo" in target ? "Pistola" : ammoTypeFor(target);
    if (["Indefinida", "Outra"].includes(sourceType)) return "Identifique o tipo de munição da origem antes de transferir.";
    if ((receiving > 0 || to === "shared") && sourceType !== targetType) return `Não é possível misturar ${sourceType} e ${targetType} no mesmo contador.`;
  }
  return null;
}

export function transferProvisions(game: GameState, from: string, to: string, resource: Provision, quantity: number) {
  if (provisionTransferError(game, from, to, resource, quantity)) return false;
  const source = from === "shared" ? game.shelter : game.survivors.find(s => s.id === from)!;
  const target = to === "shared" ? game.shelter : game.survivors.find(s => s.id === to)!;
  if (resource === "ammo") {
    const type = "pistolAmmo" in source ? "Pistola" : ammoTypeFor(source);
    if ("pistolAmmo" in source) source.pistolAmmo -= quantity; else source.ammo -= quantity;
    if ("pistolAmmo" in target) target.pistolAmmo += quantity;
    else { target.ammo += quantity; target.ammoType = type; }
  } else transferPortionLots(source, target, resource, quantity);
  return true;
}
export function countsAsMedication(item: InventoryItem) {
  const entry = catalogForItem(item);
  return entry?.category === "Medicamentos e cuidado"
    && /1 unidade de Medicamentos/i.test(entry.fields.find(f => f.label === "Uso em jogo")?.value ?? "");
}
