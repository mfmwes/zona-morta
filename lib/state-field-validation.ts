import { ammunitionTypes, type InventoryItem, type Survivor } from './game';
import { eventConditionSchema } from './event-resolution-types';

type Row = Record<string, unknown>;
const slots = ['primary', 'secondary', 'protection', 'outfit', 'personal', 'bag', 'pocket1', 'pocket2'];
export const record = (value: unknown): value is Row => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown, max = 4000) => typeof value === 'string' && value.length <= max;
const integer = (value: unknown, min = 0, max = 999999) => Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
const optional = (value: unknown, validate: (value: unknown) => boolean) => value === undefined || validate(value);
const oneOf = (value: unknown, values: readonly string[]) => typeof value === 'string' && values.includes(value);
const strings = (value: unknown, max: number, length = 120) => Array.isArray(value) && value.length <= max && value.every(item => text(item, length));
const stringMap = (value: unknown, max = 4000, keys?: string[]) => record(value) && Object.keys(value).length <= 2000
  && Object.entries(value).every(([key, item]) => text(key, 240) && (!keys || keys.includes(key)) && text(item, max));
const itemKeys = new Set(['id', 'name', 'load', 'qty', 'condition', 'catalogKey', 'category', 'armorMarked', 'foundDay',
  'provisionResource', 'portionsPerUnit', 'portionsRemaining', 'prepared', 'verified', 'opened', 'expiresDay', 'battery',
  'storedResource', 'storedAmount', 'cartDeployed', 'cartItems', 'ammunitionType', 'committedAmmo']);

