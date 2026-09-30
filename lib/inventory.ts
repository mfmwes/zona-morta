import { ammunitionTypes, content, setShelterAmmoCount, shelterAmmoCount, survivorHex, survivorsAtHex, type AmmunitionType, type EquipmentSlot, type GameState, type InventoryItem, type Survivor } from "./game";
import { getPrimary, getProtection, getSecondary, weaponAmmoType } from "./equipment";
import { createId } from "./id";
import { transferPortionLots, withdrawPortions } from "./provisions";
import { hydrateProvisionItem, physicalProvisionPortions, provisionItemInfo, type ProvisionResource } from "./provision-items";

type CatalogEntry = (typeof content.catalog)[number];
export const inventoryCategories = [...new Set(content.catalog
  .filter(entry => !["Consulta antes de sair e ao retornar", "Suprimentos abstratos"].includes(entry.category))
  .map(entry => entry.category))];
export const catalogItems = content.catalog.filter(entry => inventoryCategories.includes(entry.category));
export const conditions = ["Íntegro", "Gasto", "Danificado", "Contaminado", "Estragado"];
export const ammoTypes: AmmunitionType[] = [...ammunitionTypes];
export function ammoTypeFor(s: Survivor) {
  return s.ammoType || weaponAmmoType(s.primary) || "Indefinida";
}

export function catalogKey(entry: CatalogEntry) { return entry.category + "::" + entry.name; }
export function catalogForItem(item: InventoryItem) {
  return content.catalog.find(entry => catalogKey(entry) === item.catalogKey)
    ?? content.catalog.find(entry => entry.name === item.name && (!item.category || entry.category === item.category));
}

const explicitSingleUse = new Set([
  "Kit de pilhas", "Pastilhas de purificação", "Sinalizador de mão", "Luvas descartáveis", "Luvas de procedimento",
  "Solução de limpeza lacrada", "Soro fisiológico lacrado", "Curativo compressivo", "Analgésico genérico",
  "Antitérmico genérico", "Medicamento para alergia", "Medicamento para enjoo", "Medicamento prescrito identificado",
  "Antibiótico prescrito", "Sachês de reidratação",
]);
const reusableCare = new Set(["Kit médico de campo", "Termômetro", "Tala e faixa", "Máscara respiratória com filtro"]);
export function catalogItemIsConsumable(item: InventoryItem) {
  const entry = catalogForItem(item);
  if (!entry) return false;
  if (explicitSingleUse.has(item.name)) return true;
  return entry.category === "Medicamentos e cuidado" && !reusableCare.has(item.name) && !countsAsMedication(item);
}

type PreparationCheck = { ok: boolean; message: string; details: string[]; waterCost: number; tabletCost: number; fuelCost: number };
function accessContainers(game: GameState, ownerId: string) {
  const primary = ownerId === "shared" ? game.shelter.inventory ?? [] : game.survivors.find(person => person.id === ownerId)?.inventory ?? [];
  const shared = ownerId !== "shared" && atSharedStorage(game, ownerId) ? game.shelter.inventory ?? [] : [];
  return shared === primary ? [primary] : [primary, shared];
}
function accessibleNamedQuantity(game: GameState, ownerId: string, name: string) {
  return accessContainers(game, ownerId).reduce((sum, items) => sum + items.filter(item => item.name === name).reduce((n, item) => n + item.qty, 0), 0);
}
function completedFacility(game: GameState, ...keys: string[]) {
  return Boolean(game.shelter.hex && keys.some(key => game.shelter.projects?.some(project => project.key === key && project.state === "Concluído")));
}
function ownerHolder(game: GameState, ownerId: string) {
  return ownerId === "shared" ? game.shelter : game.survivors.find(person => person.id === ownerId);
}
function availableWater(game: GameState, ownerId: string) {
  const holder = ownerHolder(game, ownerId);
  let total = holder ? (holder.water ?? 0) + physicalProvisionPortions(holder.inventory, "water", true) : 0;
  if (ownerId !== "shared" && atSharedStorage(game, ownerId)) total += game.shelter.water + physicalProvisionPortions(game.shelter.inventory, "water", true);
  return total;
}
function hasPan(game: GameState, ownerId: string) {
  return accessibleNamedQuantity(game, ownerId, "Panela leve") > 0 || completedFacility(game, "community-kitchen", "community-kitchen-space");
}
function heatPlan(game: GameState, ownerId: string) {
  if (completedFacility(game, "community-kitchen", "community-kitchen-space")) return { ok: true, fuelCost: 0 };
  if (accessibleNamedQuantity(game, ownerId, "Fogareiro") < 1) return { ok: false, fuelCost: 0 };
  const personalFuel = accessibleNamedQuantity(game, ownerId, "Combustível (1 unidade)");
  if (personalFuel > 0) return { ok: true, fuelCost: 1 };
  if (ownerId === "shared" || atSharedStorage(game, ownerId)) return { ok: game.shelter.fuel > 0, fuelCost: game.shelter.fuel > 0 ? 1 : 0 };
  return { ok: false, fuelCost: 0 };
}

