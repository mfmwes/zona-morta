import { addLog, content as gameContent, survivorHex, survivorIsDown, survivorStats, type GameState } from "./game";
import { collectLocationStock, deepSearchCandidateKeys, finishPreparedSearch, pendingPlayerSearchOperation, prepareLocationForExploration, quickSearchOptions, rollSearchAccess, searchAreaSessionState, searchAreaState, searchMentors, startDeepSearch, startSearch, warehouseWorkers } from "./hex-automation";
import { moveSurvivors } from "./hex-actions";
import { atSharedStorage, catalogKey, transferItem, transferProvisions } from "./inventory";
import { survivorTimedCommitment } from "./activity";
import { resolveGroupRest, restActionsFor, type RestChoice } from "./abilities";
import { eventTriggerReady } from "./hex-generators";
import { projectPlayerSceneBoard, type SceneBoardScene } from "./scene-board";
import { shelterTravelMinutes } from "./shelter-projects";
import { rollDie } from "./rolls";
import { confirmTableRest, requestTableRest } from "./table-rest";
import { defaultPlayerPolicy, playerCommandSchema, playerPolicySchema, type PlayerActionState, type PlayerCommand, type PublicPlayerActions, type TeamOperation } from "./player-actions-types";

export function playerActionState(game: GameState): PlayerActionState {
  return game.playerActions ?? { policy: defaultPlayerPolicy(), operations: [], receipts: [], withdrawals: [], markers: [] };
}
function active(game: GameState, op: TeamOperation) {
  if (op.day !== game.day || op.scene !== (game.scene ?? 1) || !["forming", "access"].includes(op.status)) return false;
  if (op.type === "search" && op.status === "access") {
    const attempt = game.hexes[op.hexId]?.points.find(p => p.id === op.pointId)?.preparation?.attempts.find(a => a.id === op.id);
    if (attempt && ["completed", "failed"].includes(attempt.status)) return false;
  }
  return true;
}
function areaPermission(game: GameState, hexId: string, pointId: string, areaId: string) {
  const hex = game.hexes[hexId];
  const point = hex?.points.find(p => p.id === pointId && p.revealed && !p.clueTargetHex);
  const area = point?.preparation?.areas.find(a => a.id === areaId);
  if (hex?.discovery !== "explorado" || !area || area.searchable === false) return undefined;
  const specificItems = deepSearchCandidateKeys(area);
  return { objectives: ["open", ...quickSearchOptions(area).filter(option => option.available).map(option => option.id), ...(specificItems.length ? ["item" as const] : [])], specificItems };
}
export function playerTimedActionIssue(game: GameState, ids: string[], except?: string) {
  if (game.conflict?.active) return "Resolva o conflito antes de iniciar exploração, viagem ou descanso.";
  for (const id of ids) {
    const person = game.survivors.find(p => p.id === id);
    if (!person || survivorIsDown(person)) return "Um participante está ausente ou caído.";
    const commitment = survivorTimedCommitment(game, id);
    if (commitment) return commitment.label;
    if (playerActionState(game).operations.some(op => op.id !== except && active(game, op) && op.status === "access" && op.participantIds.includes(id))) return "Conclua a busca em andamento antes de outra atividade.";
  }
  return null;
}
function checkCapacity(game: GameState, id: string) {
  const person = game.survivors.find(p => p.id === id);
  if (!person || person.inventory.length > 120) return false;
  const stats = survivorStats(person);
  return stats.carried <= stats.capacity && (!stats.cart || stats.cart.carried <= stats.cart.capacity);
}
function knownPosition(scene: SceneBoardScene, x: number, y: number, width = 1, height = 1) {
  if (x < 0 || y < 0 || x + width > scene.width || y + height > scene.height) return false;
  return !scene.fogEnabled || (scene.revealedAreas ?? []).some(a => x >= a.x && y >= a.y && x + width <= a.x + a.width && y + height <= a.y + a.height);
}
export function projectPlayerActions(game: GameState, actorId: string): PublicPlayerActions {
  const state = playerActionState(game);
  const actor = game.survivors.find(p => p.id === actorId);
  const hexId = survivorHex(game, actorId);
  const { paused, transfers, deposits, rest, tokens } = state.policy;
  const policy = { paused, transfers, deposits, rest, tokens };
  const result: PublicPlayerActions = { policy, actorId, hexId, busy: playerTimedActionIssue(game, [actorId]), peers: game.survivors.map(p => ({ id: p.id, name: p.name, hex: survivorHex(game, p) })), locations: [], areas: [], stock: [], routes: [], operations: [], supplies: [], markers: state.markers.filter(m => { const scene = game.sceneBoard?.scenes.find(s => s.id === m.sceneId && s.id === game.sceneBoard?.activeSceneId && s.visibleToPlayers); return m.day === game.day && scene && knownPosition(scene, m.x, m.y); }) };
  for (const point of game.hexes[hexId]?.points ?? []) {
    if (!point.revealed || point.clueTargetHex) continue;
    const prep = point.preparation;
    const publicAreas = prep?.areas ?? [];
    const areaStates = publicAreas.map(area => ({ area, state: searchAreaSessionState(game, hexId, point.id, area) }));
    result.locations.push({
      hexId,
      pointId: point.id,
      pointName: point.name,
      prepared: Boolean(prep && publicAreas.every(area => area.visibleOutcome
        || prep.stock.some(stock => stock.areaId === area.id && stock.attemptId === undefined))),
      areaCount: publicAreas.length,
      searchedAreas: areaStates.filter(({ state }) => ["deep-available", "deep-ongoing", "exhausted", "searched"].includes(state)).length,
      availableAreas: areaStates.filter(({ state }) => state === "available").length,
      narrativeAreas: areaStates.filter(({ state }) => state === "narrative").length,
      stockUnits: prep?.stock.filter(row => row.remaining > 0).reduce((sum, row) => sum + row.remaining, 0) ?? 0,
      apparentStockUnits: prep?.stock.filter(row => row.attemptId === undefined && row.remaining > 0).reduce((sum, row) => sum + row.remaining, 0) ?? 0,
      activeSearches: new Set([
        ...(prep?.attempts.filter(attempt => ["pending", "ready"].includes(attempt.status)).map(attempt => attempt.id) ?? []),
        ...state.operations.filter(operation => operation.type === "search" && operation.day === game.day && operation.scene === (game.scene ?? 1)
          && ["forming", "access"].includes(operation.status) && operation.hexId === hexId && operation.pointId === point.id).map(operation => operation.id),
      ]).size,
    });
    for (const area of publicAreas) {
      const permission = areaPermission(game, hexId, point.id, area.id);
      const state = searchAreaSessionState(game, hexId, point.id, area);
      const objectives = permission?.objectives.filter(o => o === "open" || o === "item" || quickSearchOptions(area).some(option => option.id === o && option.available)) ?? [];
      const attempt = prep?.attempts.find(candidate => candidate.areaId === area.id && ["pending", "ready"].includes(candidate.status));
      const knownKeys = new Set(prep?.stock.filter(stock => stock.areaId === area.id && stock.remaining > 0).map(stock => stock.item.catalogKey).filter(Boolean) ?? []);
      const specificItems = (permission?.specificItems ?? [])
        .filter(key => state !== "deep-available" || !knownKeys.has(key))
        .map(key => {
          const item = gameContent.catalog.find(entry => catalogKey(entry) === key);
          return item ? { key, name: item.name } : null;
        }).filter((item): item is { key: string; name: string } => Boolean(item));
      const eligibleWorkers = (area.spacious || area.minutes === 60)
        ? warehouseWorkers(game, hexId).map(person => ({ id: person.id, name: person.name }))
        : [];
      const mentors = attempt ? searchMentors(game, hexId, point.id, attempt.id, actorId).map(person => ({ id: person.id, name: person.name })) : [];
      const completed = [...(prep?.attempts.filter(candidate => candidate.areaId === area.id && ["completed", "failed"].includes(candidate.status)) ?? [])].at(-1);
      const lastAttention = completed?.outcome?.success === false
        ? "Falha no acesso: o mestre resolve a consequência narrativa."
        : completed?.outcome?.with === "Fear"
          ? "Rolagem com Medo: o mestre pode introduzir uma complicação."
          : undefined;
      result.areas.push({
        hexId, pointId: point.id, areaId: area.id, name: area.name, pointName: point.name, signal: area.signal,
        minutes: area.minutes, noise: area.noise, access: area.access, objectives,
        available: Boolean(permission) && state === "available" && !pendingPlayerSearchOperation(game, hexId, point.id, area.id), searchable: area.searchable !== false, state,
        visibleOutcome: area.visibleOutcome ?? null, specificItems, warehouseWorkers: eligibleWorkers, mentors,
        ...(completed?.result ? {
          lastResult: completed.result,
          lastResultDepth: completed.kind === "deep" ? "deep" as const : "normal" as const,
          ...(completed.mode === "open" && completed.roll ? { lastRoll: completed.effectiveRoll ?? completed.roll } : {}),
        } : {}),
        ...(lastAttention ? { lastAttention } : {}),
      });
      for (const stock of prep?.stock.filter(s => s.areaId === area.id && s.remaining > 0) ?? []) {
        if (stock.attemptId && !prep?.attempts.some(a => a.id === stock.attemptId && a.status === "completed")) continue;
        result.stock.push({
          hexId, pointId: point.id, areaId: area.id, stockId: stock.id, name: stock.item.name, catalogKey: stock.item.catalogKey, remaining: stock.remaining,
          accessible: area.access !== "blocked" && stock.accessible !== false,
          source: stock.attemptId ? "search" : "apparent",
          condition: stock.item.condition,
          requiresFuelContainer: Boolean(stock.requiresFuelContainer),
        });
      }
    }
  }
  result.routes = state.policy.routes.filter(r => r.from === hexId && game.hexes[r.to]?.discovery !== "desconhecido" && game.hexes[r.to]).map(r => ({ destination: r.to, name: game.hexes[r.to].sector?.name ?? `Hex ${r.to}`, minutes: shelterTravelMinutes(game, r.from, r.to, game.hexes[r.to].routeHours * 60) }));
  result.operations = state.operations.filter(op => op.day === game.day && op.scene === (game.scene ?? 1) && (op.type === "transfer" || op.type === "exception" ? op.initiatorId === actorId || op.invitedIds.includes(actorId) : op.hexId === hexId || op.initiatorId === actorId || op.invitedIds.includes(actorId) || op.type === "rest")).map(op => {
    const safe: Omit<TeamOperation, "itemSnapshot" | "plans"> = { ...op };
    delete (safe as TeamOperation).itemSnapshot; delete (safe as TeamOperation).plans;
    if (safe.type === "search" && safe.status === "access" && !active(game, op)) safe.status = "done";
    return safe;
  });
  if (actor && atSharedStorage(game, actorId)) {
    const used = (key: string) => state.withdrawals.filter(w => w.day === game.day && w.actorId === actorId && w.key === key).reduce((n, w) => n + w.quantity, 0);
    for (const resource of ["food", "water"] as const) result.supplies.push({ key: resource, name: resource === "food" ? "Comida solta (porções)" : "Água solta (porções)", available: game.shelter[resource], allowance: Math.max(0, state.policy.supplies[resource] - used(resource)) });
    for (const [itemId, limit] of Object.entries(state.policy.supplies.items)) {
      const item = game.shelter.inventory?.find(i => i.id === itemId);
      if (item) result.supplies.push({ key: itemId, itemId, name: item.name, available: item.qty - (item.committedAmmo ?? 0), allowance: Math.max(0, limit - used(itemId)) });
    }
  }
  return result;
}
function checkPlan(game: GameState, id: string, kind: "short" | "long") {
  const person = game.survivors.find(p => p.id === id);
  const plan = person?.restPlan;
  return plan?.kind === kind && plan.choices.length === 2 && plan.choices.every(c => restActionsFor(kind).includes(c.action as RestChoice["action"]) && game.survivors.some(p => p.id === c.targetId && survivorHex(game, p) === survivorHex(game, id))) ? structuredClone(plan.choices) as RestChoice[] : null;
}
function sameParty(game: GameState, op: TeamOperation) {
  return op.participantIds.every(id => game.survivors.some(p => p.id === id && survivorHex(game, p) === op.hexId));
}
function attentionAfter(game: GameState, op: TeamOperation, beforeEvents: Set<string>) {
  const triggered = Object.entries(game.hexes).some(([id, hex]) => hex.events.some(e => eventTriggerReady(game, id, e) && !beforeEvents.has(e.id)));
  if (op.attention || triggered || game.noise >= 3) {
    op.attention ??= triggered ? "Um acontecimento ficou pronto: o mestre resolve a consequência." : "Barulho elevado: o mestre resolve a consequência.";
    game.playerActions!.policy.paused = true;
  }
}
function executeCommand(game: GameState, actorId: string, cmd: PlayerCommand, die: (faces: number) => number): string | null {
  const state = game.playerActions!;
  const policy = state.policy;
  const actor = game.survivors.find(p => p.id === actorId)!;
  const hexId = survivorHex(game, actor);
  if (policy.paused && !["leave", "request", "clear-marker"].includes(cmd.type)) return "As ações da equipe estão pausadas pelo mestre.";
  const op = "operationId" in cmd ? state.operations.find(o => o.id === cmd.operationId) : undefined;
  if ("operationId" in cmd && (!op || !active(game, op))) return "Esta operação terminou, expirou ou mudou de cena.";
  if (cmd.type === "confirm-rest") return confirmTableRest(game, actorId, cmd.operationId, cmd.choices, die);
  if (cmd.type === "request-rest") return requestTableRest(game, cmd.kind, actorId);
  if (op?.individualChoices && cmd.type !== "request") return "Use as escolhas de descanso na sua própria ficha.";
  if (cmd.type === "request") {
    if (state.operations.filter(o => active(game, o) && o.type === "exception" && o.initiatorId === actorId).length >= 3) return "Você já tem três pedidos aguardando o mestre.";
    state.operations.push({ id: cmd.id, type: "exception", initiatorId: actorId, day: game.day, scene: game.scene ?? 1, hexId, status: "forming", participantIds: [actorId], invitedIds: [], purpose: cmd.text, attention: "Pedido de avaliação narrativa" });
    return null;
  }
  if (cmd.type === "prepare-search") {
    const point = game.hexes[cmd.hexId]?.points.find(p => p.id === cmd.pointId);
    if (cmd.hexId !== hexId || game.hexes[hexId]?.discovery !== "explorado" || !point?.revealed || point.clueTargetHex) return "Este local ainda não está disponível para exploração.";
    return prepareLocationForExploration(game, cmd.hexId, cmd.pointId);
  }
  if (["search", "deep-search", "travel", "rest"].includes(cmd.type)) {
    const issue = playerTimedActionIssue(game, [actorId]); if (issue) return issue;
    if (state.operations.some(o => active(game, o) && o.initiatorId === actorId && ["search", "travel", "rest"].includes(o.type))) return "Conclua ou cancele sua proposta anterior.";
    const operationType = cmd.type === "deep-search" ? "search" : cmd.type;
    const proposal: TeamOperation = { id: cmd.id, type: operationType as "search" | "travel" | "rest", initiatorId: actorId, day: game.day, scene: game.scene ?? 1, hexId, status: "forming", participantIds: [actorId], invitedIds: [] };
    if (cmd.type === "search" || cmd.type === "deep-search") {
      const permission = areaPermission(game, cmd.hexId, cmd.pointId, cmd.areaId);
      const point = game.hexes[cmd.hexId]?.points.find(p => p.id === cmd.pointId);
      const area = point?.preparation?.areas.find(a => a.id === cmd.areaId);
      const areaState = point && area ? searchAreaState(point, area) : undefined;
      const expectedState = cmd.type === "deep-search" ? "deep-available" : "available";
      if (cmd.hexId !== hexId || !permission?.objectives.includes(cmd.objective) || !point?.revealed || game.hexes[hexId].discovery !== "explorado" || !area || area.access === "blocked" || areaState !== expectedState || area.searchable === false) return "Esta área ou objetivo não está disponível para sua busca.";
      if (cmd.type === "deep-search" && cmd.objective === "open") return "A busca profunda precisa de um foco específico.";
      if (cmd.objective === "item" && (!cmd.catalogKey || !permission.specificItems.includes(cmd.catalogKey))) return "Escolha um item plausível para esta área.";
      if (cmd.objective !== "item" && (cmd.catalogKey || cmd.objectiveLabel)) return "Use a seleção específica apenas ao procurar um item.";
      if (state.operations.some(o => active(game, o) && o.type === "search" && o.hexId === hexId && o.pointId === point.id && o.areaId === area.id)) return "Já existe uma busca proposta para esta área. Entre nela.";
      Object.assign(proposal, {
        pointId: cmd.pointId, areaId: cmd.areaId, objective: cmd.objective, purpose: cmd.purpose,
        depth: cmd.type === "deep-search" ? "deep" : "normal",
        ...(cmd.objective === "item" ? {
          catalogKey: cmd.catalogKey,
          objectiveLabel: gameContent.catalog.find(entry => catalogKey(entry) === cmd.catalogKey)?.name,
        } : {}),
      });
    } else if (cmd.type === "travel") {
      if (!policy.routes.some(r => r.from === hexId && r.to === cmd.destination) || !game.hexes[cmd.destination] || game.hexes[cmd.destination].discovery === "desconhecido") return "Esta rota não foi liberada pelo mestre.";
      proposal.destination = cmd.destination;
    } else if (cmd.type === "rest") {
      if (!policy.rest) return "O mestre ainda não liberou a conclusão de descansos pela equipe.";
      const choices = checkPlan(game, actorId, cmd.kind); if (!choices) return "Registre suas duas escolhas na ficha antes de propor o descanso.";
      if (state.operations.some(o => active(game, o) && o.type === "rest")) return "Já há um descanso proposto para a mesa.";
      proposal.kind = cmd.kind; proposal.plans = { [actorId]: choices }; proposal.invitedIds = game.survivors.map(p => p.id);
    }
    state.operations.push(proposal); return null;
  }
  if (cmd.type === "join" && op) {
    if (op.status !== "forming" || !["search", "travel", "rest", "transfer"].includes(op.type)) return "Esta operação não aceita participantes.";
    if (op.type === "transfer") {
      if (!policy.transfers || !op.invitedIds.includes(actorId) || actorId === op.initiatorId) return "Somente o destinatário pode receber esta entrega.";
      const sender = game.survivors.find(p => p.id === op.initiatorId);
      const item = sender?.inventory.find(i => i.id === op.itemId);
      if (!item || JSON.stringify(item) !== op.itemSnapshot || survivorHex(game, sender!) !== hexId || !transferItem(game, op.initiatorId, actorId, op.itemId!, op.quantity!)) return "O item, a quantidade ou a posição mudou. Peça uma nova entrega.";
      if (!checkCapacity(game, actorId)) return "Você não tem capacidade para receber estes itens.";
      op.status = "done"; op.participantIds.push(actorId); op.result = `${actor.name} recebeu ${op.quantity} unidade(s).`; return null;
    }
    const issue = playerTimedActionIssue(game, [actorId], op.id); if (issue) return issue;
    if (op.type !== "rest" && op.hexId !== hexId) return "Vá ao mesmo hex para participar.";
    if (op.type === "rest") {
      if (!policy.rest || !op.invitedIds.includes(actorId)) return "Você não participa deste descanso.";
      const choices = checkPlan(game, actorId, op.kind!); if (!choices) return "Registre duas escolhas do mesmo tipo de descanso na ficha.";
      (op.plans ??= {})[actorId] = choices;
    }
    if (!op.participantIds.includes(actorId)) op.participantIds.push(actorId);
    return null;
  }
  if (cmd.type === "leave" && op) {
    if (!op.participantIds.includes(actorId) && !op.invitedIds.includes(actorId)) return "Você não participa desta operação.";
    if (op.status !== "forming") return "Uma busca iniciada precisa ser resolvida; o custo não pode ser desfeito.";
    if (actorId === op.initiatorId || (op.type === "transfer" && op.invitedIds.includes(actorId))) op.status = "cancelled";
    else { op.participantIds = op.participantIds.filter(id => id !== actorId); if (op.plans) delete op.plans[actorId]; }
    return null;
  }
  if ((cmd.type === "execute" || cmd.type === "roll-access") && op) {
    if (op.initiatorId !== actorId) return "Somente quem propôs pode concluir a operação.";
    const issue = playerTimedActionIssue(game, op.participantIds, op.id); if (issue) return issue;
    if (op.type !== "rest" && !sameParty(game, op)) return "Um participante saiu do hex. Atualize o grupo.";
    if (op.type === "travel") {
      if (cmd.type !== "execute" || !policy.routes.some(r => r.from === op.hexId && r.to === op.destination)) return "A rota deixou de estar liberada.";
      const result = moveSurvivors(game, op.destination!, op.participantIds); if (!result.ok) return result.message || "Este deslocamento não está disponível.";
      op.result = result.message; op.status = "done";
    } else if (op.type === "rest") {
      if (cmd.type !== "execute" || !policy.rest || game.survivors.some(p => !op.participantIds.includes(p.id)) || op.participantIds.length !== game.survivors.length) return "Todos os sobreviventes precisam confirmar suas duas ações.";
      if (game.survivors.some(p => JSON.stringify(checkPlan(game, p.id, op.kind!)) !== JSON.stringify(op.plans?.[p.id]))) return "As escolhas mudaram: cancele e proponha o descanso novamente.";
      const result = resolveGroupRest(game, op.kind!, game.survivors.map(p => ({ survivorId: p.id, choices: op.plans![p.id] })), die);
      if (!result.ok) return result.message;
      op.result = `Descanso concluído · ${result.minutes / 60}h · Medo +${result.fear}.`; op.status = "done";
    } else if (op.type === "search") {
      const point = game.hexes[op.hexId]?.points.find(p => p.id === op.pointId);
      const area = point?.preparation?.areas.find(a => a.id === op.areaId);
      const permission = areaPermission(game, op.hexId, op.pointId!, op.areaId!);
      if (!point?.revealed || !area || area.access === "blocked" || !permission?.objectives.includes(op.objective ?? "open")) return "O acesso ou os objetivos deste cômodo mudaram.";
      if (cmd.type === "execute") {
        if (op.status !== "forming") return "Esta busca já começou; resolva o acesso.";
        const selected = quickSearchOptions(area).find(o => o.id === op.objective && o.available);
        const specificKey = op.objective === "item" ? op.catalogKey : selected?.key;
        const specificLabel = op.objective === "item" ? op.objectiveLabel : selected?.label;
        if (op.depth === "deep") {
          if (!specificKey || op.objective === "open") return "Escolha um foco plausível para a busca profunda.";
          const error = startDeepSearch(game, { id: op.id, hexId: op.hexId, pointId: op.pointId!, areaId: op.areaId!, participants: op.participantIds,
            objective: specificLabel || "Item específico", purpose: op.purpose!, catalogKey: specificKey });
          if (error) return error;
          op.status = "access";
          return null;
        }
        const specific = op.objective !== "open";
        if (specific && !specificKey) return "O objetivo não é previsto para esta área. Escolha outra categoria ou faça uma busca aberta.";
        const error = startSearch(game, {
          id: op.id, hexId: op.hexId, pointId: op.pointId!, areaId: op.areaId!, participants: op.participantIds,
          mode: specific ? "specific" : "open", objective: specific ? (specificLabel || "Item específico") : "Vasculhar",
          purpose: op.purpose!, catalogKey: specific ? specificKey : undefined, quantity: 1,
          warehouseWorker: cmd.warehouseWorkerId,
        });
        if (error) return error;
        op.status = "access";
        if (area.access === "risk") return null;
      } else {
        if (op.status !== "access") return "Inicie a busca antes de resolver o acesso.";
        const error = rollSearchAccess(game, op.hexId, op.pointId!, op.id, {
          actorId, trait: cmd.trait, experiences: cmd.experiences, other: 0, edge: cmd.edge ?? "none", mentorId: cmd.mentorId,
        }, die);
        if (error) return error;
      }
      const error = finishPreparedSearch(game, op.hexId, op.pointId!, op.id, die); if (error) return error;
      // A conclusão usa um clone internamente: recupere a operação do novo estado.
      const saved = game.playerActions!.operations.find(o => o.id === op.id)!;
      const attempt = game.hexes[op.hexId].points.find(p => p.id === op.pointId)!.preparation!.attempts.find(a => a.id === op.id)!;
      saved.status = "done"; saved.result = attempt.result || "Busca concluída sem achados.";
      if (attempt.outcome?.success === false) saved.attention = "Falha no acesso: o mestre resolve a consequência narrativa. Nenhum achado foi sorteado.";
      if (attempt.outcome?.with === "Fear") saved.attention = "Rolagem com Medo: o mestre escolhe a complicação; os achados de um sucesso são preservados.";
    } else return "Esta operação não pode ser executada.";
    return null;
  }
  if (cmd.type === "collect") {
    const point = game.hexes[cmd.hexId]?.points.find(p => p.id === cmd.pointId && p.revealed);
    const stock = point?.preparation?.stock.find(s => s.id === cmd.stockId);
    const area = point?.preparation?.areas.find(a => a.id === stock?.areaId);
    if (cmd.hexId !== hexId || !stock || !area || area.access === "blocked" || stock.accessible === false
      || (stock.attemptId && !point?.preparation?.attempts.some(a => a.id === stock.attemptId && a.status === "completed"))) return "Este achado não está liberado para você.";
    if (point?.preparation?.collections.some(c => c.id === cmd.id)) return "Este identificador já foi usado em outra coleta.";
    return collectLocationStock(game, cmd.hexId, cmd.pointId, cmd.id, [{ stockId: cmd.stockId, ownerId: actorId, quantity: cmd.quantity, cartId: cmd.cartId }]);
  }
  if (cmd.type === "offer") {
    const receiver = game.survivors.find(p => p.id === cmd.targetId);
    const item = actor.inventory.find(i => i.id === cmd.itemId);
    if (state.operations.filter(o => active(game, o) && o.type === "transfer" && o.initiatorId === actorId).length >= 5) return "Você já tem cinco entregas aguardando confirmação.";
    if (!policy.transfers || !receiver || receiver.id === actorId || survivorHex(game, receiver) !== hexId || !item || cmd.quantity > item.qty - (item.committedAmmo ?? 0) || item.cartDeployed || item.cartItems?.length) return "Confira a liberação, o destinatário e os itens disponíveis.";
    state.operations.push({ id: cmd.id, type: "transfer", initiatorId: actorId, day: game.day, scene: game.scene ?? 1, hexId, status: "forming", participantIds: [actorId], invitedIds: [cmd.targetId], itemId: item.id, itemSnapshot: JSON.stringify(item), quantity: cmd.quantity, purpose: `${cmd.quantity} × ${item.name}` }); return null;
  }
  if (cmd.type === "deposit") {
    if (!policy.deposits || !atSharedStorage(game, actorId) || !transferItem(game, actorId, "shared", cmd.itemId, cmd.quantity)) return "O depósito ou o item não está acessível.";
    addLog(game, "inventário", `${actor.name} depositou ${cmd.quantity} unidade(s) nas reservas.`, actorId); return null;
  }
  if (cmd.type === "withdraw") {
    const key = cmd.resource === "item" ? cmd.itemId : cmd.resource;
    const limit = cmd.resource === "item" ? policy.supplies.items[cmd.itemId ?? ""] ?? 0 : policy.supplies[cmd.resource];
    const used = state.withdrawals.filter(w => w.day === game.day && w.actorId === actorId && w.key === key).reduce((n, w) => n + w.quantity, 0);
    if (!key || !atSharedStorage(game, actorId) || used + cmd.quantity > limit) return "Esta retirada excede a liberação diária ou o depósito está distante.";
    const success = cmd.resource === "item" ? transferItem(game, "shared", actorId, key, cmd.quantity) : transferProvisions(game, "shared", actorId, cmd.resource, cmd.quantity);
    if (!success || !checkCapacity(game, actorId)) return "O estoque ou sua capacidade não permite esta retirada.";
    state.withdrawals.push({ day: game.day, actorId, key, quantity: cmd.quantity });
    addLog(game, "inventário", `${actor.name} retirou ${cmd.quantity} unidade(s) dentro da liberação diária.`, actorId); return null;
  }
  if (cmd.type === "clear-marker") { state.markers = state.markers.filter(m => m.actorId !== actorId); return null; }
  if (cmd.type === "token" || cmd.type === "marker") {
    const scene = game.sceneBoard?.scenes.find(s => s.id === cmd.sceneId && s.id === game.sceneBoard?.activeSceneId && s.visibleToPlayers);
    if (!policy.tokens || !scene) return "O mestre não liberou a movimentação nesta cena.";
    if (cmd.type === "marker") {
      if (!knownPosition(scene, cmd.x, cmd.y)) return "Marque somente uma posição revelada da cena.";
      state.markers = state.markers.filter(m => m.actorId !== actorId);
      state.markers.push({ actorId, sceneId: scene.id, day: game.day, x: cmd.x, y: cmd.y, label: cmd.label }); return null;
    }
    const object = projectPlayerSceneBoard(game.sceneBoard)?.scenes[0]?.objects.find(o => o.id === cmd.objectId && o.kind === "token" && o.tokenKind === "survivor" && o.refId === actorId && !o.locked);
    if (!object || object.x !== cmd.beforeX || object.y !== cmd.beforeY || !knownPosition(scene, cmd.x, cmd.y, object.width, object.height)) return "Seu token mudou, está bloqueado ou a posição não foi revelada.";
    const target = scene.objects.find(o => o.id === object.id)!; target.x = cmd.x; target.y = cmd.y; return null;
  }
  return "Ação indisponível.";
}
export function applyPlayerAction(game: GameState, actorId: string, input: unknown, die = rollDie): { ok: true; state: GameState; replay: boolean } | { ok: false; error: string } {
  const parsed = playerCommandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados da ação inválidos." };
  const cmd = parsed.data;
  if (!game.survivors.some(p => p.id === actorId) || cmd.day !== game.day) return { ok: false, error: "A ficha ou o dia da campanha mudou. Atualize a tela." };
  const state = playerActionState(game);
  const fingerprint = JSON.stringify(cmd);
  const receipt = state.receipts.find(r => r.id === cmd.id && r.actorId === actorId && r.day === game.day);
  if (receipt) return receipt.fingerprint === fingerprint ? { ok: true, state: game, replay: true } : { ok: false, error: "O identificador já foi usado para outra ação." };
  const draft = structuredClone(game);
  draft.playerActions = structuredClone(state);
  draft.playerActions.operations = draft.playerActions.operations.filter(o => o.day === game.day && o.scene === (game.scene ?? 1));
  draft.playerActions.receipts = draft.playerActions.receipts.filter(r => r.day === game.day);
  draft.playerActions.withdrawals = draft.playerActions.withdrawals.filter(r => r.day === game.day);
  if ((["search", "deep-search", "travel", "rest", "request-rest", "offer", "request"].includes(cmd.type) && draft.playerActions.operations.length >= 150) || draft.playerActions.receipts.length >= 2000) return { ok: false, error: "Limite de ações deste dia atingido. O mestre pode continuar pelas ferramentas da campanha." };
  if (["search", "deep-search", "travel", "rest", "offer", "request"].includes(cmd.type) && draft.playerActions.operations.some(o => o.id === cmd.id)) return { ok: false, error: "Este identificador já pertence a uma operação." };
  const beforeEvents = new Set(Object.entries(game.hexes).flatMap(([hexId, hex]) => hex.events.filter(e => eventTriggerReady(game, hexId, e)).map(e => e.id)));
  const error = executeCommand(draft, actorId, cmd, die);
  if (error) return { ok: false, error };
  if (["execute", "roll-access", "confirm-rest"].includes(cmd.type) && "operationId" in cmd) {
    const op = draft.playerActions!.operations.find(o => o.id === cmd.operationId);
    if (op?.status === "done") attentionAfter(draft, op, beforeEvents);
  }
  draft.playerActions!.receipts.push({ id: cmd.id, day: game.day, actorId, fingerprint });
  if (cmd.type !== "prepare-search")
    addLog(draft, "equipe", `${draft.survivors.find(p => p.id === actorId)!.name}: ${cmd.type === "roll-access" ? "acesso à busca resolvido" : cmd.type === "execute" ? "operação concluída" : cmd.type === "join" ? "participação confirmada" : cmd.type === "leave" ? "participação cancelada" : "ação da equipe registrada"}.`, actorId);
  return { ok: true, state: draft, replay: false };
}
export function setPlayerPolicy(game: GameState, input: unknown) {
  const result = playerPolicySchema.safeParse(input);
  if (!result.success || Object.keys(result.data.supplies.items).length > 120) return null;
  const draft = structuredClone(game); draft.playerActions = structuredClone(playerActionState(game)); draft.playerActions.policy = result.data;
  return draft;
}
