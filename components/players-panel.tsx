"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ShieldCheck, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GameState } from "@/lib/game";

type Player = { email: string; user_id: string | null; survivor_id: string | null; created_at: string };

export function PlayersPanel({ game, ownerId }: { game: GameState; ownerId: string }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [code, setCode] = useState("");
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const api = "/api/players?campanha=" + encodeURIComponent(ownerId);
  const link = typeof window === "undefined" || !code ? "" : window.location.origin + "/?campanha=" + encodeURIComponent(ownerId) + "#convite=" + code;

  useEffect(() => {
    void fetch(api, { cache: "no-store" }).then(async response => {
      const result = await response.json() as { players?: Player[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar os jogadores.");
      setPlayers(result.players ?? []);
    }).catch(reason => setError(String(reason)));
  }, [api]);

  async function createInvite() {
    setBusy(true); setError("");
    try {
      const response = await fetch(api, { method: "POST" });
      const result = await response.json() as { code?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível atualizar.");
      setCode(result.code ?? ""); setCopied(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível atualizar."); }
    finally { setBusy(false); }
  }

  async function remove(email: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(api, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const result = await response.json() as { players?: Player[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível remover.");
      setPlayers(result.players ?? []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível remover."); }
    finally { setBusy(false); }
  }

  async function assign(userId: string) {
    const survivorId = assignments[userId];
    if (!survivorId) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/players/assign?campanha=" + encodeURIComponent(ownerId), { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, survivorId }) });
      const result = await response.json() as { players?: Player[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível vincular a ficha.");
      setPlayers(result.players ?? []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível vincular."); }
    finally { setBusy(false); }
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 2500); }
    catch { setError("A cópia automática não funcionou. Selecione o endereço abaixo para copiar."); }
  }

  return <div className="players-layout">
    <section className="panel panel-pad">
      <p className="dossier-title">Acesso à mesa</p><h2 className="section-title mt-1">Jogadores criam as próprias fichas</h2>
      <p className="intro-line mt-2">Crie um convite e envie o endereço para os jogadores. Cada pessoa entra com uma conta do próprio Zona Morta e cria seu sobrevivente. Não é preciso cadastrar fichas antes.</p>
      <div className="players-link mt-5">
        <div><b>Convite da campanha</b><p className="text-sm subtle">O convite aparece apenas ao ser criado. Guarde uma cópia; gerar outro endereço invalida o anterior para novos participantes.</p></div>
        <Button size="sm" disabled={busy} onClick={() => void createInvite()}>{code ? "Gerar novo convite" : "Criar convite"}</Button>
        {link && <div className="players-link-row"><input aria-label="Endereço do convite" readOnly value={link} onFocus={event => event.target.select()} />
          <Button size="sm" variant="outline" onClick={() => void copyLink()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copiado" : "Copiar"}</Button></div>}
      </div>
      {error && <p role="alert" className="inventory-danger mt-3">{error}</p>}
    </section>
    <section className="panel panel-pad">
      <p className="dossier-title">Equipe</p><h2 className="section-title mt-1">Pessoas na campanha</h2>
      {players.length === 0 && <p className="intro-line mt-4">Ninguém entrou ainda. Compartilhe o endereço para começar.</p>}
      <div className="players-list mt-4">{players.map(player => {
        const survivor = game.survivors.find(s => s.id === player.survivor_id);
        return <div className="players-row" key={player.email}>
          <div className="players-avatar"><Users size={18} aria-hidden="true" /></div>
          <div className="players-person"><b>{survivor?.name ?? (player.survivor_id ? "Ficha indisponível" : "Criando sobrevivente")}</b><span>{player.email}</span>
            <small><ShieldCheck size={13} aria-hidden="true" /> {player.user_id ? player.survivor_id ? "Ficha pessoal ativa" : "Entrou · ficha pendente" : "Aguardando primeiro acesso"}</small>
            {player.user_id && !player.survivor_id && game.survivors.some(s => !players.some(p => p.survivor_id === s.id)) &&
              <div className="flex flex-wrap gap-2 mt-2">
                <select aria-label={"Vincular ficha a " + player.email} className="rounded border bg-background px-2 py-1 text-sm"
                  value={assignments[player.user_id] ?? ""} onChange={event => setAssignments(prev => ({ ...prev, [player.user_id!]: event.target.value }))}>
                  <option value="">Ficha existente...</option>
                  {game.survivors.filter(s => !players.some(p => p.survivor_id === s.id)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <Button size="sm" variant="outline" disabled={busy || !assignments[player.user_id]} onClick={() => void assign(player.user_id!)}>Vincular</Button>
              </div>}</div>
          <Button size="sm" variant="ghost" disabled={busy} aria-label={"Remover acesso de " + player.email}
            onClick={() => void remove(player.email)}><Trash2 size={17} /></Button>
        </div>;
      })}</div>
    </section>
  </div>;
}
