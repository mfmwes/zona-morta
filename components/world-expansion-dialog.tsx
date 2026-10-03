"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Counter, Pick } from "@/components/game-controls";
import { addLog, type GameState } from "@/lib/game";
import { directions, expandWorld, expansionHexes, hexCenter, mapBounds, MAX_WORLD_HEXES, passages, terrains, worldHexes, type Expansion, type Passage, type Terrain } from "@/lib/world";

export function WorldExpansionDialog({ game, origin, edit, onClose, onExpanded }: {
  game: GameState; origin: string; edit: (fn: (draft: GameState) => void) => void;
  onClose: () => void; onExpanded: (id: string) => void;
}) {
  const [mode, setMode] = useState<Expansion["mode"]>("neighbor");
  const [direction, setDirection] = useState(1);
  const [length, setLength] = useState(3);
  const [terrain, setTerrain] = useState<Terrain>("urban");
  const [passage, setPassage] = useState<Passage>("none");
  const input = { origin, mode, direction, length, terrain, passage };
  const additions = expansionHexes(game.hexes, input);
  const total = Object.keys(game.hexes).length + additions.length;
  const existing = worldHexes(game.hexes);
  const bounds = mapBounds([...existing, ...additions]);
  const disabled = additions.length === 0 || total > MAX_WORLD_HEXES;

  function save() {
    if (disabled) return;
    const result = { added: [] as string[] };
    edit(draft => {
      const added = expandWorld(draft, input);
      result.added = added;
      if (added.length) addLog(draft, "mapa", `O mundo foi ampliado com ${added.length} hex(es) desconhecido(s).`);
    });
    if (!result.added.length) { toast.error("A borda do mapa mudou. Confira a prévia e tente novamente."); return; }
    onExpanded(result.added[0]); onClose();
    toast.success(`${result.added.length} hex(es) adicionados ao mundo.`);
  }

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent overlayClassName="z-[90]" className="world-expansion-dialog z-[100] max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>Expandir mundo</DialogTitle>
        <DialogDescription>Acrescente áreas a partir do hex {origin}. Os setores existentes permanecem registrados; os novos começam desconhecidos.</DialogDescription></DialogHeader>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Forma da expansão">
        {([{ value: "neighbor", label: "Adicionar vizinho" }, { value: "direction", label: "Estender direção" }, { value: "ring", label: "Adicionar anel" }] as const).map(option =>
          <Button size="sm" key={option.value} variant={mode === option.value ? "default" : "outline"} aria-pressed={mode === option.value} onClick={() => setMode(option.value)}>{option.label}</Button>)}
      </div>
      {mode !== "ring" ? <div className="grid gap-3 sm:grid-cols-2">
        <Pick contentClassName="z-[110]" label="Direção" value={String(direction)} options={directions.map((d, i) => ({ value: String(i), label: d.label }))} onChange={value => setDirection(Number(value))} />
        {mode === "direction" && <Counter label="Distância em hexes" value={length} min={1} max={12} onChange={setLength} />}
      </div> : <p className="text-sm subtle">Acrescenta uma camada ao redor de toda a borda atual. No mapa inicial: 19 → 37 → 61 áreas.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Pick contentClassName="z-[110]" label="Terreno dos novos hexes" value={terrain} options={Object.entries(terrains).map(([value, label]) => ({ value, label }))} onChange={value => setTerrain(value as Terrain)} />
        <Pick contentClassName="z-[110]" label="Via dos novos hexes" value={passage} options={Object.entries(passages).map(([value, label]) => ({ value, label }))} onChange={value => setPassage(value as Passage)} />
      </div>
      <p className="text-sm subtle">Terreno e via são independentes: uma estrada pode atravessar a floresta. A travessia começa em 1 hora e pode ser ajustada nas ferramentas de cada hex.</p>
      <div className="world-expansion-preview">
        <svg viewBox={`${bounds.x - bounds.width / 2} ${bounds.y - bounds.height / 2} ${bounds.width} ${bounds.height}`} role="img" aria-label={`Prévia: ${additions.length} novos hexes destacados em dourado`}>
          {[...existing, ...additions].map(hex => {
            const { x, y } = hexCenter(hex);
            const isNew = !game.hexes[hex.id];
            const points = Array.from({ length: 6 }, (_, i) => {
              const a = Math.PI / 180 * (60 * i - 30);
              return `${x + 49 * Math.cos(a)},${y + 49 * Math.sin(a)}`;
            }).join(" ");
            return <polygon key={hex.id} points={points} fill={isNew ? "#edc578" : hex.id === origin ? "#9fd7cc" : "#35686a"} stroke="#17282d" strokeWidth="3"><title>Hex {hex.id}{isNew ? " · novo" : ""}</title></polygon>;
          })}
        </svg>
        <p aria-live="polite"><b>{additions.length} novos</b> · {total} áreas no total · dourado = expansão</p>
      </div>
      {!additions.length && <p role="status" className="text-sm">Essa direção já está no mapa. Escolha outra direção ou estenda a distância.</p>}
      {total > MAX_WORLD_HEXES && <p role="status">O mapa comporta até {MAX_WORLD_HEXES} áreas. Escolha uma expansão menor.</p>}
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={disabled} onClick={save}>Adicionar {additions.length} hex(es)</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
