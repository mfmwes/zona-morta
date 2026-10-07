"use client";

import { MasterContextActions, PlayerContextActions, type MasterActionControls, type PlayerActionControls } from "@/components/player-actions-panel";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import {
  Copy, Eye, EyeOff, Hand, Layers, Lock, Minus, MousePointer2, Plus, RotateCcw, RotateCw,
  Search, Square, Trash2, Type, Unlock, User, ZoomIn, ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/game-controls";
import { Button } from "@/components/ui/button";
import { survivorIsDown, type GameState } from "@/lib/game";
import { removalFingerprint } from "@/lib/master-removals";
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
type LibraryGroup = { id: string; label: string; shortLabel: string; pieces: LibraryPiece[] };

const libraryGroups: LibraryGroup[] = [
  { id: "ambiente", label: "Ambiente e marcação", shortLabel: "Ambiente", pieces: [
    { kind: "zone", label: "Sala / área", variant: "room" },
    { kind: "text", label: "Texto" },
    { kind: "prop", label: "Pista / objetivo", variant: "marker" },
    { kind: "prop", label: "Tapete", variant: "rug" },
    { kind: "furniture", label: "Divisória", variant: "partition" },
    { kind: "prop", label: "Escada", variant: "stairs" },
  ] },
  { id: "casa", label: "Casa e mobiliário", shortLabel: "Casa", pieces: [
    { kind: "furniture", label: "Mesa", variant: "table" },
    { kind: "furniture", label: "Mesa de jantar", variant: "dining-table" },
    { kind: "furniture", label: "Mesa de centro", variant: "coffee-table" },
    { kind: "furniture", label: "Cadeira", variant: "chair" },
    { kind: "furniture", label: "Poltrona", variant: "armchair" },
    { kind: "furniture", label: "Sofá", variant: "sofa" },
    { kind: "furniture", label: "Armário", variant: "cabinet" },
    { kind: "furniture", label: "Guarda-roupa", variant: "wardrobe" },
    { kind: "furniture", label: "Estante", variant: "shelf" },
    { kind: "furniture", label: "Cama", variant: "bed" },
    { kind: "furniture", label: "Beliche", variant: "bunkbed" },
    { kind: "furniture", label: "Criado-mudo", variant: "nightstand" },
    { kind: "furniture", label: "Geladeira", variant: "fridge" },
    { kind: "furniture", label: "Fogão", variant: "stove" },
    { kind: "furniture", label: "Máquina de lavar", variant: "washer" },
    { kind: "furniture", label: "Televisão", variant: "television" },
  ] },
  { id: "banheiro", label: "Banheiro", shortLabel: "Banheiro", pieces: [
    { kind: "furniture", label: "Pia", variant: "sink" },
    { kind: "furniture", label: "Vaso sanitário", variant: "toilet" },
    { kind: "furniture", label: "Chuveiro", variant: "shower" },
    { kind: "furniture", label: "Banheira", variant: "bathtub" },
  ] },
  { id: "trabalho", label: "Escritório e comércio", shortLabel: "Trabalho", pieces: [
    { kind: "furniture", label: "Escrivaninha", variant: "desk" },
    { kind: "furniture", label: "Cadeira de escritório", variant: "office-chair" },
    { kind: "furniture", label: "Computador", variant: "computer" },
    { kind: "furniture", label: "Arquivo", variant: "filing-cabinet" },
    { kind: "furniture", label: "Balcão", variant: "counter" },
    { kind: "furniture", label: "Caixa registradora", variant: "checkout" },
    { kind: "furniture", label: "Prateleira comercial", variant: "store-shelf" },
    { kind: "furniture", label: "Freezer", variant: "freezer" },
    { kind: "furniture", label: "Máquina de vendas", variant: "vending" },
    { kind: "furniture", label: "Bancada de trabalho", variant: "workbench" },
    { kind: "furniture", label: "Armário de ferramentas", variant: "tool-cabinet" },
    { kind: "furniture", label: "Armário metálico", variant: "locker" },
  ] },
  { id: "hospital", label: "Hospital e emergência", shortLabel: "Hospital", pieces: [
    { kind: "furniture", label: "Cama hospitalar", variant: "hospital-bed" },
    { kind: "furniture", label: "Maca", variant: "stretcher" },
    { kind: "furniture", label: "Cadeira de rodas", variant: "wheelchair" },
    { kind: "furniture", label: "Mesa cirúrgica", variant: "surgery-table" },
    { kind: "furniture", label: "Biombo hospitalar", variant: "privacy-screen" },
    { kind: "prop", label: "Suporte de soro", variant: "iv-stand" },
    { kind: "prop", label: "Caixa médica", variant: "med-crate" },
  ] },
  { id: "sobrevivencia", label: "Sobrevivência e ruínas", shortLabel: "Ruínas", pieces: [
    { kind: "prop", label: "Caixa", variant: "crate" },
    { kind: "prop", label: "Barricada", variant: "barricade" },
    { kind: "prop", label: "Entulho", variant: "debris" },
    { kind: "prop", label: "Gerador", variant: "generator" },
    { kind: "prop", label: "Barril", variant: "barrel" },
    { kind: "prop", label: "Palete", variant: "pallet" },
    { kind: "prop", label: "Corpo", variant: "body" },
    { kind: "prop", label: "Sacos de areia", variant: "sandbags" },
    { kind: "prop", label: "Fogueira", variant: "campfire" },
    { kind: "prop", label: "Barraca", variant: "tent" },
    { kind: "prop", label: "Caixa d'água", variant: "water-tank" },
    { kind: "prop", label: "Lixeira", variant: "trash-bin" },
  ] },
  { id: "rua", label: "Rua e veículos", shortLabel: "Rua", pieces: [
    { kind: "prop", label: "Carro", variant: "car" },
    { kind: "prop", label: "Caminhonete", variant: "pickup" },
    { kind: "prop", label: "Van", variant: "van" },
    { kind: "prop", label: "Ambulância", variant: "ambulance" },
    { kind: "prop", label: "Ônibus", variant: "bus" },
    { kind: "prop", label: "Motocicleta", variant: "motorcycle" },
    { kind: "prop", label: "Bicicleta", variant: "bicycle" },
    { kind: "prop", label: "Caçamba", variant: "dumpster" },
    { kind: "prop", label: "Cone", variant: "traffic-cone" },
    { kind: "prop", label: "Barreira de trânsito", variant: "road-barrier" },
    { kind: "prop", label: "Poste de luz", variant: "streetlight" },
  ] },
];

const visualSizes: Record<string, { width: number; height: number }> = {
  room: { width: 320, height: 220 }, marker: { width: 58, height: 58 },
  rug: { width: 140, height: 90 }, partition: { width: 150, height: 28 }, stairs: { width: 120, height: 150 },
  table: { width: 130, height: 80 }, "dining-table": { width: 170, height: 90 }, "coffee-table": { width: 110, height: 64 },
  chair: { width: 56, height: 56 }, armchair: { width: 76, height: 76 }, sofa: { width: 150, height: 68 },
  cabinet: { width: 90, height: 48 }, wardrobe: { width: 120, height: 58 }, shelf: { width: 140, height: 42 },
  bed: { width: 90, height: 150 }, bunkbed: { width: 92, height: 160 }, nightstand: { width: 52, height: 52 },
  fridge: { width: 72, height: 86 }, stove: { width: 76, height: 70 }, washer: { width: 70, height: 70 }, television: { width: 105, height: 34 },
  sink: { width: 76, height: 62 }, toilet: { width: 62, height: 82 }, shower: { width: 82, height: 82 }, bathtub: { width: 140, height: 72 },
  desk: { width: 150, height: 72 }, "office-chair": { width: 62, height: 62 }, computer: { width: 66, height: 44 },
  "filing-cabinet": { width: 72, height: 92 }, counter: { width: 160, height: 52 }, checkout: { width: 130, height: 70 },
  "store-shelf": { width: 160, height: 46 }, freezer: { width: 130, height: 70 }, vending: { width: 76, height: 102 },
  workbench: { width: 160, height: 68 }, "tool-cabinet": { width: 100, height: 58 }, locker: { width: 96, height: 62 },
  "hospital-bed": { width: 96, height: 160 }, stretcher: { width: 72, height: 150 }, wheelchair: { width: 76, height: 76 },
  "surgery-table": { width: 78, height: 158 }, "privacy-screen": { width: 150, height: 24 }, "iv-stand": { width: 48, height: 48 },
  "med-crate": { width: 66, height: 66 },
  crate: { width: 62, height: 62 }, barricade: { width: 140, height: 48 }, debris: { width: 100, height: 76 },
  generator: { width: 100, height: 72 }, barrel: { width: 58, height: 58 }, pallet: { width: 110, height: 78 },
  body: { width: 62, height: 120 }, sandbags: { width: 140, height: 58 }, campfire: { width: 62, height: 62 },
  tent: { width: 120, height: 105 }, "water-tank": { width: 86, height: 86 }, "trash-bin": { width: 70, height: 70 },
  car: { width: 168, height: 84 }, pickup: { width: 178, height: 86 }, van: { width: 184, height: 90 },
  ambulance: { width: 190, height: 90 }, bus: { width: 250, height: 96 }, motorcycle: { width: 112, height: 52 },
  bicycle: { width: 100, height: 48 }, dumpster: { width: 120, height: 72 }, "traffic-cone": { width: 46, height: 46 },
  "road-barrier": { width: 150, height: 42 }, streetlight: { width: 42, height: 42 },
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
      if (full) state = survivorIsDown(full) ? "down" : full.hp > 0 ? "injured" : "active";
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
    const stateLabel = token.state === "injured" ? "FERIDO" : token.state === "down" ? "CAÍDO" : token.state === "dead" ? "MORTO" : token.state === "defeated" ? "FORA DE COMBATE" : "";
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

export function SceneBoard({ game, edit, playerPreview, playerActions, masterActions }: { game: GameState; edit: Edit; playerPreview: boolean; playerActions?: PlayerActionControls; masterActions?: MasterActionControls }) {
  const readonly = playerPreview;
  const [playerPosition, setPlayerPosition] = useState<{sceneId:string;x:number;y:number}|null>(null);
  const board = useMemo(
    () => readonly ? projectPlayerSceneBoard(safeBoard(game)) ?? { scenes: [] } : safeBoard(game),
    [game, readonly],
  );
  const [workspaceMode, setWorkspaceMode] = useState<"prepare" | "session">(() => board.activeSceneId ? "session" : "prepare");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newSceneName, setNewSceneName] = useState("Nova cena");
  const [chosenScene, setChosenScene] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [multiSelect, setMultiSelect] = useState(false);
  const [libraryMode, setLibraryMode] = useState<"objects" | "tokens">("objects");
  const [libraryCategory, setLibraryCategory] = useState("all");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [zoom, setZoom] = useState(.8);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pan, setPan] = useState<Pan | null>(null);
  const [wallDraft, setWallDraft] = useState<WallDraft | null>(null);
  const [fogDraft, setFogDraft] = useState<FogDraft | null>(null);
  const [deletionTarget, setDeletionTarget] = useState<{ scene: SceneBoardScene; activeSceneId: string | null; day: number; id: string } | null>(null);
  const [deletionPending, setDeletionPending] = useState(false);
  const [deletionError, setDeletionError] = useState("");
  const deletionLock = useRef(false);
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
  const showLibrary = !readonly && (workspaceMode === "prepare" || libraryOpen);
  const showInspector = !readonly && (workspaceMode === "prepare" || selectedObjects.length > 0);
  const activeConflictThreats = game.conflict?.active ? game.conflict.threats : [];
  const placedThreatIds = new Set((scene?.objects ?? [])
    .filter(object => object.kind === "token" && object.tokenKind === "threat" && object.refId)
    .map(object => object.refId!));
  const normalizedLibraryQuery = libraryQuery.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const visibleLibraryGroups = libraryGroups
    .filter(group => libraryCategory === "all" || group.id === libraryCategory)
    .map(group => ({
      ...group,
      pieces: group.pieces.filter(piece => !normalizedLibraryQuery
        || (piece.label + " " + group.label).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").includes(normalizedLibraryQuery)),
    }))
    .filter(group => group.pieces.length > 0);
  const visibleSurvivors = game.survivors.filter(person => !normalizedLibraryQuery
    || person.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").includes(normalizedLibraryQuery));
  const visibleNpcs = game.npcs.filter(person => person.active && (!normalizedLibraryQuery
    || person.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").includes(normalizedLibraryQuery))).slice(0, 40);
  const visibleThreats = activeConflictThreats.filter(threat => !normalizedLibraryQuery
    || (threat.name + " " + threat.templateSnapshot.role).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").includes(normalizedLibraryQuery));


  function selectScene(id: string) {
    setChosenScene(id);
    setSelectedIds([]);
    setTool("select");
  }

  function createScene() {
    if (readonly) return;
    const name = newSceneName.trim().slice(0, 120);
    if (!name) return;
    if (board.scenes.length >= sceneBoardLimits.maxScenes) {
      toast.error(`A campanha já tem ${sceneBoardLimits.maxScenes} cenas visuais.`);
      return;
    }
    const created = createSceneBoardScene(name);
    edit(draft => {
      draft.sceneBoard ??= { scenes: [] };
      if (draft.sceneBoard.scenes.length < sceneBoardLimits.maxScenes) draft.sceneBoard.scenes.push(created);
    });
    selectScene(created.id);
    setCreateOpen(false);
    setWorkspaceMode("prepare");
    toast.success("Cena criada", { description: "Monte o ambiente e apresente quando estiver pronto." });
  }

  function openCreateScene() {
    if (readonly) return;
    setNewSceneName("Nova cena");
    setCreateOpen(true);
  }

  function switchWorkspaceMode(mode: "prepare" | "session") {
    setWorkspaceMode(mode);
    setLibraryOpen(false);
    setTool("select");
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
    if (scene.objects.length >= sceneBoardLimits.maxObjectsPerScene) {
      toast.error(`Esta cena já tem ${sceneBoardLimits.maxObjectsPerScene} objetos.`);
      return;
    }
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
    if (readonly || !scene) return;
    edit(draft => {
      draft.sceneBoard ??= { scenes: [] };
      const target = draft.sceneBoard.scenes.find(entry => entry.id === scene.id);
      if (!target) return;
      target.visibleToPlayers = true;
      draft.sceneBoard.activeSceneId = target.id;
    });
    toast.success("Cena apresentada", { description: scene.name });
  }

  function hide() {
    if (readonly || !scene) return;
    edit(draft => {
      const target = draft.sceneBoard?.scenes.find(entry => entry.id === scene.id);
      if (target) target.visibleToPlayers = false;
      if (draft.sceneBoard?.activeSceneId === scene.id) delete draft.sceneBoard.activeSceneId;
    });
    toast.success("Cena ocultada da mesa");
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

  async function confirmSceneDeletion() {
    if (readonly || !deletionTarget || !masterActions?.canAct || masterActions.pending || deletionLock.current) return;
    deletionLock.current = true;
    setDeletionPending(true);
    setDeletionError("");
    try {
      await masterActions.send({ type: "delete-scene", id: deletionTarget.id, day: deletionTarget.day,
        sceneId: deletionTarget.scene.id, expectedActiveSceneId: deletionTarget.activeSceneId,
        expectedFingerprint: await removalFingerprint(deletionTarget.scene) });
      setDeletionTarget(null);
      selectScene(board.scenes.find(entry => entry.id !== deletionTarget.scene.id && entry.id === board.activeSceneId)?.id
        ?? board.scenes.find(entry => entry.id !== deletionTarget.scene.id)?.id ?? "");
      if (deletionTarget.activeSceneId === deletionTarget.scene.id) setWorkspaceMode("prepare");
      setDrag(null); dragRef.current = null;
      setPan(null); panRef.current = null;
      setWallDraft(null); wallDraftRef.current = null;
      setFogDraft(null); fogDraftRef.current = null;
      setPlayerPosition(null);
      toast.success("Cena excluída");
    } catch (error) { setDeletionError(error instanceof Error ? error.message : "Não foi possível excluir a cena."); }
    finally { deletionLock.current = false; setDeletionPending(false); }
  }

  const deletionDialog = !readonly && <Dialog open={Boolean(deletionTarget)} onOpenChange={open => { if (!open && !deletionLock.current) setDeletionTarget(null); }}>
    <DialogContent><DialogHeader><DialogTitle>Excluir cena?</DialogTitle>
      <DialogDescription>A cena “{deletionTarget?.scene.name}”, seus elementos e marcações serão excluídos permanentemente.</DialogDescription></DialogHeader>
      {deletionTarget?.activeSceneId === deletionTarget?.scene.id && <p className="text-sm">Esta cena está ao vivo. A apresentação aos jogadores será encerrada.</p>}
      <p className="text-sm subtle">Os sobreviventes, PNJs e ameaças representados pelos tokens continuam cadastrados na campanha.</p>
      {deletionError && <p role="alert" className="text-sm text-destructive">{deletionError}</p>}
      <DialogFooter><Button variant="outline" disabled={deletionPending} onClick={() => { if (!deletionLock.current) setDeletionTarget(null); }}>Manter cena</Button>
        <Button variant="destructive" disabled={!masterActions?.canAct || masterActions.pending || deletionPending} onClick={confirmSceneDeletion}>{deletionPending ? "Excluindo…" : "Excluir definitivamente"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;

  const creationDialog = !readonly && <Dialog open={createOpen} onOpenChange={setCreateOpen}>
    <DialogContent><DialogHeader><DialogTitle>Criar cena visual</DialogTitle>
      <DialogDescription>A cena começa privada. Você escolhe quando apresentá-la aos jogadores.</DialogDescription></DialogHeader>
      <form onSubmit={event => { event.preventDefault(); createScene(); }}>
        <Field label="Nome da cena" value={newSceneName} onChange={setNewSceneName} placeholder="Ex.: Corredores do hospital" />
        <DialogFooter className="mt-4"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
          <Button type="submit" disabled={!newSceneName.trim() || board.scenes.length >= sceneBoardLimits.maxScenes}>Criar cena</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;

  if (!scene) return <><section className="panel panel-pad scene-board-empty">
    <Layers size={38} />
    <div><p className="dossier-title">Cena visual</p><h2 className="section-title mt-1">{readonly ? "Nenhuma cena está sendo apresentada" : "Comece com uma tela em branco"}</h2>
      <p className="intro-line mt-2">{readonly ? "Quando o mestre apresentar uma cena ela aparecerá aqui." : "Monte corredores, portas, objetos e posições sem transformar o jogo em um mapa tático rígido."}</p></div>
    {!readonly && <Button onClick={openCreateScene}><Plus size={16} /> Criar primeira cena</Button>}
  </section>{masterActions && !readonly && <details className="team-card"><summary>Liberar tokens e marcações dos jogadores</summary><MasterContextActions game={game} controls={masterActions} context={{kind:"scene"}} /></details>}{creationDialog}{deletionDialog}</>;

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
        <button type="button" disabled={board.scenes.length >= sceneBoardLimits.maxScenes} onClick={openCreateScene}><Plus size={14} /> Nova</button></div>}
      <div className="scene-board-actions">
        <Button size="sm" variant="outline" aria-label="Diminuir zoom" onClick={() => changeZoom(zoom - .1)}><ZoomOut size={15} /></Button>
        <span className="scene-zoom">{Math.round(zoom * 100)}%</span>
        <Button size="sm" variant="outline" aria-label="Aumentar zoom" onClick={() => changeZoom(zoom + .1)}><ZoomIn size={15} /></Button>
        <Button size="sm" variant="outline" onClick={centerScene}>Centralizar</Button>
        {!readonly && <>
          {live ? <Button size="sm" variant="outline" onClick={hide}><EyeOff size={15} /> Ocultar da mesa</Button>
            : <Button size="sm" onClick={present}><Eye size={15} /> Apresentar</Button>}
          <Button size="sm" variant="outline" disabled={!masterActions?.canAct || masterActions.pending || deletionPending}
            onClick={() => { setDeletionError(""); setDeletionTarget({ scene: structuredClone(scene), activeSceneId: board.activeSceneId ?? null, day: game.day, id: createId() }); }}><Trash2 size={15} /> Excluir cena</Button></>}
      </div>
    </header>

    {!readonly && <>
      <div className="scene-session-bar">
        <div className="scene-workflow-switch" role="group" aria-label="Modo de uso da cena">
          <Button size="sm" variant={workspaceMode === "prepare" ? "default" : "outline"} aria-pressed={workspaceMode === "prepare"} onClick={() => switchWorkspaceMode("prepare")}>Montar cena</Button>
          <Button size="sm" variant={workspaceMode === "session" ? "default" : "outline"} aria-pressed={workspaceMode === "session"} onClick={() => switchWorkspaceMode("session")}>Conduzir sessão</Button>
        </div>
        <p role="status">{live ? "A mesa vê esta cena. Mudanças nos elementos visíveis aparecem para os jogadores." : board.activeSceneId ? `Você está preparando esta cena. A mesa vê: ${board.scenes.find(entry => entry.id === board.activeSceneId)?.name ?? "outra cena"}.` : "Esta cena está privada. Use Apresentar para mostrá-la à mesa."}</p>
      </div>
      <details className="panel scene-display-settings"><summary>Grade e visibilidade</summary><div className="scene-board-actions">
        <Button size="sm" variant="outline" onClick={() => patchScene(target => { target.showGrid = !target.showGrid; })}>{scene.showGrid ? "Ocultar grade" : "Mostrar grade"}</Button>
          <Button size="sm" variant={snapEnabled ? "default" : "outline"} onClick={() => patchScene(target => { target.snapToGrid = target.snapToGrid === false; })}>Encaixe {snapEnabled ? "ligado" : "desligado"}</Button>
          <Button size="sm" variant={scene.fogEnabled ? "default" : "outline"} onClick={toggleFog}>{scene.fogEnabled ? <EyeOff size={15} /> : <Eye size={15} />} Névoa {scene.fogEnabled ? "ativa" : "desligada"}</Button>
          {scene.fogEnabled && <><Button size="sm" variant="outline" onClick={() => patchScene(revealAllSceneFog)}>Revelar tudo</Button>
            <Button size="sm" variant="outline" onClick={() => patchScene(coverAllSceneFog)}>Cobrir tudo</Button></>}
      </div></details>
    </>}

    {!readonly && <div className="panel scene-toolstrip" role="toolbar" aria-label="Ferramentas da cena">
      <button type="button" className={tool === "select" ? "is-active" : ""} aria-pressed={tool === "select"} onClick={() => setTool("select")}><MousePointer2 size={16} /><span>Selecionar</span></button>
      <button type="button" className={tool === "pan" ? "is-active" : ""} aria-pressed={tool === "pan"} onClick={() => setTool("pan")}><Hand size={16} /><span>Mover câmera</span></button>
      {workspaceMode === "prepare" && <><button type="button" className={tool === "wall" ? "is-active" : ""} aria-pressed={tool === "wall"} onClick={() => setTool("wall")}><Minus size={17} /><span>Desenhar parede</span></button>
      <button type="button" className={tool === "door" ? "is-active" : ""} aria-pressed={tool === "door"} onClick={() => setTool("door")}><Square size={15} /><span>Porta na parede</span></button>
      <button type="button" className={tool === "window" ? "is-active" : ""} aria-pressed={tool === "window"} onClick={() => setTool("window")}><Square size={15} /><span>Janela na parede</span></button>
      </>}
      <button type="button" disabled={!scene.fogEnabled} className={tool === "reveal" ? "is-active" : ""} aria-pressed={tool === "reveal"} onClick={() => setTool("reveal")}><Eye size={15} /><span>Revelar área</span></button>
      <button type="button" disabled={!scene.fogEnabled} className={tool === "conceal" ? "is-active" : ""} aria-pressed={tool === "conceal"} onClick={() => setTool("conceal")}><EyeOff size={15} /><span>Ocultar área</span></button>
      {workspaceMode === "session" && <button type="button" aria-pressed={libraryOpen} className={libraryOpen ? "is-active" : ""} onClick={() => { setLibraryMode("tokens"); setLibraryOpen(value => !value); }}><User size={15} /><span>Adicionar personagens</span></button>}
      <span className="scene-toolstrip-spacer" />
      <button type="button" className={multiSelect ? "is-active" : ""} aria-pressed={multiSelect} onClick={() => setMultiSelect(value => !value)}>
        <Layers size={15} /><span>Múltipla</span>{selectedIds.length > 0 && <b>{selectedIds.length}</b>}
      </button>
    </div>}

    <div className={"scene-board-layout scene-workflow-layout" + (readonly ? " is-readonly" : "") + (showLibrary ? " has-library" : "") + (showInspector ? " has-inspector" : "")}>
      {showLibrary && <aside className="panel scene-palette">
        <div className="scene-library-head">
          <div className="scene-library-title-row"><div><p className="dossier-title">Biblioteca visual</p><small>{libraryGroups.reduce((sum, group) => sum + group.pieces.length, 0)} objetos disponíveis</small></div>
            <div className="scene-library-mode" role="tablist" aria-label="Tipo de item da biblioteca">
              <button type="button" className={libraryMode === "objects" ? "is-active" : ""} onClick={() => setLibraryMode("objects")}>Objetos</button>
              <button type="button" className={libraryMode === "tokens" ? "is-active" : ""} onClick={() => setLibraryMode("tokens")}>Personagens</button>
            </div>
          </div>
          <label className="scene-library-search"><Search size={15} aria-hidden="true" /><input type="search" value={libraryQuery}
            onChange={event => setLibraryQuery(event.target.value)} placeholder={libraryMode === "objects" ? "Buscar cama, veículo, hospital…" : "Buscar personagem…"} /></label>
          {libraryMode === "objects" && <div className="scene-library-categories" aria-label="Categorias da biblioteca">
            <button type="button" className={libraryCategory === "all" ? "is-active" : ""} onClick={() => setLibraryCategory("all")}>Todos</button>
            {libraryGroups.map(group => <button type="button" key={group.id} className={libraryCategory === group.id ? "is-active" : ""}
              onClick={() => setLibraryCategory(group.id)}>{group.shortLabel}</button>)}
          </div>}
        </div>

        <div className="scene-library-scroll">
          {libraryMode === "objects" ? <>
            <p className="scene-palette-note">Clique para inserir. Os tamanhos iniciais seguem a proporção aproximada de uma planta e continuam ajustáveis no inspetor.</p>
            {visibleLibraryGroups.map(group => <section className="scene-library-group" key={group.id}>
              <div className="scene-library-group-heading"><b>{group.label}</b><span>{group.pieces.length}</span></div>
              <div className="scene-piece-grid">{group.pieces.map(piece => <button type="button" key={piece.label}
                title={"Adicionar " + piece.label} onClick={() => add(piece.kind, piece.label, piece.variant)}>
                {piece.kind === "text" ? <Type size={17} /> : <ObjectVisual variant={piece.variant} compact />}<span>{piece.label}</span></button>)}</div>
            </section>)}
            {visibleLibraryGroups.length === 0 && <p className="scene-library-empty">Nenhum objeto encontrado para “{libraryQuery.trim()}”.</p>}
          </> : <>
            <p className="scene-palette-note">Tokens usam os retratos e estados já registrados no sistema.</p>
            {visibleSurvivors.length > 0 && <div className="scene-token-section"><b>Sobreviventes</b>{visibleSurvivors.map(person => <button type="button" className="scene-library-person" key={person.id}
              onClick={() => add("token", person.name, "survivor", { tokenKind: "survivor", refId: person.id })}>
              <span className="scene-library-avatar">{person.portrait ? <img src={person.portrait} alt="" /> : <User size={14} />}</span><span>{person.name}</span></button>)}</div>}
            {visibleNpcs.length > 0 && <div className="scene-token-section"><b>PNJs</b>{visibleNpcs.map(person => <button type="button" className="scene-library-person" key={person.id}
              onClick={() => add("token", person.name, "npc", { tokenKind: "npc", refId: person.id })}>
              <span className="scene-library-avatar">{person.portrait ? <img src={person.portrait} alt="" style={portraitStyle(person.portraitFrame)} /> : <User size={14} />}</span><span>{person.name}</span></button>)}</div>}
            {visibleThreats.length > 0 && <div className="scene-token-section scene-conflict-token-library">
              <b>Ameaças do conflito</b><small>{game.conflict?.name}</small>
              {visibleThreats.map(threat => {
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
            {visibleSurvivors.length === 0 && visibleNpcs.length === 0 && visibleThreats.length === 0 && normalizedLibraryQuery && <p className="scene-library-empty">Nenhum personagem encontrado.</p>}
          </>}
        </div>
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
              onClick={event => {
                if (!playerActions) return;
                const bounds=event.currentTarget.getBoundingClientRect();
                setPlayerPosition({sceneId:scene.id,x:Math.round((event.clientX-bounds.left)/zoom),y:Math.round((event.clientY-bounds.top)/zoom)});
              }}
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
                    + (tokenView?.state === "defeated" || tokenView?.state === "dead" || tokenView?.state === "down" ? " is-out" : "")}
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
              {(game.publicPlayerActions?.markers ?? game.playerActions?.markers ?? []).filter(m => m.day === game.day && m.sceneId === scene.id).map(m => <span key={m.actorId} className="scene-team-marker" style={{left:m.x, top:m.y}} role="img" aria-label={m.label}>{m.label}</span>)}
              {playerActions && playerPosition?.sceneId===scene.id && <span className="scene-player-position" style={{left:playerPosition.x,top:playerPosition.y}} aria-label="Posição selecionada" />}
              <FogOverlay scene={scene} readonly={readonly} />
              {fogPreview && <div className={"scene-fog-draft is-" + fogDraft?.mode} style={{ left: fogPreview.x, top: fogPreview.y, width: fogPreview.width, height: fogPreview.height }} />}
            </div>
          </div>
        </div>
        {masterActions && !readonly && <details className="team-card"><summary>Liberar tokens e marcações dos jogadores</summary><MasterContextActions game={game} controls={masterActions} context={{kind:"scene"}} /></details>}
        {playerActions && <PlayerContextActions game={game} controls={playerActions} context={{kind:"scene",position:playerPosition?.sceneId===scene.id?playerPosition:undefined}} />}
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

      {showInspector && <aside className="panel panel-pad scene-inspector">
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
    {creationDialog}
    {deletionDialog}
  </section>;
}
