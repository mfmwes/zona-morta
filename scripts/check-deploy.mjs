import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const id = config.d1_databases?.find(entry => entry.binding === "DB")?.database_id;
if (!id || id === "00000000-0000-4000-8000-000000000000") {
  throw new Error("Crie o banco D1 e substitua database_id em wrangler.jsonc antes de publicar.");
}
