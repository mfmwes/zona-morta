"use client";
import { useRef, useState } from "react";
import { activeCampaignSession, sessionEntries, type SessionCommand } from "@/lib/campaign-sessions";
import { displayTime, type GameState } from "@/lib/game";
import { Button } from "@/components/ui/button";

export function CampaignSessions({ game, canAct, onAction }: { game: GameState; canAct: boolean; onAction: (c: SessionCommand) => Promise<void> }) {
  const active = activeCampaignSession(game);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [checkpoint, setCheckpoint] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [selected, setSelected] = useState("");
  const toggle = useRef<HTMLButtonElement>(null);
  const session = game.sessions?.find(s => s.id === selected) ?? active ?? game.sessions?.at(-1);
  const entries = session ? sessionEntries(game, session) : [];
  async function submit() {
    if (busy || !canAct || (!active && !name.trim())) return;
    setBusy(true); setError(""); setFeedback("");
    try {
      await onAction({ action: active ? "end" : "start", name, summary, checkpoint, expectedSessionId: active?.id });
      setFeedback(active ? "Sessão encerrada. Resumo disponível abaixo." : "Sessão iniciada.");
      setName(""); setSummary(""); setSelected(""); setEditing(false); toggle.current?.focus();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível registrar a sessão. Tente novamente."); }
    finally { setBusy(false); }
  }
  return <section className="master-overview-card campaign-sessions mt-5" aria-busy={busy}>
    <header><div><span><b>Sessões da mesa</b><small>{active ? `Em andamento: ${active.name}` : "Nenhuma sessão em andamento"}</small></span></div>
      <Button ref={toggle} size="sm" variant={editing ? "ghost" : active ? "outline" : "default"} disabled={busy || (!canAct && !editing)} aria-expanded={editing} aria-controls="campaign-session-form" onClick={() => { setEditing(!editing); setError(""); setFeedback(""); }}>{editing ? "Recolher" : active ? "Encerrar sessão" : "Iniciar sessão"}</Button>
    </header>
    {feedback && <p className="campaign-feedback" role="status">{feedback}</p>}
    {!canAct && <p className="subtle text-xs" role="status">Aguarde o salvamento da campanha para registrar a sessão.</p>}
    {editing && <form id="campaign-session-form" className="campaign-session-form" aria-label={active ? "Encerrar sessão" : "Iniciar sessão"} onSubmit={event => { event.preventDefault(); void submit(); }}>
      <p className="subtle text-sm">Iniciar e encerrar uma sessão não avança o relógio nem aplica descanso.</p>
      {active ? <div className="field"><label htmlFor="session-summary">Decisões e próximos passos <span className="subtle">(opcional)</span></label><textarea id="session-summary" autoFocus rows={3} maxLength={2000} value={summary} disabled={busy} onChange={e => setSummary(e.target.value)} placeholder="O que retomar na próxima sessão" /></div>
        : <div className="field"><label htmlFor="session-name">Nome da sessão</label><input id="session-name" autoFocus required maxLength={80} value={name} disabled={busy} onChange={e => setName(e.target.value)} placeholder={`Sessão ${(game.sessions?.length ?? 0) + 1}`} /></div>}
      <label className="campaign-checkbox"><input type="checkbox" checked={checkpoint} disabled={busy} onChange={e => setCheckpoint(e.target.checked)} /><span>Guardar ponto de restauração antes de {active ? "encerrar" : "iniciar"}<small>Usa um dos 10 pontos disponíveis.</small></span></label>
      {error && <p className="campaign-form-error" role="alert">{error} Seus textos foram mantidos.</p>}
      <div className="campaign-form-actions"><Button type="submit" disabled={busy || !canAct || (!active && !name.trim())}>{busy ? "Registrando…" : active ? "Confirmar encerramento" : "Confirmar início"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setEditing(false); setError(""); toggle.current?.focus(); }}>Cancelar</Button></div>
    </form>}
    {session && <details className="campaign-session-history"><summary>Consultar resumo da sessão</summary>
      <div className="field mt-3"><label htmlFor="session-history">Sessão</label><select id="session-history" value={session.id} onChange={e => setSelected(e.target.value)}>{[...(game.sessions ?? [])].reverse().map(s => <option key={s.id} value={s.id}>{s.name}{s.endedAt ? "" : " · em andamento"}</option>)}</select></div>
      <p className="text-sm mt-3">Dia {session.startDay} · {displayTime(session.startMinutes)} até {session.endedAt ? `dia ${session.endDay} · ${displayTime(session.endMinutes!)}` : "agora"}</p>
      {session.summary && <p className="whitespace-pre-wrap mt-3">{session.summary}</p>}
      {session.endedAt && <div className="mt-3"><b>Pendências no encerramento</b><ul>{session.pending.map((p, i) => <li key={i}>{p}</li>)}</ul>{!session.pending.length && <p className="subtle">Nenhuma pendência registrada.</p>}</div>}
      {entries.length ? <ol className="grid gap-2 mt-3">{entries.map(e => <li className="text-sm" key={e.id}><span className="subtle">Dia {e.day} · {e.time} · {e.kind}</span><p>{e.text}</p></li>)}</ol> : <p className="subtle text-sm mt-3">Nenhum registro disponível no diário desta sessão.</p>}
      <p className="text-xs subtle mt-3">Até 50 registros do diário. O resumo encerrado permanece mesmo se o diário for limpo. Pendências históricas podem já ter sido resolvidas.</p>
    </details>}
  </section>;
}
