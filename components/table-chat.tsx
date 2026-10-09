"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  CheckCircle2,
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
import { toast } from "sonner";
import { FreeDiceTray } from "@/components/free-dice-tray";
import { rollFreeDice, freeDiceLog, readFreeDiceLog } from "@/lib/free-dice";
import { RollDialog, type RollRequest } from "@/components/roll-dialog";
import { rollInfo } from "@/lib/roll-log";
import { localizeRollLog } from "@/lib/terminology";
import { addLog, type GameState } from "@/lib/game";
import { applyThreatDamage } from "@/lib/conflict";
import { isChatLog } from "@/lib/history";
import { HistoryClearButton } from "@/components/history-clear-button";

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
  if (entry.kind === "chat" || entry.kind === "rolagem") return { name: "Mestre", portrait: undefined, subtitle: "Narrador da mesa" };
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
  const status = /Acerto confirmado/i.test(text) && /Dano ainda não aplicado/i.test(text) ? "pendente"
    : /não aplicado/i.test(text) ? "não aplicado"
    : /potencial|pendente/i.test(text) ? "potencial"
    : "aplicável";
  const target = text.match(/Alvo:\s*(.*?)\./i)?.[1]?.trim() ?? "";
  const tierMatch = text.match(/Faixa (?:de dano|potencial):\s*(SEM DANO|MENOR|MAIOR|SEVERO)\s*\((\d+)\s*PV\)/i);
  const tier = tierMatch?.[1] ? tierMatch[1].toLocaleUpperCase("pt-BR") : "";
  const hpMarks = tierMatch?.[2] ? Number(tierMatch[2]) : null;
  return total ? { total, weapon, formula, status, target, tier, hpMarks } : null;
}


