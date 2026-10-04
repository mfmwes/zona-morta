import { campaignOwnerId, campaignPresentationVersion, clearCampaignPresentation, findPlayer, readCampaignPresentation, writeCampaignPresentation } from "@/db/state";
import { sameOrigin, siteUser } from "@/lib/auth";
import type { TablePresentation } from "@/lib/game";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

function requestedCampaign(request: Request) {
  return new URL(request.url).searchParams.get("campanha")?.trim() ?? "";
}

async function canRead(campaignId: string, request: Request) {
  const user = await siteUser(request);
  if (!user) return { ok: false as const, status: 401, error: "Acesso restrito." };
  const ownerId = await campaignOwnerId(campaignId);
  if (!ownerId) return { ok: false as const, status: 404, error: "Campanha não encontrada." };
  if (ownerId === user.id) return { ok: true as const, owner: true, user };
  const member = await findPlayer(campaignId, user.id, user.email);
  if (!member) return { ok: false as const, status: 403, error: "Acesso revogado." };
  return { ok: true as const, owner: false, user };
}

function validImage(value: unknown) {
  if (typeof value !== "string" || value.length < 1 || value.length > 100_000) return false;
  return /^https?:\/\//i.test(value) || /^data:image\/(?:webp|png|jpeg|jpg);base64,/i.test(value);
}

function validPresentation(value: unknown): value is TablePresentation {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<TablePresentation>;
  return typeof row.id === "string" && row.id.length > 0 && row.id.length <= 120
    && validImage(row.image)
    && (row.title === undefined || (typeof row.title === "string" && row.title.length <= 120))
    && (row.caption === undefined || (typeof row.caption === "string" && row.caption.length <= 500))
    && row.active === true;
}

export async function GET(request: Request) {
  try {
    const campaignId = requestedCampaign(request);
    if (!campaignId) return Response.json({ error: "Campanha inválida." }, { status: 400, headers: noStore });
    const access = await canRead(campaignId, request);
    if (!access.ok) return Response.json({ error: access.error }, { status: access.status, headers: noStore });

    const since = new URL(request.url).searchParams.get("since") ?? "";
    const version = await campaignPresentationVersion(campaignId);
    if (since && since === version) return Response.json({ changed: false, version }, { headers: noStore });

    return Response.json({
      changed: true,
      version,
      presentation: version === "none" ? undefined : await readCampaignPresentation(campaignId),
    }, { headers: noStore });
  } catch (error) {
    console.error("Falha ao ler apresentação da mesa", error);
    return Response.json({ error: "Não foi possível atualizar a apresentação da mesa." }, { status: 503, headers: noStore });
  }
}

export async function PUT(request: Request) {
  const user = await siteUser(request);
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 401, headers: noStore });
  if (!sameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403, headers: noStore });
  try {
    const campaignId = requestedCampaign(request);
    if (!campaignId || await campaignOwnerId(campaignId) !== user.id)
      return Response.json({ error: "Somente o mestre pode apresentar imagens." }, { status: 403, headers: noStore });

    const raw = await request.text();
    if (raw.length > 110_000) return Response.json({ error: "Imagem grande demais para apresentação." }, { status: 413, headers: noStore });
    const payload = JSON.parse(raw) as unknown;
    if (!validPresentation(payload))
      return Response.json({ error: "Dados da apresentação inválidos." }, { status: 400, headers: noStore });

    const version = await writeCampaignPresentation(campaignId, payload);
    return Response.json({ version, presentation: payload }, { headers: noStore });
  } catch (error) {
    console.error("Falha ao salvar apresentação da mesa", error);
    return Response.json({ error: "Não foi possível exibir a imagem. Tente novamente." }, { status: 503, headers: noStore });
  }
}

export async function DELETE(request: Request) {
  const user = await siteUser(request);
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 401, headers: noStore });
  if (!sameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403, headers: noStore });
  try {
    const campaignId = requestedCampaign(request);
    if (!campaignId || await campaignOwnerId(campaignId) !== user.id)
      return Response.json({ error: "Somente o mestre pode encerrar a apresentação." }, { status: 403, headers: noStore });
    const version = await clearCampaignPresentation(campaignId);
    return Response.json({ version }, { headers: noStore });
  } catch (error) {
    console.error("Falha ao encerrar apresentação da mesa", error);
    return Response.json({ error: "Não foi possível encerrar a apresentação." }, { status: 503, headers: noStore });
  }
}