export function validImageReference(value: unknown) {
  if (!text(value, 12000)) return false;
  if (value === '') return true;
  if (/^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(value as string)) return true;
  try { const url = new URL(value as string); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}

// Legacy imports may contain zero-quantity stacks and custom metadata. New
// player edits must still obey the current physical-item limits.
export function validInventoryItem(value: unknown, nested = false, legacy = false): value is InventoryItem {
  if (!record(value)) return false;
  const item = value;
  return text(item.id, 120) && text(item.name, 100)
    && (legacy || Object.keys(item).every(key => itemKeys.has(key)))
    && integer(item.qty, legacy ? 0 : 1, legacy ? 999999 : 99) && integer(item.load, 0, legacy ? 999 : 9)
    && ['condition', 'catalogKey', 'category'].every(key => optional(item[key], v => text(v, 240)))
    && optional(item.armorMarked, v => integer(v, 0, 20)) && optional(item.foundDay, v => integer(v, 1))
    && optional(item.provisionResource, v => oneOf(v, ['food', 'water']))
    && optional(item.portionsPerUnit, v => integer(v, 1, 99))
    && optional(item.portionsRemaining, v => integer(v, 1, Number(item.portionsPerUnit ?? 99)) && item.qty === 1)
    && ['prepared', 'verified', 'opened'].every(key => optional(item[key], v => typeof v === 'boolean'))
    && optional(item.expiresDay, v => integer(v, 1))
    && optional(item.battery, v => oneOf(v, ['Carregada', 'Descarregada']))
    && optional(item.ammunitionType, v => ammunitionTypes.some(type => type === v))
    && optional(item.committedAmmo, v => integer(v, 1, Number(item.qty)))
    && optional(item.storedResource, v => oneOf(v, ['water', 'fuel']))
    && optional(item.storedAmount, v => integer(v, 1, item.storedResource === 'fuel' ? 1 : 4))
    && ((item.storedResource === undefined) === (item.storedAmount === undefined))
    && optional(item.cartDeployed, v => !nested && item.name === 'Carrinho dobrável' && typeof v === 'boolean')
    && optional(item.cartItems, v => !nested && item.name === 'Carrinho dobrável' && Array.isArray(v)
      && v.length <= 40 && v.every(child => validInventoryItem(child, true, legacy)));
}

export function validProvisionLots(value: unknown) {
  return optional(value, v => Array.isArray(v) && v.length <= 1000 && v.every(lot => record(lot)
    && text(lot.id, 120) && oneOf(lot.resource, ['food', 'water']) && integer(lot.qty)
    && integer(lot.expiresDay, 1) && text(lot.label, 1000)));
}

export function validSurvivorField(key: string, value: unknown, legacy = false): boolean {
  if (slots.includes(key) || ['id', 'name', 'origin', 'archetype', 'specialty', 'freeExperience'].includes(key))
    return (['outfit', 'pocket1', 'pocket2'].includes(key) && value === undefined) || text(value, key === 'id' ? 120 : 1000);
  if (['past', 'notes'].includes(key)) return text(value, key === 'past' ? 20000 : 4000);
  if (key === 'portrait') return optional(value, validImageReference);
  if (['home', 'hex', 'transport', 'ammoType', 'ammoSpentType'].includes(key)) return optional(value, v => text(v, 1000));
  if (key === 'inventory') return (legacy && value === undefined) || (Array.isArray(value) && value.length <= 120 && value.every(item => validInventoryItem(item, false, legacy)));
  if (key === 'techniques') return strings(value, 200, 1000);
  if (key === 'attributes') return record(value) && Object.keys(value).length <= 20 && Object.entries(value).every(([k, v]) => text(k, 100) && integer(v, -100, 100));
  if (key === 'provisionLots') return validProvisionLots(value);
  if (key === 'kitCondition') return optional(value, v => stringMap(v, 120, legacy ? [...slots, 'transport'] : slots));
  if (key === 'equippedItems') return optional(value, v => record(v) && Object.entries(v).every(([slot, item]) => (legacy ? [...slots, 'transport'] : slots).includes(slot) && validInventoryItem(item, false, legacy)));
  if (key === 'abilityUses') return optional(value, v => stringMap(v, 240));
  if (['hp', 'armorMarked', 'stress', 'hope', 'food', 'water', 'ammo', 'terminalScenes'].includes(key)) return integer(value);
  if (['level', 'proficiency', 'ammoSpentScene'].includes(key)) return optional(value, v => integer(v, 1));
  if (['foodConsumedDay', 'waterConsumedDay'].includes(key)) return optional(value, v => integer(v, 1));
  if (key === 'ammoSpentTypes') return optional(value, v => Array.isArray(v) && v.length <= ammunitionTypes.length && v.every(type => ammunitionTypes.some(t => t === type)));
  if (key === 'infection') return oneOf(value, ['Saudável', 'Exposto', 'Infectado', 'Sintomático', 'Terminal']);
  if (key === 'exposureDeadline') return value === null || integer(value, 0, Number.MAX_SAFE_INTEGER);
  if (key === 'treatmentAttempted') return typeof value === 'boolean';
  if (key === 'restCounters') return optional(value, v => record(v) && integer(v.short) && integer(v.long));
  if (key === 'eventConditions') return optional(value, v => Array.isArray(v) && v.length <= 100 && v.every(c => eventConditionSchema.safeParse(c).success));
  if (key === 'restPlan') return optional(value, v => record(v) && oneOf(v.kind, ['short', 'long']) && Array.isArray(v.choices)
    && v.choices.length === 2 && v.choices.every(c => record(c) && text(c.targetId, 120)
      && oneOf(c.action, ['hp', 'stress', 'armor', 'prepare', 'fiction', 'hp-full', 'stress-full', 'armor-full'])));
  return true; // Unknown legacy fields are preserved, never made player-editable.
}

export function validSurvivor(value: unknown): value is Survivor {
  if (!record(value)) return false;
  const required = ['id', 'name', 'origin', 'past', 'archetype', 'specialty', 'attributes', 'freeExperience', 'techniques',
    'primary', 'secondary', 'protection', 'personal', 'bag', 'hp', 'armorMarked', 'stress', 'hope', 'infection',
    'exposureDeadline', 'treatmentAttempted', 'terminalScenes', 'food', 'water', 'ammo', 'inventory', 'notes'];
  return required.every(key => validSurvivorField(key, value[key], true))
    && Object.entries(value).every(([key, v]) => validSurvivorField(key, v, true));
}

export function validStockHolder(value: unknown) {
  return record(value) && integer(value.food) && integer(value.water) && validProvisionLots(value.provisionLots)
    && optional(value.inventory, v => Array.isArray(v) && v.length <= 1000 && v.every(item => validInventoryItem(item, false, true)));
}

export function validLogEntry(value: unknown) {
  return record(value) && text(value.id, 120) && integer(value.day, 1) && text(value.time, 20)
    && text(value.kind, 120) && text(value.text, 20000)
    && ['actorId', 'actorName'].every(key => optional(value[key], v => text(v, 1000)))
    && optional(value.actorPortrait, validImageReference) && optional(value.participantIds, v => strings(v, 30));
}
