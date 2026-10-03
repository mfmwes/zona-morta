import { createId } from "./id";
import { validPortraitFrame, type PortraitFrame } from "./portrait-frame";

export type SceneObjectKind = "zone" | "wall" | "door" | "window" | "furniture" | "prop" | "text" | "token";
export type SceneTokenKind = "survivor" | "npc" | "threat" | "custom";
export type ScenePoint = { x: number; y: number };
export type SceneFogArea = { id: string; x: number; y: number; width: number; height: number };

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
  locked?: boolean;
  parentWallId?: string;
  doorState?: "closed" | "open";
  tokenKind?: SceneTokenKind;
  refId?: string;
  /** Snapshot público efêmero usado pelos tokens na visão dos jogadores. */
  tokenImage?: string;
  tokenImageFrame?: PortraitFrame;
  tokenState?: "active" | "injured" | "dead" | "defeated";
};

export type SceneBoardScene = {
  id: string;
  name: string;
  width: number;
  height: number;
  showGrid: boolean;
  snapToGrid?: boolean;
  /** Quando ativo, apenas áreas explicitamente reveladas ficam disponíveis aos jogadores. */
  fogEnabled?: boolean;
  revealedAreas?: SceneFogArea[];
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
  maxFogAreas: 320,
  minWidth: 600,
  maxWidth: 4000,
  minHeight: 500,
  maxHeight: 3000,
  gridSize: 20,
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
    snapToGrid: true,
    fogEnabled: false,
    revealedAreas: [],
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

function distance(a: ScenePoint, b: ScenePoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function wallCenter(wall: SceneBoardObject): ScenePoint {
  return { x: wall.x + wall.width / 2, y: wall.y + wall.height / 2 };
}

export function wallEndpoints(wall: SceneBoardObject): [ScenePoint, ScenePoint] {
  const center = wallCenter(wall);
  const angle = wall.rotation * Math.PI / 180;
  const dx = Math.cos(angle) * wall.width / 2;
  const dy = Math.sin(angle) * wall.width / 2;
  return [{ x: center.x - dx, y: center.y - dy }, { x: center.x + dx, y: center.y + dy }];
}

export function snapScenePoint(point: ScenePoint, grid = sceneBoardLimits.gridSize): ScenePoint {
  return { x: Math.round(point.x / grid) * grid, y: Math.round(point.y / grid) * grid };
}

export function nearestWallEndpoint(point: ScenePoint, walls: SceneBoardObject[], radius = 24): ScenePoint | null {
  let nearest: ScenePoint | null = null;
  let nearestDistance = radius + 0.001;
  for (const wall of walls.filter(object => object.kind === "wall")) {
    for (const endpoint of wallEndpoints(wall)) {
      const current = distance(point, endpoint);
      if (current <= nearestDistance) {
        nearest = endpoint;
        nearestDistance = current;
      }
    }
  }
  return nearest ? { x: Math.round(nearest.x), y: Math.round(nearest.y) } : null;
}

export function prepareWallPoints(startInput: ScenePoint, endInput: ScenePoint, walls: SceneBoardObject[], snap = true) {
  let start = snap ? snapScenePoint(startInput) : { ...startInput };
  let end = snap ? snapScenePoint(endInput) : { ...endInput };
  start = nearestWallEndpoint(start, walls) ?? start;
  end = nearestWallEndpoint(end, walls) ?? end;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const axisThreshold = snap ? sceneBoardLimits.gridSize : 12;
  if (Math.abs(dx) <= axisThreshold && Math.abs(dy) > axisThreshold) end = { x: start.x, y: end.y };
  else if (Math.abs(dy) <= axisThreshold && Math.abs(dx) > axisThreshold) end = { x: end.x, y: start.y };
  return { start, end };
}

export function wallGeometry(startInput: ScenePoint, endInput: ScenePoint, walls: SceneBoardObject[] = [], snap = true) {
  const { start, end } = prepareWallPoints(startInput, endInput, walls, snap);
  const width = Math.max(1, Math.round(distance(start, end)));
  const rotation = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
  const height = objectDefaults.wall.height;
  return {
    start,
    end,
    x: Math.round((start.x + end.x) / 2 - width / 2),
    y: Math.round((start.y + end.y) / 2 - height / 2),
    width,
    height,
    rotation,
  };
}

export function createWallFromDrag(start: ScenePoint, end: ScenePoint, walls: SceneBoardObject[] = [], snap = true) {
  const geometry = wallGeometry(start, end, walls, snap);
  if (geometry.width < 36) return null;
  const wall = createSceneBoardObject("wall", "Parede");
  wall.x = geometry.x; wall.y = geometry.y; wall.width = geometry.width; wall.height = geometry.height; wall.rotation = geometry.rotation;
  return wall;
}

function closestPointOnWall(point: ScenePoint, wall: SceneBoardObject): ScenePoint {
  const [start, end] = wallEndpoints(wall);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return start;
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return { x: start.x + t * dx, y: start.y + t * dy };
}

export function createFixtureOnWall(kind: "door" | "window", wall: SceneBoardObject, point: ScenePoint) {
  const fixture = createSceneBoardObject(kind, kind === "door" ? "Porta" : "Janela");
  const center = closestPointOnWall(point, wall);
  fixture.x = Math.round(center.x - fixture.width / 2);
  fixture.y = Math.round(center.y - fixture.height / 2);
  fixture.rotation = wall.rotation;
  fixture.parentWallId = wall.id;
  if (kind === "door") fixture.doorState = "closed";
  fixture.visibleToPlayers = wall.visibleToPlayers;
  return fixture;
}

function expandedSelection(scene: SceneBoardScene, ids: Iterable<string>) {
  const selected = new Set(ids);
  for (const id of [...selected]) {
    const wall = scene.objects.find(object => object.id === id && object.kind === "wall");
    if (!wall) continue;
    for (const object of scene.objects) if (object.parentWallId === wall.id) selected.add(object.id);
  }
  return selected;
}

export function clampSceneDelta(scene: SceneBoardScene, ids: Iterable<string>, dx: number, dy: number) {
  const selected = expandedSelection(scene, ids);
  const objects = scene.objects.filter(object => selected.has(object.id));
  if (!objects.length) return { dx: 0, dy: 0 };
  const minX = Math.min(...objects.map(object => object.x));
  const minY = Math.min(...objects.map(object => object.y));
  const maxX = Math.max(...objects.map(object => object.x + object.width));
  const maxY = Math.max(...objects.map(object => object.y + object.height));
  return {
    dx: Math.max(-minX, Math.min(scene.width - maxX, Math.round(dx))),
    dy: Math.max(-minY, Math.min(scene.height - maxY, Math.round(dy))),
  };
}

export function moveSceneObjects(scene: SceneBoardScene, ids: Iterable<string>, dx: number, dy: number) {
  const primary = new Set([...ids].filter(id => !scene.objects.find(object => object.id === id)?.locked));
  const selected = expandedSelection(scene, primary);
  const delta = clampSceneDelta(scene, selected, dx, dy);
  for (const object of scene.objects) {
    if (!selected.has(object.id)) continue;
    object.x += delta.dx;
    object.y += delta.dy;
  }
  return delta;
}

export function rotateWallWithFixtures(scene: SceneBoardScene, wallId: string, deltaDegrees: number) {
  const wall = scene.objects.find(object => object.id === wallId && object.kind === "wall");
  if (!wall || wall.locked) return false;
  const center = wallCenter(wall);
  const radians = deltaDegrees * Math.PI / 180;
  wall.rotation += deltaDegrees;
  for (const fixture of scene.objects.filter(object => object.parentWallId === wall.id)) {
    const fixtureCenter = { x: fixture.x + fixture.width / 2, y: fixture.y + fixture.height / 2 };
    const dx = fixtureCenter.x - center.x;
    const dy = fixtureCenter.y - center.y;
    const x = center.x + dx * Math.cos(radians) - dy * Math.sin(radians);
    const y = center.y + dx * Math.sin(radians) + dy * Math.cos(radians);
    fixture.x = Math.round(x - fixture.width / 2);
    fixture.y = Math.round(y - fixture.height / 2);
    fixture.rotation += deltaDegrees;
  }
  return true;
}


function normalizeFogArea(scene: SceneBoardScene, area: Omit<SceneFogArea, "id">): Omit<SceneFogArea, "id"> | null {
  const x1 = Math.max(0, Math.min(scene.width, Math.round(area.x)));
  const y1 = Math.max(0, Math.min(scene.height, Math.round(area.y)));
  const x2 = Math.max(0, Math.min(scene.width, Math.round(area.x + area.width)));
  const y2 = Math.max(0, Math.min(scene.height, Math.round(area.y + area.height)));
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  if (width < 12 || height < 12) return null;
  return { x, y, width, height };
}

export function fogAreaFromPoints(scene: SceneBoardScene, start: ScenePoint, end: ScenePoint) {
  return normalizeFogArea(scene, { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y });
}

function intersects(a: Pick<SceneFogArea, "x" | "y" | "width" | "height">, b: Pick<SceneFogArea, "x" | "y" | "width" | "height">) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function contains(a: Pick<SceneFogArea, "x" | "y" | "width" | "height">, b: Pick<SceneFogArea, "x" | "y" | "width" | "height">) {
  return b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height;
}

function subtractArea(source: SceneFogArea, cover: Omit<SceneFogArea, "id">): SceneFogArea[] {
  if (!intersects(source, cover)) return [source];
  const ix1 = Math.max(source.x, cover.x);
  const iy1 = Math.max(source.y, cover.y);
  const ix2 = Math.min(source.x + source.width, cover.x + cover.width);
  const iy2 = Math.min(source.y + source.height, cover.y + cover.height);
  const pieces: SceneFogArea[] = [];
  const push = (x: number, y: number, width: number, height: number) => {
    if (width >= 12 && height >= 12) pieces.push({ id: createId(), x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) });
  };
  push(source.x, source.y, source.width, iy1 - source.y);
  push(source.x, iy2, source.width, source.y + source.height - iy2);
  push(source.x, iy1, ix1 - source.x, iy2 - iy1);
  push(ix2, iy1, source.x + source.width - ix2, iy2 - iy1);
  return pieces;
}

export function revealSceneFogArea(scene: SceneBoardScene, input: Omit<SceneFogArea, "id">) {
  const area = normalizeFogArea(scene, input);
  if (!area) return false;
  scene.revealedAreas ??= [];
  if (scene.revealedAreas.some(existing => contains(existing, area))) return false;
  scene.revealedAreas = scene.revealedAreas.filter(existing => !contains(area, existing));
  if (scene.revealedAreas.length >= sceneBoardLimits.maxFogAreas) return false;
  scene.revealedAreas.push({ id: createId(), ...area });
  return true;
}

export function coverSceneFogArea(scene: SceneBoardScene, input: Omit<SceneFogArea, "id">) {
  const area = normalizeFogArea(scene, input);
  if (!area) return false;
  const before = scene.revealedAreas ?? [];
  const next = before.flatMap(existing => subtractArea(existing, area)).slice(0, sceneBoardLimits.maxFogAreas);
  const changed = JSON.stringify(before.map(({ x, y, width, height }) => ({ x, y, width, height })))
    !== JSON.stringify(next.map(({ x, y, width, height }) => ({ x, y, width, height })));
  scene.revealedAreas = next;
  return changed;
}

export function revealAllSceneFog(scene: SceneBoardScene) {
  scene.revealedAreas = [{ id: createId(), x: 0, y: 0, width: scene.width, height: scene.height }];
}

export function coverAllSceneFog(scene: SceneBoardScene) {
  scene.revealedAreas = [];
}

export function sceneObjectFogVisible(scene: SceneBoardScene, object: SceneBoardObject) {
  if (!scene.fogEnabled) return true;
  const areas = scene.revealedAreas ?? [];
  if (!areas.length) return false;
  const bounds = { x: object.x, y: object.y, width: object.width, height: object.height };
  return areas.some(area => intersects(area, bounds));
}

export type SceneTokenSnapshot = {
  tokenKind: SceneTokenKind;
  refId: string;
  label: string;
  image?: string;
  imageFrame?: PortraitFrame;
  state?: "active" | "injured" | "dead" | "defeated";
};

export function hydrateSceneBoardTokens(board: SceneBoardState | undefined, snapshots: SceneTokenSnapshot[]) {
  if (!board) return undefined;
  const byKey = new Map(snapshots.map(snapshot => [snapshot.tokenKind + ":" + snapshot.refId, snapshot] as const));
  const hydrated = structuredClone(board);
  for (const scene of hydrated.scenes) {
    for (const object of scene.objects) {
      if (object.kind !== "token" || !object.tokenKind || !object.refId) continue;
      const snapshot = byKey.get(object.tokenKind + ":" + object.refId);
      if (!snapshot) continue;
      object.label = snapshot.label.trim().slice(0, 120) || object.label;
      if (snapshot.image?.trim()) object.tokenImage = snapshot.image.trim().slice(0, 12_000);
      else delete object.tokenImage;
      if (snapshot.imageFrame && validPortraitFrame(snapshot.imageFrame)) object.tokenImageFrame = structuredClone(snapshot.imageFrame);
      else delete object.tokenImageFrame;
      if (snapshot.state) object.tokenState = snapshot.state;
      else delete object.tokenState;
    }
  }
  return hydrated;
}

export function projectPlayerSceneBoard(board: SceneBoardState | undefined): SceneBoardState | undefined {
  if (!board?.activeSceneId) return board ? { scenes: [] } : undefined;
  const active = board.scenes.find(scene => scene.id === board.activeSceneId && scene.visibleToPlayers);
  if (!active) return { scenes: [] };
  const fogVisible = active.objects.filter(object => object.visibleToPlayers && sceneObjectFogVisible(active, object));
  const visibleIds = new Set(fogVisible.map(object => object.id));
  return {
    activeSceneId: active.id,
    scenes: [{
      ...structuredClone(active),
      revealedAreas: structuredClone(active.revealedAreas ?? []),
      objects: fogVisible
        .filter(object => !object.parentWallId || visibleIds.has(object.parentWallId))
        .map(object => structuredClone(object)),
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
  return board.scenes.every(scene => {
    if (!scene
      || typeof scene.id !== "string" || scene.id.length === 0 || scene.id.length > 120
      || typeof scene.name !== "string" || scene.name.length > 100
      || !finiteInt(scene.width, sceneBoardLimits.minWidth, sceneBoardLimits.maxWidth)
      || !finiteInt(scene.height, sceneBoardLimits.minHeight, sceneBoardLimits.maxHeight)
      || typeof scene.showGrid !== "boolean"
      || (scene.snapToGrid !== undefined && typeof scene.snapToGrid !== "boolean")
      || (scene.fogEnabled !== undefined && typeof scene.fogEnabled !== "boolean")
      || (scene.revealedAreas !== undefined && (!Array.isArray(scene.revealedAreas) || scene.revealedAreas.length > sceneBoardLimits.maxFogAreas
        || !scene.revealedAreas.every(area => area && typeof area.id === "string" && area.id.length > 0 && area.id.length <= 120
          && finiteInt(area.x, 0, scene.width) && finiteInt(area.y, 0, scene.height)
          && finiteInt(area.width, 12, scene.width) && finiteInt(area.height, 12, scene.height)
          && area.x + area.width <= scene.width && area.y + area.height <= scene.height)))
      || typeof scene.visibleToPlayers !== "boolean"
      || !Array.isArray(scene.objects) || scene.objects.length > sceneBoardLimits.maxObjectsPerScene) return false;

    const ids = new Set(scene.objects.filter(object => object && typeof object.id === "string").map(object => object.id));
    const walls = new Set(scene.objects.filter(object => object?.kind === "wall").map(object => object.id));
    if (ids.size !== scene.objects.length) return false;

    return scene.objects.every(object => Boolean(object
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
      && (object.locked === undefined || typeof object.locked === "boolean")
      && (object.parentWallId === undefined || (typeof object.parentWallId === "string" && object.parentWallId.length <= 120
        && walls.has(object.parentWallId) && (object.kind === "door" || object.kind === "window")))
      && (object.doorState === undefined || ((object.kind === "door") && ["closed", "open"].includes(object.doorState)))
      && (object.tokenKind === undefined || ["survivor", "npc", "threat", "custom"].includes(object.tokenKind))
      && (object.refId === undefined || (typeof object.refId === "string" && object.refId.length <= 120))
      && (object.tokenImage === undefined || (typeof object.tokenImage === "string" && object.tokenImage.length <= 12_000))
      && (object.tokenImageFrame === undefined || validPortraitFrame(object.tokenImageFrame))
      && (object.tokenState === undefined || ["active", "injured", "dead", "defeated"].includes(object.tokenState))));
  });
}
