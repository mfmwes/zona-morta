import { campaignOwnerId, findPlayer, readCampaign, writeCampaign } from "@/db/state";
import { sameOrigin, siteUser } from "@/lib/auth";
import { projectPlayerGame } from "@/lib/collaboration";
import { cancelConflictSpotlightRequest, requestConflictSpotlight } from "@/lib/conflict";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

function requestedCampaign(request: Request) {
  return new URL(request.url).searchParams.get("campanha")?.trim() ?? "";
}

export async function POST(request: Request) {
  const user = await siteUser(request);
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });

  try {
    const campaignId = requestedCampaign(request);
    if (!campaignId) return Response.json({ error: "Campanha inválida." }, { status: 400 });

    const ownerId = await campaignOwnerId(campaignId);
    if (!ownerId) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
    if (ownerId === user.id)
      return Response.json({ error: "O mestre controla o spotlight diretamente pela Cena de Conflito." }, { status: 403 });

    const member = await findPlayer(campaignId, user.id, user.email);
    if (!member?.survivor_id)
      return Response.json({ error: "Crie seu sobrevivente antes de pedir o spotlight." }, { status: 409 });

    const raw = await request.text();
    if (raw.length > 2_000) return Response.json({ error: "Solicitação grande demais." }, { status: 413 });
    const payload = JSON.parse(raw) as { action?: unknown };
    if (!["request", "cancel"].includes(String(payload.action)))
      return Response.json({ error: "Ação de spotlight inválida." }, { status: 400 });

    for (let attempt = 0; attempt < 4; attempt++) {
      const data = await readCampaign(campaignId);
      const scene = data.state.conflict;
      if (!scene?.active)
        return Response.json({ error: "Não há conflito ativo." }, { status: 409 });
      if (!scene.survivorIds.includes(member.survivor_id))
        return Response.json({ error: "Seu personagem não participa deste conflito." }, { status: 403 });

      if (payload.action === "request") requestConflictSpotlight(scene, member.survivor_id);
      else cancelConflictSpotlightRequest(scene, member.survivor_id);

      const revision = await writeCampaign(campaignId, data.state, data.revision);
      if (revision === null) continue;

      return Response.json({
        revision,
        state: projectPlayerGame(data.state, member.survivor_id),
      }, { headers: noStore });
    }

    return Response.json({ error: "A campanha mudou durante a solicitação. Tente novamente." }, { status: 409 });
  } catch (error) {
    console.error("Falha ao atualizar pedido de spotlight", error);
    return Response.json({ error: "Não foi possível atualizar o pedido de spotlight." }, { status: 503 });
  }
}
