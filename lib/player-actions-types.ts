import { z } from "zod";
import type { RestChoice, RestKind } from "./abilities";

const id = z.string().min(1).max(120);
const objective = z.enum(["open", "food", "water", "medicine", "parts", "fuel"]);
const restChoices = z.array(z.object({ action: z.enum(["hp", "stress", "armor", "hp-full", "stress-full", "armor-full", "prepare", "fiction"]), targetId: id }).strict()).length(2);
export const playerPolicySchema = z.object({
  paused: z.boolean(), transfers: z.boolean(), deposits: z.boolean(), rest: z.boolean(), tokens: z.boolean(),
  areas: z.array(z.object({ hexId: id, pointId: id, areaId: id, objectives: z.array(objective).min(1).max(6) }).strict()).max(200),
  routes: z.array(z.object({ from: id, to: id }).strict()).max(200),
  supplies: z.object({ food: z.number().int().min(0).max(20), water: z.number().int().min(0).max(20),
    items: z.record(id, z.number().int().min(0).max(20)) }).strict(),
}).strict();
export type PlayerActionPolicy = z.infer<typeof playerPolicySchema>;
export function defaultPlayerPolicy(): PlayerActionPolicy {
  return { paused: false, transfers: false, deposits: false, rest: false, tokens: false, areas: [], routes: [], supplies: { food: 0, water: 0, items: {} } };
}
export type TeamOperation = {
  id: string; type: "search" | "travel" | "transfer" | "rest" | "exception"; initiatorId: string;
  day: number; scene: number; hexId: string; status: "forming" | "access" | "done" | "cancelled";
  participantIds: string[]; invitedIds: string[]; pointId?: string; areaId?: string; destination?: string;
  objective?: z.infer<typeof objective>; purpose?: string; itemId?: string; itemSnapshot?: string; quantity?: number;
  depth?: "normal" | "deep";
  kind?: RestKind; plans?: Record<string, RestChoice[]>; result?: string; attention?: string;
  individualChoices?: boolean; awaitingNight?: boolean;
};
export type PlayerActionState = {
  policy: PlayerActionPolicy; operations: TeamOperation[];
  receipts: { id: string; actorId: string; day: number; fingerprint: string }[];
  withdrawals: { day: number; actorId: string; key: string; quantity: number }[];
  markers: { actorId: string; sceneId: string; day: number; x: number; y: number; label: string }[];
};
const quantity = z.number().int().min(1).max(99);
const base = { id, day: z.number().int().min(1).max(9999) };
export const playerCommandSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("prepare-search"), hexId: id, pointId: id }).strict(),
  z.object({ ...base, type: z.literal("search"), hexId: id, pointId: id, areaId: id, objective, purpose: z.string().trim().min(1).max(240) }).strict(),
  z.object({ ...base, type: z.literal("deep-search"), hexId: id, pointId: id, areaId: id, objective: z.enum(["food", "water", "medicine", "parts", "fuel"]), purpose: z.string().trim().min(1).max(240) }).strict(),
  z.object({ ...base, type: z.literal("travel"), destination: id }).strict(),
  z.object({ ...base, type: z.literal("rest"), kind: z.enum(["short", "long"]) }).strict(),
  z.object({ ...base, type: z.literal("request-rest"), kind: z.enum(["short", "long"]) }).strict(),
  z.object({ ...base, type: z.literal("confirm-rest"), operationId: id, choices: restChoices }).strict(),
  z.object({ ...base, type: z.literal("offer"), targetId: id, itemId: id, quantity }).strict(),
  z.object({ ...base, type: z.literal("deposit"), itemId: id, quantity }).strict(),
  z.object({ ...base, type: z.literal("withdraw"), resource: z.enum(["food", "water", "item"]), itemId: id.optional(), quantity }).strict(),
  z.object({ ...base, type: z.literal("join"), operationId: id }).strict(),
  z.object({ ...base, type: z.literal("leave"), operationId: id }).strict(),
  z.object({ ...base, type: z.literal("execute"), operationId: id }).strict(),
  z.object({ ...base, type: z.literal("roll-access"), operationId: id, trait: z.enum(["Agilidade", "Força", "Finesse", "Instinto", "Presença", "Conhecimento"]), experiences: z.array(z.enum(["origin", "free"])).max(2) }).strict(),
  z.object({ ...base, type: z.literal("collect"), hexId: id, pointId: id, stockId: id, quantity }).strict(),
  z.object({ ...base, type: z.literal("request"), text: z.string().trim().min(1).max(500) }).strict(),
  z.object({ ...base, type: z.literal("token"), sceneId: id, objectId: id, x: z.number().int(), y: z.number().int(), beforeX: z.number().int(), beforeY: z.number().int() }).strict(),
  z.object({ ...base, type: z.literal("marker"), sceneId: id, x: z.number().int(), y: z.number().int(), label: z.string().trim().min(1).max(80) }).strict(),
  z.object({ ...base, type: z.literal("clear-marker") }).strict(),
]);
export type PlayerCommand = z.infer<typeof playerCommandSchema>;
export type PublicSearchAreaState = "available" | "proposed" | "ongoing" | "deep-available" | "deep-ongoing" | "exhausted" | "searched" | "narrative";
export type PublicPlayerActions = {
  policy: Omit<PlayerActionPolicy, "areas" | "routes" | "supplies">;
  actorId: string; hexId: string; busy: string | null;
  peers: { id: string; name: string; hex: string }[];
  locations: { hexId: string; pointId: string; pointName: string; prepared: boolean; areaCount: number; searchedAreas: number; availableAreas: number; narrativeAreas: number; stockUnits: number; apparentStockUnits: number; activeSearches: number }[];
  areas: { hexId: string; pointId: string; areaId: string; name: string; pointName: string; signal: string; minutes: number; noise: number; access: "open" | "risk" | "blocked"; objectives: string[]; available: boolean; searchable: boolean; state: PublicSearchAreaState; visibleOutcome: "none" | "item" | null }[];
  stock: { hexId: string; pointId: string; areaId: string; stockId: string; name: string; remaining: number; accessible: boolean; source: "apparent" | "search"; condition?: string; requiresFuelContainer: boolean }[];
  routes: { destination: string; name: string; minutes: number }[];
  operations: Omit<TeamOperation, "itemSnapshot" | "plans">[];
  supplies: { key: string; itemId?: string; name: string; available: number; allowance: number }[];
  markers: PlayerActionState["markers"];
};

