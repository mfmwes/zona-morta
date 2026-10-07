"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Crosshair, Maximize, Search, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HexState } from "@/lib/game";
import { hexCenter, mapBounds, parseHex, terrains, worldHexes } from "@/lib/world";

export function WorldMapViewport({ hexes, activeHex, selected, focusHex, playerPreview, onSelect, children }: {
  hexes: Record<string, HexState>; activeHex: string; selected: string; focusHex: string;
  playerPreview: boolean; onSelect: (id: string) => void; children: ReactNode;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const start = hexCenter(parseHex(activeHex) ?? { q: 0, r: 0 });
  const [camera, setCamera] = useState({ ...start, width: 600 });
  const [aspect, setAspect] = useState(1.25);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const drag = useRef<{ id: number; x: number; y: number; camera: typeof camera; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const initialized = useRef(false);
  const bounds = mapBounds(worldHexes(hexes));
  const fitWidth = Math.max(bounds.width, bounds.height * aspect);

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      setAspect(node.clientWidth / Math.max(1, node.clientHeight));
      if (!initialized.current && node.clientWidth) {
        initialized.current = true;
        setCamera(previous => ({ ...previous, width: Math.max(300, Math.min(600, node.clientWidth)) }));
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const point = parseHex(focusHex);
    if (!point) return;
    const frame = requestAnimationFrame(() => setCamera(previous => ({ ...previous, ...hexCenter(point) })));
    return () => cancelAnimationFrame(frame);
  }, [focusHex]);

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    function wheel(event: WheelEvent) {
      if (!event.deltaY || !Number.isFinite(event.deltaY)) return;
      // A non-passive listener keeps page scrolling from competing with map zoom.
      event.preventDefault();
      if (drag.current) return;
      const rect = node!.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
      const delta = Math.max(-180, Math.min(180, event.deltaY * unit));
      const factor = Math.exp(delta * 0.002);
      const anchorX = (event.clientX - rect.left) / rect.width - 0.5;
      const anchorY = (event.clientY - rect.top) / rect.height - 0.5;
      setCamera(previous => {
        const width = Math.max(180, Math.min(Math.max(1200, fitWidth * 2), previous.width * factor));
        return {
          x: previous.x + anchorX * (previous.width - width),
          y: previous.y + anchorY * (previous.width - width) / aspect,
          width,
        };
      });
    }
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [aspect, fitWidth]);

  function center(id: string) {
    const point = parseHex(id);
    if (point) setCamera(previous => ({ ...previous, ...hexCenter(point) }));
  }
  function zoom(factor: number) {
    setCamera(previous => ({ ...previous, width: Math.max(180, Math.min(Math.max(1200, fitWidth * 2), previous.width * factor)) }));
  }
  const matches = query.trim() ? Object.entries(hexes).filter(([id, hex]) =>
    id.includes(query.trim()) || ((hex.discovery !== "desconhecido" || !playerPreview)
      && hex.sector?.name.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR")))).slice(0, 6) : [];
  function navigate(id: string) {
    center(id); onSelect(id); setQuery(""); setMessage("");
  }

  return <>
    <div className="world-map-toolbar">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" aria-label="Ampliar mapa" onClick={() => zoom(0.75)}><ZoomIn /></Button>
        <Button size="sm" variant="outline" aria-label="Reduzir mapa" onClick={() => zoom(1 / 0.75)}><ZoomOut /></Button>
        <Button size="sm" variant="outline" onClick={() => setCamera({ x: bounds.x, y: bounds.y, width: fitWidth })}><Maximize /> Ver tudo</Button>
        <Button size="sm" variant="outline" onClick={() => center(activeHex)}><Crosshair /> Grupo ativo</Button>
        <Button size="sm" variant="outline" onClick={() => center(selected)}>Hex selecionado</Button>
      </div>
      <form className="world-map-search" onSubmit={event => {
        event.preventDefault();
        const exact = query.trim();
        if (Object.hasOwn(hexes, exact) && parseHex(exact)) navigate(exact);
        else if (matches.length === 1) navigate(matches[0][0]);
        else setMessage(matches.length ? "Escolha um dos setores encontrados." : "Nenhum hex encontrado.");
      }}>
        <input type="search" aria-label="Buscar hex por nome ou coordenadas" placeholder="Nome ou coordenadas (3,0)" value={query} onChange={event => { setQuery(event.target.value); setMessage(""); }} />
        <Button size="sm" variant="outline" aria-label="Buscar no mapa"><Search /></Button>
        {query.trim() && <div className="world-map-results">
          {matches.map(([id, hex]) => <button type="button" key={id} onClick={() => navigate(id)}>
            <b>Hex {id}</b> · {hex.discovery !== "desconhecido" || !playerPreview
              ? `${hex.sector?.name ?? "Desconhecido"} · ${terrains[hex.terrain ?? "urban"]}`
              : "Desconhecido"}
          </button>)}
          <p role="status">{message || (!matches.length ? "Nenhum hex encontrado." : "Selecione para centralizar e consultar.")}</p>
        </div>}
      </form>
    </div>
    <div ref={viewport} className="map-viewport world-map-viewport"
      onPointerDown={event => {
        if (event.button !== 0 || drag.current) return;
        suppressClick.current = false;
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, camera, moved: false };
      }}
      onPointerMove={event => {
        const current = drag.current;
        if (!current || current.id !== event.pointerId) return;
        const dx = event.clientX - current.x, dy = event.clientY - current.y;
        if (!current.moved && Math.hypot(dx, dy) < 6) return;
        current.moved = true; suppressClick.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        const scale = current.camera.width / Math.max(1, event.currentTarget.clientWidth);
        setCamera({ ...current.camera, x: current.camera.x - dx * scale, y: current.camera.y - dy * scale });
      }}
      onPointerUp={event => { if (drag.current?.id === event.pointerId) drag.current = null; }}
      onPointerLeave={() => { if (drag.current && !drag.current.moved) drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; suppressClick.current = false; }}
      onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
      <svg viewBox={`${camera.x - camera.width / 2} ${camera.y - camera.width / aspect / 2} ${camera.width} ${camera.width / aspect}`}
        aria-label={`Mapa de exploração com ${Object.keys(hexes).length} hexes. Arraste para navegar, use a roda do mouse para ampliar ou reduzir e as setas quando o mapa estiver em foco.`}
        role="img" tabIndex={0} onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
          if (moves[event.key]) {
            event.preventDefault(); const [dx, dy] = moves[event.key];
            setCamera(previous => ({ ...previous, x: previous.x + dx * previous.width / 8, y: previous.y + dy * previous.width / 8 }));
          }
        }}>{children}</svg>
    </div>
    <p className="world-map-hint">Arraste para navegar. Role a roda do mouse sobre o mapa para ampliar ou reduzir; “Ver tudo” mostra o mundo inteiro.</p>
  </>;
}
