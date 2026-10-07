import { addLog, survivorHex, type GameState } from "./game";
import { createId } from "./id";
import { defaultPlayerPolicy, type TeamOperation } from "./player-actions-types";
import { participantTimePreview, timedActionParticipantIssue } from "./activity";
import { scheduleGroupRest, restActionsFor, restDurationMinutes, type RestChoice, type RestKind } from "./abilities";
import { rollDie } from "./rolls";

export function currentTableRest(game: GameState, actorId?: string): TeamOperation | undefined {
  const operations = game.publicPlayerActions?.operations ?? game.playerActions?.operations ?? [];
  return operations.find(op => op.type === "rest" && op.individualChoices && op.status === "forming" && op.day === game.day && op.scene === (game.scene ?? 1) && (!actorId || op.invitedIds.includes(actorId)));
}

export function tableRestReadyForNight(game: GameState) {
  const op = currentTableRest(game);
  return Boolean(op?.awaitingNight && op.kind === "long" && op.invitedIds.length === game.survivors.length
    && game.survivors.every(p => op.participantIds.includes(p.id) && p.restPlan?.kind === "long"
      && JSON.stringify(p.restPlan.choices) === JSON.stringify(op.plans?.[p.id])));
}

function availabilityIssue(game: GameState, ids: string[]) {
  const issue = timedActionParticipantIssue(game, ids, "um descanso");
  if (issue) return issue;
  const unresolved = Object.values(game.hexes).some(hex => hex.points.some(point => point.preparation?.attempts.some(attempt =>
    ["pending", "ready"].includes(attempt.status) && attempt.participants.some(id => ids.includes(id)))));
  return unresolved ? "Conclua a busca em andamento antes do descanso." : null;
}

export function requestTableRest(game: GameState, kind: RestKind, initiatorId = game.survivors[0]?.id, selectedIds?: string[]) {
  if (!game.survivors.length) return "Não há sobreviventes para descansar.";
  if (game.conflict?.active) return "Encerre o conflito antes de solicitar descanso.";
  if (game.playerActions?.policy.paused) return "Resolva a pausa da mesa antes de solicitar descanso.";
  const hex = survivorHex(game, initiatorId!);
  const invitedIds = selectedIds ?? game.survivors.filter(p => survivorHex(game, p) === hex && !timedActionParticipantIssue(game, [p.id])).map(p => p.id);
  if (!invitedIds.length || new Set(invitedIds).size !== invitedIds.length || !invitedIds.includes(initiatorId!)
    || invitedIds.some(id => !game.survivors.some(p => p.id === id && survivorHex(game, p) === hex))) return "Escolha participantes presentes no mesmo hex, incluindo quem solicita.";
  if (game.playerActions?.operations.some(op => op.type === "rest" && op.status === "forming" && op.day === game.day
    && op.invitedIds.some(id => invitedIds.includes(id)))) return "Já há um descanso aguardando confirmação destes participantes.";
  const issue = availabilityIssue(game, invitedIds);
  if (issue) return issue;
  if (kind === "short" && !participantTimePreview(game, invitedIds, restDurationMinutes.short).ok) return "O descanso curto precisa terminar antes da passagem de dia.";
  if (kind === "long" && !participantTimePreview(game, invitedIds, restDurationMinutes.long).ok && invitedIds.length !== game.survivors.length) return "O descanso deste subgrupo precisa terminar antes da passagem de dia.";
  game.playerActions ??= { policy: defaultPlayerPolicy(), operations: [], receipts: [], withdrawals: [], markers: [] };
  game.playerActions.operations = game.playerActions.operations.filter(op => op.day === game.day && (op.scene === (game.scene ?? 1) || op.status === "scheduled" || game.activities?.some(a => a.status === "running" && a.operationId === op.id)));
  if (game.playerActions.operations.length >= 150) return "Limite de operações atingido.";
  game.playerActions.operations.push({ id: createId(), type: "rest", individualChoices: true, initiatorId: initiatorId!,
    day: game.day, scene: game.scene ?? 1, hexId: hex, kind, status: "forming", participantIds: [],
    invitedIds, plans: {} });
  addLog(game, "equipe", `Descanso ${kind === "short" ? "curto" : "longo"} solicitado: cada participante escolhe duas ações na própria ficha.`);
  return null;
}

export function confirmTableRest(game: GameState, actorId: string, operationId: string, choices: RestChoice[], _die = rollDie) {
  const op = game.playerActions?.operations.find(op => op.id === operationId);
  const actor = game.survivors.find(p => p.id === actorId);
  if (!op || op !== currentTableRest(game, actorId) || !op.kind || !actor || !op.invitedIds.includes(actorId) || op.awaitingNight) return "Este descanso não aceita suas escolhas.";
  if (game.conflict?.active) return "Encerre o conflito antes de confirmar o descanso.";
  const issue = availabilityIssue(game, [actorId]);
  if (issue) return issue;
  if (choices.length !== 2 || choices.some(choice => !restActionsFor(op.kind!).includes(choice.action) || !game.survivors.some(target => target.id === choice.targetId && op.invitedIds.includes(target.id) && survivorHex(game, target) === survivorHex(game, actor)))) return "Escolha duas ações válidas e alvos presentes no mesmo hex.";
  if (op.invitedIds.some(id => !game.survivors.some(p => p.id === id && survivorHex(game, p) === op.hexId))) return "O grupo mudou. Cancele e solicite outro descanso.";
  op.plans ??= {};
  op.plans[actorId] = structuredClone(choices);
  actor.restPlan = { kind: op.kind, choices: structuredClone(choices) };
  if (!op.participantIds.includes(actorId)) op.participantIds.push(actorId);
  if (!op.invitedIds.every(id => op.participantIds.includes(id))) return null;
  if (game.survivors.filter(p => op.invitedIds.includes(p.id)).some(p => p.restPlan?.kind !== op.kind || JSON.stringify(p.restPlan?.choices) !== JSON.stringify(op.plans?.[p.id]))) return "Uma escolha confirmada mudou. Confirme novamente antes de concluir.";
  const allIssue = availabilityIssue(game, op.invitedIds);
  if (allIssue) return allIssue;
  if (op.kind === "long" && !participantTimePreview(game, op.invitedIds, restDurationMinutes.long).ok) {
    op.awaitingNight = true;
    op.result = "Todos confirmaram. Escolhas prontas para Encerrar dia.";
    return null;
  }
  const result = scheduleGroupRest(game, op.kind, op.invitedIds.map(id => ({ survivorId: id, choices: op.plans![id] })), op.id, _die);
  if (!result.ok) return result.message;
  const saved = game.playerActions!.operations.find(row => row.id === op.id)!;
  saved.status = result.completed ? "done" : "scheduled";
  saved.result = result.completed ? "Descanso concluído." : "Descanso iniciado. Benefícios serão aplicados na conclusão.";
  return null;
}
