import { content, type EquipmentSlot, type GameState, type InventoryItem, type Survivor } from "./game";
import { getPrimary, getProtection, getSecondary, weaponAmmoType } from "./equipment";
import { createId } from "./id";
import { transferPortionLots } from "./provisions";

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
  return { id: createId(), name: entry.name, catalogKey: catalogKey(entry), category: entry.category,
    load, qty, condition, ...(["Alimentos", "Bebidas"].includes(entry.category) && foundDay ? { foundDay } : {}) };
}
export function addStack(items: InventoryItem[], incoming: InventoryItem) {
  const match = items.find(item => item.name === incoming.name && item.catalogKey === incoming.catalogKey
    && item.category === incoming.category && item.condition === incoming.condition
    && item.load === incoming.load && item.foundDay === incoming.foundDay
    && (item.armorMarked ?? 0) === (incoming.armorMarked ?? 0)
    && item.qty + incoming.qty <= 99);
  if (match) match.qty += incoming.qty;
  else items.push({ ...incoming, id: createId() });
}
export function atSharedStorage(game: GameState) {
  return !game.shelter.hex || game.partyHex === game.shelter.hex;
}
export function container(game: GameState, id: string) {
  if (id === "shared") return game.shelter.inventory ?? (game.shelter.inventory = []);
  return game.survivors.find(s => s.id === id)?.inventory;
}
export function transferItem(game: GameState, from: string, to: string, itemId: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1 || from === to || ((from === "shared" || to === "shared") && !atSharedStorage(game))) return false;
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
export function compatibleSlots(item: InventoryItem): EquipmentSlot[] {
  const name = item.name;
  const slots: EquipmentSlot[] = [];
  if (getPrimary(name)) slots.push("primary");
  if (getSecondary(name)) slots.push("secondary");
  if (getProtection(name)) slots.push("protection");
  if (["Bolsa tiracolo", "Mochila urbana", "Mochila de trilha", "Mochila cargueira"].includes(name)) slots.push("bag");
  if (content.personal.some(x => x.name === name) && !slots.includes("bag")) slots.push("personal");
  return slots;
}
export const slotLabels: Record<EquipmentSlot, string> = {
  primary: "Arma principal", secondary: "Arma secundária", protection: "Proteção", personal: "Item pessoal", bag: "Bolsa/mochila",
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
  const field = entry?.fields.find(x => x.label === "Guarda")?.value;
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
  const catalog = catalogForItem(item);
  const category: "food" | "water" | null = catalog?.category === "Alimentos" ? "food" : catalog?.category === "Bebidas" ? "water" : null;
  const label = category === "food" ? "Porções" : "Água em jogo";
  const description = catalog?.fields.find(f => f.label === label)?.value ?? "";
  const listed = Number(description.match(/\d+/)?.[0] ?? 1);
  const requiresVerification = category === "water" && listed === 0 && /até/i.test(description);
  const portions = requiresVerification ? 1 : listed;
  const type = portions > 0 && item.condition !== "Estragado" ? category : null;
  const preparation = catalog?.fields.find(f => f.label === "Preparo")?.value;
  const shelf = catalog?.fields.find(f => f.label === "Prazo")?.value;
  const needsPreparation = Boolean(requiresVerification || (preparation && !/^Pronto/i.test(preparation))
    || item.condition === "Contaminado" || (item.condition && item.condition !== "Íntegro" && /se íntegr[ao]/i.test(preparation ?? "")));
  return { type, portions, preparation, shelf, needsPreparation, requiresVerification };
}

export type Provision = "food" | "water" | "ammo";
export function provisionTransferError(game: GameState, from: string, to: string, resource: Provision, quantity: number): string | null {
  if (!Number.isInteger(quantity) || quantity < 1) return "Informe uma quantidade inteira maior que zero.";
  if (!to || from === to) return "Escolha dois destinos diferentes.";
  if ((from === "shared" || to === "shared") && !atSharedStorage(game)) return "O grupo precisa estar no abrigo para acessar essas reservas.";
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