const operationSchema = z.object({
  id, type: z.enum(["search", "travel", "transfer", "rest", "exception"]), initiatorId: id,
  day: z.number().int().min(1).max(9999), scene: z.number().int().min(1), hexId: id,
  status: z.enum(["forming", "access", "done", "cancelled"]), participantIds: z.array(id).max(30), invitedIds: z.array(id).max(30),
  pointId: id.optional(), areaId: id.optional(), destination: id.optional(), objective: objective.optional(),
  purpose: z.string().max(500).optional(), itemId: id.optional(), itemSnapshot: z.string().max(20000).optional(),
  quantity: quantity.optional(), depth: z.enum(["normal", "deep"]).optional(), kind: z.enum(["short", "long"]).optional(), result: z.string().max(6000).optional(), attention: z.string().max(500).optional(),
  individualChoices: z.boolean().optional(), awaitingNight: z.boolean().optional(),
  plans: z.record(id, z.array(z.object({ action: z.enum(["hp", "stress", "armor", "hp-full", "stress-full", "armor-full", "prepare", "fiction"]), targetId: id }).strict()).length(2)).optional(),
}).strict();
const stateSchema = z.object({
  policy: playerPolicySchema, operations: z.array(operationSchema).max(150),
  receipts: z.array(z.object({ id, actorId: id, day: z.number().int().min(1), fingerprint: z.string().max(3000) }).strict()).max(2000),
  withdrawals: z.array(z.object({ day: z.number().int().min(1), actorId: id, key: id, quantity }).strict()).max(2000),
  markers: z.array(z.object({ actorId: id, sceneId: id, day: z.number().int().min(1), x: z.number().int().min(0).max(4000), y: z.number().int().min(0).max(3000), label: z.string().max(80) }).strict()).max(30),
}).strict();
export function validPlayerActionState(value: unknown) { return value === undefined || stateSchema.safeParse(value).success; }
