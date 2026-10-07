import { z } from "zod";
import type { GameState } from "./game";

const id = z.string().min(1).max(120);
const hex = z.string().regex(/^-?\d+,-?\d+$/);
const minute = z.number().int().min(0).max(1439);
const choice = z.object({ action: z.enum(["hp", "stress", "armor", "hp-full", "stress-full", "armor-full", "prepare", "fiction"]), targetId: id }).strict();
const base = { id, day: z.number().int().min(1).max(99999), startMinute: minute, endMinute: minute,
  participantIds: z.array(id).min(1).max(30), hexId: hex, label: z.string().min(1).max(2400),
  status: z.enum(["running", "completed", "cancelled"]), issue: z.string().max(4000).optional(), operationId: id.optional() };
const schema = z.array(z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("treatment"), medicineSource: z.string().min(1).max(240), modifier: z.number().int().min(-20).max(20) }).strict(),
  z.object({ ...base, type: z.literal("travel"), destination: hex }).strict(),
  z.object({ ...base, type: z.literal("search"), pointId: id, attemptId: id }).strict(),
  z.object({ ...base, type: z.literal("rest"), kind: z.enum(["short", "long"]), selections: z.array(z.object({ survivorId: id, choices: z.array(choice).length(2) }).strict()).min(1).max(30) }).strict(),
])).max(130);

export const masterActivityCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("advance-activity"), id, day: z.number().int().min(1), expectedMinute: minute, expectedNext: minute }).strict(),
  z.object({ type: z.literal("cancel-activity"), id, day: z.number().int().min(1), activityId: id }).strict(),
]);

export function validActivities(value: unknown, state: Partial<GameState>) {
  if (value === undefined) return true;
  const parsed = schema.safeParse(value);
  if (!parsed.success || new Set(parsed.data.map(a => a.id)).size !== parsed.data.length) return false;
  const occupied = new Set<string>();
  return parsed.data.every(a => {
    if (a.endMinute <= a.startMinute || new Set(a.participantIds).size !== a.participantIds.length) return false;
    if (a.type === "rest" && (a.selections.length !== a.participantIds.length
      || new Set(a.selections.map(s => s.survivorId)).size !== a.participantIds.length
      || a.selections.some(s => !a.participantIds.includes(s.survivorId) || s.choices.some(c => !a.participantIds.includes(c.targetId))))) return false;
    if (a.status !== "running") return true;
    if (a.day !== state.day || a.startMinute > Number(state.minutes)) return false;
    for (const id of a.participantIds) { if (occupied.has(id)) return false; occupied.add(id); }
    return true;
  });
}
