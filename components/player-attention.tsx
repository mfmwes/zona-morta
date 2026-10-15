"use client";
import { Bell, ArrowRight, ShieldAlert } from "lucide-react";
import { playerAttention, type PlayerAttentionTarget } from "@/lib/player-attention";
import type { GameState } from "@/lib/game";
export function PlayerAttention({ game, actorId, onOpen }: { game: GameState; actorId: string | null; onOpen: (target: PlayerAttentionTarget) => void }) {
  const items = playerAttention(game, actorId);
  if (!items.length) return null;
  return <section className="player-attention panel" aria-label="O que precisa da sua atenção">
    <header><Bell size={17} aria-hidden="true" /><h2>Precisa da sua atenção</h2><span aria-label={`${items.length} pendências`}>{items.length}</span></header>
    <div className="player-attention-items">{items.map(item => <button type="button" key={item.id} className={item.tone === "danger" ? "is-danger" : ""} onClick={() => onOpen(item.target)}>
      {item.tone === "danger" && <ShieldAlert size={18} aria-hidden="true" />}<span><b>{item.title}</b><small>{item.detail}</small></span><ArrowRight size={16} aria-hidden="true" />
    </button>)}</div>
  </section>;
}
