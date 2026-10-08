import { z } from "zod";

export const eventOutcomeLabels = { success: "Sucesso", complication: "Sucesso com custo / complicação", failure: "Falha", withdrawn: "Recuo / outra saída" } as const;
export type EventOutcome = keyof typeof eventOutcomeLabels;
const id = z.string().min(1).max(120);
const minute = z.number().int().min(0).max(1439);
export const eventConditionSchema = z.object({ name: z.string().trim().min(1).max(80), effect: z.string().trim().min(1).max(400), clear: z.string().trim().min(1).max(400), preventsMovement: z.boolean().optional() }).strict();
export type EventCondition = z.infer<typeof eventConditionSchema>;
export const eventPersonalEffectSchema = z.object({ survivorId: id, hpMarks: z.number().int().min(0).max(3), armor: z.boolean(), stress: z.number().int().min(-6).max(6), hope: z.number().int().min(-6).max(6), food: z.number().int().min(-10).max(10), water: z.number().int().min(-10).max(10), condition: eventConditionSchema.optional() }).strict();
export type EventPersonalEffect = z.infer<typeof eventPersonalEffectSchema>;
export const eventNpcEffectSchema = z.object({ npcId: id, disposition: z.enum(["Hostil", "Desconfiado", "Neutro", "Aliado", "Leal"]), mode: z.enum(["set", "at-least", "keep"]).optional(), condition: eventConditionSchema.optional(), commitment: z.string().trim().min(1).max(600) }).strict();
export type EventNpcEffect = z.infer<typeof eventNpcEffectSchema>;
export const eventClockSchema = z.object({ label: z.string().trim().min(1).max(120), consequence: z.string().trim().min(1).max(600), noise: z.number().int().min(0).max(5), dueAbsoluteMinute: z.number().int().min(0).max(1000000000), status: z.enum(["active", "expired", "cancelled"]) }).strict();
export type EventClock = z.infer<typeof eventClockSchema>;
export const eventClockInitialSchema = eventClockSchema.pick({label:true,consequence:true,noise:true}).extend({minutes:z.number().int().min(1).max(1440)}).strict();
export const eventClockPlanSchema = z.object({ initial:eventClockInitialSchema.optional(), action:z.enum(["keep","extend","cancel"]), minutes:z.number().int().min(1).max(1440).optional() }).strict().refine(p=>p.action!=="extend"||p.minutes!==undefined);
export type EventClockPlan = z.infer<typeof eventClockPlanSchema>;
const effects = { minutes: z.number().int().min(0).max(360), noise: z.number().int().min(-5).max(5), fear: z.number().int().min(-12).max(12) };
const plan = { id, outcome: z.enum(["success", "complication", "failure", "withdrawn"]), approachId: id,
  closeEvent: z.boolean().optional(), clock: eventClockPlanSchema.optional(), personalEffects: z.array(eventPersonalEffectSchema).max(30).optional(), npcEffect: eventNpcEffectSchema.optional(), summary: z.string().trim().min(1).max(1600), continuity: z.string().trim().max(1600), participantIds: z.array(id).max(30), ...effects };
export const eventResolutionCommandSchema = z.object({ type: z.literal("resolve-event"), day: z.number().int().min(1), expectedMinute: minute,
  expectedEvent: z.string().min(1).max(12000), hexId: z.string().regex(/^-?\d+,-?\d+$/), eventId: id, ...plan }).strict();
export type EventResolutionCommand = z.infer<typeof eventResolutionCommandSchema>;
export const eventResolutionSchema = z.object({ ...plan, day: z.number().int().min(1), startMinute: minute,
  endMinute: minute, status: z.enum(["scheduled", "completed", "cancelled"]), eventText: z.string().max(2400),
  appliedEffects: z.array(z.string().max(1200)).max(40).optional(), appliedNoise: z.number().int().min(-5).max(5).optional(), appliedFear: z.number().int().min(-12).max(12).optional() }).strict();
export type EventResolution = z.infer<typeof eventResolutionSchema>;
export function validEventResolutions(value: unknown) {
  if (value === undefined) return true;
  const parsed = z.array(eventResolutionSchema).max(20).safeParse(value);
  return parsed.success && new Set(parsed.data.map(r => r.id)).size === parsed.data.length
    && parsed.data.filter(r => r.status === "scheduled").length <= 1
    && parsed.data.every(r => new Set(r.participantIds).size === r.participantIds.length && r.endMinute >= r.startMinute
      && new Set((r.personalEffects ?? []).map(e => e.survivorId)).size === (r.personalEffects ?? []).length
      && (r.personalEffects ?? []).every(e => r.participantIds.includes(e.survivorId))
      && (r.minutes === 0 || r.participantIds.length > 0));
}
