import { absoluteMinutes, addLog, type GameState } from "./game";
import { processScheduledShelterWork } from "./shelter-projects";

export type AdvanceTimeResult = {
  ok: boolean;
  completedWork: ReturnType<typeof processScheduledShelterWork>;
};

function dueWorkBefore(game: GameState, targetAbsolute: number) {
  return (game.shelter.projects ?? [])
    .flatMap(project => [
      project.workShift?.endAbsoluteMinute,
      ...(project.volunteerShifts ?? []).map(shift => shift.endAbsoluteMinute),
    ])
    .filter((value): value is number => Number.isFinite(value) && value <= targetAbsolute)
    .sort((a, b) => a - b)[0];
}

/** Avança o relógio da campanha e resolve automaticamente turnos de obra cujo
 * horário de término for alcançado. Mantém o limite diário usado pelo sistema. */
export function advanceCampaignTime(game: GameState, minutes: number, logText?: string): AdvanceTimeResult {
  if (!Number.isInteger(minutes) || minutes < 0 || game.minutes + minutes >= 1440)
    return { ok: false, completedWork: [] };

  const targetAbsolute = absoluteMinutes(game) + minutes;
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

  const dayStart = (game.day - 1) * 1440;
  game.minutes = targetAbsolute - dayStart;
  if (logText) addLog(game, "tempo", logText);
  return { ok: true, completedWork };
}

/** Ajuste manual no mesmo dia. Ao mover o relógio para frente, turnos
 * programados são resolvidos; ao corrigir para trás, nenhum trabalho é criado. */
export function setCampaignTime(game: GameState, targetMinute: number) {
  if (!Number.isInteger(targetMinute) || targetMinute < 0 || targetMinute >= 1440)
    return { ok: false, completedWork: [] as ReturnType<typeof processScheduledShelterWork> };
  if (targetMinute >= game.minutes) return advanceCampaignTime(game, targetMinute - game.minutes);
  game.minutes = targetMinute;
  return { ok: true, completedWork: [] as ReturnType<typeof processScheduledShelterWork> };
}

/** Antes da passagem para o próximo dia, resolve turnos já programados que
 * terminariam ainda hoje. Não agenda trabalho novo. */
export function settleScheduledWorkBeforeMorning(game: GameState) {
  const remaining = Math.max(0, 1439 - game.minutes);
  return advanceCampaignTime(game, remaining);
}
