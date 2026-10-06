import handler from "vinext/server/fetch-handler";
import { campaignLiveConnection } from "../db/campaign-live";

export { CampaignLive } from "./campaign-live";

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    if (new URL(request.url).pathname === "/api/campaign/live") return campaignLiveConnection(request);
    return handler.fetch(request, env, ctx);
  },
};
export default worker;
