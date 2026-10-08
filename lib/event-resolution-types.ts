import { z } from "zod";

export const eventOutcomeLabels = { success: "Sucesso", complication: "Sucesso com custo / complicação", failure: "Falha", withdrawn: "Recuo / outra saída" } as const;
export type EventOutcome = keyof typeof eventOutcomeLabels;
const id = z.string().min(1).max(120);
const minute = z.number().int().min(0).max(1439);
const effects = { minutes: z.number().int().min(0).max(360), noise: z.number().int().min(-5).max(5), fear: z.number().int().min(-12).max(12) };
const plan = { id, outcome: z.enum(["success", "complication", "failure", "withdrawn"]), approachId: id,
  closeEvent: z.boolean().optional(), summary: z.string().trim().min(1).max(1600), continuity: z.string().trim().max(1600), participantIds: z.array(id).max(30), ...effects };
export const eventResolutionCommandSchema = z.object({ type: z.literal("resolve-event"), day: z.number().int().min(1), expectedMinute: minute,
  expectedEvent: z.string().min(1).max(12000), hexId: z.string().regex(/^-?\d+,-?\d+$/), eventId: id, ...plan }).strict();
export type EventResolutionCommand = z.infer<typeof eventResolutionCommandSchema>;
export const eventResolutionSchema = z.object({ ...plan, day: z.number().int().min(1), startMinute: minute,
  endMinute: minute, status: z.enum(["scheduled", "completed", "cancelled"]), eventText: z.string().max(2400),
  appliedNoise: z.number().int().min(-5).max(5).optional(), appliedFear: z.number().int().min(-12).max(12).optional() }).strict();
export type EventResolution = z.infer<typeof eventResolutionSchema>;
export function validEventResolutions(value: unknown) {
  if (value === undefined) return true;
  const parsed = z.array(eventResolutionSchema).max(20).safeParse(value);
  return parsed.success && new Set(parsed.data.map(r => r.id)).size === parsed.data.length
    && parsed.data.filter(r => r.status === "scheduled").length <= 1
    && parsed.data.every(r => new Set(r.participantIds).size === r.participantIds.length && r.endMinute >= r.startMinute
      && (r.minutes === 0 || r.participantIds.length > 0));
}
