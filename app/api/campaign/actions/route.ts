import { campaignOwnerId, findPlayer, readCampaign, writeCampaign } from "@/db/state";
import { sameOrigin, siteUser } from "@/lib/auth";
import { projectPlayerGame } from "@/lib/collaboration";
import { applyPlayerAction, playerActionState, setPlayerPolicy } from "@/lib/player-actions";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  const user = await siteUser(request);
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  try {
    const campaignId = new URL(request.url).searchParams.get("campanha")?.trim();
    if (!campaignId) return Response.json({ error: "Campanha inválida." }, { status: 400 });
    const owner = await campaignOwnerId(campaignId);
    if (!owner) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
    const master = owner === user.id;
    const member = master ? null : await findPlayer(campaignId, user.id, user.email);
    if (!master && !member?.survivor_id) return Response.json({ error: "Vincule seu sobrevivente antes de agir." }, { status: 403 });
    const raw = await request.text();
    if (raw.length > (master ? 60_000 : 3000)) return Response.json({ error: "Ação grande demais." }, { status: 413 });
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(raw); } catch { return Response.json({ error: "Dados inválidos." }, { status: 400 }); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return Response.json({ error: "Dados inválidos." }, { status: 400 });
    if (!master && ["policy", "review"].includes(String(payload.type))) return Response.json({ error: "Somente o mestre altera as liberações e resolve avisos." }, { status: 403 });
    for (let attempt = 0; attempt < 4; attempt++) {
      const data = await readCampaign(campaignId);
      let next = data.state;
      if (master) {
        if (payload.type === "policy") {
          if (typeof payload.expectedPolicy !== "string" || (payload.expectedPolicy !== JSON.stringify(playerActionState(data.state).policy) && JSON.stringify(payload.policy) !== JSON.stringify(playerActionState(data.state).policy)))
            return Response.json({ error: "As liberações mudaram em outra janela. Descarte o rascunho e revise antes de salvar." }, { status: 409 });
          const configured = setPlayerPolicy(data.state, payload.policy);
          if (!configured) return Response.json({ error: "Liberações inválidas." }, { status: 400 });
          next = configured;
        } else if (payload.type === "review" && typeof payload.operationId === "string") {
          next = structuredClone(data.state); next.playerActions = structuredClone(playerActionState(next));
          const op = next.playerActions.operations.find(o => o.id === payload.operationId);
          if (!op) return Response.json({ error: "Aviso não encontrado." }, { status: 404 });
          delete op.attention;
          if (op.type === "exception") op.status = "done";
        } else return Response.json({ error: "Use as ferramentas do mestre para executar ações narrativas." }, { status: 400 });
      } else {
        const result = applyPlayerAction(data.state, member!.survivor_id!, payload);
        if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
        next = result.state;
        if (result.replay) return Response.json({ revision: data.revision, state: projectPlayerGame(next, member!.survivor_id!) }, { headers });
      }
      if (new TextEncoder().encode(JSON.stringify(next)).byteLength > 1_800_000) return Response.json({ error: "O registro da campanha atingiu o limite. O mestre precisa revisar o histórico." }, { status: 413 });
      const revision = await writeCampaign(campaignId, next, data.revision);
      if (revision !== null) return Response.json({ revision, state: master ? next : projectPlayerGame(next, member!.survivor_id!) }, { headers });
    }
    return Response.json({ error: "A campanha mudou durante esta ação. Tente novamente com a mesma solicitação." }, { status: 409 });
  } catch (error) {
    console.error("Falha na ação da equipe", error);
    return Response.json({ error: "Não foi possível registrar a ação. Tente novamente." }, { status: 503 });
  }
}
