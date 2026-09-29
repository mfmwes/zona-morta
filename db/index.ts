import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Banco D1 indisponível. Verifique a ligação DB em wrangler.jsonc."
    );
  }

  return drizzle(env.DB, { schema });
}
