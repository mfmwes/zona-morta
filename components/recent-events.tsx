"use client";

import { HistoryClearButton } from "@/components/history-clear-button";
import type { GameState } from "@/lib/game";
import { historyEntries } from "@/lib/history";

export function RecentEvents({ game, edit, role, readOnly = false }: {
  game: GameState; edit: (fn: (draft: GameState) => void) => void;
  role: "mestre" | "jogador" | "convidado"; readOnly?: boolean;
}) {
  const events = historyEntries(game, "events");
  return <section className="panel panel-pad mt-5" aria-labelledby="recent-events-title">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="dossier-title">Registro</p><h2 id="recent-events-title" className="section-title mt-1">Últimos acontecimentos</h2></div>
      <div className="flex flex-wrap items-center gap-2"><span className="tag">{events.length} entradas</span>
        <HistoryClearButton game={game} edit={edit} scope="events" role={role} readOnly={readOnly} /></div>
    </div>
    {events.length === 0 ? <p className="mt-3 text-sm subtle">Nenhum acontecimento registrado. Mensagens e rolagens ficam no chat da mesa.</p>
      : <div className="mt-3 grid gap-2">{events.slice(0, 12).map(entry => <div key={entry.id} className="border-t pt-2 text-sm leading-relaxed">
        <span className="font-mono text-xs subtle mr-3">D{entry.day} {entry.time} · {entry.kind}</span>{entry.text}
      </div>)}</div>}
  </section>;
}
