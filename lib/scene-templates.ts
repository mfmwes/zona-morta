import { createId } from "./id";
import { createSceneBoardScene, sceneBoardLimits, validSceneBoardState, type SceneBoardObject, type SceneBoardScene } from "./scene-board";

export type SceneTemplate = { id: string; name: string; objects: SceneBoardObject[] };
export type SceneLibrary = { templates: SceneTemplate[]; favorites: string[] };
export const emptySceneLibrary = (): SceneLibrary => ({ templates: [], favorites: [] });
export const scenePieceKey = (piece: { kind: string; variant?: string }) => `${piece.kind}:${piece.variant ?? ""}`;

export function readSceneLibrary(raw: string | null): SceneLibrary {
  if (!raw || raw.length > 1_500_000) return emptySceneLibrary();
  try {
    const value = JSON.parse(raw) as SceneLibrary;
    if (!Array.isArray(value.templates) || value.templates.length > 24 || !Array.isArray(value.favorites) || value.favorites.length > 100) return emptySceneLibrary();
    const templates = value.templates.filter(t => t && typeof t.id === "string" && t.id.length <= 120 && typeof t.name === "string" && t.name.trim().length > 0 && t.name.length <= 80
      && Array.isArray(t.objects) && t.objects.length > 0 && t.objects.length <= 100
      && validSceneBoardState({ scenes: [{ ...createSceneBoardScene(), objects: t.objects }] })
      && t.objects.every(o => o.kind !== "token" && !o.refId && !o.tokenImage && !o.tokenImageFrame && !o.tokenState && !o.tokenKind));
    return { templates, favorites: [...new Set(value.favorites.filter(f => typeof f === "string" && f.length <= 80))] };
  } catch { return emptySceneLibrary(); }
}

export function createSceneTemplate(scene: SceneBoardScene, selectedIds: string[], name: string): SceneTemplate {
  const selected = new Set(selectedIds);
  for (const o of scene.objects) if (selected.has(o.id) && o.parentWallId) selected.add(o.parentWallId);
  const objects = scene.objects.filter(o => o.kind !== "token" && (selected.has(o.id) || Boolean(o.parentWallId && selected.has(o.parentWallId))));
  if (!objects.length) throw new Error("Selecione uma sala ou objetos do ambiente. Personagens não entram nos modelos.");
  if (objects.length > 100) throw new Error("Um modelo pode guardar até 100 elementos.");
  if (!name.trim()) throw new Error("Dê um nome ao modelo.");
  const x = Math.min(...objects.map(o => o.x)), y = Math.min(...objects.map(o => o.y));
  const ids = new Map(objects.map(o => [o.id, createId()]));
  return { id: createId(), name: name.trim().slice(0, 80), objects: objects.map(o => ({
    id: ids.get(o.id)!, kind: o.kind, label: o.label, variant: o.variant,
    x: o.x - x, y: o.y - y, width: o.width, height: o.height, rotation: o.rotation,
    visibleToPlayers: o.visibleToPlayers, locked: o.locked, doorState: o.doorState,
    ...(o.parentWallId ? { parentWallId: ids.get(o.parentWallId) } : {}),
  })) };
}

export function insertSceneTemplate(scene: SceneBoardScene, template: SceneTemplate): SceneBoardObject[] {
  if (scene.objects.length + template.objects.length > sceneBoardLimits.maxObjectsPerScene) throw new Error("Não há espaço para todos os elementos deste modelo na cena.");
  const width = Math.max(...template.objects.map(o => o.x + o.width)), height = Math.max(...template.objects.map(o => o.y + o.height));
  if (width > scene.width || height > scene.height) throw new Error("O modelo é maior que a cena. Amplie a cena antes de inserir.");
  const ids = new Map(template.objects.map(o => [o.id, createId()]));
  const x = Math.floor((scene.width - width) / 40) * 20, y = Math.floor((scene.height - height) / 40) * 20;
  return template.objects.map(o => ({ ...structuredClone(o), id: ids.get(o.id)!, x: o.x + x, y: o.y + y,
    ...(o.parentWallId ? { parentWallId: ids.get(o.parentWallId) } : {}) }));
}
