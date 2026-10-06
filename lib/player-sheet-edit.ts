import { applyPlayerChange, type PlayerLog, type ShelterWorkAction } from './collaboration';
import { playerActionState } from './player-actions';
import type { GameState, Survivor } from './game';

export type SheetEditPayload = { id?: string; day?: number; before: Survivor; after: Survivor; fearDelta?: number; noiseDelta?: number; logs: PlayerLog[]; shelterWorkActions?: ShelterWorkAction[] };

export async function applyPlayerSheetEdit(game: GameState, actorId: string, payload: SheetEditPayload) {
  const body = { before: payload.before, after: payload.after, fearDelta: payload.fearDelta ?? 0, noiseDelta: payload.noiseDelta ?? 0, logs: payload.logs, shelterWorkActions: payload.shelterWorkActions ?? [] };
  const state = playerActionState(game);
  let fingerprint = '';
  if (payload.id !== undefined) {
    if (typeof payload.id !== 'string' || !payload.id.length || payload.id.length > 120 || !Number.isInteger(payload.day))
      return { ok: false as const, error: 'Identificador de salvamento inválido.' };
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(body)));
    fingerprint = 'sheet:' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const receipt = state.receipts.find(row => row.id === payload.id && row.actorId === actorId && row.day === payload.day);
    if (receipt) return receipt.fingerprint === fingerprint
      ? { ok: true as const, state: game, replay: true }
      : { ok: false as const, error: 'Este identificador já foi usado em outra alteração.' };
    if (payload.day !== game.day) return { ok: false as const, error: 'O dia mudou. Recarregue a ficha antes de registrar esta ação.' };
    if (state.receipts.filter(row => row.day === game.day).length >= 2000)
      return { ok: false as const, error: 'Limite de registros deste dia atingido.' };
  }
  const next = applyPlayerChange(game, actorId, body.before, body.after, body.fearDelta, body.logs, body.noiseDelta, body.shelterWorkActions);
  if (!next) return { ok: false as const, error: 'Sua ficha mudou em outra janela ou esta ação precisa ser registrada pelo mestre. Recarregue antes de tentar novamente.' };
  if (payload.id) {
    next.playerActions = structuredClone(state);
    next.playerActions.receipts = state.receipts.filter(row => row.day === game.day);
    next.playerActions.receipts.push({ id: payload.id, actorId, day: game.day, fingerprint });
  }
  return { ok: true as const, state: next, replay: false };
}
