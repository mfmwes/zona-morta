import { absoluteMinutes, addLog, type GameState } from "./game";
import { processScheduledShelterWork } from "./shelter-projects";
import { runningActivities } from "./activity-timeline";
import { resolveActivityEffect } from "./activity-handlers";
import { rollDie } from "./rolls";
import { ensureParallelTime, participantTimePreview, resetParallelTime, syncAllParticipantsToCurrentTime, type ParticipantTimePreview } from "./activity";

export type AdvanceTimeResult = {
  ok: boolean;
  issue?: string;
  completedActivities?: string[];
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

function resolveScheduledActivity(game: GameState, id: string, die = rollDie): string | null {
  const draft = structuredClone(game);
  const activity = runningActivities(draft).find(a => a.id === id);
  if (!activity) return null;
  if (activity.participantIds.some(id => !draft.survivors.some(p => p.id === id))) return "Um participante foi removido. Interrompa a atividade para continuar.";
  // Libera apenas este compromisso no clone; outros compromissos continuam validados.
  activity.status = "completed";
  if (activity.participantIds.some(id => (draft.survivors.find(p => p.id === id)?.hex ?? draft.partyHex) !== activity.hexId)) return "Os participantes mudaram de hex. Interrompa a atividade para continuar.";
  const effect = resolveActivityEffect(draft, activity, die);
  if (!effect.ok) return effect.message;
  const result = effect.message;
  const saved = draft.activities!.find(a => a.id === id)!;
  delete saved.issue;
  const op = draft.playerActions?.operations.find(op => op.id === saved.operationId);
  if (op) { op.status = "done"; op.result = result; }
  Object.assign(game, draft);
  return null;
}

/** Uma única ordem de conclusão para exploração e obras, inclusive no ajuste manual. */
function advanceWorldToMinute(game: GameState, targetMinute: number, logText?: string, die = rollDie, options: { ignoreNightEvents?: boolean } = {}): AdvanceTimeResult {
  if (!Number.isInteger(targetMinute) || targetMinute < game.minutes || targetMinute >= 1440)
    return { ok: false, completedWork: [] };
  const completedWork: ReturnType<typeof processScheduledShelterWork> = [];
  const completedActivities: string[] = [];
  const dayStart = (game.day - 1) * 1440;
  while (true) {
    const workDue = dueWorkBefore(game, dayStart + targetMinute);
    const activityDue = runningActivities(game).find(a => a.endMinute <= targetMinute)?.endMinute;
    const nightDue = !options.ignoreNightEvents && game.minutes < 1080 && targetMinute >= 1080 && Object.values(game.hexes).some(hex=>hex.events.some(e=>e.triggerType==="night"&&(e.status??"pending")==="pending")) ? 1080 : undefined;
    const deadlines = [workDue === undefined ? undefined : workDue - dayStart, activityDue, nightDue].filter((n): n is number => n !== undefined);
    if (!deadlines.length) break;
    game.minutes = Math.max(game.minutes, Math.min(...deadlines));
    const workResolved = processScheduledShelterWork(game);
    completedWork.push(...workResolved);
    const due = runningActivities(game).filter(a => a.endMinute <= game.minutes);
    let pendingIssue: string | undefined;
    for (const activity of due) {
      const issue = resolveScheduledActivity(game, activity.id, die);
      if (issue) {
        const blocked = game.activities!.find(a => a.id === activity.id)!;
        blocked.issue = issue;
        pendingIssue ??= issue;
        continue;
      }
      completedActivities.push(activity.id);
    }
    if (nightDue === game.minutes) {
      if (game.playerActions) game.playerActions.policy.paused = true;
      return { ok: true, issue: "Anoiteceu. Há acontecimentos noturnos para o mestre resolver antes de avançar mais.", completedWork, completedActivities };
    }
    if (pendingIssue) return { ok: true, issue: pendingIssue, completedWork, completedActivities };
    // Uma consequência narrativa pausa o salto seguinte, mas conclui todas as ações simultâneas.
    if (game.playerActions?.policy.paused && due.length && game.minutes < targetMinute)
      return { ok: true, issue: "Há consequências para o mestre resolver antes de avançar mais.", completedWork, completedActivities };
    if (!due.length && !workResolved.length) return { ok: true, issue: "Confira o turno pendente do abrigo antes de avançar.", completedWork, completedActivities };
  }
  game.minutes = targetMinute;
  if (logText) addLog(game, "tempo", logText);
  return { ok: true, completedWork, completedActivities };
}

export function nextActivityMinute(game: GameState): number | null {
  const work = dueWorkBefore(game, (game.day - 1) * 1440 + 1439);
  const minute = runningActivities(game)[0]?.endMinute;
  const night = game.minutes < 1080 && Object.values(game.hexes).some(hex=>hex.events.some(e=>e.triggerType==="night"&&(e.status??"pending")==="pending")) ? 1080 : undefined;
  const deadlines = [work === undefined ? undefined : work - (game.day - 1) * 1440, minute, night].filter((n): n is number => n !== undefined);
  return deadlines.length ? Math.max(game.minutes, Math.min(...deadlines)) : null;
}

export function advanceToNextActivity(game: GameState, die = rollDie): AdvanceTimeResult {
  if (game.conflict?.active) return { ok: false, issue: "Encerre o conflito antes de avançar a exploração.", completedWork: [] };
  const target = nextActivityMinute(game);
  if (target === null) return { ok: false, issue: "Não há atividades agendadas.", completedWork: [] };
  const result = advanceWorldToMinute(game, target, undefined, die);
  if (result.ok) syncAllParticipantsToCurrentTime(game);
  return result;
}

/** Avança o relógio global. Como todos esperaram esse intervalo, elimina
 * qualquer folga paralela ainda não usada pelos subgrupos. */
export function advanceCampaignTime(game: GameState, minutes: number, logText?: string): AdvanceTimeResult {
  if (!Number.isInteger(minutes) || minutes < 0 || game.minutes + minutes >= 1440)
    return { ok: false, completedWork: [] };
  // Mesmo sem salto, permite resolver uma conclusão que aguardava acesso.
  const result = advanceWorldToMinute(game, game.minutes + minutes, logText);
  if (result.ok) syncAllParticipantsToCurrentTime(game);
  return result;
}

/** Compatibilidade com ações imediatas antigas. Ações novas usam agendamento
 * e sempre começam no horário atual, sem preencher intervalos passados. */
export function advanceParticipantTime(game: GameState, survivorIds: string[], minutes: number, logText?: string): AdvanceParticipantTimeResult {
  const preview = participantTimePreview(game, survivorIds, minutes);
  if (!preview.ok) return { ...preview, completedWork: [] };

  if (runningActivities(game).length) return { ...preview, ok: false, issue: "Use a linha do tempo para concluir as atividades antes de uma ação imediata.", completedWork: [] };
  const timeline = ensureParallelTime(game);
  let completedWork: ReturnType<typeof processScheduledShelterWork> = [];
  if (preview.worldAfter > game.minutes) {
    const result = advanceWorldToMinute(game, preview.worldAfter);
    if (!result.ok || result.issue) return { ...preview, ok: false, issue: result.issue, completedWork: [] };
    completedWork = result.completedWork;
  }
  for (const id of new Set(survivorIds)) timeline.survivorMinutes[id] = preview.endMinute;
  if (logText) addLog(game, "tempo", logText);
  return { ...preview, ok: true, completedWork };
}

/** Ajuste manual no mesmo dia. Ao mover o relógio para frente, turnos
 * programados são resolvidos; ao corrigir para trás, nenhum trabalho é criado. */
export function setCampaignTime(game: GameState, targetMinute: number) {
  if (!Number.isInteger(targetMinute) || targetMinute < 0 || targetMinute >= 1440)
    return { ok: false, completedWork: [] as ReturnType<typeof processScheduledShelterWork> };
  if (targetMinute >= game.minutes) return advanceCampaignTime(game, targetMinute - game.minutes);
  if (runningActivities(game).length) return { ok: false, issue: "Interrompa as atividades em andamento antes de corrigir o relógio para trás.", completedWork: [] };
  game.minutes = targetMinute;
  resetParallelTime(game);
  return { ok: true, completedWork: [] as ReturnType<typeof processScheduledShelterWork> };
}

/** Antes da passagem para o próximo dia, resolve turnos já programados que
 * terminariam ainda hoje. Não agenda trabalho novo. */
export function settleScheduledWorkBeforeMorning(game: GameState) {
  const result = advanceWorldToMinute(game, 1439, undefined, rollDie, { ignoreNightEvents: true });
  if (result.ok) syncAllParticipantsToCurrentTime(game);
  return result;
}
