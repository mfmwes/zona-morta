"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Copy, Eye, EyeOff, Layers, Minus, Plus, RotateCcw, RotateCw, Square, Trash2, Type, User, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GameState } from "@/lib/game";
import { createId } from "@/lib/id";
import {
  createSceneBoardObject,
  createSceneBoardScene,
  projectPlayerSceneBoard,
  sceneBoardLimits,
  type SceneBoardObject,
  type SceneBoardState,
  type SceneObjectKind,
} from "@/lib/scene-board";

type Edit = (fn: (draft: GameState) => void) => void;
type Drag = { id: string; pointerId: number; clientX: number; clientY: number; startX: number; startY: number; x: number; y: number };

const pieces: { kind: SceneObjectKind; label: string; variant?: string }[] = [
  { kind: "zone", label: "Sala / área", variant: "room" },
  { kind: "wall", label: "Parede" },
  { kind: "door", label: "Porta" },
  { kind: "window", label: "Janela" },
  { kind: "furniture", label: "Mesa", variant: "table" },
  { kind: "furniture", label: "Cadeira", variant: "chair" },
  { kind: "furniture", label: "Armário", variant: "cabinet" },
  { kind: "furniture", label: "Cama", variant: "bed" },
  { kind: "prop", label: "Caixa", variant: "crate" },
  { kind: "prop", label: "Barricada", variant: "barricade" },
  { kind: "prop", label: "Entulho", variant: "debris" },
  { kind: "prop", label: "Carro", variant: "car" },
  { kind: "prop", label: "Corpo", variant: "body" },
  { kind: "prop", label: "Pista / objetivo", variant: "marker" },
  { kind: "text", label: "Texto" },
];

const glyph: Record<string, string> = {
  table: "▰", chair: "▣", cabinet: "▥", bed: "▰", crate: "▦",
  barricade: "╳", debris: "✦", car: "▱", body: "†", marker: "◆",
};

function safeBoard(game: GameState): SceneBoardState {
  return game.sceneBoard ?? { scenes: [] };
}

function face(object: SceneBoardObject) {
  if (object.kind === "wall") return <span className="scene-wall-line" />;
  if (object.kind === "door") return <><span className="scene-door-leaf" /><small>{object.label}</small></>;
  if (object.kind === "window") return <><span className="scene-window-line" /><small>{object.label}</small></>;
  if (object.kind === "zone" || object.kind === "text") return <span>{object.label}</span>;
  if (object.kind === "token") return <><b className="scene-token-face">{object.label.slice(0, 2).toUpperCase()}</b><small>{object.label}</small></>;
  return <><b className="scene-piece-glyph">{glyph[object.variant ?? ""] ?? "■"}</b><small>{object.label}</small></>;
}

