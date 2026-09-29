import { campaignExists, defaultCampaignOwner, findPlayer, readCampaign, wasRevoked, writeCampaign } from "@/db/state";
import { sameOrigin, siteUser } from "@/lib/auth";
import { applyPlayerChange, projectPlayerGame, type PlayerLog } from "@/lib/collaboration";
import type { GameState, Survivor } from "@/lib/game";
import { preserveKnownSectors } from "@/lib/sectors";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

async function campaignOwner(request: Request, user: { id: string; email: string }) {
  return new URL(request.url).searchParams.get("campanha")?.trim()
    || await defaultCampaignOwner(user.id, user.email);
}

function validState(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<GameState>;
  const shelter = state.shelter as Partial<GameState["shelter"]> | undefined;
  return Number.isInteger(state.day) && state.day! > 0 && state.day! < 100000
    && Number.isInteger(state.minutes) && state.minutes! >= 0 && state.minutes! < 1440
    && Number.isInteger(state.fear) && state.fear! >= 0 && state.fear! <= 12
    && Number.isInteger(state.noise) && state.noise! >= 0 && state.noise! <= 5
    && typeof state.partyHex === "string" && /^-?\d+,-?\d+$/.test(state.partyHex)
    && Boolean(state.hexes && typeof state.hexes === "object")
    && Array.isArray(state.survivors) && state.survivors.length <= 30
    && state.survivors.every(s => Number.isInteger(s.armorMarked) && s.armorMarked >= 0 && s.armorMarked <= 20)
    && Boolean(shelter && typeof shelter === "object")
    && (shelter?.hex === undefined || shelter.hex === null ||
      (typeof shelter.hex === "string" && state.hexes?.[shelter.hex]?.discovery === "explorado"))
    && Array.isArray(state.log) && state.log.length <= 200;
}

export async function GET(request: Request) {
  const user = await siteUser(request);
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 401 });
  try {
    const owner = await campaignOwner(request, user);
    if (owner === user.id) {
      const data = await readCampaign(owner);
      return Response.json({ ...data, role: "mestre", ownerId: owner }, { headers: noStore });
    }
    const member = await findPlayer(owner, user.id, user.email);
    if (!member) {
      if (await wasRevoked(owner, user.id, user.email))
        return Response.json({ error: "Seu acesso a esta campanha foi encerrado pelo mestre." }, { status: 403 });
      const explicit = new URL(request.url).searchParams.get("campanha")?.trim();
      if (explicit === owner && await campaignExists(owner))
        return Response.json({ role: "convidado", ownerId: owner }, { headers: noStore });
      return Response.json({ error: "Abra o link de acesso enviado pelo mestre para entrar na campanha." }, { status: 403 });
    }
    const data = await readCampaign(owner);
    const characterId = member.survivor_id && data.state.survivors.some(s => s.id === member.survivor_id) ? member.survivor_id : null;
    return Response.json({ revision: data.revision, state: projectPlayerGame(data.state, characterId ?? ""),
      role: "jogador", ownerId: owner, survivorId: characterId }, { headers: noStore });
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
    if (await campaignOwner(request, user) !== user.id)
      return Response.json({ error: "Somente o mestre pode alterar a campanha inteira." }, { status: 403 });
    const raw = await request.text();
    if (raw.length > 400_000) return Response.json({ error: "Registro grande demais." }, { status: 413 });
    const payload = JSON.parse(raw) as { revision?: number; state?: unknown };
    if (!Number.isInteger(payload.revision) || (payload.revision ?? -1) < 0 || !validState(payload.state))
      return Response.json({ error: "Dados da campanha inválidos." }, { status: 400 });
    const revision = await writeCampaign(user.id, preserveKnownSectors(payload.state), payload.revision!);
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
    const owner = await campaignOwner(request, user);
    if (owner === user.id) return Response.json({ error: "Use o registro do mestre." }, { status: 400 });
    const member = await findPlayer(owner, user.id, user.email);
    if (!member) return Response.json({ error: "Acesso revogado." }, { status: 403 });
    if (!member.survivor_id) return Response.json({ error: "Crie seu sobrevivente antes de editar a ficha." }, { status: 409 });
    const raw = await request.text();
    if (raw.length > 150_000) return Response.json({ error: "Alteração grande demais." }, { status: 413 });
    const payload = JSON.parse(raw) as { before?: Survivor; after?: Survivor; fearDelta?: number; logs?: PlayerLog[] };
    if (!payload.before || !payload.after || !Array.isArray(payload.logs))
      return Response.json({ error: "Alteração incompleta." }, { status: 400 });
    for (let attempt = 0; attempt < 4; attempt++) {
      const data = await readCampaign(owner);
      const next = applyPlayerChange(data.state, member.survivor_id, payload.before, payload.after,
        payload.fearDelta ?? 0, payload.logs);
      if (!next) return Response.json({ error: "Sua ficha mudou em outra janela ou esta ação precisa ser registrada pelo mestre. Recarregue antes de tentar novamente." }, { status: 409 });
      const revision = await writeCampaign(owner, next, data.revision);
      if (revision !== null) return Response.json({ revision, state: projectPlayerGame(next, member.survivor_id) }, { headers: noStore });
    }
    return Response.json({ error: "A campanha foi atualizada durante esta ação. Tente salvar novamente." }, { status: 409 });
  } catch (error) {
    console.error("Falha ao registrar ação do jogador", error);
    return Response.json({ error: "Não foi possível registrar a ação. Tente novamente." }, { status: 503 });
  }
}
