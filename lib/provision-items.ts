import content from "./content.json";
import type { InventoryItem } from "./game";

export type ProvisionResource = "food" | "water";

export function provisionShelfLabel(code: string | undefined) {
  switch (code?.trim().toUpperCase()) {
    case "D": return "Durável";
    case "F": return "Fresco · vence no segundo amanhecer";
    case "R": return "Refrigerado/preparado · vence no próximo amanhecer";
    case "C": return "Congelado · exige frio contínuo";
    default: return code || "Sem prazo específico";
  }
}
type CatalogEntry = (typeof content.catalog)[number];
type ProvisionHolder = { food: number; water: number; inventory?: InventoryItem[] };

function catalogFor(item: InventoryItem): CatalogEntry | undefined {
  return content.catalog.find(entry => `${entry.category}::${entry.name}` === item.catalogKey)
    ?? content.catalog.find(entry => entry.name === item.name && (!item.category || entry.category === item.category));
}

function definition(entry: CatalogEntry | undefined) {
  const resource: ProvisionResource | null = entry?.category === "Alimentos" ? "food"
    : entry?.category === "Bebidas" ? "water" : null;
  if (!resource || !entry) return null;

  const label = resource === "food" ? "Porções" : "Água em jogo";
  const description = entry.fields.find(field => field.label === label)?.value ?? "";
  const listed = Number(description.match(/\d+/)?.[0] ?? 0);
  const requiresVerification = resource === "water"
    && /verific|examinar|identificar|tratad|tornar utilizável/i.test(description);
  const portions = listed > 0 ? listed : requiresVerification ? 1 : 0;
  if (portions < 1) return null;

  const preparation = entry.fields.find(field => field.label === "Preparo")?.value;
  const requiresPreparation = resource === "food" && Boolean(preparation && !/^Pronto/i.test(preparation));
  const requiresIntact = /se íntegr[ao]/i.test(preparation ?? "");
  const shelf = entry.fields.find(field => field.label === "Prazo")?.value;
  return { resource, portions, description, preparation, shelf, requiresVerification, requiresPreparation, requiresIntact };
}

export function provisionItemInfo(item: InventoryItem) {
  const def = definition(catalogFor(item));
  const resource = item.provisionResource ?? def?.resource ?? null;
  const portionsPerUnit = Math.max(0, Math.trunc(item.portionsPerUnit ?? def?.portions ?? 0));
  const requiresVerification = def?.requiresVerification ?? false;
  const requiresPreparation = def?.requiresPreparation ?? false;
  const prepared = item.prepared ?? !requiresPreparation;
  const verified = item.verified ?? !requiresVerification;
  const remaining = resource && portionsPerUnit > 0
    ? Math.max(0, Math.trunc(item.portionsRemaining ?? item.qty * portionsPerUnit)) : 0;
  const spoiled = item.condition === "Estragado";
  const contaminated = item.condition === "Contaminado";
  const intactOk = !(def?.requiresIntact) || item.condition === "Íntegro";
  const ready = Boolean(resource && remaining > 0 && prepared && verified && !spoiled && !contaminated && intactOk);

  let status = "Não é provisão";
  if (resource) {
    status = spoiled ? "Estragado"
      : contaminated ? "Contaminado"
      : requiresVerification && !verified ? "Aguardando verificação"
      : requiresPreparation && !prepared ? "Requer preparo"
      : !intactOk ? "Embalagem comprometida"
      : ready ? "Pronto para consumo"
      : "Indisponível";
  }

  return {
    resource,
    portionsPerUnit,
    remaining,
    ready,
    status,
    prepared,
    verified,
    requiresPreparation,
    requiresVerification,
    preparation: def?.preparation,
    shelf: def?.shelf,
    expiresDay: item.expiresDay ?? null,
    opened: Boolean(item.opened),
  };
}

export function hydrateProvisionItem(item: InventoryItem): InventoryItem {
  const info = provisionItemInfo(item);
  if (!info.resource || info.portionsPerUnit < 1) return item;
  return {
    ...item,
    provisionResource: info.resource,
    portionsPerUnit: info.portionsPerUnit,
    prepared: info.prepared,
    verified: info.verified,
  };
}

export function itemPortionsRemaining(item: InventoryItem) {
  return provisionItemInfo(item).remaining;
}

export function physicalProvisionPortions(items: InventoryItem[] | undefined, resource: ProvisionResource, readyOnly = false) {
  return (items ?? []).reduce((sum, item) => {
    const info = provisionItemInfo(item);
    if (info.resource !== resource || (readyOnly && !info.ready)) return sum;
    return sum + info.remaining;
  }, 0);
}

export function groupedProvisionPortions(items: InventoryItem[] | undefined, resource: ProvisionResource) {
  return (items ?? []).reduce((sum, item) => {
    if (item.load !== 0) return sum;
    const info = provisionItemInfo(item);
    if (info.resource === resource) return sum + info.remaining;
    const category = item.category ?? catalogFor(item)?.category;
    if (!info.resource && resource === "food" && category === "Alimentos") return sum + Math.max(1, item.qty);
    if (!info.resource && resource === "water" && category === "Bebidas") return sum + Math.max(1, item.qty);
    return sum;
  }, 0);
}

export function provisionBreakdown(holder: ProvisionHolder, resource: ProvisionResource) {
  const loose = Math.max(0, Math.trunc(holder[resource] ?? 0));
  const itemsReady = physicalProvisionPortions(holder.inventory, resource, true);
  const itemsPhysical = physicalProvisionPortions(holder.inventory, resource, false);
  return {
    loose,
    itemsReady,
    itemsWaiting: Math.max(0, itemsPhysical - itemsReady),
    total: loose + itemsReady,
    physicalTotal: itemsPhysical,
  };
}

export function provisionDisplay(item: InventoryItem) {
  const info = provisionItemInfo(item);
  if (!info.resource) return null;
  const noun = info.resource === "food" ? "Comida" : "Água";
  const quantity = item.portionsRemaining !== undefined && item.qty === 1
    ? `${info.remaining}/${info.portionsPerUnit} porção(ões) restantes`
    : item.qty > 1
      ? `${info.remaining} porção(ões) em ${item.qty} unidade(s) · ${info.portionsPerUnit} por unidade`
      : `${info.remaining}/${info.portionsPerUnit} porção(ões)`;
  return `${noun} · ${quantity} · ${info.status}`;
}
