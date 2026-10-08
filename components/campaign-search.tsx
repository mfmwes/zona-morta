"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pick } from "@/components/game-controls";
import { campaignSearchEntries, campaignSearchKinds, filterCampaignSearch } from "@/lib/campaign-search";
import type { CampaignTarget } from "@/lib/campaign-attention";
import type { GameState } from "@/lib/game";

export function CampaignSearch({ game, role, playerPreview, onOpen, onClose }: {
  game: GameState; role: string; playerPreview: boolean; onOpen: (target: CampaignTarget) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const entries = useMemo(() => campaignSearchEntries(game, { role, playerPreview }), [game, role, playerPreview]);
  const results = filterCampaignSearch(entries, query, kind);
  function moveResult(event: React.KeyboardEvent) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(list.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    if (!buttons.length) return;
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowUp" && index <= 0) { input.current?.focus(); return; }
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1)) % buttons.length;
    buttons[next]?.focus();
  }
  if (role !== "mestre" || playerPreview) return null;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="campaign-search-dialog">
    <DialogHeader><DialogTitle>Buscar na campanha</DialogTitle><DialogDescription>Abra fichas, setores, locais, eventos e obras pelo nome.</DialogDescription></DialogHeader>
    <div className="campaign-list-toolbar"><div className="field"><label htmlFor="campaign-search-query"><Search size={14} aria-hidden="true" /> Nome ou localização</label>
      <input ref={input} id="campaign-search-query" type="search" autoComplete="off" maxLength={120} placeholder="Buscar registros…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "ArrowDown") moveResult(event); }} /></div>
      <Pick label="Tipo de registro" value={kind} onChange={setKind} options={[{ value: "all", label: "Todos" }, ...Object.entries(campaignSearchKinds).map(([value, label]) => ({ value, label }))]} />
    </div>
    <p className="campaign-list-count" role="status">{query.trim() ? `${results.length} resultado${results.length === 1 ? "" : "s"}${results.length > 40 ? " · mostrando os primeiros 40; refine a busca" : ""}` : "Digite um nome ou hex para localizar um registro."}</p>
    {query.trim() && !results.length && <div className="campaign-empty"><b>Nenhum registro encontrado.</b><p>Revise o termo ou escolha outro tipo.</p>{kind !== "all" && <Button variant="outline" size="sm" onClick={() => setKind("all")}>Buscar em todos os tipos</Button>}</div>}
    <div className="campaign-search-results" ref={list} onKeyDown={moveResult}>
      {results.slice(0, 40).map(entry => <button key={entry.id} type="button" className="campaign-search-result" onClick={() => { onOpen(entry.target); onClose(); }}>
        <span><small>{campaignSearchKinds[entry.kind]}</small><b>{entry.title}</b><small>{entry.detail}</small></span><ArrowUpRight size={18} aria-hidden="true" />
      </button>)}
    </div>
    <p className="subtle text-xs">Use ↑ e ↓ para escolher, Enter para abrir e Esc para fechar. Registros não revelados são visíveis apenas ao mestre.</p>
  </DialogContent></Dialog>;
}
