"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import {
  Copy, Eye, EyeOff, Hand, Layers, Lock, Minus, MousePointer2, Plus, RotateCcw, RotateCw,
  Square, Trash2, Type, Unlock, User, ZoomIn, ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GameState } from "@/lib/game";
import { createId } from "@/lib/id";
import { portraitFrame, type PortraitFrame } from "@/lib/portrait-frame";
import {
  clampSceneDelta,
  coverAllSceneFog,
  coverSceneFogArea,
  createFixtureOnWall,
  createSceneBoardObject,
  createSceneBoardScene,
  createWallFromDrag,
  fogAreaFromPoints,
  moveSceneObjects,
  projectPlayerSceneBoard,
  revealAllSceneFog,
  revealSceneFogArea,
  rotateWallWithFixtures,
  sceneBoardLimits,
  snapScenePoint,
  wallGeometry,
  type SceneBoardObject,
  type SceneBoardScene,
  type SceneBoardState,
  type SceneObjectKind,
  type ScenePoint,
} from "@/lib/scene-board";

type Edit = (fn: (draft: GameState) => void) => void;
type Tool = "select" | "pan" | "wall" | "door" | "window" | "reveal" | "conceal";
type Drag = {
  pointerId: number;
  clientX: number;
  clientY: number;
  anchorId: string;
  baseIds: string[];
  movingIds: string[];
  dx: number;
  dy: number;
};
type Pan = { pointerId: number; clientX: number; clientY: number; scrollLeft: number; scrollTop: number };
type WallDraft = { pointerId: number; start: ScenePoint; end: ScenePoint };
type FogDraft = { pointerId: number; start: ScenePoint; end: ScenePoint; mode: "reveal" | "conceal" };

type LibraryPiece = { kind: SceneObjectKind; label: string; variant?: string };
const libraryGroups: { label: string; pieces: LibraryPiece[] }[] = [
  { label: "Ambiente", pieces: [
    { kind: "zone", label: "Sala / área", variant: "room" },
    { kind: "text", label: "Texto" },
    { kind: "prop", label: "Pista / objetivo", variant: "marker" },
  ] },
  { label: "Mobiliário", pieces: [
    { kind: "furniture", label: "Mesa", variant: "table" },
    { kind: "furniture", label: "Cadeira", variant: "chair" },
    { kind: "furniture", label: "Sofá", variant: "sofa" },
    { kind: "furniture", label: "Armário", variant: "cabinet" },
    { kind: "furniture", label: "Estante", variant: "shelf" },
    { kind: "furniture", label: "Cama", variant: "bed" },
    { kind: "furniture", label: "Balcão", variant: "counter" },
    { kind: "furniture", label: "Pia", variant: "sink" },
    { kind: "furniture", label: "Vaso sanitário", variant: "toilet" },
  ] },
  { label: "Sobrevivência", pieces: [
    { kind: "prop", label: "Caixa", variant: "crate" },
    { kind: "prop", label: "Barricada", variant: "barricade" },
    { kind: "prop", label: "Entulho", variant: "debris" },
    { kind: "prop", label: "Gerador", variant: "generator" },
    { kind: "prop", label: "Barril", variant: "barrel" },
    { kind: "prop", label: "Palete", variant: "pallet" },
    { kind: "prop", label: "Corpo", variant: "body" },
  ] },
  { label: "Veículos", pieces: [
    { kind: "prop", label: "Carro", variant: "car" },
    { kind: "prop", label: "Ambulância", variant: "ambulance" },
  ] },
];

const visualSizes: Record<string, { width: number; height: number }> = {
  table: { width: 130, height: 80 },
  chair: { width: 56, height: 56 },
  sofa: { width: 150, height: 68 },
  cabinet: { width: 90, height: 48 },
  shelf: { width: 140, height: 42 },
  bed: { width: 90, height: 150 },
  counter: { width: 160, height: 52 },
  sink: { width: 76, height: 62 },
  toilet: { width: 62, height: 82 },
  crate: { width: 62, height: 62 },
  barricade: { width: 140, height: 48 },
  debris: { width: 100, height: 76 },
  generator: { width: 100, height: 72 },
  barrel: { width: 58, height: 58 },
  pallet: { width: 110, height: 78 },
  body: { width: 62, height: 120 },
  car: { width: 168, height: 84 },
  ambulance: { width: 190, height: 90 },
  marker: { width: 58, height: 58 },
};

function safeBoard(game: GameState): SceneBoardState {
  return game.sceneBoard ?? { scenes: [] };
}

function ObjectVisual({ variant, compact = false }: { variant?: string; compact?: boolean }) {
  return <span className={"scene-object-visual visual-" + (variant ?? "generic") + (compact ? " is-compact" : "")} aria-hidden="true">
    <i className="visual-a" /><i className="visual-b" /><i className="visual-c" /><i className="visual-d" />
  </span>;
}

