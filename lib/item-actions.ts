import { addLog, content, survivorHex, type EquipmentSlot, type GameState, type InventoryItem } from "./game";
import {
  addStack,
  activeCart,
  atSharedStorage,
  batteryTargets,
  catalogForItem,
  catalogItemCanUse,
  catalogItemIsConsumable,
  compatibleSlots,
  consumeProvisionItem,
  countsAsMedication,
  discardItem,
  deployCart,
  displacedSlots,
  emptyReusableContainerToReserves,
  equipItem,
  fillReusableContainer,
  foldCart,
  itemFromCatalog,
  prepareProvisionItem,
  removeFromCart,
  reusableContainerOptions,
  setBatteryState,
  storeInCart,
  transferItem,
} from "./inventory";
import { provisionItemInfo } from "./provision-items";

export type ItemAction =
  | { type: "transfer"; targetId: string; quantity: number }
  | { type: "equip"; slot: EquipmentSlot }
  | { type: "consume"; consumerId?: string }
  | { type: "prepare"; quantity: number }
  | { type: "use"; quantity: number }
  | { type: "recharge"; targetId: string }
  | { type: "fill-container"; resource: "water" | "fuel"; quantity: number }
  | { type: "empty-container" }
  | { type: "deploy-cart" }
  | { type: "fold-cart" }
  | { type: "cart-store"; quantity: number }
  | { type: "cart-remove"; nestedItemId: string; quantity: number }
  | { type: "medication"; quantity: number }
  | { type: "stock"; quantity: number }
  | { type: "discard"; quantity: number };

type StockResource = "medications" | "fuel" | "parts";

export function inventoryOwnerName(game: GameState, id: string) {
  return id === "shared"
    ? (game.shelter.hex ? "Depósito do abrigo" : "Reservas do grupo")
    : game.survivors.find(person => person.id === id)?.name ?? "Sobrevivente";
}

function stockResourceFor(item: InventoryItem): StockResource | undefined {
  if (item.category !== "Suprimentos abstratos") return undefined;
  return ({
    "Medicamentos (1 unidade)": "medications",
    "Combustível (1 unidade)": "fuel",
    "Peças (1 unidade)": "parts",
  } as const)[item.name as "Medicamentos (1 unidade)" | "Combustível (1 unidade)" | "Peças (1 unidade)"];
}

export function itemActionOptions(game: GameState, ownerId: string, item: InventoryItem, selfOnly = false) {
  const slots = ownerId === "shared" ? [] : compatibleSlots(item);
  const owner = game.survivors.find(person => person.id === ownerId);
  const targets = selfOnly ? [] : [
    ...game.survivors
      .filter(person => person.id !== ownerId)
      .filter(person => ownerId === "shared"
        ? atSharedStorage(game, person.id)
        : Boolean(owner && survivorHex(game, person) === survivorHex(game, owner)))
      .map(person => ({ value: person.id, label: person.name })),
    ...(ownerId !== "shared" && atSharedStorage(game, ownerId)
      ? [{ value: "shared", label: inventoryOwnerName(game, "shared") }]
      : []),
  ];
  const provision = provisionItemInfo(item);
  const current = catalogForItem(item);
  const rechargeTargets = item.name === "Kit de pilhas"
    ? batteryTargets(game, ownerId).filter(target => target.battery === "Descarregada")
    : [];
  const containerOptions = reusableContainerOptions(game, ownerId, item);
  const canUse = catalogItemCanUse(item) && item.name !== "Kit de pilhas";
  const stockResource = stockResourceFor(item);
  const cart = owner ? activeCart(owner) : null;
  const cartContents = item.name === "Carrinho dobrável" ? item.cartItems ?? [] : [];
  const cartLoad = item.name === "Carrinho dobrável"
    ? cartContents.reduce((sum, entry) => sum + Math.max(0, entry.load) * Math.max(0, entry.qty), 0)
    : 0;

  return {
    slots,
    targets,
    provision,
    rechargeTargets,
    containerOptions,
    canUse,
    canDeployCart: Boolean(owner && item.name === "Carrinho dobrável" && !item.cartDeployed && !cart),
    canFoldCart: Boolean(owner && item.name === "Carrinho dobrável" && item.cartDeployed && cartContents.length === 0),
    cartFoldBlocked: Boolean(owner && item.name === "Carrinho dobrável" && item.cartDeployed && cartContents.length > 0),
    canStoreInCart: Boolean(owner && cart && cart.id !== item.id),
    cart,
    cartLoad,
    canMedication: !selfOnly && countsAsMedication(item) && (ownerId === "shared" ? atSharedStorage(game) : atSharedStorage(game, ownerId)),
    canStock: !selfOnly && Boolean(stockResource) && (ownerId === "shared" ? atSharedStorage(game) : atSharedStorage(game, ownerId)),
    stockResource,
  };
}

