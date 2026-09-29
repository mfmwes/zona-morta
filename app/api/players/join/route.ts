import { campaignExists, joinCampaign, wasRevoked } from "@/db/state";
import { sameOrigin, siteUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await siteUser(request);
  if (!user) return Response.json({ error: "Entre com sua conta para acessar a campanha." }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  try {
    const raw = await request.text();
    if (raw.length > 1000) return Response.json({ error: "Dados inválidos." }, { status: 400 });
    const input = JSON.parse(raw) as { ownerId?: unknown; code?: unknown };
    const owner = typeof input.ownerId === "string" ? input.ownerId.trim() : "";
    if (!owner || owner.length > 200 || owner === user.id || !user.email || !await campaignExists(owner))
      return Response.json({ error: "Este endereço de campanha não está disponível." }, { status: 404 });
    if (await wasRevoked(owner, user.id, user.email))
      return Response.json({ error: "Seu acesso a esta campanha foi encerrado pelo mestre." }, { status: 403 });
    const joined = await joinCampaign(owner, user.id, user.email, typeof input.code === "string" ? input.code : "");
    if (!joined) return Response.json({ error: "Não foi possível entrar. A campanha pode estar lotada; converse com o mestre." }, { status: 409 });
    return Response.json({ joined: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Falha ao entrar na campanha", error);
    return Response.json({ error: "Não foi possível entrar agora. Tente novamente." }, { status: 503 });
  }
}