function portraitStyle(frame?: PortraitFrame) {
  const crop = portraitFrame(frame);
  return {
    objectPosition: crop.x + "% " + crop.y + "%",
    transformOrigin: crop.x + "% " + crop.y + "%",
    transform: "scale(" + crop.zoom + ")",
  };
}

function tokenPresentation(game: GameState, object: SceneBoardObject) {
  let label = object.label;
  let image = object.tokenImage;
  let frame = object.tokenImageFrame;
  let state = object.tokenState;
  if (object.tokenKind === "survivor" && object.refId) {
    const person = game.survivors.find(entry => entry.id === object.refId)
      ?? game.publicConflict?.survivors.find(entry => entry.id === object.refId);
    if (person) {
      label = person.name;
      image = person.portrait ?? image;
      const full = game.survivors.find(entry => entry.id === object.refId);
      if (full) state = full.hp > 0 ? "injured" : "active";
    }
  } else if (object.tokenKind === "npc" && object.refId) {
    const person = game.npcs.find(entry => entry.id === object.refId);
    if (person) {
      label = person.name;
      image = person.portrait ?? image;
      frame = person.portraitFrame ?? frame;
      state = person.status === "Morto" ? "dead" : person.status === "Ferido" || person.status === "Grave" ? "injured" : "active";
    }
  } else if (object.tokenKind === "threat" && object.refId) {
    const threat = game.conflict?.threats.find(entry => entry.id === object.refId);
    const publicThreat = game.publicConflict?.threats.find(entry => entry.id === object.refId);
    if (threat) {
      label = threat.name;
      image = threat.templateSnapshot.image ?? image;
      state = threat.defeated ? "defeated" : "active";
    } else if (publicThreat) {
      label = publicThreat.name;
      state = publicThreat.defeated ? "defeated" : "active";
    }
  }
  return { label, image, frame, state };
}

function face(object: SceneBoardObject, game: GameState) {
  if (object.kind === "wall") return <span className="scene-wall-line" />;
  if (object.kind === "door") return <><span className="scene-door-leaf" /><small>{object.label}</small></>;
  if (object.kind === "window") return <><span className="scene-window-line" /><small>{object.label}</small></>;
  if (object.kind === "zone" || object.kind === "text") return <span>{object.label}</span>;
  if (object.kind === "token") {
    const token = tokenPresentation(game, object);
    const stateLabel = token.state === "injured" ? "FERIDO" : token.state === "dead" ? "MORTO" : token.state === "defeated" ? "FORA DE COMBATE" : "";
    return <><b className="scene-token-face">
      {token.image ? <img src={token.image} alt="" draggable={false} style={token.frame ? portraitStyle(token.frame) : undefined} /> : <span>{token.label.slice(0, 2).toUpperCase()}</span>}
    </b><small className="scene-token-name">{token.label}</small>{stateLabel && <em className={"scene-token-state is-" + token.state}>{stateLabel}</em>}</>;
  }
  return <><ObjectVisual variant={object.variant} /><small>{object.label}</small></>;
}


function FogOverlay({ scene, readonly }: { scene: SceneBoardScene; readonly: boolean }) {
  if (!scene.fogEnabled) return null;
  const maskId = "scene-fog-" + scene.id;
  return <svg className={"scene-fog-overlay" + (readonly ? " is-player" : " is-master")}
    viewBox={"0 0 " + scene.width + " " + scene.height} preserveAspectRatio="none" aria-hidden="true">
    <defs><mask id={maskId}>
      <rect x="0" y="0" width={scene.width} height={scene.height} fill="white" />
      {(scene.revealedAreas ?? []).map(area => <rect key={area.id} x={area.x} y={area.y} width={area.width} height={area.height} fill="black" />)}
    </mask></defs>
    <rect x="0" y="0" width={scene.width} height={scene.height} className="scene-fog-fill" mask={"url(#" + maskId + ")"} />
  </svg>;
}

function withAttachedFixtures(scene: SceneBoardScene, ids: string[]) {
  const expanded = new Set(ids);
  for (const id of ids) {
    if (!scene.objects.some(object => object.id === id && object.kind === "wall")) continue;
    for (const object of scene.objects) if (object.parentWallId === id) expanded.add(object.id);
  }
  return [...expanded];
}

