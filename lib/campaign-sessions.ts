import { addLog, type GameState } from "./game";
import { createId } from "./id";
import { campaignAttention } from "./campaign-attention";
import { historyEntries } from "./history";

export type CampaignSession = {
  id: string; name: string; startedAt: string; endedAt?: string;
  startDay: number; startMinutes: number; endDay?: number; endMinutes?: number;
  startLogId: string; summary: string; pending: string[];
  entries: { id: string; day: number; time: string; kind: string; text: string }[];
};
export type SessionCommand = { action: "start" | "end"; name: string; summary: string; checkpoint: boolean; expectedSessionId?: string };
export function activeCampaignSession(game: GameState) { return game.sessions?.find(s => !s.endedAt); }
export function sessionEntries(game: GameState, session: CampaignSession) {
  if (session.endedAt) return session.entries;
  const boundary = game.log.findIndex(e => e.id === session.startLogId);
  const log = boundary < 0 ? game.log : game.log.slice(0, boundary);
  return historyEntries({ ...game, log }, "events").slice(0, 50).reverse().map(({id,day,time,kind,text}) => ({id,day,time,kind,text:text.slice(0,10000)}));
}
export function applySessionCommand(game: GameState, c: SessionCommand) {
  const active = activeCampaignSession(game);
  if (c.action === "start") {
    if (active) throw new Error("Já existe uma sessão em andamento.");
    if (!c.name.trim() || c.name.trim().length > 80 || (game.sessions?.length ?? 0) >= 100) throw new Error("Informe um nome com até 80 caracteres. Limite: 100 sessões.");
    addLog(game,"sessão",`Sessão iniciada: ${c.name.trim()}.`);
    (game.sessions ??= []).push({id:createId(),name:c.name.trim(),startedAt:new Date().toISOString(),startDay:game.day,startMinutes:game.minutes,startLogId:game.log[0].id,summary:"",pending:[],entries:[]});
  } else {
    if (!active || active.id !== c.expectedSessionId) throw new Error("A sessão mudou. Confira o registro atual.");
    if (c.summary.trim().length > 2000) throw new Error("Resuma a sessão em até 2.000 caracteres.");
    active.entries = sessionEntries(game,active);
    active.summary = c.summary.trim();
    active.pending = campaignAttention(game).slice(0,30).map(p=>`${p.title}: ${p.detail}`.slice(0,1000));
    active.endDay = game.day; active.endMinutes = game.minutes; active.endedAt = new Date().toISOString();
    addLog(game,"sessão",`Sessão encerrada: ${active.name}.${active.summary ? ` ${active.summary}` : ""}`);
  }
}
export function validCampaignSessions(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > 100) return false;
  const bounded = (s: unknown,n: number) => typeof s === "string" && s.length <= n;
  const day = (n: unknown) => Number.isInteger(n) && Number(n) > 0 && Number(n) < 100000;
  const minute = (n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) < 1440;
  return value.filter(s=>s && s.endedAt === undefined).length <= 1 && new Set(value.map(s=>s?.id)).size === value.length && value.every(s=>s && bounded(s.id,120) && s.id.length>0 && bounded(s.name,80) && s.name.trim().length>0 && bounded(s.startedAt,40)
    && day(s.startDay) && minute(s.startMinutes) && bounded(s.startLogId,120) && bounded(s.summary,2000)
    && (s.endedAt === undefined ? s.endDay === undefined && s.endMinutes === undefined : bounded(s.endedAt,40) && day(s.endDay) && minute(s.endMinutes))
    && Array.isArray(s.pending) && s.pending.length<=30 && s.pending.every((p:unknown)=>bounded(p,1000))
    && Array.isArray(s.entries) && s.entries.length<=50 && s.entries.every((e:CampaignSession["entries"][number])=>e && bounded(e.id,120) && day(e.day) && bounded(e.time,10) && bounded(e.kind,80) && bounded(e.text,10000)));
}
