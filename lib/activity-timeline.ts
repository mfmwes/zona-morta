import { addLog, displayTime, survivorHex, type GameState } from "./game";
import { createId } from "./id";
import { timedActionParticipantIssue } from "./activity";
import type { RestKind, RestSelection } from "./abilities";

type ActivityBase = {
  id: string; day: number; startMinute: number; endMinute: number;
  participantIds: string[]; hexId: string; label: string;
  status: "running" | "completed" | "cancelled";
  issue?: string; operationId?: string;
};
export type ScheduledActivity = ActivityBase & (
  | { type: "travel"; destination: string }
  | { type: "search"; pointId: string; attemptId: string }
  | { type: "treatment"; medicineSource: string; modifier: number }
  | { type: "rest"; kind: RestKind; selections: RestSelection[] }
);
export type PublicActivity = Pick<ScheduledActivity, "id" | "type" | "label" | "participantIds" | "hexId" | "startMinute" | "endMinute" | "issue">;
export type ActivityInput =
  | { type: "travel"; destination: string }
  | { type: "search"; pointId: string; attemptId: string }
  | { type: "treatment"; medicineSource: string; modifier: number }
  | { type: "rest"; kind: RestKind; selections: RestSelection[] };

export function runningActivities(game: GameState) {
  return (game.activities ?? []).filter(activity => activity.day === game.day && activity.status === "running")
    .sort((a, b) => a.endMinute - b.endMinute || a.startMinute - b.startMinute);
}

export function scheduleActivity(game: GameState, input: ActivityInput, ids: string[], minutes: number,
  label: string, options: { id?: string; operationId?: string; log?: boolean } = {}) {
  const existing = options.id && game.activities?.find(activity => activity.id === options.id);
  if (existing) return { ok: true as const, activity: existing };
  const participantIds = [...new Set(ids)];
  if (!participantIds.length || participantIds.length !== ids.length || participantIds.some(id => !game.survivors.some(p => p.id === id)))
    return { ok: false as const, message: "Escolha participantes válidos." };
  if (game.conflict?.active) return { ok: false as const, message: "Encerre o conflito antes de iniciar uma atividade." };
  const issue = timedActionParticipantIssue(game, participantIds);
  if (issue) return { ok: false as const, message: issue };
  if (!Number.isInteger(minutes) || minutes < 1 || game.minutes + minutes >= 1440)
    return { ok: false as const, message: "A atividade precisa terminar antes da passagem de dia." };
  const hexId = survivorHex(game, participantIds[0]);
  if (participantIds.some(id => survivorHex(game, id) !== hexId))
    return { ok: false as const, message: "Os participantes precisam estar no mesmo hex." };
  const activity: ScheduledActivity = { ...input, id: options.id ?? createId(), day: game.day,
    startMinute: game.minutes, endMinute: game.minutes + minutes, participantIds, hexId,
    label, status: "running", operationId: options.operationId };
  game.activities = [...runningActivities(game), ...(game.activities ?? []).filter(a => a.status !== "running").slice(-100), activity];
  if (options.log !== false) addLog(game, "atividade", `${participantIds.map(id => game.survivors.find(p => p.id === id)!.name).join(", ")}: ${label} · ${displayTime(activity.startMinute)} → ${displayTime(activity.endMinute)}.`, participantIds[0], participantIds);
  return { ok: true as const, activity };
}

export function cancelActivity(game: GameState, id: string) {
  const activity = runningActivities(game).find(a => a.id === id);
  if (!activity) return false;
  activity.status = "cancelled";
  if (activity.type === "search") {
    const attempt = game.hexes[activity.hexId]?.points.find(p => p.id === activity.pointId)?.preparation?.attempts.find(a => a.id === activity.attemptId);
    if (attempt) { attempt.status = "failed"; attempt.result = "Busca interrompida pelo mestre; nenhum achado liberado."; }
  }
  if (activity.type === "rest") for (const person of game.survivors.filter(p => activity.participantIds.includes(p.id))) delete person.restPlan;
  const op = game.playerActions?.operations.find(op => op.id === activity.operationId);
  if (op) { op.status = "cancelled"; op.result = "Atividade interrompida pelo mestre."; }
  addLog(game, "atividade", `${activity.label} interrompida às ${displayTime(game.minutes)}. O tempo decorrido permanece registrado.`, activity.participantIds[0], activity.participantIds);
  return true;
}

export function publicActivities(game: GameState): PublicActivity[] {
  return runningActivities(game).filter(a => a.type !== "search" || Boolean(game.hexes[a.hexId]?.points.find(p => p.id === a.pointId)?.revealed)).map(({ id, type, label, participantIds, hexId, startMinute, endMinute, issue }) =>
    ({ id, type, label, participantIds, hexId, startMinute, endMinute, ...(issue ? { issue: "Aguarda resolução do mestre." } : {}) }));
}

/** Campanhas anteriores podem ter buscas abertas sem registro de agendamento. */
export function restorePendingActivities(game: GameState) {
  if (game.activities !== undefined) return;
  game.activities = [];
  for (const [hexId, hex] of Object.entries(game.hexes)) for (const point of hex.points) for (const attempt of point.preparation?.attempts ?? []) {
    if (!["pending", "ready"].includes(attempt.status) || attempt.participants.some(id => survivorHex(game, id) !== hexId)) continue;
    const result = scheduleActivity(game, { type: "search", pointId: point.id, attemptId: attempt.id }, attempt.participants,
      attempt.minutes, `${attempt.kind === "deep" ? "Busca profunda" : "Busca"} em ${point.name}`, { id: attempt.id, operationId: attempt.id, log: false });
    if (result.ok) {
      const op = game.playerActions?.operations.find(o => o.id === attempt.id);
      if (op) op.status = attempt.status === "pending" ? "access" : "scheduled";
    }
  }
}