function threatActionInfo(text: string) {
  const main = text.match(/^(.*?):\s*(.*?)\s+contra\s+(.*?)\s+—\s+d20\s+(\d+)\s+([+−-])\s+(\d+)\s+=\s+(-?\d+)\s+vs\s+Evasão\s+(\d+):\s+(ACERTO|FALHA)\./i);
  if (!main) return null;
  const damage = text.match(/Dano\s+(\d+)\s+(.+?)\s+→\s+(SEM DANO|MENOR|MAIOR|SEVERO)\s+\((\d+)\s+PV\)/i);
  return {
    threat: main[1].trim(),
    attack: main[2].trim(),
    target: main[3].trim(),
    d20: Number(main[4]),
    bonus: `${main[5] === "+" ? "+" : "−"}${main[6]}`,
    total: Number(main[7]),
    evasion: Number(main[8]),
    hit: main[9].toUpperCase() === "ACERTO",
    damage: damage ? Number(damage[1]) : null,
    damageType: damage?.[2]?.trim() ?? "",
    tier: damage?.[3]?.toUpperCase() ?? "",
    hpMarks: damage ? Number(damage[4]) : null,
  };
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
  layout = "panel",
  active = true,
}: {
  game: GameState;
  edit: Edit;
  role: Role;
  survivorId: string | null;
  readOnly?: boolean;
  onClose: () => void;
  layout?: "panel" | "screen";
  active?: boolean;
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
    const relevant = game.log.filter(isChatLog);
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
    if (!feed || !active) return;

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
  }, [latestRowId, rows.length, active]);

  const player = survivorId ? game.survivors.find(person => person.id === survivorId) : null;
  const currentSpeaker = role === "jogador"
    ? player
    : speakerId === "master" ? null : game.survivors.find(person => person.id === speakerId);

  function freeRoll(formula: string) {
    if (readOnly || role === "convidado" || (role === "jogador" && !player)) return false;
    try {
      const result = rollFreeDice(formula);
      const actorId = role === "jogador" ? survivorId ?? undefined : currentSpeaker?.id;
      edit(draft => addLog(draft, "rolagem", freeDiceLog(result), actorId));
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "Confira a fórmula."); return false; }
  }

  function sendMessage() {
    const text = message.trim();
    if (!text || readOnly || role === "convidado") return;
    const command = text.match(/^\/(?:r|roll)\s+(.+)$/i);
    if (command) { if (freeRoll(command[1])) setMessage(""); return; }
    const actorId = role === "jogador" ? survivorId ?? undefined : currentSpeaker?.id;
    edit(draft => addLog(draft, "chat", text.slice(0, 600), actorId));
    setMessage("");
  }

  function removeRows(ids: string[]) {
    if (role !== "mestre" || readOnly) return;
    edit(draft => { draft.log = draft.log.filter(entry => !ids.includes(entry.id)); });
  }


  function applyAttackDamage(logId: string, targetName: string, hpMarks: number) {
    if (role !== "mestre" || readOnly || !game.conflict?.active || hpMarks <= 0) return;
    const candidates = game.conflict.threats.filter(threat => threat.name === targetName);
    if (candidates.length !== 1) return;
    const targetId = candidates[0].id;
    edit(draft => {
      const scene = draft.conflict;
      if (!scene?.active) return;
      const result = applyThreatDamage(scene, targetId, hpMarks, logId);
      if (!result.ok) return;
      addLog(draft, "conflito", `${result.targetName} marcou ${result.hpMarks} PV por um ataque resolvido no Chat da Mesa (${result.totalMarked}/${result.maxHp})${result.defeated ? " e ficou fora de combate" : ""}.`);
    });
  }

  function openRoll(kind: RollRequest["kind"]) {
    if (readOnly || role === "convidado") return;
    setRollRequest({ kind, ...(role === "jogador" && survivorId ? { survivorId } : {}) });
    setRollOpen(true);
  }

  return <aside className={`table-chat${layout === "screen" ? " table-chat--screen" : ""}`} aria-label="Chat da mesa">
    <header className="table-chat-header">
      <div>
        <p>Zona Morta</p>
        <h2><MessageSquare size={17} /> Chat da mesa</h2>
      </div>
      <div className="table-chat-header-actions">
        <span>{rows.length}</span>
        <HistoryClearButton game={game} edit={edit} scope="chat" role={role} readOnly={readOnly} iconOnly />
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

        if (row.entry.kind === "rolagem") {
          const roll = readFreeDiceLog(row.entry.text);
          return <article key={row.entry.id} className={`table-chat-roll${highlightedId === row.entry.id ? " is-new" : ""}`}>
            <div className="table-chat-roll-author"><Avatar name={who.name} portrait={who.portrait}/><div><strong>{who.name}</strong><span>{who.subtitle}</span></div><time>Dia {row.entry.day} · {row.entry.time}</time>{canDelete&&<button type="button" onClick={()=>removeRows(row.ids)} aria-label="Excluir rolagem"><Trash2 size={14}/></button>}</div>
            <div className="table-chat-roll-card"><p className="table-chat-roll-kicker"><Dice5 size={14}/>Rolagem livre</p>{roll?<><h3>{roll.formula}</h3><strong className="table-chat-roll-total">{roll.total}<small>total</small></strong><div className="table-chat-free-results">{roll.dice.map(d=><p key={d.faces}><b>d{d.faces}</b> · {d.values.join(" + ")}</p>)}{roll.modifier!==0&&<p>Modificador: {roll.modifier>0?"+":""}{roll.modifier}</p>}</div></>:<p>Registro de rolagem indisponível.</p>}</div>
          </article>;
        }

        if (row.entry.kind === "ameaça") {
          const threat = threatActionInfo(row.entry.text);
          if (!threat) return <article key={row.entry.id} className="table-chat-message"><div className="table-chat-message-body"><p>{localizeRollLog(row.entry.text)}</p></div></article>;
          return <article key={row.entry.id} className={`table-chat-threat-action${highlightedId === row.entry.id ? " is-new" : ""}`}>
            <div className="table-chat-threat-card">
              <p className="table-chat-threat-kicker"><Swords size={14} /> Ação de ameaça</p>
              <div className="table-chat-threat-title"><div><strong>{threat.threat}</strong><span>{threat.attack}</span></div><b className={threat.hit ? "is-hit" : "is-miss"}>{threat.hit ? "ACERTO" : "FALHA"}</b></div>
              <div className="table-chat-target">
                <Crosshair size={15} />
                <span><small>Alvo</small><strong>{threat.target}</strong></span>
              </div>
              <div className="table-chat-threat-roll">
                <span><small>d20</small><b>{threat.d20}</b></span>
                <span><small>Bônus</small><b>{threat.bonus}</b></span>
                <span><small>Total</small><b>{threat.total}</b></span>
                <span><small>Evasão</small><b>{threat.evasion}</b></span>
              </div>
              {threat.hit && threat.damage !== null && <div className="table-chat-threat-damage">
                <span>Dano</span><strong>{threat.damage} <small>{threat.damageType}</small></strong>
                <div><b>{threat.tier}</b><span>{threat.hpMarks} PV · alvo pode usar Armadura</span></div>
              </div>}
              <details className="table-chat-roll-details"><summary>Detalhes <ChevronDown size={13} /></summary><p>{localizeRollLog(row.entry.text)}</p></details>
            </div>
          </article>;
        }

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
                {damage.tier && (() => {
                  const hpMarks = damage.hpMarks ?? 0;
                  const conflictTarget = game.conflict?.active && damage.target
                    ? game.conflict.threats.find(threat => threat.name === damage.target) ?? null
                    : null;
                  const applied = Boolean(game.conflict?.appliedAttackLogIds?.includes(row.entry.id));
                  const canApply = role === "mestre" && !readOnly && info.targetResult === "ACERTO" && hpMarks > 0 && Boolean(conflictTarget) && !conflictTarget?.defeated && !applied;
                  return <div className="table-chat-damage-tier">
                    <span>Dano {damage.tier}</span><b>{hpMarks} PV</b>
                    {applied ? <small className="is-applied"><CheckCircle2 size={12} /> aplicado</small>
                      : canApply ? <button type="button" onClick={() => applyAttackDamage(row.entry.id, damage.target, hpMarks)}>Aplicar {hpMarks} PV</button>
                      : <small>{damage.status === "não aplicado" ? "não aplicado" : damage.status === "pendente" ? "a confirmar" : "a marcar"}</small>}
                  </div>;
                })()}
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
        {role !== "convidado" && <FreeDiceTray disabled={role === "jogador" && !player} onRoll={freeRoll}/>}
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
            placeholder="Mensagem ou /r 2d6 + 3…"
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
