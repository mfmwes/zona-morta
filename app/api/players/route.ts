import { listPlayers, removePlayer, rotateCampaignInvite } from "@/db/state";
import { sameOrigin, siteUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const user = await siteUser(request);
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 401 });
  try { return Response.json({ players: await listPlayers(user.id) }, { headers: noStore }); }
  catch { return Response.json({ error: "Não foi possível abrir os convites." }, { status: 503 }); }
}

export async function POST(request: Request) {
  const user = await siteUser(request);
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  try {
    const code = await rotateCampaignInvite(user.id);
    return Response.json({ code }, { headers: noStore });
  } catch (error) {
    console.error("Falha ao convidar jogador", error);
    return Response.json({ error: "Não foi possível salvar o convite." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const user = await siteUser(request);
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  try {
    const input = await request.json() as { email?: string };
    const email = input.email?.trim().toLowerCase() ?? "";
    if (!email || email.length > 254) return Response.json({ error: "E-mail inválido." }, { status: 400 });
    await removePlayer(user.id, email);
    return Response.json({ players: await listPlayers(user.id) }, { headers: noStore });
  } catch { return Response.json({ error: "Não foi possível remover o convite." }, { status: 503 }); }
}
