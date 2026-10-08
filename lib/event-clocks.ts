import { absoluteMinutes, addLog, type GameState, type HexEvent } from "./game";
import type { EventClockPlan } from "./event-resolution-types";

export function nextEventClockMinute(game: GameState) {
  const due = Object.values(game.hexes).flatMap(hex => hex.events
    .filter(e => e.clock?.status === "active" && e.status !== "archived")
    .map(e => e.clock!.dueAbsoluteMinute - (game.day - 1) * 1440));
  return due.length ? Math.max(game.minutes, Math.min(...due)) : null;
}

export function expireEventClocks(game: GameState) {
  const expired: string[] = [];
  for (const [hexId, hex] of Object.entries(game.hexes)) for (const event of hex.events) {
    const c = event.clock;
    if (!c || c.status !== "active" || event.status === "archived" || c.dueAbsoluteMinute > absoluteMinutes(game)) continue;
    c.status = "expired";
    const before = game.noise;
    game.noise = Math.min(5, game.noise + c.noise);
    const text = `${c.label} · Hex ${hexId}: ${c.consequence} Barulho +${game.noise-before}.`;
    addLog(game, "evento", text);
    expired.push(text);
    if (game.playerActions) game.playerActions.policy.paused = true;
  }
  return expired;
}

export function beginEventClock(game: GameState, event: HexEvent, plan: EventClockPlan | undefined) {
  if (!plan?.initial || event.clock) return;
  event.clock = { ...plan.initial, dueAbsoluteMinute: absoluteMinutes(game) + plan.initial.minutes, status: "active" };
  // Duration belongs to the proposal, not to the saved countdown.
  delete (event.clock as typeof event.clock & {minutes?:number}).minutes;
}

export function eventClockIssue(event: HexEvent, plan: EventClockPlan | undefined) {
  if (!plan) return "";
  if (event.clock?.status === "expired" && plan.action !== "keep") return "O prazo já venceu. Interrompa a etapa pendente e registre a consequência atual sem prorrogar ou desarmar retroativamente.";
  if (plan.action === "extend" && (!event.clock || event.clock.status !== "active") && !plan.initial) return "Inicie o prazo anunciado antes de prorrogá-lo.";
  return "";
}

export function concludeEventClock(event: HexEvent, plan: EventClockPlan | undefined) {
  if (!plan || !event.clock || event.clock.status !== "active") return;
  if (plan.action === "cancel") event.clock.status = "cancelled";
  if (plan.action === "extend") event.clock.dueAbsoluteMinute += plan.minutes ?? 0;
}
