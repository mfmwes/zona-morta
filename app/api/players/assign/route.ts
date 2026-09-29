import { assignPlayerCharacter, campaignOwnerId, listPlayers, readCampaign } from "@/db/state";
import { sameOrigin, siteUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await siteUser(request);
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  try {
    const campaignId = new URL(request.url).searchParams.get("campanha")?.trim() ?? "";
    if (!campaignId || await campaignOwnerId(campaignId) !== user.id)
      return Response.json({ error: "Campanha inválida." }, { status: 403 });
    const raw = await request.text();
    if (raw.length > 1000) return Response.json({ error: "Dados inválidos." }, { status: 400 });
    const input = JSON.parse(raw) as { userId?: string; survivorId?: string };
    const players = await listPlayers(campaignId);
    if (!input.userId || !input.survivorId || !players.some(p => p.user_id === input.userId && !p.survivor_id) ||
        players.some(p => p.survivor_id === input.survivorId))
      return Response.json({ error: "Jogador ou ficha indisponível." }, { status: 409 });
    const campaign = await readCampaign(campaignId);
    if (!campaign.state.survivors.some(s => s.id === input.survivorId))
      return Response.json({ error: "Ficha não encontrada." }, { status: 404 });
    if (!await assignPlayerCharacter(campaignId, input.userId, input.survivorId))
      return Response.json({ error: "A ficha foi vinculada em outra janela. Atualize a lista." }, { status: 409 });
    return Response.json({ players: await listPlayers(campaignId) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Não foi possível vincular a ficha." }, { status: 503 });
  }
}
