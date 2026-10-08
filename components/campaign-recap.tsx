"use client";
import { useState } from "react";
import { BookOpen } from "lucide-react";
import { displayTime, survivorPositionGroups, type GameState } from "@/lib/game";
import { historyEntries } from "@/lib/history";
import { campaignAttention, type CampaignTarget } from "@/lib/campaign-attention";
import { Button } from "@/components/ui/button";

export function CampaignRecap({game,onOpen}:{game:GameState;onOpen:(target:CampaignTarget)=>void}){
  const days=[...new Set([game.day,...historyEntries(game,"events").map(e=>e.day)])].sort((a,b)=>b-a);
  const [chosenDay,setChosenDay]=useState(game.day);const day=days.includes(chosenDay)?chosenDay:game.day;
  const entries=historyEntries(game,"events").filter(e=>e.day===day).slice(0,20).reverse();
  const pending=campaignAttention(game);const groups=survivorPositionGroups(game);
  return <section className="master-overview-card mt-5"><header><div><BookOpen size={18}/><span><b>Retomar campanha</b><small>Posições atuais, pendências e registros do dia escolhido.</small></span></div></header>
    <details><summary className="cursor-pointer">Dia {game.day} · {displayTime(game.minutes)} · {pending.length} pendência(s)</summary>
      <div className="grid gap-3 mt-3 md:grid-cols-2"><div><b>Onde paramos</b>{groups.map(g=><p key={g.hex}>{game.hexes[g.hex]?.sector?.name??`Hex ${g.hex}`}: {g.members.map(p=>p.name).join(", ")}</p>)}{!groups.length&&<p>Nenhum sobrevivente registrado.</p>}
        <b className="block mt-3">Próximas decisões</b>{pending.slice(0,5).map(p=><Button key={p.id} variant="ghost" size="sm" className="h-auto whitespace-normal text-left" onClick={()=>onOpen(p.target)}>{p.title}</Button>)}{!pending.length&&<p>Nenhuma pendência registrada.</p>}{pending.length>5&&<p>As demais estão em Precisa de atenção.</p>}</div>
        <div><label className="text-sm">Registros do dia <select className="border rounded px-2 py-1 ml-2" value={day} onChange={e=>setChosenDay(Number(e.target.value))}>{days.map(d=><option key={d} value={d}>Dia {d}</option>)}</select></label>
          <ol className="grid gap-2 mt-3">{entries.map(e=><li key={e.id} className="text-sm"><span className="subtle">{e.time} · {e.kind}</span><p>{e.text}</p></li>)}</ol>{!entries.length&&<p className="subtle mt-3">Nenhum registro disponível neste dia.</p>}<p className="text-xs subtle mt-3">Últimos 20 registros do dia, preservados no diário. Posições e pendências refletem o estado atual.</p></div></div>
    </details></section>;
}
