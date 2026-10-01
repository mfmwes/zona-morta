import { campaignOwnerId, findPlayer, readCampaign } from "@/db/state";
import { sameOrigin, siteUser } from "@/lib/auth";
import { resolveThreatAttack } from "@/lib/conflict";

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

    const isOwner = ownerId === user.id;
    const member = isOwner ? null : await findPlayer(campaignId, user.id, user.email);
    if (!isOwner && !member) return Response.json({ error: "Acesso revogado." }, { status: 403 });

    const raw = await request.text();
    if (raw.length > 8_000) return Response.json({ error: "Solicitação grande demais." }, { status: 413 });
    const payload = JSON.parse(raw) as {
      targetId?: unknown;
      attackTotal?: unknown;
      critical?: unknown;
      damageTotal?: unknown;
    };

    if (typeof payload.targetId !== "string" || payload.targetId.length > 120
      || !Number.isInteger(payload.attackTotal) || Number(payload.attackTotal) < -100 || Number(payload.attackTotal) > 500
      || typeof payload.critical !== "boolean"
      || !Number.isInteger(payload.damageTotal) || Number(payload.damageTotal) < 0 || Number(payload.damageTotal) > 5000) {
      return Response.json({ error: "Dados de ataque inválidos." }, { status: 400 });
    }

    const { state } = await readCampaign(campaignId);
    const conflict = state.conflict;
    if (!conflict?.active) return Response.json({ error: "Não há conflito ativo." }, { status: 409 });

    if (!isOwner) {
      if (!member?.survivor_id || !conflict.survivorIds.includes(member.survivor_id))
        return Response.json({ error: "Seu personagem não participa deste conflito." }, { status: 403 });
    }

    const threat = conflict.threats.find(row => row.id === payload.targetId);
    if (!threat) return Response.json({ error: "A ameaça não está mais nesta cena." }, { status: 404 });
    if (threat.defeated) return Response.json({ error: "A ameaça já está fora de combate." }, { status: 409 });

    const resolution = resolveThreatAttack(
      threat,
      Number(payload.attackTotal),
      payload.critical,
      Number(payload.damageTotal),
    );

    return Response.json({
      targetId: resolution.targetId,
      targetName: resolution.targetName,
      hit: resolution.hit,
      damageTier: resolution.damageTier,
    }, { headers: noStore });
  } catch (error) {
    console.error("Falha ao resolver alvo do conflito", error);
    return Response.json({ error: "Não foi possível resolver o alvo. Tente novamente." }, { status: 503 });
  }
}
