"use client";

import { useMemo, useState } from "react";
import { Crosshair, Dice5, Flame, Sparkles, Swords, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RollDialog } from "@/components/roll-dialog";
import { localizeRollLog } from "@/lib/terminology";
import type { GameState } from "@/lib/game";

type Edit = (fn: (draft: GameState) => void) => void;
type Role = "mestre" | "jogador" | "convidado";
type FeedFilter = "all" | "roll" | "damage";
type LogEntry = GameState["log"][number];

function actorLabel(game: GameState, entry: LogEntry) {
  const known = entry.actorId ? game.survivors.find(survivor => survivor.id === entry.actorId)?.name : null;
  if (known) return known;
  const prefix = entry.text.split(":", 1)[0]?.trim();
  if (prefix && prefix.length <= 80) return prefix;
  return entry.actorId ? "Sobrevivente" : "Mesa";
}

function outcome(entry: LogEntry) {
  const text = localizeRollLog(entry.text);
  if (entry.kind === "dano") {
    if (/não aplicado/i.test(text)) return { label: "Não aplicado", tone: "neutral" } as const;
    if (/acerto pendente/i.test(text)) return { label: "Dano potencial", tone: "neutral" } as const;
    return { label: "Dano", tone: "damage" } as const;
  }
  if (/Sucesso crítico/i.test(text)) return { label: "Crítico", tone: "critical" } as const;
  if (/Falha com Medo/i.test(text)) return { label: "Falha · Medo", tone: "fear" } as const;
  if (/Falha com Esperança/i.test(text)) return { label: "Falha · Esperança", tone: "hope" } as const;
  if (/Sucesso com Medo/i.test(text)) return { label: "Sucesso · Medo", tone: "fear" } as const;
  if (/Sucesso com Esperança/i.test(text)) return { label: "Sucesso · Esperança", tone: "hope" } as const;
  if (/com Medo/i.test(text)) return { label: "Medo", tone: "fear" } as const;
  if (/com Esperança/i.test(text)) return { label: "Esperança", tone: "hope" } as const;
  return { label: "Rolagem", tone: "neutral" } as const;
}

function damageTotal(text: string) {
  const match = text.match(/=\s*(\d+)\s+dano/i);
  return match?.[1] ?? null;
}

export function RollCenter({ game, edit, role, survivorId }: {
  game: GameState;
  edit: Edit;
  role: Role;
  survivorId: string | null;
}) {
  const [filter, setFilter] = useState<FeedFilter>("all");

  const rollLog = useMemo(() => game.log.filter(entry => entry.kind === "dados" || entry.kind === "dano"), [game.log]);
  const entries = useMemo(() => rollLog.filter(entry => filter === "all"
    || (filter === "roll" && entry.kind === "dados")
    || (filter === "damage" && entry.kind === "dano")).slice(0, 60), [rollLog, filter]);

  const actionRolls = rollLog.filter(entry => entry.kind === "dados");
  const hope = actionRolls.filter(entry => /com Esperança/i.test(localizeRollLog(entry.text)) || /Sucesso crítico/i.test(localizeRollLog(entry.text))).length;
  const fear = actionRolls.filter(entry => /com Medo/i.test(localizeRollLog(entry.text))).length;
  const critical = actionRolls.filter(entry => /Sucesso crítico/i.test(localizeRollLog(entry.text))).length;
  const playerRequest = role === "jogador" && survivorId ? { survivorId } : undefined;

  return <div className="grid gap-5">
    <section className="panel panel-pad">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="dossier-title">Mesa / dados de dualidade</p>
          <h2 className="section-title mt-1">Painel da sessão</h2>
          <p className="intro-line mt-2 max-w-3xl">As rolagens ficam registradas no dossiê da campanha e aparecem aqui para a mesa. A sincronização acompanha as atualizações normais da campanha.</p>
        </div>
        {role !== "convidado" && <RollDialog game={game} edit={edit} request={playerRequest} />}
      </div>

      <div className="grid gap-3 mt-5 sm:grid-cols-2 xl:grid-cols-4">
        <div className="metric"><span className="smallcaps subtle flex items-center gap-2"><Dice5 size={15} /> Rolagens</span><strong>{actionRolls.length}</strong></div>
        <div className="metric"><span className="smallcaps subtle flex items-center gap-2"><Sparkles size={15} /> Com Esperança</span><strong>{hope}</strong></div>
        <div className="metric"><span className="smallcaps subtle flex items-center gap-2"><Zap size={15} /> Com Medo</span><strong>{fear}</strong></div>
        <div className="metric"><span className="smallcaps subtle flex items-center gap-2"><Flame size={15} /> Críticos</span><strong>{critical}</strong></div>
      </div>
    </section>

    <section className="panel panel-pad">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="dossier-title">Histórico compartilhado</p><h2 className="section-title mt-1">Últimas rolagens</h2></div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar histórico de rolagens">
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>Tudo</Button>
          <Button size="sm" variant={filter === "roll" ? "default" : "outline"} onClick={() => setFilter("roll")}><Dice5 size={15} /> Testes</Button>
          <Button size="sm" variant={filter === "damage" ? "default" : "outline"} onClick={() => setFilter("damage")}><Swords size={15} /> Dano</Button>
        </div>
      </div>

      {entries.length === 0 ? <div className="list-card mt-4 text-center py-8">
        <Dice5 className="mx-auto mb-3 subtle" size={28} />
        <b>Nenhuma rolagem registrada ainda.</b>
        <p className="text-sm subtle mt-1">Quando alguém rolar ação, reação, ataque ou dano, o resultado aparecerá aqui.</p>
      </div> : <div className="grid gap-3 mt-4">
        {entries.map(entry => {
          const result = outcome(entry);
          const actor = actorLabel(game, entry);
          const damage = entry.kind === "dano" ? damageTotal(entry.text) : null;
          const badgeClass = result.tone === "hope" ? "border-[#80cfc7] text-[#225e5b] bg-[#e7f6f3]"
            : result.tone === "fear" ? "border-[#d9a2a2] text-[#7e3030] bg-[#fff0f0]"
            : result.tone === "critical" ? "border-[#d4b45c] text-[#6b5312] bg-[#fff8dc]"
            : result.tone === "damage" ? "border-[#d4a184] text-[#7b3d22] bg-[#fff1e9]"
            : "border-border text-foreground bg-background";
          return <article key={entry.id} className="list-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border bg-background">
                  {entry.kind === "dano" ? <Crosshair size={17} /> : <Dice5 size={17} />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><b>{actor}</b><span className={`rounded-full border px-2 py-0.5 text-[.68rem] font-bold uppercase tracking-wide ${badgeClass}`}>{result.label}</span></div>
                  <p className="font-mono text-[.7rem] subtle mt-1">Dia {entry.day} · {entry.time}</p>
                </div>
              </div>
              {damage && <strong className="text-xl font-mono">{damage} <span className="text-xs font-normal subtle">{result.label === "Não aplicado" ? "não aplicado" : result.label === "Dano potencial" ? "potencial" : "dano"}</span></strong>}
            </div>
            <p className="text-sm leading-relaxed mt-3">{localizeRollLog(entry.text)}</p>
          </article>;
        })}
      </div>}

      {rollLog.length > 60 && <p className="text-xs subtle mt-4">Mostrando as 60 entradas mais recentes de rolagens e dano.</p>}
    </section>
  </div>;
}
