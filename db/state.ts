import { env } from "cloudflare:workers";
import { defaultState, type GameState } from "@/lib/game";
import { preserveKnownSectors } from "@/lib/sectors";
import { randomToken, tokenHash } from "@/lib/auth";

type Row = { revision: number; body: string };
type CampaignMetaRow = {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};
type CampaignListRow = CampaignMetaRow & {
  role: "mestre" | "jogador";
  survivor_id: string | null;
  body: string | null;
};

export type CampaignSummary = {
  id: string;
  name: string;
  role: "mestre" | "jogador";
  survivorId: string | null;
  survivorName: string | null;
  day: number | null;
  updatedAt: string;
};

function database() {
  if (!env.DB) throw new Error("O registro da campanha está indisponível.");
  return env.DB;
}

let campaignSchemaReady: Promise<void> | null = null;
async function ensureCampaignSchema() {
  if (campaignSchemaReady) return campaignSchemaReady;
  campaignSchemaReady = (async () => {
    const db = database();
    await db.prepare(`CREATE TABLE IF NOT EXISTS campaigns (
      id text PRIMARY KEY NOT NULL,
      owner_id text NOT NULL,
      name text NOT NULL,
      created_at text NOT NULL,
      updated_at text NOT NULL,
      archived_at text
    )`).run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_campaigns_owner ON campaigns (owner_id, archived_at)").run();
    await db.prepare(`INSERT OR IGNORE INTO campaigns (id, owner_id, name, created_at, updated_at, archived_at)
      SELECT cs.owner_id, cs.owner_id, 'Campanha principal', COALESCE(u.created_at, cs.updated_at), cs.updated_at, NULL
      FROM campaign_states cs LEFT JOIN users u ON u.id = cs.owner_id`).run();
  })().catch(error => { campaignSchemaReady = null; throw error; });
  return campaignSchemaReady;
}

function campaignDisplay(row: CampaignListRow): CampaignSummary {
  let day: number | null = null;
  let survivorName: string | null = null;
  if (row.body) {
    try {
      const state = JSON.parse(row.body) as Partial<GameState>;
      day = Number.isInteger(state.day) ? state.day! : null;
      if (row.survivor_id && Array.isArray(state.survivors)) {
        survivorName = state.survivors.find(s => s.id === row.survivor_id)?.name ?? null;
      }
    } catch { /* Metadados de lista não devem impedir acesso à campanha. */ }
  }
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    survivorId: row.survivor_id,
    survivorName,
    day,
    updatedAt: row.updated_at,
  };
}

export async function readCampaign(campaignId: string) {
  await ensureCampaignSchema();
  const db = database();
  let row = await db.prepare(
    "SELECT revision, body FROM campaign_states WHERE owner_id = ?"
  ).bind(campaignId).first<Row>();
  if (!row) {
    const exists = await db.prepare("SELECT 1 FROM campaigns WHERE id = ? AND archived_at IS NULL")
      .bind(campaignId).first();
    if (!exists) throw new Error("Campanha não encontrada.");
    const initial = defaultState();
    initial.campaignId = campaignId;
    await db.prepare(
      "INSERT OR IGNORE INTO campaign_states (owner_id, revision, body, updated_at) VALUES (?, 1, ?, ?)"
    ).bind(campaignId, JSON.stringify(initial), new Date().toISOString()).run();
    row = await db.prepare(
      "SELECT revision, body FROM campaign_states WHERE owner_id = ?"
    ).bind(campaignId).first<Row>();
  }
  if (!row) throw new Error("Falha ao iniciar campanha.");
  return { revision: row.revision, state: preserveKnownSectors(JSON.parse(row.body) as GameState) };
}

