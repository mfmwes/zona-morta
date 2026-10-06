import type { LocationPreparation } from "./hex-automation-types";
import content from "./content.json";

const text = (value: unknown, max = 120): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const number = (value: unknown, min: number, max: number) => Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
const unique = (values: string[]) => new Set(values).size === values.length;
const keys = new Set(content.catalog.map(row => `${row.category}::${row.name}`));
export function validLocationPreparation(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prep = value as LocationPreparation;
  if (prep.version !== 1 || (prep.scale !== undefined && !["small", "medium", "large", "complex"].includes(prep.scale)) || !Array.isArray(prep.areas) || !prep.areas.length || prep.areas.length > 80
    || !Array.isArray(prep.attempts) || prep.attempts.length > 80 || !Array.isArray(prep.stock) || prep.stock.length > 240
    || !Array.isArray(prep.collections) || prep.collections.length > 200) return false;
  if (!prep.areas.every(area => area && text(area.id) && text(area.name) && typeof area.signal === "string" && area.signal.length <= 2000
    && content.lootTables.some(row => row.name === area.table) && [30, 60].includes(area.minutes)
    && ["open", "risk", "blocked"].includes(area.access) && [12, 13, 15].includes(area.difficulty)
    && number(area.noise, 0, 5) && typeof area.armedGuard === "boolean" && typeof area.compatibleOwner === "boolean"
    && ["Pistola", "Espingarda", "Carabina"].includes(area.ammunition)
    && (area.collectible === undefined || typeof area.collectible === "boolean")
    && (area.spacious === undefined || typeof area.spacious === "boolean")
    && (area.searchable === undefined || typeof area.searchable === "boolean")
    && (area.source === undefined || ["generated", "manual", "historical"].includes(area.source))
    && (area.excludedRolls === undefined || (Array.isArray(area.excludedRolls) && area.excludedRolls.length < 12 && area.excludedRolls.every(roll => number(roll, 1, 12))))
    && (area.exclusionReason === undefined || (typeof area.exclusionReason === "string" && area.exclusionReason.length <= 2000))) || !unique(prep.areas.map(row => row.id))) return false;
  const areaIds = new Set(prep.areas.map(row => row.id));
  if (!prep.attempts.every(attempt => attempt && text(attempt.id) && areaIds.has(attempt.areaId)
    && Array.isArray(attempt.participants) && attempt.participants.length <= 30 && attempt.participants.every(id => text(id)) && unique(attempt.participants)
    && ["open", "specific"].includes(attempt.mode) && typeof attempt.objective === "string" && attempt.objective.length <= 2400
    && typeof attempt.purpose === "string" && attempt.purpose.length <= 2400 && number(attempt.quantity, 1, 99)
    && number(attempt.minutes, 1, 1439) && number(attempt.noise, 0, 5) && ["pending", "ready", "completed", "failed"].includes(attempt.status)
    && (attempt.catalogKey === undefined || keys.has(attempt.catalogKey))
    && (attempt.warehouseWorker === undefined || text(attempt.warehouseWorker))
    && (attempt.actorId === undefined || text(attempt.actorId))
    && (attempt.result === undefined || (typeof attempt.result === "string" && attempt.result.length <= 4000))
    && (attempt.roll === undefined || number(attempt.roll, 1, 12))
    && (attempt.effectiveRoll === undefined || number(attempt.effectiveRoll, 1, 12))
    && (attempt.adjustmentReason === undefined || (typeof attempt.adjustmentReason === "string" && attempt.adjustmentReason.length <= 2000))
    && (attempt.areaSnapshot === undefined || (attempt.areaSnapshot.id === attempt.areaId && validLocationPreparation({ version: 1, areas: [attempt.areaSnapshot], attempts: [], stock: [], collections: [] })))
    && (attempt.outcome === undefined || (attempt.outcome && number(attempt.outcome.hopeDie, 1, 12) && number(attempt.outcome.fearDie, 1, 12)
      && Number.isFinite(attempt.outcome.total) && Number.isFinite(attempt.outcome.modifier) && typeof attempt.outcome.critical === "boolean"
      && typeof attempt.outcome.success === "boolean" && ["Hope", "Fear"].includes(attempt.outcome.with)
      && ["none", "advantage", "disadvantage"].includes(attempt.outcome.edge)
      && (attempt.outcome.edgeDie === null || number(attempt.outcome.edgeDie, 1, 6)) && [12, 13, 15].includes(attempt.outcome.difficulty!)))
    && (attempt.stockIds === undefined || (Array.isArray(attempt.stockIds) && attempt.stockIds.length <= 12 && attempt.stockIds.every(id => text(id)))))
    || !unique(prep.attempts.map(row => row.id)) || !unique(prep.attempts.map(row => row.areaId))) return false;
  const attempts = new Set(prep.attempts.map(row => row.id));
  if (!prep.stock.every(stock => stock && text(stock.id) && areaIds.has(stock.areaId) && (stock.attemptId === undefined || attempts.has(stock.attemptId))
    && stock.item && text(stock.item.id) && text(stock.item.name) && keys.has(stock.item.catalogKey!)
    && number(stock.item.qty, 1, 99) && number(stock.item.load, 0, 9) && number(stock.remaining, 0, stock.item.qty)
    && (stock.item.battery === undefined || ["Carregada", "Descarregada"].includes(stock.item.battery))
    && (stock.accessible === undefined || typeof stock.accessible === "boolean")
    && (stock.requiresFuelContainer === undefined || typeof stock.requiresFuelContainer === "boolean")
    && (stock.item.foundDay === undefined || number(stock.item.foundDay, 1, 99999))) || !unique(prep.stock.map(row => row.id))) return false;
  const stockIds = new Set(prep.stock.map(row => row.id));
  return prep.collections.every(collection => collection && text(collection.id) && Array.isArray(collection.lines)
    && collection.lines.length > 0 && collection.lines.length <= 240
    && collection.lines.every(line => line && stockIds.has(line.stockId) && text(line.ownerId) && number(line.quantity, 1, 99) && (line.cartId === undefined || text(line.cartId))))
    && unique(prep.collections.map(row => row.id));
}

export function validExplorationPreferences(value: unknown) {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const preferences = value as { autoPrepare?: boolean; participantIds?: string[]; transport?: string };
  return typeof preferences.autoPrepare === "boolean" && Array.isArray(preferences.participantIds)
    && preferences.participantIds.length <= 30 && preferences.participantIds.every(id => text(id)) && unique(preferences.participantIds)
    && (preferences.transport === undefined || ["personal-first", "cart-first"].includes(preferences.transport));
}
