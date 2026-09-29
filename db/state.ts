import { env } from "cloudflare:workers";
import { defaultState, type GameState } from "@/lib/game";
import { preserveKnownSectors } from "@/lib/sectors";
import { randomToken, tokenHash } from "@/lib/auth";

type Row = { revision: number; body: string };

function database() {
  if (!env.DB) throw new Error("O registro da campanha está indisponível.");
  return env.DB;
}

export async function readCampaign(ownerId: string) {
  const db = database();
  let row = await db.prepare(
    "SELECT revision, body FROM campaign_states WHERE owner_id = ?"
  ).bind(ownerId).first<Row>();
  if (!row) {
    const initial = defaultState();
    await db.prepare(
      "INSERT OR IGNORE INTO campaign_states (owner_id, revision, body, updated_at) VALUES (?, 1, ?, ?)"
    ).bind(ownerId, JSON.stringify(initial), new Date().toISOString()).run();
    row = await db.prepare(
      "SELECT revision, body FROM campaign_states WHERE owner_id = ?"
    ).bind(ownerId).first<Row>();
  }
  if (!row) throw new Error("Falha ao iniciar campanha.");
  return { revision: row.revision, state: preserveKnownSectors(JSON.parse(row.body) as GameState) };
}

export async function writeCampaign(ownerId: string, state: GameState, expectedRevision: number) {
  const now = new Date().toISOString();
  const body = JSON.stringify(state);
  const db = database();
  const result = expectedRevision === 0
    ? await db.prepare(
        "INSERT OR IGNORE INTO campaign_states (owner_id, revision, body, updated_at) VALUES (?, 1, ?, ?)"
      ).bind(ownerId, body, now).run()
    : await db.prepare(
        "UPDATE campaign_states SET revision = revision + 1, body = ?, updated_at = ? WHERE owner_id = ? AND revision = ?"
      ).bind(body, now, ownerId, expectedRevision).run();
  if (!result.meta.changes) return null;
  return expectedRevision + 1;
}

export type PlayerRow = { email: string; user_id: string | null; survivor_id: string | null; created_at: string };

export async function campaignExists(ownerId: string) {
  return Boolean(await database().prepare("SELECT 1 FROM campaign_states WHERE owner_id = ?")
    .bind(ownerId).first());
}

export async function defaultCampaignOwner(userId: string, email: string) {
  void email;
  return userId;
}

export async function listPlayers(ownerId: string) {
  const result = await database().prepare(
    "SELECT email, user_id, survivor_id, created_at FROM campaign_players WHERE owner_id = ? AND revoked_at IS NULL ORDER BY created_at"
  ).bind(ownerId).all<PlayerRow>();
  return result.results;
}

export async function findPlayer(ownerId: string, userId: string, email: string) {
  void email;
  return database().prepare(
    "SELECT email, user_id, survivor_id, created_at FROM campaign_players WHERE owner_id = ? AND revoked_at IS NULL AND user_id = ? LIMIT 1"
  ).bind(ownerId, userId).first<PlayerRow>();
}

export async function wasRevoked(ownerId: string, userId: string, email: string) {
  return Boolean(await database().prepare(
    "SELECT 1 FROM campaign_players WHERE owner_id = ? AND revoked_at IS NOT NULL AND (user_id = ? OR email = ?)"
  ).bind(ownerId, userId, email).first());
}

export async function invitePlayer(ownerId: string, email: string, survivorId: string) {
  const db = database();
  const existing = await db.prepare(
    "SELECT user_id FROM campaign_players WHERE owner_id = ? AND email = ?"
  ).bind(ownerId, email).first<{ user_id: string | null }>();
  if (existing) {
    await db.prepare("UPDATE campaign_players SET survivor_id = ?, revoked_at = NULL WHERE owner_id = ? AND email = ?")
      .bind(survivorId, ownerId, email).run();
  } else {
    await db.prepare(
      "INSERT INTO campaign_players (owner_id, email, survivor_id, created_at) VALUES (?, ?, ?, ?)"
    ).bind(ownerId, email, survivorId, new Date().toISOString()).run();
  }
}

export async function rotateCampaignInvite(ownerId: string) {
  const code = randomToken();
  await database().prepare(
    "INSERT INTO campaign_invites (owner_id, code_hash, updated_at) VALUES (?, ?, ?) ON CONFLICT(owner_id) DO UPDATE SET code_hash = excluded.code_hash, updated_at = excluded.updated_at"
  ).bind(ownerId, await tokenHash(code), new Date().toISOString()).run();
  return code;
}

export async function joinCampaign(ownerId: string, userId: string, email: string, code: string) {
  const db = database();
  const found = await findPlayer(ownerId, userId, email);
  if (found) return found;
  if (await wasRevoked(ownerId, userId, email) || !/^[A-Za-z0-9_-]{43}$/.test(code)) return null;
  const invite = await db.prepare("SELECT 1 FROM campaign_invites WHERE owner_id = ? AND code_hash = ?")
    .bind(ownerId, await tokenHash(code)).first();
  if (!invite) return null;
  const count = await db.prepare("SELECT COUNT(*) AS total FROM campaign_players WHERE owner_id = ? AND revoked_at IS NULL")
    .bind(ownerId).first<{ total: number }>();
  if ((count?.total ?? 0) >= 12) return null;
  await db.prepare(
    "INSERT OR IGNORE INTO campaign_players (owner_id, email, user_id, survivor_id, created_at) VALUES (?, ?, ?, NULL, ?)"
  ).bind(ownerId, email, userId, new Date().toISOString()).run();
  return findPlayer(ownerId, userId, email);
}

export async function reservePlayerCharacter(ownerId: string, userId: string, email: string, characterId: string) {
  const result = await database().prepare(
    "UPDATE campaign_players SET survivor_id = ? WHERE owner_id = ? AND user_id = ? AND email = ? AND survivor_id IS NULL AND revoked_at IS NULL"
  ).bind(characterId, ownerId, userId, email).run();
  return Boolean(result.meta.changes);
}

export async function assignPlayerCharacter(ownerId: string, userId: string, survivorId: string) {
  try {
    const result = await database().prepare(
      "UPDATE campaign_players SET survivor_id = ? WHERE owner_id = ? AND user_id = ? AND survivor_id IS NULL AND revoked_at IS NULL"
    ).bind(survivorId, ownerId, userId).run();
    return Boolean(result.meta.changes);
  } catch { return false; }
}

export async function removePlayer(ownerId: string, email: string) {
  await database().prepare("UPDATE campaign_players SET revoked_at = ? WHERE owner_id = ? AND email = ?")
    .bind(new Date().toISOString(), ownerId, email).run();
}