export function performItemAction(game: GameState, ownerId: string, itemId: string, action: ItemAction) {
  const source = ownerId === "shared" ? game.shelter.inventory ?? [] : game.survivors.find(person => person.id === ownerId)?.inventory ?? [];
  const item = source.find(entry => entry.id === itemId);
  const person = game.survivors.find(entry => entry.id === ownerId);
  const owner = inventoryOwnerName(game, ownerId);
  if (!item || (ownerId === "shared" && !atSharedStorage(game))) return { ok: false, message: "" };

  let message = "";

  if (action.type === "transfer") {
    const count = Math.max(1, Math.min(item.qty, Math.trunc(action.quantity)));
    if (transferItem(game, ownerId, action.targetId, item.id, count)) {
      message = `${owner} → ${inventoryOwnerName(game, action.targetId)}: ${count}× ${item.name}.`;
    }
  } else if (action.type === "equip" && person) {
    const displaced = displacedSlots(person, item, action.slot).map(slot => person[slot]).filter(Boolean);
    if (equipItem(person, item.id, action.slot)) {
      message = `${person.name} equipou ${item.name}.${displaced.length ? ` Guardou: ${displaced.join(", ")}.` : ""}`;
    }
  } else if (action.type === "deploy-cart" && person) {
    if (deployCart(person, item.id)) {
      message = `${person.name} abriu o Carrinho dobrável e liberou as duas mãos para conduzi-lo. Armas empunhadas foram guardadas.`;
    }
  } else if (action.type === "fold-cart" && person) {
    if (foldCart(person, item.id)) {
      message = `${person.name} dobrou o Carrinho dobrável. Guardado, ele volta a ocupar 1 espaço de carga.`;
    }
  } else if (action.type === "cart-store" && person) {
    const count = Math.max(1, Math.min(item.qty, Math.trunc(action.quantity)));
    if (storeInCart(person, item.id, count)) {
      message = `${person.name} colocou ${count}× ${item.name} no Carrinho dobrável.`;
    }
  } else if (action.type === "cart-remove" && person) {
    const cart = source.find(entry => entry.id === item.id && entry.name === "Carrinho dobrável");
    const nested = cart?.cartItems?.find(entry => entry.id === action.nestedItemId);
    const count = nested ? Math.max(1, Math.min(nested.qty, Math.trunc(action.quantity))) : 0;
    const nestedName = nested?.name ?? "item";
    if (count > 0 && removeFromCart(person, item.id, action.nestedItemId, count)) {
      message = `${person.name} retirou ${count}× ${nestedName} do Carrinho dobrável.`;
    }
  } else if (action.type === "consume") {
    const consumed = consumeProvisionItem(game, ownerId, item.id, action.consumerId);
    if (consumed) {
      const consumer = action.consumerId
        ? game.survivors.find(entry => entry.id === action.consumerId)
        : person;
      message = `${consumer?.name ?? owner} consumiu 1 porção de ${item.name}.` +
        (consumed.remainingInOpenedUnit > 0
          ? ` Restam ${consumed.remainingInOpenedUnit} porção(ões) na unidade aberta.`
          : "");
    }
  } else if (action.type === "prepare") {
    const count = Math.max(1, Math.min(item.qty, Math.trunc(action.quantity)));
    const before = provisionItemInfo(item);
    const prepared = prepareProvisionItem(game, ownerId, item.id, count);
    if (prepared) {
      message = `${owner}: ${count}× ${item.name} ` +
        (before.requiresVerification ? "foi verificado/tratado" : "foi preparado") +
        " e permanece como item físico no inventário." +
        (prepared.requirements?.length ? ` Requisitos usados: ${prepared.requirements.join(", ")}.` : "");
    }
  } else if (action.type === "use") {
    const consumable = catalogItemIsConsumable(item);
    const count = consumable ? Math.max(1, Math.min(item.qty, Math.trunc(action.quantity))) : 1;
    const used = consumable ? discardItem(game, ownerId, item.id, count) : catalogItemCanUse(item);
    if (used) {
      const noisePerUse = item.name === "Sinalizador de mão" ? 2 : item.name === "Apito" ? 1 : 0;
      const noise = noisePerUse * (consumable ? count : 1);
      if (noise) game.noise = Math.min(5, game.noise + noise);
      message = `${owner} usou ${consumable && count > 1 ? `${count}× ` : ""}${item.name}.` +
        (consumable ? " A unidade foi consumida." : " O item permanece disponível.") +
        (noise ? ` Barulho +${noise}.` : " Aplicar o efeito indicado pelo item em cena.");
    }
  } else if (action.type === "recharge") {
    const target = batteryTargets(game, ownerId).find(candidate => candidate.id === action.targetId && candidate.battery === "Descarregada");
    if (item.name === "Kit de pilhas" && target && discardItem(game, ownerId, item.id, 1)
      && setBatteryState(game, ownerId, target.id, "Carregada")) {
      message = `${owner} usou Kit de pilhas em ${target.name}. Bateria registrada como carregada.`;
    }
  } else if (action.type === "fill-container") {
    const filled = fillReusableContainer(game, ownerId, item.id, action.resource, action.quantity);
    if (filled) {
      const label = action.resource === "water" ? "Água" : "Combustível";
      message = `${owner} colocou ${action.quantity} ${action.resource === "water" ? "porção(ões)" : "unidade(s)"} de ${label} em ${filled.name}. O conteúdo não adiciona carga além do recipiente.`;
    }
  } else if (action.type === "empty-container") {
    const resource = item.storedResource;
    const amount = item.storedAmount ?? 0;
    if (emptyReusableContainerToReserves(game, ownerId, item.id)) {
      message = `${owner} devolveu ${amount} ${resource === "water" ? "porção(ões) de Água" : "unidade(s) de Combustível"} às reservas compartilhadas; o galão ficou vazio.`;
    }
  } else if (action.type === "medication") {
    const count = Math.max(1, Math.min(item.qty, Math.trunc(action.quantity)));
    if (countsAsMedication(item) && (ownerId === "shared" ? atSharedStorage(game) : atSharedStorage(game, ownerId)) && game.shelter.medications + count <= 99
      && discardItem(game, ownerId, item.id, count)) {
      game.shelter.medications += count;
      if (item.name === "Caixa clínica completa") {
        const kit = content.catalog.find(entry => entry.category === "Medicamentos e cuidado" && entry.name === "Kit médico de campo");
        if (kit) addStack(source, itemFromCatalog(kit, count, "Íntegro", game.day));
      }
      message = `${owner} guardou ${count}× ${item.name} como ${count} unidade(s) de Medicamentos nas reservas compartilhadas.` +
        (item.name === "Caixa clínica completa" ? " O estojo reutilizável permaneceu como Kit médico de campo." : "");
    }
  } else if (action.type === "stock") {
    const count = Math.max(1, Math.min(item.qty, Math.trunc(action.quantity)));
    const resource = stockResourceFor(item);
    if (resource && (ownerId === "shared" ? atSharedStorage(game) : atSharedStorage(game, ownerId)) && game.shelter[resource] + count <= 99
      && discardItem(game, ownerId, item.id, count)) {
      game.shelter[resource] += count;
      message = `${owner} guardou ${count} unidade(s) de ${item.name} nas reservas compartilhadas.`;
    }
  } else if (action.type === "discard") {
    const count = Math.max(1, Math.min(item.qty, Math.trunc(action.quantity)));
    if (discardItem(game, ownerId, item.id, count)) {
      const location = person ? survivorHex(game, person) : (game.shelter.hex ?? game.partyHex);
      message = `${owner} deixou para trás ${count}× ${item.name} no hex ${location}.`;
    }
  }

  if (!message) return { ok: false, message: "" };
  addLog(game, "inventário", message, person?.id);
  return { ok: true, message };
}
