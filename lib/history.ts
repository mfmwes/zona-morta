import type { GameState } from "./game";

export type HistoryScope = "events" | "chat";
type LogEntry = GameState["log"][number];
const chatKinds = new Set(["chat", "dados", "dano", "ameaça"]);

export function isChatLog(entry: Pick<LogEntry, "kind">) {
  return chatKinds.has(entry.kind);
}

export function historyEntries(game: GameState, scope: HistoryScope) {
  return game.log.filter(entry => scope === "chat" ? isChatLog(entry) : !isChatLog(entry));
}

// The master's normal, revision-checked save persists this change for the table.
// Clearing the feed leaves resources, scene limits and applied damage untouched.
export function clearCampaignHistory(game: GameState, scope: HistoryScope) {
  const previousCount = game.log.length;
  game.log = game.log.filter(entry => scope === "chat" ? !isChatLog(entry) : isChatLog(entry));
  return previousCount - game.log.length;
}
