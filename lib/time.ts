import { absoluteMinutes, addLog, type GameState } from "./game";
import { processScheduledShelterWork } from "./shelter-projects";
import { ensureParallelTime, participantTimePreview, resetParallelTime, syncAllParticipantsToCurrentTime, type ParticipantTimePreview } from "./activity";

export type AdvanceTimeResult = {
  ok: boolean;
  completedWork: ReturnType<typeof processScheduledShelterWork>;
};

export type AdvanceParticipantTimeResult = AdvanceTimeResult & ParticipantTimePreview;

function dueWorkBefore(game: GameState, targetAbsolute: number) {
  return (game.shelter.projects ?? [])
    .flatMap(project => [
      project.workShift?.endAbsoluteMinute,
      ...(project.volunteerShifts ?? []).map(shift => shift.endAbsoluteMinute),
    ])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value <= targetAbsolute)
    .sort((a, b) => a - b)[0];
}

function advanceWorldToMinute(game: GameState, targetMinute: number, logText?: string): AdvanceTimeResult {
  if (!Number.isInteger(targetMinute) || targetMinute < game.minutes || targetMinute >= 1440)
    return { ok: false, completedWork: [] };

  const targetAbsolute = (game.day - 1) * 1440 + targetMinute;
  const completedWork: ReturnType<typeof processScheduledShelterWork> = [];

  // Resolve turnos exatamente no horário em que terminam, mesmo quando uma
  // viagem/busca avança o relógio além daquele ponto.
  while (true) {
    const currentAbsolute = absoluteMinutes(game);
    const nextDue = dueWorkBefore(game, targetAbsolute);
    if (nextDue === undefined) break;

    if (nextDue > currentAbsolute) {
      const dayStart = (game.day - 1) * 1440;
      game.minutes = nextDue - dayStart;
    }
    const resolved = processScheduledShelterWork(game);
    if (!resolved.length) break;
    completedWork.push(...resolved);
  }

  game.minutes = targetMinute;
  if (logText) addLog(game, "tempo", logText);
  return { ok: true, completedWork };
}

/** Avança o relógio global. Como todos esperaram esse intervalo, elimina
 * qualquer folga paralela ainda não usada pelos subgrupos. */
export function advanceCampaignTime(game: GameState, minutes: number, logText?: string): AdvanceTimeResult {
  if (!Number.isInteger(minutes) || minutes < 0 || game.minutes + minutes >= 1440)
    return { ok: false, completedWork: [] };
  if (minutes === 0) return { ok: true, completedWork: [] };
  const result = advanceWorldToMinute(game, game.minutes + minutes, logText);
  if (result.ok) syncAllParticipantsToCurrentTime(game);
  return result;
}

/** Consome tempo apenas dos participantes informados. O relógio global avança
 * somente até o maior horário alcançado entre os subgrupos. */
export function advanceParticipantTime(game: GameState, survivorIds: string[], minutes: number, logText?: string): AdvanceParticipantTimeResult {
  const preview = participantTimePreview(game, survivorIds, minutes);
  if (!preview.ok) return { ...preview, completedWork: [] };

  const timeline = ensureParallelTime(game);
  for (const id of new Set(survivorIds)) timeline.survivorMinutes[id] = preview.endMinute;

  let completedWork: ReturnType<typeof processScheduledShelterWork> = [];
  if (preview.worldAfter > game.minutes) {
    const result = advanceWorldToMinute(game, preview.worldAfter);
    if (!result.ok) return { ...preview, ok: false, completedWork: [] };
    completedWork = result.completedWork;
  }
  if (logText) addLog(game, "tempo", logText);
  return { ...preview, ok: true, completedWork };
}

/** Ajuste manual no mesmo dia. Ao mover o relógio para frente, turnos
 * programados são resolvidos; ao corrigir para trás, nenhum trabalho é criado. */
export function setCampaignTime(game: GameState, targetMinute: number) {
  if (!Number.isInteger(targetMinute) || targetMinute < 0 || targetMinute >= 1440)
    return { ok: false, completedWork: [] as ReturnType<typeof processScheduledShelterWork> };
  if (targetMinute >= game.minutes) return advanceCampaignTime(game, targetMinute - game.minutes);
  game.minutes = targetMinute;
  resetParallelTime(game);
  return { ok: true, completedWork: [] as ReturnType<typeof processScheduledShelterWork> };
}

/** Antes da passagem para o próximo dia, resolve turnos já programados que
 * terminariam ainda hoje. Não agenda trabalho novo. */
export function settleScheduledWorkBeforeMorning(game: GameState) {
  const remaining = Math.max(0, 1439 - game.minutes);
  return advanceCampaignTime(game, remaining);
}
