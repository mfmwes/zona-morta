"use client";
import { useState } from "react";
import { activeCampaignSession, sessionEntries, type SessionCommand } from "@/lib/campaign-sessions";
import { displayTime, type GameState } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function CampaignSessions({game,canAct,onAction}:{game:GameState;canAct:boolean;onAction:(c:SessionCommand)=>Promise<void>}) {
  const active=activeCampaignSession(game);
  const [name,setName]=useState("");const [summary,setSummary]=useState("");const [checkpoint,setCheckpoint]=useState(true);const [busy,setBusy]=useState(false);
  const [selected,setSelected]=useState("");
  const session=game.sessions?.find(s=>s.id===selected)??active??game.sessions?.at(-1);
  async function submit(){setBusy(true);try{await onAction({action:active?"end":"start",name,summary,checkpoint,expectedSessionId:active?.id});setName("");setSummary("");setSelected("");}catch(e){toast.error(e instanceof Error?e.message:"Não foi possível registrar a sessão.");}finally{setBusy(false);}}
  return <section className="master-overview-card mt-5"><header><div><span><b>Sessões da mesa</b><small>{active?`Em andamento: ${active.name}`:"Nenhuma sessão em andamento"}</small></span></div></header>
    <p className="text-xs subtle mb-3">Uma sessão pode atravessar vários dias do jogo. Iniciar e encerrar não avança o relógio nem aplica descanso.</p>
    <div className="grid gap-3">
      {active?<label>Decisões e próximos passos<textarea className="w-full border rounded p-2" rows={3} maxLength={2000} value={summary} disabled={busy} onChange={e=>setSummary(e.target.value)} placeholder="O que foi decidido e o que retomar na próxima sessão"/></label>:<label>Nome da sessão<input className="w-full border rounded p-2" maxLength={80} value={name} disabled={busy} onChange={e=>setName(e.target.value)} placeholder={`Sessão ${(game.sessions?.length??0)+1}`}/></label>}
      <label className="text-sm"><input type="checkbox" checked={checkpoint} disabled={busy} onChange={e=>setCheckpoint(e.target.checked)}/> Guardar ponto de restauração antes de {active?"encerrar":"iniciar"} (usa um dos 10 pontos)</label>
      <Button disabled={busy||!canAct||(!active&&!name.trim())} onClick={()=>void submit()}>{busy?"Registrando…":active?"Encerrar sessão":"Iniciar sessão"}</Button>
      {!canAct&&<p className="text-xs subtle">Aguarde a campanha ser salva para registrar a sessão.</p>}
      {session&&<details><summary>Consultar resumo da sessão</summary><label className="block mt-3">Sessão <select value={session.id} onChange={e=>setSelected(e.target.value)}>{[...(game.sessions??[])].reverse().map(s=><option key={s.id} value={s.id}>{s.name}{s.endedAt?"":" · em andamento"}</option>)}</select></label>
        <p className="text-sm mt-3">Dia {session.startDay} · {displayTime(session.startMinutes)} até {session.endedAt?`dia ${session.endDay} · ${displayTime(session.endMinutes!)}`:"agora"}</p>
        {session.summary&&<p className="whitespace-pre-wrap mt-3">{session.summary}</p>}
        {session.endedAt&&<div className="mt-3"><b>Pendências no encerramento</b><ul>{session.pending.map((p,i)=><li key={i}>{p}</li>)}</ul>{!session.pending.length&&<p>Nenhuma pendência registrada.</p>}</div>}
        <ol className="grid gap-2 mt-3">{sessionEntries(game,session).map(e=><li className="text-sm" key={e.id}><span className="subtle">Dia {e.day} · {e.time} · {e.kind}</span><p>{e.text}</p></li>)}</ol>
        <p className="text-xs subtle mt-3">Até 50 registros disponíveis no diário desta sessão. O resumo encerrado fica preservado mesmo quando o diário é limpo. As pendências históricas podem já ter sido resolvidas.</p>
      </details>}
    </div>
  </section>;
}
