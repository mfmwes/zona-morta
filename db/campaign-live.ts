import { env } from "cloudflare:workers";
import { siteUser, sameOrigin } from "@/lib/auth";
import { campaignOwnerId, findPlayer } from "@/db/state";

export async function campaignLiveConnection(request: Request) {
  if (request.method !== "GET" || !sameOrigin(request)) return new Response(null, { status: 403 });
  const user = await siteUser(request);
  if (!user) return new Response(null, { status: 401 });
  const campaignId = new URL(request.url).searchParams.get("campanha")?.trim();
  if (!campaignId) return new Response(null, { status: 400 });
  const owner = await campaignOwnerId(campaignId);
  if (!owner) return new Response(null, { status: 404 });
  if (owner !== user.id && !await findPlayer(campaignId, user.id, user.email)) return new Response(null, { status: 403 });
  if (!env.CAMPAIGN_LIVE) return new Response(null, { status: 503 });
  return env.CAMPAIGN_LIVE.get(env.CAMPAIGN_LIVE.idFromName(campaignId)).fetch(request);
}

export async function notifyCampaignChanged(campaignId: string) {
  try {
    if (!env.CAMPAIGN_LIVE) return;
    const hub = env.CAMPAIGN_LIVE.get(env.CAMPAIGN_LIVE.idFromName(campaignId));
    await hub.fetch("https://campaign-live/notify", { method: "POST" });
  } catch (error) {
    // Persistence already succeeded. The periodic reconciliation recovers a
    // missed notification without reporting a successful save as a failure.
    console.error("Falha ao notificar atualização da campanha", error);
  }
}
