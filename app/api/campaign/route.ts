import { campaignExists, campaignOwnerId, findPlayer, readCampaign, wasRevoked, writeCampaign } from "@/db/state";
import { sameOrigin, siteUser } from "@/lib/auth";
import { applyPlayerChange, projectPlayerGame, type PlayerLog } from "@/lib/collaboration";
import { ammunitionTypes, survivorStats, type AmmunitionType, type GameState, type Survivor } from "@/lib/game";
import { preserveKnownSectors } from "@/lib/sectors";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

function requestedCampaign(request: Request) {
  return new URL(request.url).searchParams.get("campanha")?.trim() ?? "";
}

function restPeers(state: GameState) {
  return state.survivors.map(person => {
    const stats = survivorStats(person);
    return {
      id: person.id,
      name: person.name,
      portrait: person.portrait,
      archetype: person.archetype,
      specialty: person.specialty,
      hex: person.hex ?? state.partyHex,
      infection: person.infection,
      hp: Math.max(0, stats.hp - person.hp),
      hpMax: stats.hp,
      stress: person.stress,
      hope: person.hope,
    };
  });
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
    && (state.npcs === undefined || (Array.isArray(state.npcs) && state.npcs.length <= 300
      && state.npcs.every(npc => npc && typeof npc.id === "string" && typeof npc.name === "string"
        && typeof npc.hex === "string" && Array.isArray(npc.skills))))
    && state.survivors.every(s => Number.isInteger(s.armorMarked) && s.armorMarked >= 0 && s.armorMarked <= 20
      && (s.hex === undefined || (typeof s.hex === "string" && Boolean(state.hexes?.[s.hex])))
      && (s.outfit === undefined || typeof s.outfit === "string")
      && (s.transport === undefined || typeof s.transport === "string")
      && (s.ammoSpentScene === undefined || (Number.isInteger(s.ammoSpentScene) && s.ammoSpentScene >= 1))
      && (s.ammoSpentType === undefined || typeof s.ammoSpentType === "string")
      && (s.ammoSpentTypes === undefined || (Array.isArray(s.ammoSpentTypes) && s.ammoSpentTypes.length <= ammunitionTypes.length
        && s.ammoSpentTypes.every(type => ammunitionTypes.includes(type as AmmunitionType)))))
    && Boolean(shelter && typeof shelter === "object")
    && (shelter?.ammoStocks === undefined || (typeof shelter.ammoStocks === "object" && shelter.ammoStocks !== null
      && Object.entries(shelter.ammoStocks).every(([key, value]) =>
        ammunitionTypes.includes(key as AmmunitionType)
        && Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 99)))
    && (shelter?.hex === undefined || shelter.hex === null ||
      (typeof shelter.hex === "string" && state.hexes?.[shelter.hex]?.discovery === "explorado"))
    && (shelter?.projects === undefined || (Array.isArray(shelter.projects) && shelter.projects.length <= 80
      && shelter.projects.every(project => project && typeof project.id === "string" && typeof project.key === "string"
        && typeof project.name === "string" && typeof project.state === "string"
        && Number.isInteger(project.progress) && Number.isInteger(project.requiredProgress)
        && Array.isArray(project.requiredCapabilities) && Array.isArray(project.effects))))
    && (shelter?.posts === undefined || (Array.isArray(shelter.posts) && shelter.posts.length <= 20
      && shelter.posts.every(post => post && typeof post.key === "string" && (post.helperIds === undefined || Array.isArray(post.helperIds)))))
    && Array.isArray(state.log) && state.log.length <= 200;
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
    const data = await readCampaign(campaignId);
    const state = preserveKnownSectors(data.state);
    const characterId = member.survivor_id && state.survivors.some(s => s.id === member.survivor_id) ? member.survivor_id : null;
    return Response.json({ revision: data.revision, state: projectPlayerGame(state, characterId ?? ""),
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
    if (raw.length > 400_000) return Response.json({ error: "Registro grande demais." }, { status: 413 });
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
    const payload = JSON.parse(raw) as { before?: Survivor; after?: Survivor; fearDelta?: number; noiseDelta?: number; logs?: PlayerLog[] };
    if (!payload.before || !payload.after || !Array.isArray(payload.logs))
      return Response.json({ error: "Alteração incompleta." }, { status: 400 });
    for (let attempt = 0; attempt < 4; attempt++) {
      const data = await readCampaign(campaignId);
      const next = applyPlayerChange(data.state, member.survivor_id, payload.before, payload.after,
        payload.fearDelta ?? 0, payload.logs, payload.noiseDelta ?? 0);
      if (!next) return Response.json({ error: "Sua ficha mudou em outra janela ou esta ação precisa ser registrada pelo mestre. Recarregue antes de tentar novamente." }, { status: 409 });
      const revision = await writeCampaign(campaignId, next, data.revision);
      if (revision !== null) return Response.json({ revision, state: projectPlayerGame(next, member.survivor_id), restPeers: restPeers(next) }, { headers: noStore });
    }
    return Response.json({ error: "A campanha foi atualizada durante esta ação. Tente salvar novamente." }, { status: 409 });
  } catch (error) {
    console.error("Falha ao registrar ação do jogador", error);
    return Response.json({ error: "Não foi possível registrar a ação. Tente novamente." }, { status: 503 });
  }
}
