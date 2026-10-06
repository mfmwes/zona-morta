import { playerEditPayload } from './collaboration';
import { createId } from './id';
import type { GameState } from './game';

export type PlayerSheetEdit = NonNullable<ReturnType<typeof playerEditPayload>> & { id: string; day: number };

// Keep each interaction separate: combining rolls can exceed delta/log limits,
// and replacing a pending baseline loses earlier clicks.
export class PlayerSaveQueue {
  private edits: PlayerSheetEdit[] = [];
  get length() { return this.edits.length; }
  get first() { return this.edits[0]; }
  enqueue(before: GameState, after: GameState) {
    const payload = playerEditPayload(before, after);
    if (!payload) return false;
    this.edits.push(structuredClone({ ...payload, id: createId(), day: before.day }));
    return true;
  }
  complete(id: string) {
    if (this.first?.id !== id) throw new Error('Resposta fora da ordem de salvamento.');
    this.edits.shift();
  }
  clear() { this.edits = []; }
}
