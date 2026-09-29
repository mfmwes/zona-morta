import { env } from "cloudflare:workers";

const COOKIE = "zm_session";
const SESSION_DAYS = 30;
const ITERATIONS = 100_000;
const encoder = new TextEncoder();

function database() {
  if (!env.DB) throw new Error("Banco de dados indisponível.");
  return env.DB;
}

function base64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64url(value: string) {
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export function randomToken() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function tokenHash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return base64url(new Uint8Array(digest));
}

async function derivePassword(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: ITERATIONS }, key, 256);
  return base64url(new Uint8Array(bits));
}

export async function passwordHash(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256:${ITERATIONS}:${base64url(salt)}:${await derivePassword(password, salt)}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [method, iterations, salt, expected] = encoded.split(":");
  if (method !== "pbkdf2-sha256" || iterations !== String(ITERATIONS) || !salt || !expected) return false;
  const actual = await derivePassword(password, fromBase64url(salt));
  const a = encoder.encode(actual), b = encoder.encode(expected);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

export type SiteUser = { id: string; email: string };

export async function siteUser(request: Request): Promise<SiteUser | null> {
  const cookie = request.headers.get("cookie")?.split(";").map(item => item.trim())
    .find(item => item.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!cookie || !/^[A-Za-z0-9_-]{43}$/.test(cookie)) return null;
  const hash = await tokenHash(cookie);
  const row = await database().prepare(
    "SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?"
  ).bind(hash, new Date().toISOString()).first<SiteUser>();
  return row ?? null;
}

export async function createSession(userId: string) {
  const token = randomToken();
  const expiry = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await database().prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(await tokenHash(token), userId, expiry, new Date().toISOString()).run();
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}`;
}

export async function destroySession(request: Request) {
  const cookie = request.headers.get("cookie")?.split(";").map(item => item.trim())
    .find(item => item.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (cookie && /^[A-Za-z0-9_-]{43}$/.test(cookie))
    await database().prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await tokenHash(cookie)).run();
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function allowAttempt(key: string, limit: number, durationMs: number) {
  const now = new Date(), reset = new Date(now.getTime() + durationMs).toISOString();
  const row = await database().prepare("SELECT count, reset_at FROM auth_attempts WHERE key = ?")
    .bind(key).first<{ count: number; reset_at: string }>();
  if (!row || row.reset_at <= now.toISOString()) {
    await database().prepare("INSERT INTO auth_attempts (key, count, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at")
      .bind(key, reset).run();
    return true;
  }
  if (row.count >= limit) return false;
  await database().prepare("UPDATE auth_attempts SET count = count + 1 WHERE key = ?").bind(key).run();
  return true;
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin;
}
