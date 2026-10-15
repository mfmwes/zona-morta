import type { GameState } from "./game";

export type PlayerAttentionTarget = "rest" | "conflict" | "inventory" | "map";
export type PlayerAttentionItem = { id: string; title: string; detail: string; target: PlayerAttentionTarget; tone: "danger" | "notice" };

/** Read only the projection belonging to this player; never derive notices from private state. */
export function playerAttention(game: GameState, actorId: string | null): PlayerAttentionItem[] {
  const view = game.publicPlayerActions;
  if (!actorId || view?.actorId !== actorId || !game.survivors.some(s => s.id === actorId)) return [];
  const items: PlayerAttentionItem[] = [];
  const damage = game.publicConflict?.active ? game.publicConflict.pendingDamage.length : 0;
  if (damage) items.push({ id: "damage", title: `${damage} impacto(s) aguardando decisão`, detail: "Revise o dano e escolha como usar PV e Armadura.", target: "conflict", tone: "danger" });
  for (const op of view.operations) {
    if (op.day !== game.day || op.scene !== (game.scene ?? 1) || !["forming", "access"].includes(op.status)) continue;
    if (op.type === "rest" && op.individualChoices && op.invitedIds.includes(actorId) && !op.participantIds.includes(actorId) && !op.awaitingNight) {
      items.push({ id: op.id, title: `Escolha seu descanso ${op.kind === "long" ? "longo" : "curto"}`, detail: "Faltam suas duas ações para confirmar o descanso.", target: "rest", tone: "notice" });
    } else if (op.type === "transfer" && op.invitedIds.includes(actorId) && !op.participantIds.includes(actorId)) {
      items.push({ id: op.id, title: "Entrega aguardando confirmação", detail: "Confira o item oferecido antes de aceitar na mochila.", target: "inventory", tone: "notice" });
    } else if (op.type === "search" && op.status === "access" && op.initiatorId === actorId) {
      items.push({ id: op.id, title: "Busca aguardando teste de acesso", detail: "Abra o local da busca no mapa para continuar.", target: "map", tone: "notice" });
    }
  }
  return items;
}
