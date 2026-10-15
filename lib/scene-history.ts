import { validSceneBoardState, type SceneBoardObject, type SceneBoardScene } from "./scene-board";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
type Change = { id: string; before?: SceneBoardObject; after?: SceneBoardObject; beforeIndex: number; afterIndex: number };
type Setting = Exclude<keyof SceneBoardScene, "objects" | "id">;
export type SceneEdit = {
  sceneId: string; label: string; objects: Change[];
  settings: { key: Setting; before: unknown; after: unknown }[];
  order?: { before: string[]; after: string[] };
  walls: { id: string; before: string[]; after: string[] }[];
};
export type SceneHistory = { undo: SceneEdit[]; redo: SceneEdit[] };
export const emptySceneHistory = (): SceneHistory => ({ undo: [], redo: [] });

/** Only changed objects are restored. Unrelated multiplayer changes are retained. */
export function describeSceneEdit(before: SceneBoardScene, after: SceneBoardScene): SceneEdit | null {
  if (before.id !== after.id) return null;
  const old = new Map(before.objects.map(o => [o.id, o]));
  const next = new Map(after.objects.map(o => [o.id, o]));
  const objects: Change[] = [...new Set([...old.keys(), ...next.keys()])]
    .filter(id => !same(old.get(id), next.get(id)))
    .map(id => ({ id, before: structuredClone(old.get(id)), after: structuredClone(next.get(id)),
      beforeIndex: before.objects.findIndex(o => o.id === id), afterIndex: after.objects.findIndex(o => o.id === id) }));
  const keys: Setting[] = ["name", "width", "height", "showGrid", "snapToGrid", "fogEnabled", "revealedAreas", "visibleToPlayers"];
  const settings = keys.filter(key => !same(before[key], after[key]))
    .map(key => ({ key, before: structuredClone(before[key]), after: structuredClone(after[key]) }));
  const previousOrder = before.objects.map(o => o.id), nextOrder = after.objects.map(o => o.id);
  const reordered = !same(previousOrder.filter(id => next.has(id)), nextOrder.filter(id => old.has(id)));
  if (!objects.length && !settings.length && !reordered) return null;
  const additions = objects.filter(o => !o.before).length, removals = objects.filter(o => !o.after).length;
  return { sceneId: before.id, objects, settings,
    label: additions ? `Adicionar ${additions} elemento(s)` : removals ? `Excluir ${removals} elemento(s)` : "Editar cena",
    ...(reordered ? { order: { before: previousOrder, after: nextOrder } } : {}),
    walls: objects.filter(o => o.before?.kind === "wall" || o.after?.kind === "wall").map(o => ({ id: o.id,
      before: before.objects.filter(f => f.parentWallId === o.id).map(f => f.id).sort(),
      after: after.objects.filter(f => f.parentWallId === o.id).map(f => f.id).sort() })),
  };
}

export function recordSceneEdit(history: SceneHistory, entry: SceneEdit | null) {
  if (entry) { history.undo = [...history.undo.slice(-49), entry]; history.redo = []; }
}

export function applySceneEdit(current: SceneBoardScene, entry: SceneEdit, direction: "undo" | "redo"):
  { ok: true; scene: SceneBoardScene } | { ok: false; message: string } {
  const from = direction === "undo" ? "after" : "before", to = direction === "undo" ? "before" : "after";
  const conflict = { ok: false as const, message: "Os elementos desta ação mudaram desde a edição. O histórico foi preservado; nenhuma alteração foi sobrescrita." };
  if (current.id !== entry.sceneId) return conflict;
  for (const change of entry.objects) if (!same(current.objects.find(o => o.id === change.id), change[from])) return conflict;
  for (const change of entry.settings) if (!same(current[change.key], change[from])) return conflict;
  for (const wall of entry.walls) if (!same(current.objects.filter(o => o.parentWallId === wall.id).map(o => o.id).sort(), wall[from])) return conflict;
  if (entry.order && !same(current.objects.map(o => o.id), entry.order[from])) return conflict;
  const result = structuredClone(current);
  for (const change of entry.objects) {
    const index = result.objects.findIndex(o => o.id === change.id), value = change[to];
    if (!value) { if (index >= 0) result.objects.splice(index, 1); }
    else if (index >= 0) result.objects[index] = structuredClone(value);
    else { const destination = direction === "undo" ? change.beforeIndex : change.afterIndex; result.objects.splice(destination < 0 ? result.objects.length : destination, 0, structuredClone(value)); }
  }
  for (const change of entry.settings) {
    if (change[to] === undefined) delete result[change.key];
    else Object.assign(result, { [change.key]: structuredClone(change[to]) });
  }
  if (entry.order) result.objects.sort((a, b) => entry.order![to].indexOf(a.id) - entry.order![to].indexOf(b.id));
  if (!validSceneBoardState({ scenes: [result] })) return { ok: false, message: "Esta ação não cabe mais na cena atual. Nenhuma alteração foi aplicada." };
  return { ok: true, scene: result };
}
