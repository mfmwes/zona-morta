import { addLog, ammunitionTypes, type AmmunitionType, type GameState, type InventoryItem, type NPC, type Survivor } from "./game";

export function projectPlayerGame(game: GameState, survivorId: string): GameState {
  const visible = structuredClone(game);
  visible.log = visible.log.map(entry => {
    const actor = entry.actorId ? game.survivors.find(person => person.id === entry.actorId) : null;
    return actor ? { ...entry, actorName: entry.actorName ?? actor.name, actorPortrait: entry.actorPortrait ?? actor.portrait } : entry;
  });
  visible.survivors = visible.survivors.filter(person => person.id === survivorId);
  // The player projection intentionally omits private GM notes, the NPC's home
  // and consumption bookkeeping. Public notes are the explicit sharing channel.
  visible.npcs = (visible.npcs ?? []).map(npc => ({
    id: npc.id, name: npc.name, portrait: npc.portrait, role: npc.role, description: npc.description,
    publicNotes: npc.publicNotes, hex: npc.hex, status: npc.status, infection: npc.infection,
    disposition: npc.disposition, skills: npc.skills, duty: npc.duty, active: npc.active,
    accompaniesParty: npc.accompaniesParty,
  } as NPC));
  // Improvements are public infrastructure, but staff assignments, paid costs
  // and any future private annotations stay on the GM projection.
  visible.shelter.projects = (visible.shelter.projects ?? []).map(project => ({
    id: project.id, key: project.key, name: project.name, category: project.category, state: project.state,
    progress: project.progress, requiredProgress: project.requiredProgress,
    requiredCapabilities: project.requiredCapabilities, effects: project.effects, costs: {}, helperIds: [],
  }));
  visible.shelter.posts = [];
  visible.shelter.manualAdjustments = { security: 0, energy: 0, comfort: 0 };
  visible.shelter.notes = "";
  visible.formerShelters = [];
  // A ficha do jogador mantém apenas o próprio histórico e o chat. Resultados
  // de outra ficha não precisam ser enviados para que a mesa os narre.
  visible.log = visible.log.filter(entry => entry.kind === "chat" || entry.actorId === survivorId);
  for (const hex of Object.values(visible.hexes)) {
    hex.notes = "";
    hex.infestation = null;
    if (hex.discovery === "desconhecido") {
      hex.sector = null; hex.signs = ""; hex.points = []; hex.events = [];
      continue;
    }
    hex.points = hex.points.filter(point => point.revealed).map(point => ({
      ...point, notes: "", access: "", searches: [],
    }));
    hex.events = hex.events.filter(event => event.revealed).map(event => ({ ...event, trigger: "" }));
  }
  return visible;
}

const immutable = ["id", "name", "level", "proficiency", "origin", "past", "archetype", "specialty", "hex",
  "attributes", "freeExperience", "techniques", "infection", "exposureDeadline", "treatmentAttempted", "terminalScenes"] as const;
const editable = ["portrait", "primary", "secondary", "protection", "outfit", "personal", "bag", "transport", "pocket1", "pocket2", "equippedItems", "kitCondition",
  "hp", "armorMarked", "stress", "hope", "food", "water", "foodConsumedDay", "waterConsumedDay", "provisionLots",
  "ammo", "ammoType", "ammoSpentScene", "ammoSpentType", "ammoSpentTypes", "inventory", "notes", "abilityUses", "restPlan"] as const;
const allowedKeys = new Set<string>([...immutable, ...editable]);
const allowedItemKeys = new Set(["id", "name", "load", "qty", "condition", "catalogKey", "category", "armorMarked", "foundDay",
  "provisionResource", "portionsPerUnit", "portionsRemaining", "prepared", "verified", "opened", "expiresDay", "battery", "storedResource", "storedAmount", "cartDeployed", "cartItems"]);
function validInventoryItem(item: InventoryItem, nested = false): boolean {
  return Boolean(item && typeof item.id === "string" && typeof item.name === "string"
    && Object.keys(item).every(key => allowedItemKeys.has(key))
    && item.name.length <= 100 && Number.isInteger(item.qty) && item.qty >= 1 && item.qty <= 99
    && Number.isInteger(item.load) && item.load >= 0 && item.load <= 9
    && (item.provisionResource === undefined || ["food", "water"].includes(item.provisionResource))
    && (item.portionsPerUnit === undefined || (Number.isInteger(item.portionsPerUnit) && item.portionsPerUnit >= 1 && item.portionsPerUnit <= 99))
    && (item.portionsRemaining === undefined || (Number.isInteger(item.portionsRemaining) && item.portionsRemaining >= 1
      && item.portionsRemaining <= (item.portionsPerUnit ?? 99) && item.qty === 1))
    && (item.prepared === undefined || typeof item.prepared === "boolean")
    && (item.verified === undefined || typeof item.verified === "boolean")
    && (item.opened === undefined || typeof item.opened === "boolean")
    && (item.expiresDay === undefined || (Number.isInteger(item.expiresDay) && item.expiresDay >= 1 && item.expiresDay <= 9999))
    && (item.battery === undefined || ["Carregada", "Descarregada"].includes(item.battery))
    && (item.storedResource === undefined || ["water", "fuel"].includes(item.storedResource))
    && (item.storedAmount === undefined || (Number.isInteger(item.storedAmount) && item.storedAmount >= 1 && item.storedAmount <= 4))
    && (item.storedResource !== "fuel" || (item.storedAmount ?? 0) <= 1)
    && ((item.storedResource === undefined) === (item.storedAmount === undefined))
    && (item.cartDeployed === undefined || (!nested && item.name === "Carrinho dobrável" && typeof item.cartDeployed === "boolean"))
    && (item.cartItems === undefined || (!nested && item.name === "Carrinho dobrável" && Array.isArray(item.cartItems)
      && item.cartItems.length <= 40 && item.cartItems.every(child => validInventoryItem(child, true)))));
}

