import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const campaignStates = sqliteTable("campaign_states", {
  ownerId: text("owner_id").primaryKey(),
  revision: integer("revision").notNull().default(1),
  body: text("body").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const campaignPlayers = sqliteTable("campaign_players", {
  ownerId: text("owner_id").notNull(),
  email: text("email").notNull(),
  userId: text("user_id"),
  survivorId: text("survivor_id"),
  createdAt: text("created_at").notNull(),
  revokedAt: text("revoked_at"),
}, table => [
  primaryKey({ columns: [table.ownerId, table.email] }),
  uniqueIndex("idx_campaign_players_character").on(table.ownerId, table.survivorId),
  uniqueIndex("idx_campaign_players_user").on(table.ownerId, table.userId),
]);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  recoveryHash: text("recovery_hash"),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const campaignInvites = sqliteTable("campaign_invites", {
  ownerId: text("owner_id").primaryKey(),
  codeHash: text("code_hash").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const authAttempts = sqliteTable("auth_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: text("reset_at").notNull(),
});
