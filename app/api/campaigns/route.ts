import { archiveCampaign, createCampaign, listCampaignsForUser, renameCampaign } from "@/db/state";
import { sameOrigin, siteUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

function campaignName(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, 80);
}

export async function GET(request: Request) {
  const user = await siteUser(request);
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 401, headers: noStore });
  try {
    return Response.json({ campaigns: await listCampaignsForUser(user.id) }, { headers: noStore });
  } catch (error) {
    console.error("Falha ao listar campanhas", error);
    return Response.json({ error: "Não foi possível abrir seus dossiês." }, { status: 503, headers: noStore });
  }
}

export async function POST(request: Request) {
  const user = await siteUser(request);
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 401, headers: noStore });
  if (!sameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403, headers: noStore });
  try {
    const raw = await request.text();
    if (raw.length > 1000) return Response.json({ error: "Dados inválidos." }, { status: 400, headers: noStore });
    const input = raw ? JSON.parse(raw) as { name?: unknown } : {};
    const name = campaignName(input.name) || "Nova campanha";
    const campaign = await createCampaign(user.id, name);
    return Response.json({ campaign }, { status: 201, headers: noStore });
  } catch (error) {
    console.error("Falha ao criar campanha", error);
    return Response.json({ error: "Não foi possível criar a campanha." }, { status: 503, headers: noStore });
  }
}

export async function PATCH(request: Request) {
  const user = await siteUser(request);
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 401, headers: noStore });
  if (!sameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403, headers: noStore });
  try {
    const input = await request.json() as { id?: unknown; name?: unknown };
    const id = typeof input.id === "string" ? input.id.trim() : "";
    const name = campaignName(input.name);
    if (!id || !name) return Response.json({ error: "Informe o nome da campanha." }, { status: 400, headers: noStore });
    if (!await renameCampaign(id, user.id, name))
      return Response.json({ error: "Campanha não encontrada." }, { status: 404, headers: noStore });
    return Response.json({ renamed: true }, { headers: noStore });
  } catch (error) {
    console.error("Falha ao renomear campanha", error);
    return Response.json({ error: "Não foi possível renomear a campanha." }, { status: 503, headers: noStore });
  }
}

export async function DELETE(request: Request) {
  const user = await siteUser(request);
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 401, headers: noStore });
  if (!sameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403, headers: noStore });
  try {
    const input = await request.json() as { id?: unknown };
    const id = typeof input.id === "string" ? input.id.trim() : "";
    if (!id) return Response.json({ error: "Campanha inválida." }, { status: 400, headers: noStore });
    if (!await archiveCampaign(id, user.id))
      return Response.json({ error: "Campanha não encontrada." }, { status: 404, headers: noStore });
    return Response.json({ archived: true }, { headers: noStore });
  } catch (error) {
    console.error("Falha ao arquivar campanha", error);
    return Response.json({ error: "Não foi possível arquivar a campanha." }, { status: 503, headers: noStore });
  }
}
