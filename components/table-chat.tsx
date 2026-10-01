"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Crosshair,
  Dice5,
  MessageSquare,
  Send,
  Sparkles,
  Swords,
  Trash2,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RollDialog, type RollRequest } from "@/components/roll-dialog";
import { rollInfo } from "@/lib/roll-log";
import { localizeRollLog } from "@/lib/terminology";
import { addLog, type GameState } from "@/lib/game";

type Edit = (fn: (draft: GameState) => void) => void;
type Role = "mestre" | "jogador" | "convidado";
type LogEntry = GameState["log"][number];
type ChatRow = { entry: LogEntry; damage?: LogEntry; ids: string[] };

function sameMoment(a: LogEntry, b: LogEntry) {
  return a.day === b.day && a.time === b.time && (a.actorId ?? "") === (b.actorId ?? "");
}

function actor(game: GameState, entry: LogEntry) {
  const survivor = entry.actorId ? game.survivors.find(person => person.id === entry.actorId) : null;
  if (survivor) return { name: survivor.name, portrait: survivor.portrait, subtitle: survivor.archetype || survivor.origin };
  if (entry.actorName) return { name: entry.actorName, portrait: entry.actorPortrait, subtitle: "Sobrevivente" };
  if (entry.kind === "chat") return { name: "Mestre", portrait: undefined, subtitle: "Narrador da mesa" };
  return { name: "Mesa", portrait: undefined, subtitle: "Zona Morta" };
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "ZM";
}

function damageInfo(text?: string) {
  if (!text) return null;
  const total = text.match(/=\s*(\d+)\s+dano/i)?.[1] ?? null;
  const weapon = text.match(/^[^:]+:\s*(.+?)\s+—/)?.[1]?.trim() ?? "Dano";
  const formula = text.match(/—\s*([^=]+)=/)?.[1]?.trim() ?? "";
  const status = /não aplicado/i.test(text) ? "não aplicado"
    : /potencial|pendente/i.test(text) ? "potencial"
    : "aplicável";
  const target = text.match(/Alvo:\s*(.*?)\./i)?.[1]?.trim() ?? "";
  const tierMatch = text.match(/Faixa (?:de dano|potencial):\s*(SEM DANO|MENOR|MAIOR|SEVERO)\s*\((\d+)\s*PV\)/i);
  const tier = tierMatch?.[1] ? tierMatch[1].toLocaleUpperCase("pt-BR") : "";
  const hpMarks = tierMatch?.[2] ? Number(tierMatch[2]) : null;
  return total ? { total, weapon, formula, status, target, tier, hpMarks } : null;
}

function Avatar({ name, portrait }: { name: string; portrait?: string }) {
  return <span className="table-chat-avatar" aria-hidden="true">
    {portrait ? <img src={portrait} alt="" /> : <span>{initials(name)}</span>}
  </span>;
}

