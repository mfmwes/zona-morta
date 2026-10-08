import { sameOrigin, siteUser } from "@/lib/auth";
import { campaignOwnerId, readCampaign, writeCampaign } from "@/db/state";
import { deleteCheckpoint, listCheckpoints, readCheckpoint, saveCheckpoint } from "@/db/checkpoints";
import { validState } from "@/lib/campaign-validation";
import { addLog } from "@/lib/game";
import { preserveKnownSectors } from "@/lib/sectors";
import { playerActionState } from "@/lib/player-actions";
import { z } from "zod";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
const input=z.object({action:z.enum(["create","restore","delete"]),id:z.string().min(1).max(120),name:z.string().trim().min(1).max(80).optional(),revision:z.number().int().min(1)}).strict();
async function authorize(request:Request){
 const user=await siteUser(request);if(!user)return {response:Response.json({error:"Acesso restrito."},{status:401,headers})};
 const campaignId=new URL(request.url).searchParams.get("campanha")?.trim()??"";
 if(!campaignId || await campaignOwnerId(campaignId)!==user.id)return {response:Response.json({error:"Somente o mestre pode acessar os pontos de restauração."},{status:403,headers})};
 return {campaignId};
}
export async function GET(request:Request){
 try{const auth=await authorize(request);if(auth.response)return auth.response;
 return Response.json({checkpoints:await listCheckpoints(auth.campaignId!)},{headers});
 }catch{return Response.json({error:"Não foi possível consultar os pontos de restauração."},{status:503,headers});}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:"Origem inválida."},{status:403,headers});
 try{
  const auth=await authorize(request);if(auth.response)return auth.response;const campaignId=auth.campaignId!;
  const raw=await request.text();if(raw.length>2000)return Response.json({error:"Pedido grande demais."},{status:413,headers});
  let decoded:unknown;try{decoded=JSON.parse(raw);}catch{return Response.json({error:"Pedido inválido."},{status:400,headers});}
  const parsed=input.safeParse(decoded);if(!parsed.success)return Response.json({error:"Pedido inválido."},{status:400,headers});
  const c=parsed.data;const current=await readCampaign(campaignId);
  if(current.revision!==c.revision)return Response.json({error:"A campanha mudou. Recarregue antes de continuar."},{status:409,headers});
  if(c.action==="create"){
   if(c.id==="before-restore" || !c.name)return Response.json({error:"Nome ou identificação inválidos."},{status:400,headers});
   const saved=await saveCheckpoint(campaignId,c.id,c.name,c.revision);
   if(!saved)return Response.json({error:"A campanha mudou, o ponto já existe ou o limite de 10 pontos foi atingido."},{status:409,headers});
  }else if(c.action==="delete"){
   if(!await deleteCheckpoint(campaignId,c.id))return Response.json({error:"Ponto não encontrado."},{status:404,headers});
  }else{
   const saved=await readCheckpoint(campaignId,c.id);if(!saved)return Response.json({error:"Ponto não encontrado."},{status:404,headers});
   const body:unknown=JSON.parse(saved.body);
   if(!validState(body))return Response.json({error:"Este ponto não é compatível com o estado atual do sistema."},{status:400,headers});
   const restored=preserveKnownSectors(body);
   if(!validState(restored))return Response.json({error:"Este ponto não é compatível com o estado atual do sistema."},{status:400,headers});
   // Capture the chosen body before replacing the automatic safety slot.
   if(current.state.playerActions){
    restored.playerActions??=playerActionState(restored);
    const ids=new Set(restored.playerActions.receipts.map(r=>`${r.actorId}:${r.day}:${r.id}`));
    const recent=current.state.playerActions.receipts.filter(r=>r.day===restored.day&&!ids.has(`${r.actorId}:${r.day}:${r.id}`));
    if(restored.playerActions.receipts.length+recent.length>2000)return Response.json({error:"O limite de recibos impede uma restauração segura neste dia."},{status:409,headers});
    restored.playerActions.receipts.push(...recent);
   }
   restored.campaignId=campaignId;addLog(restored,"campanha",`Ponto restaurado: ${saved.name}. A cópia anterior ficou em Pontos de restauração.`);
   const revision=await writeCampaign(campaignId,restored,c.revision,true);
   if(revision===null)return Response.json({error:"A campanha mudou. Nada foi restaurado."},{status:409,headers});
   return Response.json({revision},{headers});
  }
  return Response.json({checkpoints:await listCheckpoints(campaignId)},{headers});
 }catch{return Response.json({error:"Não foi possível concluir a operação."},{status:503,headers});}
}
