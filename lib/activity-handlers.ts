import type { GameState } from "./game";
import type { ScheduledActivity } from "./activity-timeline";

type Result = { ok: true; message: string } | { ok: false; message: string };
type Handler = (game: GameState, activity: ScheduledActivity, die: (faces: number) => number) => Result;
const handlers: Partial<Record<ScheduledActivity["type"], Handler>> = {};

/** Registro sem dependências de regras: evita ciclos de inicialização entre jogo,
 * relógio, inventário e abrigo. Cada regra fornece sua própria conclusão. */
export function registerActivityHandler(type: ScheduledActivity["type"], handler: Handler) { handlers[type] = handler; }
export function resolveActivityEffect(game: GameState, activity: ScheduledActivity, die: (faces: number) => number): Result {
  return handlers[activity.type]?.(game, activity, die) ?? { ok: false, message: "A regra desta atividade não está disponível. Recarregue a campanha." };
}