export async function writeCampaign(campaignId: string, state: GameState, expectedRevision: number) {
  await ensureCampaignSchema();
  const now = new Date().toISOString();
  const body = JSON.stringify(state);
  const db = database();
  const result = expectedRevision === 0
    ? await db.prepare(
        "INSERT OR IGNORE INTO campaign_states (owner_id, revision, body, updated_at) VALUES (?, 1, ?, ?)"
      ).bind(campaignId, body, now).run()
    : await db.prepare(
        "UPDATE campaign_states SET revision = revision + 1, body = ?, updated_at = ? WHERE owner_id = ? AND revision = ?"
      ).bind(body, now, campaignId, expectedRevision).run();
  if (!result.meta.changes) return null;
  await db.prepare("UPDATE campaigns SET updated_at = ? WHERE id = ?").bind(now, campaignId).run();
  return expectedRevision + 1;
}

export type PlayerRow = { email: string; user_id: string | null; survivor_id: string | null; created_at: string };

export async function campaignExists(campaignId: string) {
  await ensureCampaignSchema();
  return Boolean(await database().prepare("SELECT 1 FROM campaigns WHERE id = ? AND archived_at IS NULL")
    .bind(campaignId).first());
}

export async function campaignOwnerId(campaignId: string) {
  await ensureCampaignSchema();
  const row = await database().prepare("SELECT owner_id FROM campaigns WHERE id = ? AND archived_at IS NULL")
    .bind(campaignId).first<{ owner_id: string }>();
  return row?.owner_id ?? null;
}

export async function listCampaignsForUser(userId: string) {
  await ensureCampaignSchema();
  const db = database();
  const result = await db.prepare(`
    SELECT c.id AS id, c.owner_id AS owner_id, c.name AS name, c.created_at AS created_at, c.updated_at AS updated_at, c.archived_at AS archived_at,
      'mestre' AS role, NULL AS survivor_id, cs.body AS body
    FROM campaigns c
    LEFT JOIN campaign_states cs ON cs.owner_id = c.id
    WHERE c.owner_id = ? AND c.archived_at IS NULL
    UNION ALL
    SELECT c.id AS id, c.owner_id AS owner_id, c.name AS name, c.created_at AS created_at, c.updated_at AS updated_at, c.archived_at AS archived_at,
      'jogador' AS role, cp.survivor_id AS survivor_id, cs.body AS body
    FROM campaign_players cp
    JOIN campaigns c ON c.id = cp.owner_id
    LEFT JOIN campaign_states cs ON cs.owner_id = c.id
    WHERE cp.user_id = ? AND cp.revoked_at IS NULL AND c.archived_at IS NULL
      AND c.owner_id <> ?
    ORDER BY 5 DESC
  `).bind(userId, userId, userId).all<CampaignListRow>();
  return result.results.map(campaignDisplay);
}