export function SceneBoard({ game, edit, playerPreview }: { game: GameState; edit: Edit; playerPreview: boolean }) {
  const readonly = playerPreview;
  const board = useMemo(
    () => readonly ? projectPlayerSceneBoard(safeBoard(game)) ?? { scenes: [] } : safeBoard(game),
    [game, readonly],
  );
  const [chosenScene, setChosenScene] = useState("");
  const [chosenObject, setChosenObject] = useState("");
  const [zoom, setZoom] = useState(.8);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);

  const scene = board.scenes.find(entry => entry.id === chosenScene)
    ?? board.scenes.find(entry => entry.id === board.activeSceneId)
    ?? board.scenes[0];
  const selected = scene?.objects.find(object => object.id === chosenObject);

  function createScene() {
    if (readonly) return;
    const name = window.prompt("Nome da nova cena:", "Nova cena")?.trim();
    if (!name) return;
    const created = createSceneBoardScene(name);
    edit(draft => {
      draft.sceneBoard ??= { scenes: [] };
      if (draft.sceneBoard.scenes.length < sceneBoardLimits.maxScenes) draft.sceneBoard.scenes.push(created);
    });
    setChosenScene(created.id);
    setChosenObject("");
  }

  function patchScene(fn: (target: NonNullable<typeof scene>) => void) {
    if (readonly || !scene) return;
    edit(draft => {
      const target = draft.sceneBoard?.scenes.find(entry => entry.id === scene.id);
      if (target) fn(target);
    });
  }

  function patchObject(fn: (target: SceneBoardObject) => void) {
    if (!selected) return;
    patchScene(target => {
      const object = target.objects.find(entry => entry.id === selected.id);
      if (object) fn(object);
    });
  }

  function add(kind: SceneObjectKind, label: string, variant?: string, token?: Partial<SceneBoardObject>) {
    if (readonly || !scene) return;
    const object = { ...createSceneBoardObject(kind, label, variant), ...token };
    object.x = 110 + ((scene.objects.length * 43) % Math.max(120, scene.width - object.width - 160));
    object.y = 100 + ((scene.objects.length * 31) % Math.max(100, scene.height - object.height - 140));
    patchScene(target => {
      if (target.objects.length >= sceneBoardLimits.maxObjectsPerScene) return;
      if (kind === "zone") target.objects.unshift(object); else target.objects.push(object);
    });
    setChosenObject(object.id);
  }

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, object: SceneBoardObject) {
    event.stopPropagation();
    setChosenObject(object.id);
    if (readonly || !scene) return;
    const state: Drag = { id: object.id, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
      startX: object.x, startY: object.y, x: object.x, y: object.y };
    dragRef.current = state;
    setDrag(state);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    if (!current || !scene || current.pointerId !== event.pointerId) return;
    const object = scene.objects.find(entry => entry.id === current.id);
    if (!object) return;
    const x = Math.max(0, Math.min(scene.width - object.width, Math.round(current.startX + (event.clientX - current.clientX) / zoom)));
    const y = Math.max(0, Math.min(scene.height - object.height, Math.round(current.startY + (event.clientY - current.clientY) / zoom)));
    const next = { ...current, x, y };
    dragRef.current = next;
    setDrag(next);
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId || !scene) return;
    dragRef.current = null;
    setDrag(null);
    edit(draft => {
      const target = draft.sceneBoard?.scenes.find(entry => entry.id === scene.id)?.objects.find(entry => entry.id === current.id);
      if (target) { target.x = current.x; target.y = current.y; }
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

  function duplicate() {
    if (!selected) return;
    const copy = structuredClone(selected);
    copy.id = createId(); copy.x += 28; copy.y += 28;
    patchScene(target => { if (target.objects.length < sceneBoardLimits.maxObjectsPerScene) target.objects.push(copy); });
    setChosenObject(copy.id);
  }

  function removeObject() {
    if (!selected) return;
    patchScene(target => { target.objects = target.objects.filter(object => object.id !== selected.id); });
    setChosenObject("");
  }

  if (!scene) return <section className="panel panel-pad scene-board-empty">
    <Layers size={38} />
    <div><p className="dossier-title">Cena visual</p><h2 className="section-title mt-1">{readonly ? "Nenhuma cena está sendo apresentada" : "Comece com uma tela em branco"}</h2>
      <p className="intro-line mt-2">{readonly ? "Quando o mestre apresentar uma cena ela aparecerá aqui." : "Monte corredores, portas, objetos e posições sem transformar o jogo em um mapa tático rígido."}</p></div>
    {!readonly && <Button onClick={createScene}><Plus size={16} /> Criar primeira cena</Button>}
  </section>;

  const live = board.activeSceneId === scene.id && scene.visibleToPlayers;

  return <section className="scene-board-root">
    <header className="panel panel-pad scene-board-header">
      <div><p className="dossier-title">Cena visual</p><div className="scene-board-title"><h2 className="section-title">{scene.name}</h2>
        <span className={live ? "tag scene-live" : "tag"}>{live ? <Eye size={13} /> : <EyeOff size={13} />}{live ? "AO VIVO" : readonly ? "Não apresentada" : "Privada"}</span></div></div>
      {!readonly && <div className="scene-tabs">{board.scenes.map(entry => <button type="button" key={entry.id}
        className={entry.id === scene.id ? "is-active" : ""} onClick={() => { setChosenScene(entry.id); setChosenObject(""); }}>{entry.name}</button>)}
        <button type="button" onClick={createScene}><Plus size={14} /> Nova</button></div>}
      <div className="scene-board-actions">
        <Button size="sm" variant="outline" onClick={() => setZoom(value => Math.max(.4, +(value - .1).toFixed(2)))}><ZoomOut size={15} /></Button>
        <span className="scene-zoom">{Math.round(zoom * 100)}%</span>
        <Button size="sm" variant="outline" onClick={() => setZoom(value => Math.min(1.5, +(value + .1).toFixed(2)))}><ZoomIn size={15} /></Button>
        {!readonly && <><Button size="sm" variant="outline" onClick={() => patchScene(target => { target.showGrid = !target.showGrid; })}>{scene.showGrid ? "Ocultar grade" : "Mostrar grade"}</Button>
          {live ? <Button size="sm" variant="outline" onClick={hide}><EyeOff size={15} /> Ocultar da mesa</Button>
            : <Button size="sm" onClick={present}><Eye size={15} /> Apresentar</Button>}</>}
      </div>
    </header>

    <div className={"scene-board-layout" + (readonly ? " is-readonly" : "")}>
      {!readonly && <aside className="panel panel-pad scene-palette">
        <p className="dossier-title">Construir</p>
        <div className="scene-piece-grid">{pieces.map(piece => <button type="button" key={piece.label} onClick={() => add(piece.kind, piece.label, piece.variant)}>
          {piece.kind === "wall" ? <Minus size={16} /> : piece.kind === "text" ? <Type size={15} /> : <Square size={15} />}<span>{piece.label}</span></button>)}</div>
        <div className="scene-token-section"><b>Sobreviventes</b>{game.survivors.map(person => <button type="button" key={person.id}
          onClick={() => add("token", person.name, "survivor", { tokenKind: "survivor", refId: person.id })}><User size={14} />{person.name}</button>)}</div>
        <div className="scene-token-section"><b>PNJs</b>{game.npcs.filter(person => person.active).slice(0, 24).map(person => <button type="button" key={person.id}
          onClick={() => add("token", person.name, "npc", { tokenKind: "npc", refId: person.id })}><User size={14} />{person.name}</button>)}</div>
        <div className="scene-token-section"><b>Outros</b><button type="button" onClick={() => add("token", "Ameaça", "threat", { tokenKind: "threat" })}><User size={14} />Ameaça</button></div>
      </aside>}

      <div className="panel scene-workspace">
        <div className="scene-viewport" onWheel={event => { event.preventDefault(); setZoom(value => Math.max(.4, Math.min(1.5, +(value + (event.deltaY < 0 ? .1 : -.1)).toFixed(2)))); }}>
          <div className="scene-scaled" style={{ width: scene.width * zoom, height: scene.height * zoom }}>
            <div className={"scene-stage" + (scene.showGrid ? " has-grid" : "")} style={{ width: scene.width, height: scene.height, transform: "scale(" + zoom + ")" }} onPointerDown={() => setChosenObject("")}>
              {scene.objects.map(object => {
                const shown = drag?.id === object.id ? { ...object, x: drag.x, y: drag.y } : object;
                return <button type="button" key={object.id}
                  className={"scene-object scene-" + shown.kind + (shown.variant ? " scene-" + shown.variant : "") + (chosenObject === object.id ? " is-selected" : "") + (!shown.visibleToPlayers && !readonly ? " is-hidden" : "")}
                  style={{ left: shown.x, top: shown.y, width: shown.width, height: shown.height, transform: "rotate(" + shown.rotation + "deg)" }}
                  onPointerDown={event => startDrag(event, object)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
                  {face(shown)}
                </button>;
              })}
            </div>
          </div>
        </div>
        <footer className="scene-hint">Arraste objetos para posicionar. Use a roda do mouse ou os botões para aproximar e afastar.</footer>
      </div>

      {!readonly && <aside className="panel panel-pad scene-inspector">
        <p className="dossier-title">Inspetor</p>
        {!selected ? <p className="subtle text-sm">Selecione uma peça para editar tamanho, rotação, camada e visibilidade.</p> : <>
          <label>Nome<input key={selected.id} defaultValue={selected.label} maxLength={120} onBlur={event => {
            const value = event.currentTarget.value.trim(); if (value) patchObject(object => { object.label = value; });
          }} /></label>
          <div className="scene-inspector-buttons"><Button size="sm" variant="outline" onClick={() => patchObject(object => { object.width = Math.max(12, object.width - 20); })}>− largura</Button>
            <Button size="sm" variant="outline" onClick={() => patchObject(object => { object.width = Math.min(2000, object.width + 20); })}>+ largura</Button>
            <Button size="sm" variant="outline" onClick={() => patchObject(object => { object.height = Math.max(12, object.height - 20); })}>− altura</Button>
            <Button size="sm" variant="outline" onClick={() => patchObject(object => { object.height = Math.min(1600, object.height + 20); })}>+ altura</Button></div>
          <div className="scene-inspector-buttons"><Button size="sm" variant="outline" onClick={() => patchObject(object => { object.rotation -= 15; })}><RotateCcw size={14} /> −15°</Button>
            <Button size="sm" variant="outline" onClick={() => patchObject(object => { object.rotation += 15; })}><RotateCw size={14} /> +15°</Button></div>
          <Button variant="outline" onClick={() => patchObject(object => { object.visibleToPlayers = !object.visibleToPlayers; })}>
            {selected.visibleToPlayers ? <Eye size={15} /> : <EyeOff size={15} />}{selected.visibleToPlayers ? "Visível aos jogadores" : "Oculto dos jogadores"}</Button>
          <div className="scene-inspector-buttons"><Button variant="outline" onClick={duplicate}><Copy size={15} /> Duplicar</Button>
            <Button variant="destructive" onClick={removeObject}><Trash2 size={15} /> Excluir</Button></div>
        </>}
      </aside>}
    </div>
  </section>;
}
