"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/game-controls";
import { displayTime } from "@/lib/game";
import { matchesSearch } from "@/lib/campaign-search";
import { createId } from "@/lib/id";
import type { CampaignCheckpoint } from "@/db/checkpoints";
export type CheckpointAction = { action: "create" | "restore" | "delete"; id: string; name?: string };
export function CampaignCheckpoints({ campaignId, day, canAct, onAction, onClose }: { campaignId: string; day: number; canAct: boolean; onAction: (command: CheckpointAction) => Promise<void>; onClose: () => void }) {
  const [rows, setRows] = useState<CampaignCheckpoint[]>([]), [name, setName] = useState(`Dia ${day}`), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState("");
  const [confirm, setConfirm] = useState<{ kind: "restore" | "delete"; point: CampaignCheckpoint } | null>(null);
  const api = `/api/campaign/checkpoints?campanha=${encodeURIComponent(campaignId)}`;
  async function refresh() {
    setLoading(true); setError("");
    try {
      const r = await fetch(api, { cache: "no-store" });
      const data = await r.json() as { error?: string; checkpoints?: CampaignCheckpoint[] };
      if (!r.ok) throw new Error(data.error || "Não foi possível consultar os pontos.");
      setRows(data.checkpoints ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível atualizar a lista."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    void fetch(api, { cache: "no-store", signal: controller.signal }).then(async r => {
      const data = await r.json() as { error?: string; checkpoints?: CampaignCheckpoint[] };
      if (!r.ok) throw new Error(data.error || "Não foi possível consultar os pontos.");
      if (!controller.signal.aborted) { setRows(data.checkpoints ?? []); setLoading(false); }
    }).catch(e => { if (!controller.signal.aborted) { setError(e.message); setLoading(false); } });
    return () => controller.abort();
  }, [api]);
  async function act(command: CheckpointAction) {
    if (busy || loading || !canAct) return;
    setBusy(true); setError(""); setFeedback("");
    try {
      await onAction(command); setConfirm(null);
      setFeedback(command.action === "create" ? "Ponto guardado." : command.action === "restore" ? "Campanha restaurada. O estado anterior está na cópia automática." : "Ponto excluído.");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível concluir. Tente novamente."); }
    finally { setBusy(false); }
  }
  const manualCount = rows.filter(r => !r.safety).length;
  const full = manualCount >= 10;
  const visible = rows.filter(p => matchesSearch(query, p.name, `Dia ${p.day}`));
  const locked = busy || loading || !canAct;
  function pointRow(p: CampaignCheckpoint) {
    const selected = confirm?.point.id === p.id;
    return <article key={p.id} className={`campaign-checkpoint${selected ? " is-selected" : ""}`}>
      <b>{p.name}</b><p className="text-sm subtle">Dia {p.day} · {displayTime(p.minutes)} · {new Date(p.createdAt).toLocaleString("pt-BR")}</p>
      <div className="campaign-form-actions"><Button size="sm" variant="outline" disabled={locked} onClick={() => setConfirm({ kind: "restore", point: p })}>Restaurar</Button><Button size="sm" variant="ghost" disabled={locked} onClick={() => setConfirm({ kind: "delete", point: p })}>Excluir ponto</Button></div>
      {selected ? <section className="campaign-checkpoint-confirm" aria-label={`Confirmar alteração de ${p.name}`}>
        <b>{confirm.kind === "restore" ? "Restaurar" : "Excluir"} “{p.name}”?</b>
        <p className="text-sm">{confirm.kind === "restore" ? "Mapa, fichas, reservas, cenas, atividades e diário serão substituídos. A cópia automática preservará o estado anterior. Contas e convites permanecem atuais." : "Este ponto será removido. O jogo atual permanece como está."}</p>
        <div className="campaign-form-actions"><Button disabled={locked} onClick={() => void act({ action: confirm.kind, id: p.id })}>{busy ? "Aguarde…" : confirm.kind === "restore" ? "Confirmar restauração" : "Confirmar exclusão"}</Button><Button variant="outline" autoFocus disabled={busy} onClick={event => { event.currentTarget.closest("article")?.querySelector<HTMLButtonElement>("button")?.focus(); setConfirm(null); }}>Cancelar</Button></div>
      </section> : null}
    </article>;
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="inventory-dialog" showCloseButton={!busy} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}><DialogHeader><DialogTitle>Pontos de restauração</DialogTitle><DialogDescription>Guarde até 10 momentos. Antes de restaurar, o estado atual é preservado em uma cópia automática.</DialogDescription></DialogHeader>
    <div className="grid gap-4" aria-busy={busy || loading}>
      <form className="campaign-checkpoint-create" onSubmit={event => { event.preventDefault(); if (!locked && name.trim() && !full && name.trim().length <= 80 && !error) void act({ action: "create", id: createId(), name: name.trim() }); }}><Field label="Nome do novo ponto" value={name} onChange={setName} maxLength={80} disabled={busy} /><Button type="submit" disabled={locked || !name.trim() || name.trim().length > 80 || full || Boolean(error)}>{busy ? "Aguarde…" : "Guardar estado atual"}</Button></form>
      {full && <p className="subtle text-sm">Limite atingido. Exclua um ponto para guardar outro.</p>}
      {!canAct && <p className="subtle text-sm" role="status">Aguarde o salvamento da campanha para continuar.</p>}
      {feedback && <p className="campaign-feedback" role="status">{feedback}</p>}
      {error && <div className="campaign-form-error" role="alert"><p>{error}</p><Button size="sm" variant="outline" disabled={busy || loading} onClick={() => void refresh()}>Atualizar lista</Button></div>}
      {loading && <p className="subtle" role="status">Consultando pontos…</p>}
      {!loading && !error && !rows.length && <p className="campaign-empty">Nenhum ponto guardado. Use “Guardar estado atual” para criar o primeiro.</p>}
      {rows.length > 0 && <><Field label="Buscar ponto" type="search" placeholder="Nome ou dia" value={query} onChange={value => { setQuery(value); setConfirm(null); }} disabled={busy} />
        <div className="campaign-filter-status"><span className="campaign-list-count" role="status">{manualCount}/10 pontos guardados{query.trim() ? ` · ${visible.length} resultado(s)` : ""}</span>{query && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setQuery("")}>Limpar busca</Button>}</div>
        {visible.some(p => !p.safety) && <section aria-label="Pontos guardados"><h3 className="field-label mb-2">Pontos guardados</h3><div className="grid gap-2">{visible.filter(p => !p.safety).map(pointRow)}</div></section>}
        {visible.some(p => p.safety) && <section aria-label="Cópia automática"><h3 className="field-label mb-2">Cópia automática · antes da última restauração</h3><div className="grid gap-2">{visible.filter(p => p.safety).map(pointRow)}</div><p className="subtle text-xs mt-2">Esta cópia não ocupa um dos 10 pontos.</p></section>}
        {!visible.length && <p className="campaign-empty">Nenhum ponto corresponde à busca.</p>}
      </>}
    </div></DialogContent></Dialog>;
}