export function provisionPreparationCheck(game: GameState, ownerId: string, item: InventoryItem, quantity = 1): PreparationCheck {
  const entry = catalogForItem(item);
  const info = provisionItemInfo(item);
  const count = Math.max(1, Math.min(item.qty, Math.trunc(quantity)));
  const requirement = entry?.fields.find(field => field.label === "Requisitos")?.value ?? "";
  const details: string[] = [];
  let waterCost = 0, tabletCost = 0, fuelCost = 0;

  const waterPerUnit = Number(requirement.match(/(\d+) porção de Água[^.]*por unidade/i)?.[1] ?? 0);
  if (waterPerUnit > 0) {
    waterCost = waterPerUnit * count;
    details.push(`${waterCost} porção(ões) de Água`);
    if (availableWater(game, ownerId) < waterCost)
      return { ok: false, message: `Faltam ${waterCost} porção(ões) de Água acessível para preparar este item.`, details, waterCost, tabletCost, fuelCost };
  }

  const needsPan = /Panela leve/i.test(requirement);
  if (needsPan) {
    details.push("Panela leve");
    if (!hasPan(game, ownerId)) return { ok: false, message: "É necessária uma Panela leve ou cozinha operacional.", details, waterCost, tabletCost, fuelCost };
  }

  if (/fonte de calor/i.test(requirement)) {
    const heat = heatPlan(game, ownerId);
    details.push("fonte de calor");
    if (!heat.ok) return { ok: false, message: "Falta uma fonte de calor funcional: use uma cozinha operacional ou Fogareiro com Combustível.", details, waterCost, tabletCost, fuelCost };
    fuelCost = heat.fuelCost;
  }

  if (info.requiresVerification && ["Água de torneira sem verificação", "Água de chuva coletada"].includes(item.name)) {
    if (completedFacility(game, "water-filter") || accessibleNamedQuantity(game, ownerId, "Filtro portátil") > 0) {
      details.push("filtragem");
    } else {
      const portions = Math.max(1, info.portionsPerUnit * count);
      const tablets = Math.ceil(portions / 4);
      if (accessibleNamedQuantity(game, ownerId, "Pastilhas de purificação") >= tablets) {
        tabletCost = tablets; details.push(`${tablets} Pastilhas de purificação`);
      } else {
        const heat = heatPlan(game, ownerId);
        if (hasPan(game, ownerId) && heat.ok) {
          fuelCost = Math.max(fuelCost, heat.fuelCost); details.push("fervura");
        } else {
          return { ok: false, message: "Água insegura exige Filtro portátil, Pastilhas de purificação ou fervura com Panela leve e fonte de calor.", details, waterCost, tabletCost, fuelCost };
        }
      }
    }
  }
  if (info.requiresVerification && item.name === "Garrafa sem rótulo") details.push("confirmação do mestre sobre conteúdo e segurança");
  if (info.requiresVerification && item.name === "Água de cisterna tratada") details.push("verificação plausível da origem/qualidade");

  return { ok: true, message: details.length ? `Requisitos disponíveis: ${details.join(", ")}.` : "Sem requisito material adicional.", details, waterCost, tabletCost, fuelCost };
}

