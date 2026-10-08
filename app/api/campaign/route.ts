import { validState } from "@/lib/campaign-validation";
import { playerTeamPeers as restPeers } from "@/lib/player-preview";
import { applyPlayerSheetEdit, type SheetEditPayload } from "@/lib/player-sheet-edit";
import { campaignExists, campaignOwnerId, campaignRevision, findPlayer, readCampaign, restoreAccountCharacterToCampaign, wasRevoked, writeCampaign } from "@/db/state";
import { sameOrigin, siteUser } from "@/lib/auth";
import { projectPlayerGame } from "@/lib/collaboration";
import { preserveKnownSectors } from "@/lib/sectors";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

function requestedCampaign(request: Request) {
  return new URL(request.url).searchParams.get("campanha")?.trim() ?? "";
}


export async function GET(request: Request) {
  const user = await siteUser(request);
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 401 });
  try {
    const campaignId = requestedCampaign(request);
    if (!campaignId) return Response.json({ error: "Escolha uma campanha em Seus dossiês." }, { status: 400 });
    const ownerId = await campaignOwnerId(campaignId);
    if (!ownerId) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
    if (ownerId === user.id) {
      const since = new URL(request.url).searchParams.get("since");
      if (since !== null && Number(since) === await campaignRevision(campaignId))
        return Response.json({ revision: Number(since), role: "mestre", ownerId: campaignId }, { headers: noStore });
      const data = await readCampaign(campaignId);
      const state = preserveKnownSectors(data.state);
      return Response.json({ ...data, state, role: "mestre", ownerId: campaignId }, { headers: noStore });
    }
    const member = await findPlayer(campaignId, user.id, user.email);
    if (!member) {
      if (await wasRevoked(campaignId, user.id, user.email))
        return Response.json({ error: "Seu acesso a esta campanha foi encerrado pelo mestre." }, { status: 403 });
      if (await campaignExists(campaignId))
        return Response.json({ role: "convidado", ownerId: campaignId }, { headers: noStore });
      return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
    }
    const since = new URL(request.url).searchParams.get("since");
    if (since !== null && (new URL(request.url).searchParams.get("survivor") ?? "") === (member.survivor_id ?? "")
      && Number(since) === await campaignRevision(campaignId))
      return Response.json({ revision: Number(since), role: "jogador", ownerId: campaignId, survivorId: member.survivor_id }, { headers: noStore });
    const data = await readCampaign(campaignId);
    let state = preserveKnownSectors(data.state);
    let currentRevision = data.revision;
    if (member.survivor_id && !state.survivors.some(s => s.id === member.survivor_id)) {
      const recovered = structuredClone(state);
      if (await restoreAccountCharacterToCampaign(campaignId, user.id, member.survivor_id, recovered)) {
        const savedRevision = await writeCampaign(campaignId, recovered, data.revision);
        if (savedRevision !== null) {
          state = recovered;
          currentRevision = savedRevision;
        }
      }
    }
    const characterId = member.survivor_id && state.survivors.some(s => s.id === member.survivor_id) ? member.survivor_id : null;
    return Response.json({ revision: currentRevision, state: projectPlayerGame(state, characterId ?? ""),
      role: "jogador", ownerId: campaignId, survivorId: characterId, restPeers: restPeers(state) }, { headers: noStore });
  } catch (error) {
    console.error("Falha ao ler campanha", error);
    return Response.json({ error: "Não foi possível carregar o registro. Tente novamente." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const user = await siteUser(request);
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  try {
    const campaignId = requestedCampaign(request);
    if (!campaignId || await campaignOwnerId(campaignId) !== user.id)
      return Response.json({ error: "Somente o mestre pode alterar a campanha inteira." }, { status: 403 });
    const raw = await request.text();
    // Leave room under the database's 2 MB row limit, including multibyte text.
    if (new TextEncoder().encode(raw).byteLength > 1_800_000) return Response.json({ error: "Registro grande demais." }, { status: 413 });
    const payload = JSON.parse(raw) as { revision?: number; state?: unknown };
    if (!Number.isInteger(payload.revision) || (payload.revision ?? -1) < 0 || !validState(payload.state))
      return Response.json({ error: "Dados da campanha inválidos." }, { status: 400 });
    const revision = await writeCampaign(campaignId, preserveKnownSectors(payload.state), payload.revision!);
    if (revision === null) return Response.json({ error: "A campanha mudou em outra janela. Recarregue antes de salvar." }, { status: 409 });
    return Response.json({ revision });
  } catch (error) {
    console.error("Falha ao salvar campanha", error);
    return Response.json({ error: "Não foi possível salvar. Seus dados continuam nesta tela; tente novamente." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const user = await siteUser(request);
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  try {
    const campaignId = requestedCampaign(request);
    if (!campaignId) return Response.json({ error: "Campanha inválida." }, { status: 400 });
    if (await campaignOwnerId(campaignId) === user.id) return Response.json({ error: "Use o registro do mestre." }, { status: 400 });
    const member = await findPlayer(campaignId, user.id, user.email);
    if (!member) return Response.json({ error: "Acesso revogado." }, { status: 403 });
    if (!member.survivor_id) return Response.json({ error: "Crie seu sobrevivente antes de editar a ficha." }, { status: 409 });
    const raw = await request.text();
    if (raw.length > 150_000) return Response.json({ error: "Alteração grande demais." }, { status: 413 });
    const payload = JSON.parse(raw) as SheetEditPayload;
    if (!payload.before || !payload.after || !Array.isArray(payload.logs))
      return Response.json({ error: "Alteração incompleta." }, { status: 400 });
    for (let attempt = 0; attempt < 4; attempt++) {
      const data = await readCampaign(campaignId);
      const editResult = await applyPlayerSheetEdit(data.state, member.survivor_id, payload);
      if (!editResult.ok) return Response.json({ error: editResult.error }, { status: 409 });
      const next = editResult.state;
      if (editResult.replay) return Response.json({ revision: data.revision, state: projectPlayerGame(next, member.survivor_id), restPeers: restPeers(next) }, { headers: noStore });
      const revision = await writeCampaign(campaignId, next, data.revision);
      if (revision !== null) return Response.json({ revision, state: projectPlayerGame(next, member.survivor_id), restPeers: restPeers(next) }, { headers: noStore });
    }
    return Response.json({ error: "A campanha foi atualizada durante esta ação. Tente salvar novamente." }, { status: 409 });
  } catch (error) {
    console.error("Falha ao registrar ação do jogador", error);
    return Response.json({ error: "Não foi possível registrar a ação. Tente novamente." }, { status: 503 });
  }
}
