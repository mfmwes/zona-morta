import { createId } from "./id";

export type SceneObjectKind = "zone" | "wall" | "door" | "window" | "furniture" | "prop" | "text" | "token";
export type SceneTokenKind = "survivor" | "npc" | "threat" | "custom";

export type SceneBoardObject = {
  id: string;
  kind: SceneObjectKind;
  label: string;
  variant?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  visibleToPlayers: boolean;
  tokenKind?: SceneTokenKind;
  refId?: string;
};

export type SceneBoardScene = {
  id: string;
  name: string;
  width: number;
  height: number;
  showGrid: boolean;
  visibleToPlayers: boolean;
  objects: SceneBoardObject[];
};

export type SceneBoardState = {
  scenes: SceneBoardScene[];
  activeSceneId?: string;
};

export const sceneBoardLimits = {
  maxScenes: 24,
  maxObjectsPerScene: 250,
  minWidth: 600,
  maxWidth: 4000,
  minHeight: 500,
  maxHeight: 3000,
} as const;

const objectDefaults: Record<SceneObjectKind, Pick<SceneBoardObject, "width" | "height">> = {
  zone: { width: 320, height: 220 },
  wall: { width: 240, height: 18 },
  door: { width: 90, height: 22 },
  window: { width: 110, height: 14 },
  furniture: { width: 110, height: 70 },
  prop: { width: 72, height: 72 },
  text: { width: 180, height: 48 },
  token: { width: 58, height: 58 },
};

export function createSceneBoardScene(name = "Nova cena"): SceneBoardScene {
  return {
    id: createId(),
    name: name.trim().slice(0, 100) || "Nova cena",
    width: 1600,
    height: 1000,
    showGrid: true,
    visibleToPlayers: false,
    objects: [],
  };
}

export function createSceneBoardObject(kind: SceneObjectKind, label: string, variant?: string): SceneBoardObject {
  const size = objectDefaults[kind];
  return {
    id: createId(),
    kind,
    label: label.trim().slice(0, 120) || "Objeto",
    ...(variant ? { variant: variant.slice(0, 40) } : {}),
    x: 220,
    y: 180,
    width: size.width,
    height: size.height,
    rotation: 0,
    visibleToPlayers: true,
  };
}

export function projectPlayerSceneBoard(board: SceneBoardState | undefined): SceneBoardState | undefined {
  if (!board?.activeSceneId) return board ? { scenes: [] } : undefined;
  const active = board.scenes.find(scene => scene.id === board.activeSceneId && scene.visibleToPlayers);
  if (!active) return { scenes: [] };
  return {
    activeSceneId: active.id,
    scenes: [{
      ...structuredClone(active),
      objects: active.objects.filter(object => object.visibleToPlayers).map(object => structuredClone(object)),
    }],
  };
}

function finiteInt(value: unknown, min: number, max: number) {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
}

export function validSceneBoardState(value: unknown): value is SceneBoardState | undefined {
  if (value === undefined) return true;
  if (!value || typeof value !== "object") return false;
  const board = value as Partial<SceneBoardState>;
  if (!Array.isArray(board.scenes) || board.scenes.length > sceneBoardLimits.maxScenes) return false;
  if (board.activeSceneId !== undefined && (typeof board.activeSceneId !== "string" || board.activeSceneId.length > 120)) return false;
  if (board.activeSceneId && !board.scenes.some(scene => scene && typeof scene === "object" && (scene as SceneBoardScene).id === board.activeSceneId)) return false;
  return board.scenes.every(scene => Boolean(scene
    && typeof scene.id === "string" && scene.id.length > 0 && scene.id.length <= 120
    && typeof scene.name === "string" && scene.name.length <= 100
    && finiteInt(scene.width, sceneBoardLimits.minWidth, sceneBoardLimits.maxWidth)
    && finiteInt(scene.height, sceneBoardLimits.minHeight, sceneBoardLimits.maxHeight)
    && typeof scene.showGrid === "boolean"
    && typeof scene.visibleToPlayers === "boolean"
    && Array.isArray(scene.objects) && scene.objects.length <= sceneBoardLimits.maxObjectsPerScene
    && scene.objects.every(object => Boolean(object
      && typeof object.id === "string" && object.id.length > 0 && object.id.length <= 120
      && ["zone", "wall", "door", "window", "furniture", "prop", "text", "token"].includes(object.kind)
      && typeof object.label === "string" && object.label.length <= 120
      && (object.variant === undefined || (typeof object.variant === "string" && object.variant.length <= 40))
      && finiteInt(object.x, -1000, 5000)
      && finiteInt(object.y, -1000, 4000)
      && finiteInt(object.width, 12, 2000)
      && finiteInt(object.height, 12, 1600)
      && Number.isFinite(object.rotation) && object.rotation >= -3600 && object.rotation <= 3600
      && typeof object.visibleToPlayers === "boolean"
      && (object.tokenKind === undefined || ["survivor", "npc", "threat", "custom"].includes(object.tokenKind))
      && (object.refId === undefined || (typeof object.refId === "string" && object.refId.length <= 120))))));
}
