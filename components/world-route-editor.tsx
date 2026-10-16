"use client";

import { Pick, Field } from "@/components/game-controls";
import { Switch } from "@/components/ui/switch";
import type { GameState } from "@/lib/game";
import { adjacentHexes, directions, passages, setWorldConnection, worldConnection, type Passage } from "@/lib/world";

export function WorldRouteEditor({ game, hexId, edit }: { game: GameState; hexId: string; edit: (fn: (game: GameState) => void) => void }) {
  return <details className="world-route-editor">
    <summary>Conexões e região</summary>
    <Field label="Cidade ou região" value={game.hexes[hexId].region ?? ""} onChange={value => edit(draft => {
      const name = value.slice(0, 80); if (name.trim()) draft.hexes[hexId].region = name; else delete draft.hexes[hexId].region;
    })} />
    <p className="text-sm subtle">Opcional: crie vias para conectar pontos específicos do mapa. Sem conexão, a exploração entre hexes continua normal. Um bloqueio impede atravessar esta ligação nos dois sentidos.</p>
    {adjacentHexes(hexId).map((neighbor, index) => {
      if (!game.hexes[neighbor.id]) return null;
      const connection = worldConnection(game.hexes, hexId, neighbor.id);
      return <div className="world-route-editor-row" key={neighbor.id}>
        <Pick label={`${directions[index].label} · ${neighbor.id}`} value={connection?.kind ?? "none"}
          options={Object.entries(passages).map(([value, label]) => ({ value, label: value === "none" ? "Sem conexão" : label }))}
          onChange={value => edit(draft => { setWorldConnection(draft.hexes, hexId, neighbor.id, value as Passage, connection?.blocked); })} />
        {connection && <label className="world-route-block"><Switch size="sm" aria-label={`Bloquear passagem para ${neighbor.id}`} checked={connection.blocked}
          onCheckedChange={blocked => edit(draft => { setWorldConnection(draft.hexes, hexId, neighbor.id, connection.kind, blocked); })} /> Bloqueada</label>}
      </div>;
    })}
  </details>;
}