export function SceneBoard({ game, edit, playerPreview }: { game: GameState; edit: Edit; playerPreview: boolean }) {
  const readonly = playerPreview;
  const board = useMemo(
    () => readonly ? projectPlayerSceneBoard(safeBoard(game)) ?? { scenes: [] } : safeBoard(game),
    [game, readonly],
  );
  const [chosenScene, setChosenScene] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [multiSelect, setMultiSelect] = useState(false);
  const [zoom, setZoom] = useState(.8);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pan, setPan] = useState<Pan | null>(null);
  const [wallDraft, setWallDraft] = useState<WallDraft | null>(null);
  const [fogDraft, setFogDraft] = useState<FogDraft | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const panRef = useRef<Pan | null>(null);
  const wallDraftRef = useRef<WallDraft | null>(null);
  const fogDraftRef = useRef<FogDraft | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const scene = board.scenes.find(entry => entry.id === chosenScene)
    ?? board.scenes.find(entry => entry.id === board.activeSceneId)
    ?? board.scenes[0];
  const selectedObjects = scene?.objects.filter(object => selectedIds.includes(object.id)) ?? [];
  const selected = selectedObjects.length === 1 ? selectedObjects[0] : undefined;
  const snapEnabled = scene?.snapToGrid !== false;
  const activeConflictThreats = game.conflict?.active ? game.conflict.threats : [];
  const placedThreatIds = new Set((scene?.objects ?? [])
    .filter(object => object.kind === "token" && object.tokenKind === "threat" && object.refId)
    .map(object => object.refId!));

  function selectScene(id: string) {
    setChosenScene(id);
    setSelectedIds([]);
    setTool("select");
  }

  function createScene() {
    if (readonly) return;
    const name = window.prompt("Nome da nova cena:", "Nova cena")?.trim();
    if (!name) return;
    const created = createSceneBoardScene(name);
    edit(draft => {
      draft.sceneBoard ??= { scenes: [] };
      if (draft.sceneBoard.scenes.length < sceneBoardLimits.maxScenes) draft.sceneBoard.scenes.push(created);
    });
    selectScene(created.id);
  }

  function patchScene(fn: (target: SceneBoardScene) => void) {
    if (readonly || !scene) return;
    edit(draft => {
      const target = draft.sceneBoard?.scenes.find(entry => entry.id === scene.id);
      if (target) fn(target);
    });
  }

  function patchSelected(fn: (target: SceneBoardObject) => void) {
    if (!selectedIds.length) return;
    patchScene(target => {
      for (const object of target.objects) if (selectedIds.includes(object.id)) fn(object);
    });
  }

  function add(kind: SceneObjectKind, label: string, variant?: string, token?: Partial<SceneBoardObject>) {
    if (readonly || !scene) return;
    const object = { ...createSceneBoardObject(kind, label, variant), ...token };
    const visualSize = variant ? visualSizes[variant] : undefined;
    if (visualSize) { object.width = visualSize.width; object.height = visualSize.height; }
    object.x = 110 + ((scene.objects.length * 43) % Math.max(120, scene.width - object.width - 160));
    object.y = 100 + ((scene.objects.length * 31) % Math.max(100, scene.height - object.height - 140));
    if (snapEnabled) {
      const snapped = snapScenePoint({ x: object.x, y: object.y });
      object.x = snapped.x;
      object.y = snapped.y;
    }
    patchScene(target => {
      if (target.objects.length >= sceneBoardLimits.maxObjectsPerScene) return;
      if (kind === "zone") target.objects.unshift(object); else target.objects.push(object);
    });
    setSelectedIds([object.id]);
    setTool("select");
  }

  function scenePoint(clientX: number, clientY: number): ScenePoint {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(scene?.width ?? 0, (clientX - rect.left) / zoom)),
      y: Math.max(0, Math.min(scene?.height ?? 0, (clientY - rect.top) / zoom)),
    };
  }

  function beginWall(event: ReactPointerEvent<HTMLElement>) {
    if (readonly || !scene) return;
    event.preventDefault();
    event.stopPropagation();
    const point = scenePoint(event.clientX, event.clientY);
    const draft = { pointerId: event.pointerId, start: point, end: point };
    wallDraftRef.current = draft;
    setWallDraft(draft);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function updateWall(event: ReactPointerEvent<HTMLDivElement>) {
    const current = wallDraftRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const next = { ...current, end: scenePoint(event.clientX, event.clientY) };
    wallDraftRef.current = next;
    setWallDraft(next);
  }

  function finishWall(event: ReactPointerEvent<HTMLDivElement>) {
    const current = wallDraftRef.current;
    if (!current || current.pointerId !== event.pointerId || !scene) return;
    wallDraftRef.current = null;
    setWallDraft(null);
    const wall = createWallFromDrag(current.start, scenePoint(event.clientX, event.clientY), scene.objects, snapEnabled);
    if (!wall) return;
    patchScene(target => {
      if (target.objects.length < sceneBoardLimits.maxObjectsPerScene) target.objects.push(wall);
    });
    setSelectedIds([wall.id]);
  }

  function beginFog(event: ReactPointerEvent<HTMLElement>) {
    if (readonly || !scene || !scene.fogEnabled || (tool !== "reveal" && tool !== "conceal")) return;
    event.preventDefault();
    event.stopPropagation();
    const point = scenePoint(event.clientX, event.clientY);
    const draft: FogDraft = { pointerId: event.pointerId, start: point, end: point, mode: tool };
    fogDraftRef.current = draft;
    setFogDraft(draft);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function updateFog(event: ReactPointerEvent<HTMLDivElement>) {
    const current = fogDraftRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const next = { ...current, end: scenePoint(event.clientX, event.clientY) };
    fogDraftRef.current = next;
    setFogDraft(next);
  }

  function finishFog(event: ReactPointerEvent<HTMLDivElement>) {
    const current = fogDraftRef.current;
    if (!current || current.pointerId !== event.pointerId || !scene) return;
    fogDraftRef.current = null;
    setFogDraft(null);
    const area = fogAreaFromPoints(scene, current.start, scenePoint(event.clientX, event.clientY));
    if (!area) return;
    patchScene(target => {
      if (current.mode === "reveal") revealSceneFogArea(target, area);
      else coverSceneFogArea(target, area);
    });
  }

  function toggleFog() {
    if (!scene) return;
    const next = !scene.fogEnabled;
    patchScene(target => {
      target.fogEnabled = next;
      target.revealedAreas ??= [];
    });
    setTool(next ? "reveal" : "select");
  }

  function toggleDoor(objectId: string) {
    patchScene(target => {
      const door = target.objects.find(object => object.id === objectId && object.kind === "door");
      if (door) door.doorState = (door.doorState ?? "closed") === "closed" ? "open" : "closed";
    });
  }

  function placeFixture(event: ReactPointerEvent<HTMLButtonElement>, wall: SceneBoardObject) {
    if ((tool !== "door" && tool !== "window") || readonly || !scene) return;
    event.preventDefault();
    event.stopPropagation();
    const fixture = createFixtureOnWall(tool, wall, scenePoint(event.clientX, event.clientY));
    patchScene(target => {
      if (target.objects.length < sceneBoardLimits.maxObjectsPerScene) target.objects.push(fixture);
    });
    setSelectedIds([fixture.id]);
  }

  function selectObject(event: ReactPointerEvent<HTMLButtonElement>, object: SceneBoardObject) {
    if (tool === "pan") return;
    if (tool === "wall") { beginWall(event); return; }
    if (tool === "reveal" || tool === "conceal") { beginFog(event); return; }
    if (tool === "door" || tool === "window") {
      if (object.kind === "wall") placeFixture(event, object);
      return;
    }
    event.stopPropagation();

    const toggle = multiSelect || event.shiftKey || event.ctrlKey || event.metaKey;
    if (toggle) {
      setSelectedIds(previous => previous.includes(object.id) ? previous.filter(id => id !== object.id) : [...previous, object.id]);
      return;
    }

    const baseIds = selectedIds.includes(object.id) && selectedIds.length > 1
      ? selectedIds.filter(id => !scene?.objects.find(entry => entry.id === id)?.locked)
      : object.locked ? [] : [object.id];
    if (!selectedIds.includes(object.id)) setSelectedIds([object.id]);
    if (!baseIds.length || readonly || !scene) return;

    const movingIds = withAttachedFixtures(scene, baseIds);
    const state: Drag = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      anchorId: object.id,
      baseIds,
      movingIds,
      dx: 0,
      dy: 0,
    };
    dragRef.current = state;
    setDrag(state);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    if (!current || !scene || current.pointerId !== event.pointerId) return;
    const anchor = scene.objects.find(object => object.id === current.anchorId);
    if (!anchor) return;
    let dx = (event.clientX - current.clientX) / zoom;
    let dy = (event.clientY - current.clientY) / zoom;
    if (snapEnabled) {
      dx = Math.round((anchor.x + dx) / sceneBoardLimits.gridSize) * sceneBoardLimits.gridSize - anchor.x;
      dy = Math.round((anchor.y + dy) / sceneBoardLimits.gridSize) * sceneBoardLimits.gridSize - anchor.y;
    }
    const delta = clampSceneDelta(scene, current.movingIds, dx, dy);
    const next = { ...current, ...delta };
    dragRef.current = next;
    setDrag(next);
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId || !scene) return;
    dragRef.current = null;
    setDrag(null);
    patchScene(target => { moveSceneObjects(target, current.baseIds, current.dx, current.dy); });
  }

  function startPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (tool !== "pan" || !viewportRef.current) return;
    event.preventDefault();
    const state = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: viewportRef.current.scrollLeft,
      scrollTop: viewportRef.current.scrollTop,
    };
    panRef.current = state;
    setPan(state);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePan(event: ReactPointerEvent<HTMLDivElement>) {
    const current = panRef.current;
    const viewport = viewportRef.current;
    if (!current || !viewport || current.pointerId !== event.pointerId) return;
    viewport.scrollLeft = current.scrollLeft - (event.clientX - current.clientX);
    viewport.scrollTop = current.scrollTop - (event.clientY - current.clientY);
  }

  function finishPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = null;
    setPan(null);
  }

  function changeZoom(next: number, clientX?: number, clientY?: number) {
    const viewport = viewportRef.current;
    const limited = Math.max(.35, Math.min(1.6, Math.round(next * 20) / 20));
    if (!viewport || limited === zoom) { setZoom(limited); return; }
    const rect = viewport.getBoundingClientRect();
    const px = clientX ?? rect.left + rect.width / 2;
    const py = clientY ?? rect.top + rect.height / 2;
    const worldX = (viewport.scrollLeft + px - rect.left) / zoom;
    const worldY = (viewport.scrollTop + py - rect.top) / zoom;
    setZoom(limited);
    requestAnimationFrame(() => {
      viewport.scrollLeft = worldX * limited - (px - rect.left);
      viewport.scrollTop = worldY * limited - (py - rect.top);
    });
  }

  function wheelZoom(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    changeZoom(zoom + (event.deltaY < 0 ? .05 : -.05), event.clientX, event.clientY);
  }

  function centerScene() {
    const viewport = viewportRef.current;
    if (!viewport || !scene) return;
    viewport.scrollTo({
      left: Math.max(0, scene.width * zoom / 2 - viewport.clientWidth / 2),
      top: Math.max(0, scene.height * zoom / 2 - viewport.clientHeight / 2),
      behavior: "smooth",
    });
  }

  function present() {
    if (!scene) return;
    edit(draft => {
      draft.sceneBoard ??= { scenes: [] };
      const target = draft.sceneBoard.scenes.find(entry => entry.id === scene.id);
      if (!target) return;
      target.visibleToPlayers = true;
      draft.sceneBoard.activeSceneId = target.id;
    });
  }

  function hide() {
    if (!scene) return;
    edit(draft => {
      const target = draft.sceneBoard?.scenes.find(entry => entry.id === scene.id);
      if (target) target.visibleToPlayers = false;
      if (draft.sceneBoard?.activeSceneId === scene.id) delete draft.sceneBoard.activeSceneId;
    });
  }

  function duplicateSelection() {
    if (!scene || !selectedIds.length) return;
    const sourceIds = withAttachedFixtures(scene, selectedIds);
    const source = scene.objects.filter(object => sourceIds.includes(object.id));
    const available = sceneBoardLimits.maxObjectsPerScene - scene.objects.length;
    if (!available) return;
    const chosen = source.slice(0, available);
    const idMap = new Map(chosen.map(object => [object.id, createId()]));
    const copies = chosen.map(object => {
      const copy = structuredClone(object);
      copy.id = idMap.get(object.id)!;
      copy.x += 28;
      copy.y += 28;
      if (copy.parentWallId && idMap.has(copy.parentWallId)) copy.parentWallId = idMap.get(copy.parentWallId);
      return copy;
    });
    patchScene(target => { target.objects.push(...copies); });
    const copiedSelected = selectedIds.map(id => idMap.get(id)).filter((id): id is string => Boolean(id));
    setSelectedIds(copiedSelected);
  }

  function deleteSelection() {
    if (!scene || !selectedIds.length) return;
    const remove = new Set(withAttachedFixtures(scene, selectedIds));
    patchScene(target => { target.objects = target.objects.filter(object => !remove.has(object.id)); });
    setSelectedIds([]);
  }

  function rotateSelected(delta: number) {
    if (!scene || !selected) return;
    if (selected.kind === "wall") {
      patchScene(target => { rotateWallWithFixtures(target, selected.id, delta); });
    } else {
      patchSelected(object => { if (!object.locked) object.rotation += delta; });
    }
  }

  function toggleLock() {
    if (!selectedObjects.length) return;
    const shouldLock = !selectedObjects.every(object => object.locked);
    patchSelected(object => { object.locked = shouldLock; });
  }

  if (!scene) return <section className="panel panel-pad scene-board-empty">
    <Layers size={38} />
    <div><p className="dossier-title">Cena visual</p><h2 className="section-title mt-1">{readonly ? "Nenhuma cena está sendo apresentada" : "Comece com uma tela em branco"}</h2>
      <p className="intro-line mt-2">{readonly ? "Quando o mestre apresentar uma cena ela aparecerá aqui." : "Monte corredores, portas, objetos e posições sem transformar o jogo em um mapa tático rígido."}</p></div>
    {!readonly && <Button onClick={createScene}><Plus size={16} /> Criar primeira cena</Button>}
  </section>;

  const live = board.activeSceneId === scene.id && scene.visibleToPlayers;
  const walls = scene.objects.filter(object => object.kind === "wall");
  const preview = wallDraft ? wallGeometry(wallDraft.start, wallDraft.end, walls, snapEnabled) : null;
  const fogPreview = fogDraft ? fogAreaFromPoints(scene, fogDraft.start, fogDraft.end) : null;

  return <section className="scene-board-root">
    <header className="panel panel-pad scene-board-header">
      <div><p className="dossier-title">Cena visual</p><div className="scene-board-title"><h2 className="section-title">{scene.name}</h2>
        <span className={live ? "tag scene-live" : "tag"}>{live ? <Eye size={13} /> : <EyeOff size={13} />}{live ? "AO VIVO" : readonly ? "Não apresentada" : "Privada"}</span></div></div>
      {!readonly && <div className="scene-tabs">{board.scenes.map(entry => <button type="button" key={entry.id}
        className={entry.id === scene.id ? "is-active" : ""} onClick={() => selectScene(entry.id)}>{entry.name}</button>)}
        <button type="button" onClick={createScene}><Plus size={14} /> Nova</button></div>}
      <div className="scene-board-actions">
        <Button size="sm" variant="outline" onClick={() => changeZoom(zoom - .1)}><ZoomOut size={15} /></Button>
        <span className="scene-zoom">{Math.round(zoom * 100)}%</span>
        <Button size="sm" variant="outline" onClick={() => changeZoom(zoom + .1)}><ZoomIn size={15} /></Button>
        <Button size="sm" variant="outline" onClick={centerScene}>Centralizar</Button>
        {!readonly && <><Button size="sm" variant="outline" onClick={() => patchScene(target => { target.showGrid = !target.showGrid; })}>{scene.showGrid ? "Ocultar grade" : "Mostrar grade"}</Button>
          <Button size="sm" variant={snapEnabled ? "default" : "outline"} onClick={() => patchScene(target => { target.snapToGrid = target.snapToGrid === false; })}>Snap {snapEnabled ? "ligado" : "desligado"}</Button>
          <Button size="sm" variant={scene.fogEnabled ? "default" : "outline"} onClick={toggleFog}>{scene.fogEnabled ? <EyeOff size={15} /> : <Eye size={15} />} Fog {scene.fogEnabled ? "ativo" : "desligado"}</Button>
          {scene.fogEnabled && <><Button size="sm" variant="outline" onClick={() => patchScene(revealAllSceneFog)}>Revelar tudo</Button>
            <Button size="sm" variant="outline" onClick={() => patchScene(coverAllSceneFog)}>Cobrir tudo</Button></>}
          {live ? <Button size="sm" variant="outline" onClick={hide}><EyeOff size={15} /> Ocultar da mesa</Button>
            : <Button size="sm" onClick={present}><Eye size={15} /> Apresentar</Button>}</>}
      </div>
    </header>

    {!readonly && <div className="panel scene-toolstrip" role="toolbar" aria-label="Ferramentas da cena">
      <button type="button" className={tool === "select" ? "is-active" : ""} onClick={() => setTool("select")}><MousePointer2 size={16} /><span>Selecionar</span></button>
      <button type="button" className={tool === "pan" ? "is-active" : ""} onClick={() => setTool("pan")}><Hand size={16} /><span>Mover câmera</span></button>
      <button type="button" className={tool === "wall" ? "is-active" : ""} onClick={() => setTool("wall")}><Minus size={17} /><span>Desenhar parede</span></button>
      <button type="button" className={tool === "door" ? "is-active" : ""} onClick={() => setTool("door")}><Square size={15} /><span>Porta na parede</span></button>
      <button type="button" className={tool === "window" ? "is-active" : ""} onClick={() => setTool("window")}><Square size={15} /><span>Janela na parede</span></button>
      <button type="button" disabled={!scene.fogEnabled} className={tool === "reveal" ? "is-active" : ""} onClick={() => setTool("reveal")}><Eye size={15} /><span>Revelar área</span></button>
      <button type="button" disabled={!scene.fogEnabled} className={tool === "conceal" ? "is-active" : ""} onClick={() => setTool("conceal")}><EyeOff size={15} /><span>Ocultar área</span></button>
      <span className="scene-toolstrip-spacer" />
      <button type="button" className={multiSelect ? "is-active" : ""} aria-pressed={multiSelect} onClick={() => setMultiSelect(value => !value)}>
        <Layers size={15} /><span>Múltipla</span>{selectedIds.length > 0 && <b>{selectedIds.length}</b>}
      </button>
    </div>}

    <div className={"scene-board-layout" + (readonly ? " is-readonly" : "")}>
      {!readonly && <aside className="panel panel-pad scene-palette">
        <p className="dossier-title">Biblioteca visual</p>
        <p className="scene-palette-note">Estrutura é desenhada pela barra acima. Os objetos abaixo usam leitura de planta para continuar legíveis mesmo com zoom baixo.</p>
        {libraryGroups.map(group => <section className="scene-library-group" key={group.label}>
          <b>{group.label}</b>
          <div className="scene-piece-grid">{group.pieces.map(piece => <button type="button" key={piece.label} onClick={() => add(piece.kind, piece.label, piece.variant)}>
            {piece.kind === "text" ? <Type size={15} /> : <ObjectVisual variant={piece.variant} compact />}<span>{piece.label}</span></button>)}</div>
        </section>)}
        <div className="scene-token-section"><b>Sobreviventes</b>{game.survivors.map(person => <button type="button" className="scene-library-person" key={person.id}
          onClick={() => add("token", person.name, "survivor", { tokenKind: "survivor", refId: person.id })}>
          <span className="scene-library-avatar">{person.portrait ? <img src={person.portrait} alt="" /> : <User size={14} />}</span><span>{person.name}</span></button>)}</div>
        <div className="scene-token-section"><b>PNJs</b>{game.npcs.filter(person => person.active).slice(0, 30).map(person => <button type="button" className="scene-library-person" key={person.id}
          onClick={() => add("token", person.name, "npc", { tokenKind: "npc", refId: person.id })}>
          <span className="scene-library-avatar">{person.portrait ? <img src={person.portrait} alt="" style={portraitStyle(person.portraitFrame)} /> : <User size={14} />}</span><span>{person.name}</span></button>)}</div>
        {activeConflictThreats.length > 0 && <div className="scene-token-section scene-conflict-token-library">
          <b>Ameaças do conflito</b><small>{game.conflict?.name}</small>
          {activeConflictThreats.map(threat => {
            const placed = placedThreatIds.has(threat.id);
            return <button type="button" className={"scene-library-person" + (threat.defeated ? " is-defeated" : "")} key={threat.id} disabled={placed}
              onClick={() => add("token", threat.name, "threat", { tokenKind: "threat", refId: threat.id, width: 64, height: 64 })}>
              <span className="scene-library-avatar is-threat">{threat.templateSnapshot.image ? <img src={threat.templateSnapshot.image} alt="" /> : <User size={14} />}</span>
              <span>{threat.name}<small>{placed ? "Já está na cena" : threat.defeated ? "Fora de combate" : threat.templateSnapshot.role}</small></span>
            </button>;
          })}
        </div>}
        <div className="scene-token-section"><b>Outros</b><button type="button" className="scene-library-person"
          onClick={() => add("token", "Ameaça", "threat", { tokenKind: "threat" })}><span className="scene-library-avatar is-threat"><User size={14} /></span><span>Ameaça genérica</span></button></div>
      </aside>}

      <div className="panel scene-workspace">
        <div ref={viewportRef}
          className={"scene-viewport tool-" + tool + (pan ? " is-panning" : "")}
          onWheel={wheelZoom}
          onPointerDown={startPan}
          onPointerMove={movePan}
          onPointerUp={finishPan}
          onPointerCancel={finishPan}>
          <div className="scene-scaled" style={{ width: scene.width * zoom, height: scene.height * zoom }}>
            <div ref={stageRef}
              className={"scene-stage" + (scene.showGrid ? " has-grid" : "")}
              style={{ width: scene.width, height: scene.height, transform: "scale(" + zoom + ")" }}
              onPointerDown={event => {
                if (tool === "wall") beginWall(event);
                else if (tool === "reveal" || tool === "conceal") beginFog(event);
                else if (tool === "select") setSelectedIds([]);
              }}
              onPointerMove={event => { updateWall(event); updateFog(event); }}
              onPointerUp={event => { finishWall(event); finishFog(event); }}
              onPointerCancel={event => { finishWall(event); finishFog(event); }}>
              {scene.objects.map(object => {
                const moving = drag?.movingIds.includes(object.id);
                const shown = moving ? { ...object, x: object.x + (drag?.dx ?? 0), y: object.y + (drag?.dy ?? 0) } : object;
                const tokenView = shown.kind === "token" ? tokenPresentation(game, shown) : null;
                return <button type="button" key={object.id}
                  className={"scene-object scene-" + shown.kind + (shown.variant ? " scene-" + shown.variant : "")
                    + (selectedIds.includes(object.id) ? " is-selected" : "") + (!shown.visibleToPlayers && !readonly ? " is-hidden" : "")
                    + (shown.locked ? " is-locked" : "") + (shown.parentWallId ? " is-attached" : "")
                    + (shown.kind === "door" ? " scene-door-" + (shown.doorState ?? "closed") : "")
                    + (tokenView?.state === "defeated" || tokenView?.state === "dead" ? " is-out" : "")}
                  style={{ left: shown.x, top: shown.y, width: shown.width, height: shown.height, transform: "rotate(" + shown.rotation + "deg)" }}
                  onPointerDown={event => selectObject(event, object)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
                  onDoubleClick={event => { if (!readonly && tool === "select" && object.kind === "door") { event.stopPropagation(); toggleDoor(object.id); } }}>
                  {face(shown, game)}
                  {shown.locked && !readonly && <span className="scene-object-lock"><Lock size={9} /></span>}
                </button>;
              })}
              {preview && <div className="scene-wall-draft" style={{
                left: preview.x, top: preview.y, width: preview.width, height: preview.height,
                transform: "rotate(" + preview.rotation + "deg)",
              }} />}
              <FogOverlay scene={scene} readonly={readonly} />
              {fogPreview && <div className={"scene-fog-draft is-" + fogDraft?.mode} style={{ left: fogPreview.x, top: fogPreview.y, width: fogPreview.width, height: fogPreview.height }} />}
            </div>
          </div>
        </div>
        <footer className="scene-hint">
          {tool === "wall" ? "Arraste para desenhar. Pontas próximas se encaixam automaticamente e linhas quase retas são alinhadas."
            : tool === "reveal" ? "Arraste um retângulo sobre a planta para revelar essa área aos jogadores. Objetos totalmente fora das áreas reveladas não são enviados."
            : tool === "conceal" ? "Arraste sobre uma área revelada para cobri-la novamente. Isso também remove da visão pública os objetos que ficarem fora da área visível."
            : tool === "door" || tool === "window" ? "Clique em uma parede para inserir " + (tool === "door" ? "uma porta" : "uma janela") + " vinculada a ela."
            : tool === "pan" ? "Arraste em qualquer ponto para mover a câmera. A roda do mouse continua controlando o zoom."
            : multiSelect ? "Toque em vários objetos para montar a seleção. Desative “Múltipla” e arraste um deles para mover o grupo."
            : "Arraste objetos para posicionar. Use Shift/Ctrl para selecionar vários no desktop."}
        </footer>
      </div>

      {!readonly && <aside className="panel panel-pad scene-inspector">
        <div className="scene-inspector-heading"><p className="dossier-title">Inspetor</p>{selectedObjects.length > 1 && <span className="tag">{selectedObjects.length} selecionados</span>}</div>
        {!selectedObjects.length ? <p className="subtle text-sm">Selecione uma peça. Objetos bloqueados continuam selecionáveis, mas não se movem por acidente.</p> : <>
          {selected && <label>Nome<input key={selected.id} defaultValue={selected.label} maxLength={120} onBlur={event => {
            const value = event.currentTarget.value.trim();
            if (value) patchSelected(object => { object.label = value; });
          }} /></label>}
          {selected && <div className="scene-inspector-buttons"><Button size="sm" variant="outline" onClick={() => patchSelected(object => { if (!object.locked) object.width = Math.max(12, object.width - 20); })}>− largura</Button>
            <Button size="sm" variant="outline" onClick={() => patchSelected(object => { if (!object.locked) object.width = Math.min(2000, object.width + 20); })}>+ largura</Button>
            <Button size="sm" variant="outline" onClick={() => patchSelected(object => { if (!object.locked) object.height = Math.max(12, object.height - 20); })}>− altura</Button>
            <Button size="sm" variant="outline" onClick={() => patchSelected(object => { if (!object.locked) object.height = Math.min(1600, object.height + 20); })}>+ altura</Button></div>}
          {selected?.kind === "door" && <Button variant="outline" onClick={() => toggleDoor(selected.id)}><Square size={15} /> Porta {(selected.doorState ?? "closed") === "closed" ? "fechada · abrir" : "aberta · fechar"}</Button>}
          {selected?.kind === "zone" && scene.fogEnabled && <div className="scene-inspector-buttons"><Button size="sm" variant="outline" onClick={() => patchScene(target => { revealSceneFogArea(target, { x: selected.x, y: selected.y, width: selected.width, height: selected.height }); })}><Eye size={14} /> Revelar sala</Button>
            <Button size="sm" variant="outline" onClick={() => patchScene(target => { coverSceneFogArea(target, { x: selected.x, y: selected.y, width: selected.width, height: selected.height }); })}><EyeOff size={14} /> Ocultar sala</Button></div>}
          {selected && <div className="scene-inspector-buttons"><Button size="sm" variant="outline" disabled={Boolean(selected.locked)} onClick={() => rotateSelected(-15)}><RotateCcw size={14} /> −15°</Button>
            <Button size="sm" variant="outline" disabled={Boolean(selected.locked)} onClick={() => rotateSelected(15)}><RotateCw size={14} /> +15°</Button></div>}
          <Button variant="outline" onClick={toggleLock}>
            {selectedObjects.every(object => object.locked) ? <Unlock size={15} /> : <Lock size={15} />}
            {selectedObjects.every(object => object.locked) ? "Desbloquear seleção" : "Bloquear seleção"}
          </Button>
          <Button variant="outline" onClick={() => {
            const visible = !selectedObjects.every(object => object.visibleToPlayers);
            patchSelected(object => { object.visibleToPlayers = visible; });
          }}>
            {selectedObjects.every(object => object.visibleToPlayers) ? <EyeOff size={15} /> : <Eye size={15} />}
            {selectedObjects.every(object => object.visibleToPlayers) ? "Ocultar dos jogadores" : "Mostrar aos jogadores"}
          </Button>
          <div className="scene-inspector-buttons"><Button variant="outline" onClick={duplicateSelection}><Copy size={15} /> Duplicar</Button>
            <Button variant="destructive" onClick={deleteSelection}><Trash2 size={15} /> Excluir</Button></div>
          {selected?.parentWallId && <p className="scene-attached-note">Esta peça está vinculada a uma parede e acompanha os movimentos e rotações dela.</p>}
        </>}
      </aside>}
    </div>
  </section>;
}
