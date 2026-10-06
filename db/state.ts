import { env } from "cloudflare:workers";
import { addLog, defaultState, normalizeSurvivorAmmunition, type GameState, type Survivor, type TablePresentation } from "@/lib/game";
import { preserveKnownSectors } from "@/lib/sectors";
import { normalizeShelter } from "@/lib/shelter-projects";
import { randomToken, tokenHash } from "@/lib/auth";
import { notifyCampaignChanged } from "./campaign-live";

type Row = { revision: number; body: string };
type PresentationRow = { id: string; image: string; title: string | null; caption: string | null; active: number; updated_at: string };
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

type AccountCharacterRow = {
  user_id: string;
  survivor_id: string;
  campaign_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  campaign_name: string | null;
  campaign_archived_at: string | null;
};

export type AccountCharacterSummary = {
  id: string;
  campaignId: string;
  campaignName: string;
  campaignArchived: boolean;
  name: string;
  archetype: string;
  specialty: string;
  level: number;
  portrait?: string;
  updatedAt: string;
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
    await db.prepare(`CREATE TABLE IF NOT EXISTS user_characters (
      user_id text NOT NULL,
      survivor_id text NOT NULL,
      campaign_id text NOT NULL,
      body text NOT NULL,
      created_at text NOT NULL,
      updated_at text NOT NULL,
      PRIMARY KEY (user_id, survivor_id)
    )`).run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_user_characters_user ON user_characters (user_id, updated_at)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_user_characters_campaign ON user_characters (campaign_id)").run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS campaign_presentations (
      owner_id text PRIMARY KEY NOT NULL,
      id text NOT NULL,
      image text NOT NULL,
      title text,
      caption text,
      active integer NOT NULL DEFAULT 1,
      updated_at text NOT NULL
    )`).run();
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

export async function campaignRevision(campaignId: string) {
  const row = await database().prepare("SELECT revision FROM campaign_states WHERE owner_id = ?")
    .bind(campaignId).first<{ revision: number }>();
  return row?.revision ?? null;
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
  const state = preserveKnownSectors(JSON.parse(row.body) as GameState);
  // O JSON pode trazer um ID legado ou de outra campanha após uma importação.
  // As ações do jogador devem sempre usar a identidade do registro aberto.
  state.campaignId = campaignId;
  // Apresentações antigas ficavam dentro do JSON principal e podiam tornar
  // toda leitura/projeção da campanha pesada. Migre uma vez para a tabela leve.
  const legacyPresentation = state.presentation;
  if (legacyPresentation?.image) {
    try {
      const existing = await db.prepare("SELECT 1 FROM campaign_presentations WHERE owner_id = ?").bind(campaignId).first();
      if (!existing) await writeCampaignPresentation(campaignId, legacyPresentation);
    } catch (error) {
      console.error("Falha ao migrar apresentação legada", error);
    }
  }
  delete state.presentation;
  normalizeShelter(state.shelter);
  for (const site of state.formerShelters ?? []) normalizeShelter(site);
  for (const survivor of state.survivors) {
    survivor.outfit ??= "";
    survivor.transport ??= "";
  }
  return { revision: row.revision, state };
}

export async function writeCampaign(campaignId: string, state: GameState, expectedRevision: number) {
  await ensureCampaignSchema();
  const now = new Date().toISOString();
  // A imagem apresentada à mesa é persistida separadamente. Nunca volte a
  // incorporar esse payload ao corpo principal da campanha.
  const persisted = { ...state, campaignId };
  delete persisted.presentation;
  delete persisted.publicConflict;
  delete persisted.publicShelterCommunity;
  const body = JSON.stringify(persisted);
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
  await notifyCampaignChanged(campaignId);
  try {
    await syncCampaignAccountCharacters(campaignId, persisted);
  } catch (error) {
    // O estado principal já foi salvo. A cópia da conta é redundante e será
    // tentada novamente no próximo salvamento, sem transformar sucesso em conflito.
    console.error("Falha ao sincronizar sobreviventes da conta", error);
  }
  return expectedRevision + 1;
}

export async function syncCampaignAccountCharacters(campaignId: string, state: GameState) {
  await ensureCampaignSchema();
  const db = database();
  const campaign = await db.prepare("SELECT owner_id FROM campaigns WHERE id = ?")
    .bind(campaignId).first<{ owner_id: string }>();
  if (!campaign) return;

  const [players, saved] = await Promise.all([
    db.prepare(
      "SELECT user_id, survivor_id FROM campaign_players WHERE owner_id = ? AND user_id IS NOT NULL AND survivor_id IS NOT NULL"
    ).bind(campaignId).all<{ user_id: string; survivor_id: string }>(),
    db.prepare(
      "SELECT user_id, survivor_id, body FROM user_characters WHERE campaign_id = ?"
    ).bind(campaignId).all<{ user_id: string; survivor_id: string; body: string }>(),
  ]);
  const playerOwners = new Map(players.results.map(row => [row.survivor_id, row.user_id]));
  const savedBySurvivor = new Map<string, { user_id: string; body: string }[]>();
  for (const row of saved.results) {
    savedBySurvivor.set(row.survivor_id, [...(savedBySurvivor.get(row.survivor_id) ?? []), { user_id: row.user_id, body: row.body }]);
  }

  const now = new Date().toISOString();
  const statements = [];
  for (const survivor of state.survivors) {
    const userId = playerOwners.get(survivor.id) ?? campaign.owner_id;
    const body = JSON.stringify(survivor);
    const existing = savedBySurvivor.get(survivor.id) ?? [];
    const current = existing.find(row => row.user_id === userId);
    const staleOwners = existing.filter(row => row.user_id !== userId);

    if (staleOwners.length) {
      statements.push(
        db.prepare("DELETE FROM user_characters WHERE campaign_id = ? AND survivor_id = ? AND user_id <> ?")
          .bind(campaignId, survivor.id, userId)
      );
    }
    if (!current || current.body !== body) {
      statements.push(
        db.prepare(`INSERT INTO user_characters (user_id, survivor_id, campaign_id, body, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, survivor_id) DO UPDATE SET
            campaign_id = excluded.campaign_id,
            body = excluded.body,
            updated_at = excluded.updated_at`)
          .bind(userId, survivor.id, campaignId, body, now, now)
      );
    }
  }
  if (statements.length) await db.batch(statements);
}

export async function listAccountCharacters(userId: string): Promise<AccountCharacterSummary[]> {
  await ensureCampaignSchema();
  const db = database();

  // Migração preguiçosa: contas existentes ganham a biblioteca sem exigir que
  // o usuário edite cada campanha primeiro.
  const legacy = await db.prepare(`
    SELECT DISTINCT c.id AS campaign_id, cs.body AS body
    FROM campaigns c
    JOIN campaign_states cs ON cs.owner_id = c.id
    LEFT JOIN campaign_players cp ON cp.owner_id = c.id
    WHERE c.owner_id = ? OR cp.user_id = ?
  `).bind(userId, userId).all<{ campaign_id: string; body: string }>();
  for (const row of legacy.results) {
    try {
      const state = JSON.parse(row.body) as GameState;
      if (state && Array.isArray(state.survivors)) await syncCampaignAccountCharacters(row.campaign_id, state);
    } catch { /* Uma campanha inválida não bloqueia as demais fichas da conta. */ }
  }

  const result = await db.prepare(`
    SELECT uc.user_id, uc.survivor_id, uc.campaign_id, uc.body, uc.created_at, uc.updated_at,
      c.name AS campaign_name, c.archived_at AS campaign_archived_at
    FROM user_characters uc
    LEFT JOIN campaigns c ON c.id = uc.campaign_id
    WHERE uc.user_id = ?
    ORDER BY uc.updated_at DESC
  `).bind(userId).all<AccountCharacterRow>();

  return result.results.flatMap(row => {
    try {
      const survivor = JSON.parse(row.body) as Survivor;
      if (!survivor || typeof survivor.id !== "string" || typeof survivor.name !== "string") return [];
      return [{
        id: row.survivor_id,
        campaignId: row.campaign_id,
        campaignName: row.campaign_name ?? "Campanha arquivada",
        campaignArchived: Boolean(row.campaign_archived_at),
        name: survivor.name,
        archetype: survivor.archetype,
        specialty: survivor.specialty,
        level: Math.max(1, survivor.level ?? 1),
        ...(survivor.portrait ? { portrait: survivor.portrait } : {}),
        updatedAt: row.updated_at,
      }];
    } catch {
      return [];
    }
  });
}

export async function readAccountCharacter(userId: string, survivorId: string) {
  await ensureCampaignSchema();
  const row = await database().prepare(
    "SELECT body FROM user_characters WHERE user_id = ? AND survivor_id = ?"
  ).bind(userId, survivorId).first<{ body: string }>();
  if (!row) return null;
  try {
    return JSON.parse(row.body) as Survivor;
  } catch {
    return null;
  }
}

export async function restoreAccountCharacterToCampaign(campaignId: string, userId: string, survivorId: string, state: GameState) {
  if (state.survivors.some(person => person.id === survivorId)) return false;
  await ensureCampaignSchema();
  const row = await database().prepare(
    "SELECT body FROM user_characters WHERE user_id = ? AND survivor_id = ? AND campaign_id = ?"
  ).bind(userId, survivorId, campaignId).first<{ body: string }>();
  if (!row) return false;
  try {
    const survivor = JSON.parse(row.body) as Survivor;
    if (!survivor || survivor.id !== survivorId || typeof survivor.name !== "string") return false;
    normalizeSurvivorAmmunition(survivor);
    survivor.hex = survivor.hex && state.hexes[survivor.hex] ? survivor.hex : state.partyHex;
    delete survivor.restPlan;
    delete survivor.ammoSpentScene;
    delete survivor.ammoSpentType;
    delete survivor.ammoSpentTypes;
    state.survivors.push(survivor);
    addLog(state, "sobrevivente", `${survivor.name} foi restaurado da cópia salva na conta.`, survivor.id);
    return true;
  } catch {
    return false;
  }
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


function presentationFromRow(row: PresentationRow | null): TablePresentation | undefined {
  if (!row) return undefined;
  return {
    id: row.id,
    image: row.image,
    ...(row.title ? { title: row.title } : {}),
    ...(row.caption ? { caption: row.caption } : {}),
    active: Boolean(row.active),
  };
}

export async function campaignPresentationVersion(campaignId: string) {
  await ensureCampaignSchema();
  const row = await database().prepare(
    "SELECT id, active, updated_at FROM campaign_presentations WHERE owner_id = ?"
  ).bind(campaignId).first<{ id: string; active: number; updated_at: string }>();
  return row ? `${row.id}:${row.active}:${row.updated_at}` : "none";
}

export async function readCampaignPresentation(campaignId: string) {
  await ensureCampaignSchema();
  const row = await database().prepare(
    "SELECT id, image, title, caption, active, updated_at FROM campaign_presentations WHERE owner_id = ?"
  ).bind(campaignId).first<PresentationRow>();
  return presentationFromRow(row);
}

export async function writeCampaignPresentation(campaignId: string, presentation: TablePresentation) {
  await ensureCampaignSchema();
  const now = new Date().toISOString();
  await database().prepare(`INSERT INTO campaign_presentations (owner_id, id, image, title, caption, active, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_id) DO UPDATE SET
      id = excluded.id,
      image = excluded.image,
      title = excluded.title,
      caption = excluded.caption,
      active = excluded.active,
      updated_at = excluded.updated_at`)
    .bind(campaignId, presentation.id, presentation.image, presentation.title ?? null, presentation.caption ?? null,
      presentation.active ? 1 : 0, now).run();
  await notifyCampaignChanged(campaignId);
  return `${presentation.id}:${presentation.active ? 1 : 0}:${now}`;
}

export async function clearCampaignPresentation(campaignId: string) {
  await ensureCampaignSchema();
  await database().prepare("DELETE FROM campaign_presentations WHERE owner_id = ?").bind(campaignId).run();
  await notifyCampaignChanged(campaignId);
  return "none";
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
  await notifyCampaignChanged(campaignId);
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
  await notifyCampaignChanged(campaignId);
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
    if (result.meta.changes) await notifyCampaignChanged(campaignId);
    return Boolean(result.meta.changes);
  } catch { return false; }
}

export async function removePlayer(campaignId: string, email: string) {
  await database().prepare("UPDATE campaign_players SET revoked_at = ? WHERE owner_id = ? AND email = ?")
    .bind(new Date().toISOString(), campaignId, email).run();
  await notifyCampaignChanged(campaignId);
}
