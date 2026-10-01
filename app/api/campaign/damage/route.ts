import { campaignOwnerId, findPlayer, readCampaign, writeCampaign } from "@/db/state";
import { sameOrigin, siteUser } from "@/lib/auth";
import { projectPlayerGame } from "@/lib/collaboration";
import { resolveSurvivorDamageRequest } from "@/lib/conflict";
import { addLog, survivorStats } from "@/lib/game";

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
    if (!isOwner && !member?.survivor_id)
      return Response.json({ error: "Crie seu sobrevivente antes de resolver dano." }, { status: 409 });

    const raw = await request.text();
    if (raw.length > 4_000) return Response.json({ error: "Solicitação grande demais." }, { status: 413 });
    const payload = JSON.parse(raw) as { requestId?: unknown; resolution?: unknown };
    if (typeof payload.requestId !== "string" || payload.requestId.length > 120
      || !["hp", "armor"].includes(String(payload.resolution))) {
      return Response.json({ error: "Escolha de dano inválida." }, { status: 400 });
    }

    for (let attempt = 0; attempt < 4; attempt++) {
      const data = await readCampaign(campaignId);
      const scene = data.state.conflict;
      if (!scene?.active) return Response.json({ error: "Este conflito não está mais ativo." }, { status: 409 });

      const pending = (scene.damageRequests ?? []).find(row => row.id === payload.requestId);
      if (!pending || pending.status !== "pending")
        return Response.json({ error: "Este dano já foi resolvido ou não está mais disponível." }, { status: 409 });

      if (!isOwner && pending.targetSurvivorId !== member!.survivor_id)
        return Response.json({ error: "Esta solicitação pertence a outro sobrevivente." }, { status: 403 });

      const survivor = data.state.survivors.find(person => person.id === pending.targetSurvivorId);
      if (!survivor) return Response.json({ error: "Sobrevivente não encontrado." }, { status: 404 });

      const stats = survivorStats(survivor);
      const result = resolveSurvivorDamageRequest(
        scene,
        pending.id,
        survivor,
        { hp: stats.hp, armor: stats.armor },
        payload.resolution as "hp" | "armor",
        data.state.day,
        String(Math.floor(data.state.minutes / 60)).padStart(2, "0") + ":" + String(data.state.minutes % 60).padStart(2, "0"),
      );
      if (!result.ok) {
        if (result.reason === "no-armor")
          return Response.json({ error: "Você não possui espaço de Armadura livre." }, { status: 409 });
        return Response.json({ error: "Este dano não pode mais ser resolvido." }, { status: 409 });
      }

      const resolutionText = result.armorUsed
        ? `usou 1 Armadura e marcou ${result.hpMarks} PV`
        : `marcou ${result.hpMarks} PV`;
      addLog(data.state, "dano",
        `${survivor.name} resolveu o dano de ${result.sourceName} (${result.attackName}): ${resolutionText}. PV ${result.totalHpMarked}/${result.maxHp} · Armadura marcada ${result.armorMarked}/${result.maxArmor}.`,
        survivor.id);

      const revision = await writeCampaign(campaignId, data.state, data.revision);
      if (revision === null) continue;

      return Response.json({
        revision,
        resolution: {
          hpMarks: result.hpMarks,
          armorUsed: result.armorUsed,
          totalHpMarked: result.totalHpMarked,
          maxHp: result.maxHp,
          armorMarked: result.armorMarked,
          maxArmor: result.maxArmor,
        },
        state: isOwner ? data.state : projectPlayerGame(data.state, survivor.id),
      }, { headers: noStore });
    }

    return Response.json({ error: "A campanha mudou durante a resolução. Tente novamente." }, { status: 409 });
  } catch (error) {
    console.error("Falha ao resolver dano do sobrevivente", error);
    return Response.json({ error: "Não foi possível resolver o dano. Tente novamente." }, { status: 503 });
  }
}
