"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/game-controls";
import { displayTime } from "@/lib/game";
import { createId } from "@/lib/id";
import type { CampaignCheckpoint } from "@/db/checkpoints";
export type CheckpointAction={action:"create"|"restore"|"delete";id:string;name?:string};
export function CampaignCheckpoints({campaignId,day,canAct,onAction,onClose}:{campaignId:string;day:number;canAct:boolean;onAction:(command:CheckpointAction)=>Promise<void>;onClose:()=>void}){
 const [rows,setRows]=useState<CampaignCheckpoint[]>([]),[name,setName]=useState(`Dia ${day}`),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [confirm,setConfirm]=useState<{kind:"restore"|"delete";point:CampaignCheckpoint}|null>(null);
 const api=`/api/campaign/checkpoints?campanha=${encodeURIComponent(campaignId)}`;
 async function refresh(){const r=await fetch(api,{cache:"no-store"});const data=await r.json() as {error?:string;checkpoints?:CampaignCheckpoint[]};if(!r.ok)throw new Error(data.error||"Não foi possível consultar os pontos.");setRows(data.checkpoints??[]);}
 useEffect(()=>{let alive=true;void fetch(api,{cache:"no-store"}).then(async r=>{const data=await r.json() as {error?:string;checkpoints?:CampaignCheckpoint[]};if(!r.ok)throw new Error(data.error||"Não foi possível consultar os pontos.");if(alive){setRows(data.checkpoints??[]);setLoading(false);}}).catch(e=>{if(alive){setError(e.message);setLoading(false);}});return()=>{alive=false;};},[api]);
 async function act(command:CheckpointAction){if(busy||!canAct)return;setBusy(true);setError("");try{await onAction(command);setConfirm(null);await refresh();}catch(e){setError(e instanceof Error?e.message:"Não foi possível concluir.");}finally{setBusy(false);}}
 const full=rows.filter(r=>!r.safety).length>=10;
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="inventory-dialog"><DialogHeader><DialogTitle>Pontos de restauração</DialogTitle><DialogDescription>Guarde até 10 momentos desta campanha. Antes de restaurar, o estado atual é preservado em uma cópia automática.</DialogDescription></DialogHeader>
  <div className="grid gap-3"><Field label="Nome do novo ponto" value={name} onChange={setName}/><Button disabled={busy||loading||!canAct||!name.trim()||name.trim().length>80||full} onClick={()=>void act({action:"create",id:createId(),name:name.trim()})}>{busy?"Aguarde…":"Guardar estado atual"}</Button>{full&&<p className="subtle text-sm">Limite de 10 pontos atingido. Exclua um ponto para guardar outro.</p>}{!canAct&&<p role="status">Aguarde o salvamento da campanha antes de continuar.</p>}
  {error&&<p role="alert" className="inventory-danger">{error} <Button size="sm" variant="ghost" disabled={busy} onClick={()=>void refresh().then(()=>setError("")).catch(e=>setError(e.message))}>Atualizar lista</Button></p>}
  {loading?<p>Consultando pontos…</p>:!rows.length?<p className="subtle">Nenhum ponto guardado nesta campanha.</p>:<div className="grid gap-3 max-h-72 overflow-y-auto">{rows.map(p=><article key={p.id} className="rounded border p-3"><b>{p.name}</b>{p.safety&&<span className="ml-2 text-xs subtle">cópia automática</span>}<p className="text-sm subtle">Dia {p.day} · {displayTime(p.minutes)} · {new Date(p.createdAt).toLocaleString("pt-BR")}</p><div className="flex gap-2 mt-2"><Button size="sm" variant="outline" disabled={busy||!canAct} onClick={()=>setConfirm({kind:"restore",point:p})}>Restaurar</Button><Button size="sm" variant="ghost" disabled={busy||!canAct} onClick={()=>setConfirm({kind:"delete",point:p})}>Excluir ponto</Button></div></article>)}</div>}
  {confirm&&<section className="rounded border p-3" aria-label="Confirmar alteração"><b>{confirm.kind==="restore"?"Restaurar":"Excluir"} “{confirm.point.name}”?</b><p className="text-sm mt-2">{confirm.kind==="restore"?"O estado de jogo será substituído, incluindo mapa, fichas, reservas, cenas, atividades e diário. A cópia automática guardará o estado anterior. Contas e convites permanecem atuais.":"Este ponto será removido. O estado de jogo atual permanece como está."}</p><div className="flex gap-2 mt-3"><Button disabled={busy||!canAct} onClick={()=>void act({action:confirm.kind,id:confirm.point.id})}>{confirm.kind==="restore"?"Confirmar restauração":"Confirmar exclusão"}</Button><Button variant="outline" disabled={busy} onClick={()=>setConfirm(null)}>Cancelar</Button></div></section>}
  </div></DialogContent></Dialog>;
}