export function TableChat({
  game,
  edit,
  role,
  survivorId,
  readOnly = false,
  onClose,
}: {
  game: GameState;
  edit: Edit;
  role: Role;
  survivorId: string | null;
  readOnly?: boolean;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [speakerId, setSpeakerId] = useState(role === "jogador" ? survivorId ?? "" : "master");
  const [rollOpen, setRollOpen] = useState(false);
  const [rollRequest, setRollRequest] = useState<RollRequest | undefined>();
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const latestRowIdRef = useRef<string | null>(null);
  const rowCountRef = useRef(0);

  const rows = useMemo(() => {
    const relevant = game.log.filter(entry => ["chat", "dados", "dano"].includes(entry.kind));
    const grouped: ChatRow[] = [];
    for (let index = 0; index < relevant.length; index += 1) {
      const entry = relevant[index];
      const next = relevant[index + 1];
      if (entry.kind === "dados" && next?.kind === "dano" && sameMoment(entry, next)) {
        grouped.push({ entry, damage: next, ids: [entry.id, next.id] });
        index += 1;
      } else {
        grouped.push({ entry, ids: [entry.id] });
      }
    }
    return grouped.reverse();
  }, [game.log]);

  const latestRowId = rows.at(-1)?.entry.id ?? null;

  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;

    const previousLatest = latestRowIdRef.current;
    const previousCount = rowCountRef.current;
    const isNewRow = previousLatest !== null && latestRowId !== null && latestRowId !== previousLatest && rows.length > previousCount;

    latestRowIdRef.current = latestRowId;
    rowCountRef.current = rows.length;

    const frame = window.requestAnimationFrame(() => {
      feed.scrollTo({ top: feed.scrollHeight, behavior: previousLatest === null ? "auto" : "smooth" });
    });

    let highlightTimer: number | undefined;
    if (isNewRow) {
      setHighlightedId(latestRowId);
      highlightTimer = window.setTimeout(() => {
        setHighlightedId(current => current === latestRowId ? null : current);
      }, 1600);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      if (highlightTimer !== undefined) window.clearTimeout(highlightTimer);
    };
  }, [latestRowId, rows.length]);

  const player = survivorId ? game.survivors.find(person => person.id === survivorId) : null;
  const currentSpeaker = role === "jogador"
    ? player
    : speakerId === "master" ? null : game.survivors.find(person => person.id === speakerId);

  function sendMessage() {
    const text = message.trim();
    if (!text || readOnly || role === "convidado") return;
    const actorId = role === "jogador" ? survivorId ?? undefined : currentSpeaker?.id;
    edit(draft => addLog(draft, "chat", text.slice(0, 600), actorId));
    setMessage("");
  }

  function removeRows(ids: string[]) {
    if (role !== "mestre" || readOnly) return;
    edit(draft => { draft.log = draft.log.filter(entry => !ids.includes(entry.id)); });
  }

  function openRoll(kind: RollRequest["kind"]) {
    if (readOnly || role === "convidado") return;
    setRollRequest({ kind, ...(role === "jogador" && survivorId ? { survivorId } : {}) });
    setRollOpen(true);
  }

  return <aside className="table-chat" aria-label="Chat da mesa">
    <header className="table-chat-header">
      <div>
        <p>Zona Morta</p>
        <h2><MessageSquare size={17} /> Chat da mesa</h2>
      </div>
      <div className="table-chat-header-actions">
        <span>{rows.length}</span>
        <button type="button" onClick={onClose} aria-label="Fechar chat"><X size={18} /></button>
      </div>
    </header>

    <div ref={feedRef} className="table-chat-feed" aria-live="polite">
      {rows.length === 0 && <div className="table-chat-empty">
        <MessageSquare size={28} />
        <b>A mesa ainda está silenciosa.</b>
        <span>Mensagens e rolagens aparecerão aqui durante a sessão.</span>
      </div>}

      {rows.map(row => {
        const who = actor(game, row.entry);
        const canDelete = role === "mestre" && !readOnly;
        if (row.entry.kind === "chat") return <article key={row.entry.id} className={`table-chat-message${highlightedId === row.entry.id ? " is-new" : ""}`}>
          <Avatar name={who.name} portrait={who.portrait} />
          <div className="table-chat-message-body">
            <div className="table-chat-meta">
              <div><strong>{who.name}</strong><span>Dia {row.entry.day} · {row.entry.time}</span></div>
              {canDelete && <button type="button" onClick={() => removeRows(row.ids)} aria-label="Excluir mensagem"><Trash2 size={14} /></button>}
            </div>
            <p>{row.entry.text}</p>
          </div>
        </article>;

        if (row.entry.kind === "dados") {
          const info = rollInfo(row.entry.text);
          const damage = damageInfo(row.damage?.text);
          const fearTone = /MEDO/.test(info.outcome);
          const critical = info.outcome === "CRÍTICO";
          return <article key={row.entry.id} className={`table-chat-roll${highlightedId === row.entry.id ? " is-new" : ""}`}>
            <div className="table-chat-roll-author">
              <Avatar name={who.name} portrait={who.portrait} />
              <div><strong>{who.name}</strong><span>{who.subtitle}</span></div>
              <time>Dia {row.entry.day} · {row.entry.time}</time>
              {canDelete && <button type="button" onClick={() => removeRows(row.ids)} aria-label="Excluir rolagem"><Trash2 size={14} /></button>}
            </div>
            <div className={`table-chat-roll-card${fearTone ? " is-fear" : ""}${critical ? " is-critical" : ""}`}>
              <p className="table-chat-roll-kicker"><Dice5 size={14} /> Rolagem de Dualidade</p>
              <h3>{info.title}</h3>
              <div className="table-chat-roll-separator"><span /></div>
              <span className="table-chat-roll-label">Resultado</span>
              <strong className="table-chat-roll-total">{info.total} <small>{info.outcome}</small></strong>
              <div className="table-chat-dice-pair">
                <span className="hope"><Sparkles size={13} /> Esperança <b>{info.hope}</b></span>
                <span className="fear"><Zap size={13} /> Medo <b>{info.fear}</b></span>
              </div>
              <div className="table-chat-formula"><span>Fórmula</span><b>1d12 + 1d12{info.modifier ? ` ${info.modifier}` : ""}{info.edge}</b></div>
              {info.target && <div className={`table-chat-target${info.targetResult === "ACERTO" ? " is-hit" : info.targetResult === "FALHA" ? " is-miss" : ""}`}>
                <Crosshair size={15} />
                <span><small>Alvo</small><strong>{info.target}</strong></span>
                {info.targetResult && <b>{info.targetResult}</b>}
              </div>}
              {damage && <div className="table-chat-damage">
                <span><Swords size={14} /> Dano automático</span>
                <strong>{damage.total} <small>dano físico · {damage.status}</small></strong>
                <small>{damage.weapon}{damage.formula ? ` · ${damage.formula}` : ""}</small>
                {damage.tier && <div className="table-chat-damage-tier"><span>Dano {damage.tier}</span><b>{damage.hpMarks ?? 0} PV</b><small>{damage.status === "não aplicado" ? "não aplicado" : "a marcar"}</small></div>}
              </div>}
              <details className="table-chat-roll-details">
                <summary>Detalhes <ChevronDown size={13} /></summary>
                <p>{localizeRollLog(row.entry.text)}</p>
                {row.damage && <p>{localizeRollLog(row.damage.text)}</p>}
              </details>
            </div>
          </article>;
        }

        const damage = damageInfo(row.entry.text);
        return <article key={row.entry.id} className={`table-chat-roll table-chat-roll--damage${highlightedId === row.entry.id ? " is-new" : ""}`}>
          <div className="table-chat-roll-author">
            <Avatar name={who.name} portrait={who.portrait} />
            <div><strong>{who.name}</strong><span>{who.subtitle}</span></div>
            <time>Dia {row.entry.day} · {row.entry.time}</time>
            {canDelete && <button type="button" onClick={() => removeRows(row.ids)} aria-label="Excluir dano"><Trash2 size={14} /></button>}
          </div>
          <div className="table-chat-roll-card">
            <p className="table-chat-roll-kicker"><Swords size={14} /> Dano</p>
            <h3>{damage?.weapon ?? "Dano avulso"}</h3>
            <strong className="table-chat-roll-total">{damage?.total ?? "—"} <small>dano físico</small></strong>
            <details className="table-chat-roll-details">
              <summary>Detalhes <ChevronDown size={13} /></summary><p>{localizeRollLog(row.entry.text)}</p>
            </details>
          </div>
        </article>;
      })}
    </div>

    <footer className="table-chat-composer">
      {!readOnly && <>
        <div className="table-chat-speaker">
          <UserRound size={14} />
          <span>Falando como</span>
          {role === "jogador" ? <b>{player?.name ?? "Sobrevivente"}</b> :
            <select value={speakerId} onChange={event => setSpeakerId(event.target.value)} aria-label="Escolher personagem que fala">
              <option value="master">Mestre</option>
              {game.survivors.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>}
        </div>
        <div className="table-chat-rollbar" role="group" aria-label="Rolagens rápidas">
          <button type="button" onClick={() => openRoll("action")}><Dice5 size={15} /> Ação</button>
          <button type="button" onClick={() => openRoll("reaction")}><Zap size={15} /> Reação</button>
          <button type="button" onClick={() => openRoll("attack")}><Swords size={15} /> Ataque</button>
        </div>
        <div className="table-chat-input">
          <textarea
            value={message}
            onChange={event => setMessage(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
            maxLength={600}
            rows={3}
            placeholder="Digite uma mensagem…"
            aria-label="Mensagem para a mesa"
          />
          <Button type="button" size="icon" onClick={sendMessage} disabled={!message.trim()} aria-label="Enviar mensagem"><Send size={17} /></Button>
        </div>
      </>}
      {readOnly && <p className="table-chat-readonly">Prévia dos jogadores: chat em modo de leitura.</p>}
    </footer>

    <RollDialog game={game} edit={edit} request={rollRequest} open={rollOpen} onOpenChange={value => {
      setRollOpen(value);
      if (!value) setRollRequest(undefined);
    }} />
  </aside>;
}
