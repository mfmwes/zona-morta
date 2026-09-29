import { addLog, type GameState, type Survivor } from "./game";

export function projectPlayerGame(game: GameState, survivorId: string): GameState {
  const visible = structuredClone(game);
  visible.survivors = visible.survivors.filter(person => person.id === survivorId);
  visible.shelter.notes = "";
  visible.formerShelters = [];
  // O jogador vê o próprio histórico e as rolagens públicas feitas por outros
  // sobreviventes. Rolagens livres do mestre (sem actorId) continuam reservadas.
  visible.log = visible.log.filter(entry => entry.actorId === survivorId
    || (Boolean(entry.actorId) && ["dados", "dano"].includes(entry.kind)));
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

const immutable = ["id", "name", "level", "proficiency", "origin", "past", "archetype", "specialty",
  "attributes", "freeExperience", "techniques", "infection", "exposureDeadline", "treatmentAttempted", "terminalScenes"] as const;
const editable = ["portrait", "primary", "secondary", "protection", "personal", "bag", "pocket1", "pocket2", "equippedItems", "kitCondition",
  "hp", "armorMarked", "stress", "hope", "food", "water", "foodConsumedDay", "waterConsumedDay", "provisionLots",
  "ammo", "ammoType", "inventory", "notes", "abilityUses"] as const;
const allowedKeys = new Set<string>([...immutable, ...editable]);
const allowedItemKeys = new Set(["id", "name", "load", "qty", "condition", "catalogKey", "category", "armorMarked", "foundDay",
  "provisionResource", "portionsPerUnit", "portionsRemaining", "prepared", "verified", "opened", "expiresDay"]);
export type PlayerLog = { kind: string; text: string };

export function playerEditPayload(before: GameState, after: GameState) {
  const rest = (state: GameState) => JSON.stringify({ ...state, survivors: [], fear: 0, log: [] });
  const fearDelta = after.fear - before.fear;
  if (before.survivors.length !== 1 || after.survivors.length !== 1
    || after.survivors[0].id !== before.survivors[0].id || rest(before) !== rest(after)
    || !Number.isInteger(fearDelta) || fearDelta < 0 || fearDelta > 1) return null;
  const logs = after.log.filter(entry => !before.log.some(prior => prior.id === entry.id))
    .map(entry => ({ kind: entry.kind, text: entry.text }));
  if (logs.length > 3) return null;
  return { before: before.survivors[0], after: after.survivors[0], fearDelta, logs };
}

export function applyPlayerChange(game: GameState, survivorId: string, before: Survivor, after: Survivor,
  fearDelta: number, logs: PlayerLog[]): GameState | null {
  const person = game.survivors.find(s => s.id === survivorId);
  if (!person || before?.id !== survivorId || after?.id !== survivorId || JSON.stringify(person) !== JSON.stringify(before)
    || !Number.isInteger(fearDelta) || fearDelta < 0 || fearDelta > 1 || !Array.isArray(logs) || logs.length > 3
    || (fearDelta === 1 && !logs.some(log => log?.kind === "dados"))
    || !Object.keys(after).every(key => allowedKeys.has(key))
    || immutable.some(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    || !Number.isInteger(after.hp) || after.hp < 0 || after.hp > 20
    || !Number.isInteger(after.armorMarked) || after.armorMarked < 0 || after.armorMarked > 20
    || !Number.isInteger(after.stress) || after.stress < 0 || after.stress > 6
    || !Number.isInteger(after.hope) || after.hope < 0 || after.hope > 6
    || ![after.food, after.water, after.ammo].every(value => Number.isInteger(value) && value >= 0 && value <= 99)
    || !Array.isArray(after.inventory) || after.inventory.length > 120
    || after.inventory.some(item => !item || typeof item.id !== "string" || typeof item.name !== "string"
      || !Object.keys(item).every(key => allowedItemKeys.has(key))
      || item.name.length > 100 || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99
      || !Number.isInteger(item.load) || item.load < 0 || item.load > 9
      || (item.provisionResource !== undefined && !["food", "water"].includes(item.provisionResource))
      || (item.portionsPerUnit !== undefined && (!Number.isInteger(item.portionsPerUnit) || item.portionsPerUnit < 1 || item.portionsPerUnit > 99))
      || (item.portionsRemaining !== undefined && (!Number.isInteger(item.portionsRemaining) || item.portionsRemaining < 1
        || item.portionsRemaining > (item.portionsPerUnit ?? 99) || item.qty !== 1))
      || (item.prepared !== undefined && typeof item.prepared !== "boolean")
      || (item.verified !== undefined && typeof item.verified !== "boolean")
      || (item.opened !== undefined && typeof item.opened !== "boolean")
      || (item.expiresDay !== undefined && (!Number.isInteger(item.expiresDay) || item.expiresDay < 1 || item.expiresDay > 9999)))
    || typeof after.notes !== "string" || after.notes.length > 4000
    || logs.some(log => !log || !["dados", "dano", "inventário", "habilidade", "provisões", "tratamento"].includes(log.kind)
      || typeof log.text !== "string" || log.text.length > 600)) return null;
  const next = structuredClone(game);
  const index = next.survivors.findIndex(s => s.id === survivorId);
  next.survivors[index] = structuredClone(after);
  next.fear = Math.min(12, next.fear + fearDelta);
  for (const log of [...logs].reverse()) addLog(next, log.kind, log.text, survivorId);
  return next;
}