function removeNamedUnits(game: GameState, ownerId: string, name: string, quantity: number) {
  let remaining = quantity;
  for (const items of accessContainers(game, ownerId)) {
    for (const item of [...items]) {
      if (item.name !== name || remaining < 1) continue;
      const take = Math.min(remaining, item.qty);
      item.qty -= take; remaining -= take;
      if (item.qty <= 0) items.splice(items.indexOf(item), 1);
    }
  }
  return remaining === 0;
}
function consumeHolderWater(holder: { water: number; provisionLots?: any[]; inventory?: InventoryItem[] }, quantity: number) {
  let remaining = quantity;
  const loose = Math.min(remaining, Math.max(0, holder.water ?? 0));
  if (loose > 0) { withdrawPortions(holder as any, "water", loose); remaining -= loose; }
  if (remaining > 0) remaining -= consumeReadyProvisionPortions(holder.inventory, "water", remaining).consumed;
  return remaining;
}
function payPreparationCosts(game: GameState, ownerId: string, check: PreparationCheck) {
  let waterRemaining = check.waterCost;
  const holder = ownerHolder(game, ownerId);
  if (holder && waterRemaining > 0) waterRemaining = consumeHolderWater(holder, waterRemaining);
  if (ownerId !== "shared" && waterRemaining > 0 && atSharedStorage(game, ownerId))
    waterRemaining = consumeHolderWater(game.shelter, waterRemaining);
  if (waterRemaining > 0) return false;
  if (check.tabletCost > 0 && !removeNamedUnits(game, ownerId, "Pastilhas de purificação", check.tabletCost)) return false;
  if (check.fuelCost > 0) {
    if (!removeNamedUnits(game, ownerId, "Combustível (1 unidade)", check.fuelCost)) {
      if ((ownerId === "shared" || atSharedStorage(game, ownerId)) && game.shelter.fuel >= check.fuelCost) game.shelter.fuel -= check.fuelCost;
      else return false;
    }
  }
  return true;
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
  const fromPerson = from === "shared" ? null : game.survivors.find(person => person.id === from);
  const toPerson = to === "shared" ? null : game.survivors.find(person => person.id === to);
  if (!Number.isInteger(quantity) || quantity < 1 || from === to
    || (sharedSurvivor && !atSharedStorage(game, sharedSurvivor))
    || (fromPerson && toPerson && survivorHex(game, fromPerson) !== survivorHex(game, toPerson))) return false;
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
  if (item.category === "Trajes e acessórios" || catalogForItem(item)?.category === "Trajes e acessórios") slots.push("outfit");
  if (["Bolsa tiracolo", "Mochila urbana", "Mochila de trilha", "Mochila cargueira"].includes(name)) slots.push("bag");
  if (name === "Carrinho dobrável") slots.push("transport");
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
  const entry = content.catalog.find(x => x.name === name
    && (slot !== "bag" || x.category === "Abrigo, transporte e mochilas")
    && (slot !== "outfit" || x.category === "Trajes e acessórios")
    && (slot !== "transport" || x.category === "Abrigo, transporte e mochilas"));
  const field = entry?.fields.find(x => ["Guarda", "Carga", "Carga em viagem"].includes(x.label))?.value;
  return Number(field?.match(/^\d+/)?.[0] ?? 1);
}
export function stowSlot(s: Survivor, slot: EquipmentSlot) {
  const name = s[slot];
  if (!name) return false;
  if (slot === "personal" && s.bag === name) return stowSlot(s, "bag");
  const entry = content.catalog.find(x => x.name === name
    && (slot !== "bag" || x.category === "Abrigo, transporte e mochilas")
    && (slot !== "outfit" || x.category === "Trajes e acessórios")
    && (slot !== "transport" || x.category === "Abrigo, transporte e mochilas"));
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
    // This legacy helper answers whether the item is usable as a provision;
    // spoiled/contaminated food stays in the inventory for disposal only.
    type: info.ready ? info.resource : null,
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
  const count = Math.max(1, Math.min(item.qty, Math.trunc(quantity)));
  const check = provisionPreparationCheck(game, ownerId, item, count);
  if (!check.ok) return null;
  // Split only after all requirements are known; costs are paid immediately before state changes.
  const target = splitInventoryUnits(items, item, count);
  if (!target || !payPreparationCosts(game, ownerId, check)) return null;
  if (before.requiresPreparation) {
    target.prepared = true;
    target.expiresDay = game.day + 1;
  }
  if (before.requiresVerification) target.verified = true;
  const after = provisionItemInfo(target);
  return after.ready ? { item: target, info: after, requirements: check.details } : null;
}