export async function createCampaign(ownerId: string, name: string) {
  await ensureCampaignSchema();
  const db = database();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const initial = defaultState();
  initial.campaignId = id;
  await db.batch([
    db.prepare("INSERT INTO campaigns (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .bind(id, ownerId, name, now, now),
    db.prepare("INSERT INTO campaign_states (owner_id, revision, body, updated_at) VALUES (?, 1, ?, ?)")
      .bind(id, JSON.stringify(initial), now),
  ]);
  return { id, name };
}

export async function renameCampaign(campaignId: string, ownerId: string, name: string) {
  await ensureCampaignSchema();
  const result = await database().prepare(
    "UPDATE campaigns SET name = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND archived_at IS NULL"
  ).bind(name, new Date().toISOString(), campaignId, ownerId).run();
  return Boolean(result.meta.changes);
}

export async function archiveCampaign(campaignId: string, ownerId: string) {
  await ensureCampaignSchema();
  const result = await database().prepare(
    "UPDATE campaigns SET archived_at = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND archived_at IS NULL"
  ).bind(new Date().toISOString(), new Date().toISOString(), campaignId, ownerId).run();
  return Boolean(result.meta.changes);
}

export async function listPlayers(campaignId: string) {
  const result = await database().prepare(
    "SELECT email, user_id, survivor_id, created_at FROM campaign_players WHERE owner_id = ? AND revoked_at IS NULL ORDER BY created_at"
  ).bind(campaignId).all<PlayerRow>();
  return result.results;
}

export async function findPlayer(campaignId: string, userId: string, email: string) {
  void email;
  return database().prepare(
    "SELECT email, user_id, survivor_id, created_at FROM campaign_players WHERE owner_id = ? AND revoked_at IS NULL AND user_id = ? LIMIT 1"
  ).bind(campaignId, userId).first<PlayerRow>();
}

export async function wasRevoked(campaignId: string, userId: string, email: string) {
  return Boolean(await database().prepare(
    "SELECT 1 FROM campaign_players WHERE owner_id = ? AND revoked_at IS NOT NULL AND (user_id = ? OR email = ?)"
  ).bind(campaignId, userId, email).first());
}

export async function invitePlayer(campaignId: string, email: string, survivorId: string) {
  const db = database();
  const existing = await db.prepare(
    "SELECT user_id FROM campaign_players WHERE owner_id = ? AND email = ?"
  ).bind(campaignId, email).first<{ user_id: string | null }>();
  if (existing) {
    await db.prepare("UPDATE campaign_players SET survivor_id = ?, revoked_at = NULL WHERE owner_id = ? AND email = ?")
      .bind(survivorId, campaignId, email).run();
  } else {
    await db.prepare(
      "INSERT INTO campaign_players (owner_id, email, survivor_id, created_at) VALUES (?, ?, ?, ?)"
    ).bind(campaignId, email, survivorId, new Date().toISOString()).run();
  }
}

export async function rotateCampaignInvite(campaignId: string) {
  const code = randomToken();
  await database().prepare(
    "INSERT INTO campaign_invites (owner_id, code_hash, updated_at) VALUES (?, ?, ?) ON CONFLICT(owner_id) DO UPDATE SET code_hash = excluded.code_hash, updated_at = excluded.updated_at"
  ).bind(campaignId, await tokenHash(code), new Date().toISOString()).run();
  return code;
}

export async function joinCampaign(campaignId: string, userId: string, email: string, code: string) {
  const db = database();
  const found = await findPlayer(campaignId, userId, email);
  if (found) return found;
  if (await wasRevoked(campaignId, userId, email) || !/^[A-Za-z0-9_-]{43}$/.test(code)) return null;
  const invite = await db.prepare("SELECT 1 FROM campaign_invites WHERE owner_id = ? AND code_hash = ?")
    .bind(campaignId, await tokenHash(code)).first();
  if (!invite) return null;
  const count = await db.prepare("SELECT COUNT(*) AS total FROM campaign_players WHERE owner_id = ? AND revoked_at IS NULL")
    .bind(campaignId).first<{ total: number }>();
  if ((count?.total ?? 0) >= 12) return null;
  await db.prepare(
    "INSERT OR IGNORE INTO campaign_players (owner_id, email, user_id, survivor_id, created_at) VALUES (?, ?, ?, NULL, ?)"
  ).bind(campaignId, email, userId, new Date().toISOString()).run();
  return findPlayer(campaignId, userId, email);
}

export async function reservePlayerCharacter(campaignId: string, userId: string, email: string, characterId: string) {
  const result = await database().prepare(
    "UPDATE campaign_players SET survivor_id = ? WHERE owner_id = ? AND user_id = ? AND email = ? AND survivor_id IS NULL AND revoked_at IS NULL"
  ).bind(characterId, campaignId, userId, email).run();
  return Boolean(result.meta.changes);
}

export async function assignPlayerCharacter(campaignId: string, userId: string, survivorId: string) {
  try {
    const result = await database().prepare(
      "UPDATE campaign_players SET survivor_id = ? WHERE owner_id = ? AND user_id = ? AND survivor_id IS NULL AND revoked_at IS NULL"
    ).bind(survivorId, campaignId, userId).run();
    return Boolean(result.meta.changes);
  } catch { return false; }
}

export async function removePlayer(campaignId: string, email: string) {
  await database().prepare("UPDATE campaign_players SET revoked_at = ? WHERE owner_id = ? AND email = ?")
    .bind(new Date().toISOString(), campaignId, email).run();
}
