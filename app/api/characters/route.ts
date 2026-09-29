import { campaignOwnerId, findPlayer, readCampaign, reservePlayerCharacter, writeCampaign } from "@/db/state";
import { sameOrigin, siteUser } from "@/lib/auth";
import { createSurvivorFromDraft } from "@/lib/character-creation";
import { projectPlayerGame } from "@/lib/collaboration";
import { addLog } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await siteUser(request);
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  try {
    const campaignId = new URL(request.url).searchParams.get("campanha")?.trim() ?? "";
    if (!campaignId) return Response.json({ error: "Campanha inválida." }, { status: 400 });
    if (await campaignOwnerId(campaignId) === user.id) return Response.json({ error: "Use a criação do mestre." }, { status: 403 });
    const raw = await request.text();
    if (raw.length > 15_000) return Response.json({ error: "Dossiê grande demais." }, { status: 413 });
    const survivor = createSurvivorFromDraft(JSON.parse(raw));
    if (!survivor) return Response.json({ error: "Revise as escolhas do dossiê inicial." }, { status: 400 });
    let member = await findPlayer(campaignId, user.id, user.email);
    if (!member) return Response.json({ error: "Acesso à campanha encerrado." }, { status: 403 });
    if (!member.survivor_id) {
      await reservePlayerCharacter(campaignId, user.id, member.email, survivor.id);
      member = await findPlayer(campaignId, user.id, user.email);
    }
    if (!member?.survivor_id) return Response.json({ error: "Acesso à campanha encerrado." }, { status: 403 });
    survivor.id = member.survivor_id;
    for (let attempt = 0; attempt < 4; attempt++) {
      const data = await readCampaign(campaignId);
      if (data.state.survivors.some(s => s.id === survivor.id))
        return Response.json({ error: "Você já tem um sobrevivente. Atualize a página para abrir a ficha." }, { status: 409 });
      if (data.state.survivors.length >= 30) return Response.json({ error: "O registro de sobreviventes está cheio." }, { status: 409 });
      if (!await findPlayer(campaignId, user.id, user.email)) return Response.json({ error: "Acesso encerrado." }, { status: 403 });
      const next = structuredClone(data.state);
      next.survivors.push(survivor);
      addLog(next, "sobrevivente", `${survivor.name} entrou para a equipe.`, survivor.id);
      const revision = await writeCampaign(campaignId, next, data.revision);
      if (revision !== null) return Response.json({ revision, state: projectPlayerGame(next, survivor.id), survivorId: survivor.id },
        { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "A campanha mudou durante a criação. Tente salvar novamente." }, { status: 409 });
  } catch (error) {
    console.error("Falha ao criar sobrevivente", error);
    return Response.json({ error: "Não foi possível salvar seu sobrevivente. Tente novamente." }, { status: 503 });
  }
}
