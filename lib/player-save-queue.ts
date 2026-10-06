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
  // Shared state stays live even when a personal edit is queued or offline.
  // Keep only changed personal fields as an optimistic overlay; the original
  // before/after payload remains intact for server-side conflict validation.
  overlay(remote: GameState) {
    const visible = structuredClone(remote);
    for (const edit of this.edits) {
      const survivor = visible.survivors.find(person => person.id === edit.after.id);
      if (!survivor) continue;
      for (const key of Object.keys(edit.after) as (keyof typeof edit.after)[]) {
        if (JSON.stringify(edit.before[key]) === JSON.stringify(edit.after[key])) continue;
        Object.assign(survivor, { [key]: structuredClone(edit.after[key]) });
      }
    }
    return visible;
  }
}
