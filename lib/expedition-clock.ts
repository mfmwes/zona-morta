import { absoluteMinutes, addLog, type GameState } from "./game";
import { nextEventClockMinute } from "./event-clocks";
import { closeDayWithPlan, defaultDayClosePlan } from "./survival";
import { advanceCampaignTime, type AdvanceTimeResult } from "./time";

/** Manual expedition clock: daily provisions are settled at midnight without rest or a new scene.
 * Immediate actions keep their existing same-day validation in advanceCampaignTime. */
export function advanceExpeditionTime(game: GameState, minutes: number): AdvanceTimeResult {
  const result: AdvanceTimeResult = { ok: false, completedWork: [], completedActivities: [] };
  if (!Number.isSafeInteger(minutes) || minutes < 0 || minutes > 7 * 1440) return result;
  if (game.conflict?.active) return { ...result, issue: "Encerre o conflito antes de avançar a exploração." };
  const target = absoluteMinutes(game) + minutes;
  while (true) {
    const midnight = game.day * 1440;
    const next = target >= midnight ? 1439 : target - (game.day - 1) * 1440;
    const step = advanceCampaignTime(game, Math.max(0, next - game.minutes));
    result.ok = step.ok;
    result.completedWork.push(...step.completedWork);
    result.completedActivities!.push(...(step.completedActivities ?? []));
    if (!step.ok || step.issue) return { ...result, issue: step.issue };
    if (target < midnight) break;
    const clockDue = nextEventClockMinute(game);
    const oldDay = game.day;
    const closed = closeDayWithPlan(game, defaultDayClosePlan(game), "midnight");
    if (!closed.ok) return { ...result, issue: "Conclua ou interrompa as atividades pendentes antes da passagem de dia." };
    // Unperformed rest choices must not grant recovery on a later day.
    for (const person of game.survivors) delete person.restPlan;
    for (const op of game.playerActions?.operations ?? []) if (op.type === "rest" && op.day === oldDay && op.status === "forming") {
      op.status = "cancelled"; op.result = "O dia virou sem realizar este descanso.";
    }
    if (clockDue !== null && clockDue <= 1440) return { ...result, issue: "Um prazo venceu à meia-noite. Resolva a consequência antes de avançar mais." };
  }
  if (minutes) addLog(game, "tempo", `Passaram ${minutes} minutos na expedição, sem conceder descanso.`);
  return result;
}