export type PlayerLog = { kind: string; text: string };

const restActions = new Set(["hp", "stress", "armor", "prepare", "fiction", "hp-full", "stress-full", "armor-full"]);
function validRestPlan(plan: Survivor["restPlan"], survivors: Survivor[], actor: Survivor, partyHex: string) {
  if (plan === undefined) return true;
  const validActions = plan.kind === "short"
    ? new Set(["hp", "stress", "armor", "prepare", "fiction"])
    : new Set(["hp-full", "stress-full", "armor-full", "prepare", "fiction"]);
  const actorHex = actor.hex ?? partyHex;
  return Boolean(plan && (plan.kind === "short" || plan.kind === "long") && Array.isArray(plan.choices) && plan.choices.length === 2
    && plan.choices.every(choice => {
      const target = survivors.find(person => person.id === choice.targetId);
      return Boolean(choice && Object.keys(choice).every(key => key === "action" || key === "targetId")
        && typeof choice.action === "string" && restActions.has(choice.action) && validActions.has(choice.action)
        && typeof choice.targetId === "string" && target && (target.hex ?? partyHex) === actorHex);
    }));
}

export function playerEditPayload(before: GameState, after: GameState) {
  const rest = (state: GameState) => JSON.stringify({ ...state, survivors: [], fear: 0, noise: 0, log: [] });
  const fearDelta = after.fear - before.fear;
  const noiseDelta = after.noise - before.noise;
  if (before.survivors.length !== 1 || after.survivors.length !== 1
    || after.survivors[0].id !== before.survivors[0].id || rest(before) !== rest(after)
    || !Number.isInteger(fearDelta) || fearDelta < 0 || fearDelta > 1
    || !Number.isInteger(noiseDelta) || noiseDelta < 0 || noiseDelta > 5 || after.noise > 5) return null;
  const logs = after.log.filter(entry => !before.log.some(prior => prior.id === entry.id))
    .map(entry => ({ kind: entry.kind, text: entry.text }));
  if (logs.length > 3) return null;
  return { before: before.survivors[0], after: after.survivors[0], fearDelta, noiseDelta, logs };
}

export function applyPlayerChange(game: GameState, survivorId: string, before: Survivor, after: Survivor,
  fearDelta: number, logs: PlayerLog[], noiseDelta = 0): GameState | null {
  const person = game.survivors.find(s => s.id === survivorId);
  if (!person || before?.id !== survivorId || after?.id !== survivorId || JSON.stringify(person) !== JSON.stringify(before)
    || !Number.isInteger(fearDelta) || fearDelta < 0 || fearDelta > 1
    || !Number.isInteger(noiseDelta) || noiseDelta < 0 || noiseDelta > 5 || game.noise + noiseDelta > 5
    || !Array.isArray(logs) || logs.length > 3
    || (fearDelta === 1 && !logs.some(log => log?.kind === "dados"))
    || !Object.keys(after).every(key => allowedKeys.has(key))
    || immutable.some(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    || !Number.isInteger(after.hp) || after.hp < 0 || after.hp > 20
    || !Number.isInteger(after.armorMarked) || after.armorMarked < 0 || after.armorMarked > 20
    || !Number.isInteger(after.stress) || after.stress < 0 || after.stress > 6
    || !Number.isInteger(after.hope) || after.hope < 0 || after.hope > 6
    || ![after.food, after.water, after.ammo].every(value => Number.isInteger(value) && value >= 0 && value <= 99)
    || (after.outfit !== undefined && typeof after.outfit !== "string")
    || (after.transport !== undefined && typeof after.transport !== "string")
    || (after.ammoSpentScene !== undefined && (!Number.isInteger(after.ammoSpentScene) || after.ammoSpentScene < 1))
    || (after.ammoSpentType !== undefined && typeof after.ammoSpentType !== "string")
    || (after.ammoSpentTypes !== undefined && (!Array.isArray(after.ammoSpentTypes)
      || after.ammoSpentTypes.length > ammunitionTypes.length
      || after.ammoSpentTypes.some(type => !ammunitionTypes.includes(type as AmmunitionType))))
    || !Array.isArray(after.inventory) || after.inventory.length > 120
    || after.inventory.some(item => !validInventoryItem(item))
    || typeof after.notes !== "string" || after.notes.length > 4000
    || !validRestPlan(after.restPlan, game.survivors, after, game.partyHex)
    || logs.some(log => !log || !["chat", "dados", "dano", "inventário", "habilidade", "provisões", "tratamento"].includes(log.kind)
      || typeof log.text !== "string" || log.text.length > 600)) return null;
  const next = structuredClone(game);
  const index = next.survivors.findIndex(s => s.id === survivorId);
  next.survivors[index] = structuredClone(after);
  next.fear = Math.min(12, next.fear + fearDelta);
  next.noise = Math.min(5, next.noise + noiseDelta);
  for (const log of [...logs].reverse()) addLog(next, log.kind, log.text, survivorId);
  return next;
}