export function consumeProvisionPortionFromItems(items: InventoryItem[], itemId: string) {
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
  if (ownerId === "shared" && (!atSharedStorage(game) || (consumerId && !atSharedStorage(game, consumerId)))) return null;
  const items = container(game, ownerId);
  if (!items) return null;
  const result = consumeProvisionPortionFromItems(items, itemId);
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
    const result = consumeProvisionPortionFromItems(items, next.id);
    if (!result) break;
    labels.push(result.name);
    remaining -= 1;
  }
  return { consumed: Math.max(0, Math.trunc(quantity)) - remaining, labels };
}

export type Provision = "food" | "water" | "ammo";
function transferAmmoType(game: GameState, from: string, requested?: string): string {
  if (from === "shared") return requested && ammunitionTypes.includes(requested as AmmunitionType) ? requested : "Pistola";
  const source = game.survivors.find(s => s.id === from);
  return source ? ammoTypeFor(source) : "Indefinida";
}
export function provisionTransferError(game: GameState, from: string, to: string, resource: Provision, quantity: number, requestedAmmoType?: string): string | null {
  if (!Number.isInteger(quantity) || quantity < 1) return "Informe uma quantidade inteira maior que zero.";
  if (!to || from === to) return "Escolha dois destinos diferentes.";
  const sharedSurvivor = sharedAccessSurvivor(from, to);
  if (sharedSurvivor && !atSharedStorage(game, sharedSurvivor))
    return "Esse sobrevivente precisa estar no mesmo hex das reservas compartilhadas.";
  const source = from === "shared" ? game.shelter : game.survivors.find(s => s.id === from);
  const target = to === "shared" ? game.shelter : game.survivors.find(s => s.id === to);
  if (!source || !target) return "Sobrevivente não encontrado.";
  if (from !== "shared" && to !== "shared"
    && survivorHex(game, source as Survivor) !== survivorHex(game, target as Survivor))
    return "Os sobreviventes precisam estar no mesmo hex para transferir recursos.";

  if (resource === "ammo") {
    const type = transferAmmoType(game, from, requestedAmmoType);
    if (!ammunitionTypes.includes(type as AmmunitionType)) return "Identifique o tipo de munição da origem antes de transferir.";
    const available = from === "shared" ? shelterAmmoCount(game.shelter, type as AmmunitionType) : (source as Survivor).ammo;
    const receiving = to === "shared" ? shelterAmmoCount(game.shelter, type as AmmunitionType) : (target as Survivor).ammo;
    if (available < quantity) return `A origem não tem ${quantity} carga(s) de ${type}.`;
    if (receiving + quantity > 99) return "O destino atingiria o limite do contador.";
    if (to !== "shared") {
      const targetType = ammoTypeFor(target as Survivor);
      if (receiving > 0 && targetType !== type) return `Não é possível misturar ${type} e ${targetType} no mesmo contador.`;
    }
    return null;
  }

  const available = (source as Survivor)[resource];
  const receiving = (target as Survivor)[resource];
  if (available < quantity) return "A origem não tem essa quantidade disponível.";
  if (receiving + quantity > (to === "shared" ? 999 : 99)) return "O destino atingiria o limite do contador.";
  return null;
}

export function transferProvisions(game: GameState, from: string, to: string, resource: Provision, quantity: number, requestedAmmoType?: string) {
  if (provisionTransferError(game, from, to, resource, quantity, requestedAmmoType)) return false;
  const source = from === "shared" ? game.shelter : game.survivors.find(s => s.id === from)!;
  const target = to === "shared" ? game.shelter : game.survivors.find(s => s.id === to)!;
  if (resource === "ammo") {
    const type = transferAmmoType(game, from, requestedAmmoType) as AmmunitionType;
    if (from === "shared") setShelterAmmoCount(game.shelter, type, shelterAmmoCount(game.shelter, type) - quantity);
    else (source as Survivor).ammo -= quantity;
    if (to === "shared") setShelterAmmoCount(game.shelter, type, shelterAmmoCount(game.shelter, type) + quantity);
    else {
      (target as Survivor).ammo += quantity;
      (target as Survivor).ammoType = type;
    }
  } else transferPortionLots(source, target, resource, quantity);
  return true;
}
export function countsAsMedication(item: InventoryItem) {
  const entry = catalogForItem(item);
  return entry?.category === "Medicamentos e cuidado"
    && /1 unidade de Medicamentos/i.test(entry.fields.find(f => f.label === "Uso em jogo")?.value ?? "");
}
