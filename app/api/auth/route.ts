import { env } from "cloudflare:workers";
import { allowAttempt, createSession, destroySession, passwordHash, randomToken, sameOrigin, siteUser, tokenHash, verifyPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const user = await siteUser(request);
  return user ? Response.json({ user }, { headers }) : Response.json({ error: "Entre na sua conta." }, { status: 401, headers });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403, headers });
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  if (!await allowAttempt(`auth:${await tokenHash(ip)}`, 30, 3_600_000))
    return Response.json({ error: "Muitas tentativas. Aguarde antes de tentar novamente." }, { status: 429, headers });
  try {
    const raw = await request.text();
    if (raw.length > 2000) return Response.json({ error: "Dados inválidos." }, { status: 400, headers });
    const input = JSON.parse(raw) as { action?: string; email?: string; password?: string; recoveryCode?: string };
    const email = input.email?.trim().toLowerCase() ?? "";
    const password = input.password ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 12 || password.length > 128)
      return Response.json({ error: "Use um e-mail válido e senha com pelo menos 12 caracteres." }, { status: 400, headers });
    const db = env.DB;
    if (!db) throw new Error("Banco de dados indisponível.");
    let user: { id: string; email: string; password_hash: string; recovery_hash?: string | null } | null = null;
    let recoveryCode: string | undefined;
    if (input.action === "register") {
      if (!await allowAttempt(`register:${await tokenHash(ip)}`, 5, 3_600_000))
        return Response.json({ error: "Limite de cadastros atingido. Tente mais tarde." }, { status: 429, headers });
      const id = crypto.randomUUID();
      const hash = await passwordHash(password);
      recoveryCode = randomToken();
      try {
        await db.prepare("INSERT INTO users (id, email, password_hash, recovery_hash, created_at) VALUES (?, ?, ?, ?, ?)")
          .bind(id, email, hash, await tokenHash(recoveryCode), new Date().toISOString()).run();
      } catch {
        return Response.json({ error: "Este e-mail já está em uso." }, { status: 409, headers });
      }
      user = { id, email, password_hash: hash };
    } else if (input.action === "login" || input.action === "reset") {
      if (!await allowAttempt(`login:${await tokenHash(email + ":" + ip)}`, 10, 900_000))
        return Response.json({ error: "Muitas tentativas. Tente novamente em alguns minutos." }, { status: 429, headers });
      user = await db.prepare("SELECT id, email, password_hash, recovery_hash FROM users WHERE email = ?")
        .bind(email).first<{ id: string; email: string; password_hash: string; recovery_hash: string | null }>();
      if (input.action === "login") {
        if (!user || !await verifyPassword(password, user.password_hash))
          return Response.json({ error: "E-mail ou senha incorretos." }, { status: 401, headers });
      } else {
        const provided = input.recoveryCode ?? "";
        if (!user || !user.recovery_hash || !/^[A-Za-z0-9_-]{43}$/.test(provided) ||
            user.recovery_hash !== await tokenHash(provided))
          return Response.json({ error: "Código de recuperação inválido." }, { status: 401, headers });
        recoveryCode = randomToken();
        await db.prepare("UPDATE users SET password_hash = ?, recovery_hash = ? WHERE id = ?")
          .bind(await passwordHash(password), await tokenHash(recoveryCode), user.id).run();
        await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run();
      }
    } else return Response.json({ error: "Ação inválida." }, { status: 400, headers });
    return Response.json({ user: { id: user.id, email: user.email }, ...(recoveryCode ? { recoveryCode } : {}) }, {
      headers: { ...headers, "Set-Cookie": await createSession(user.id) },
    });
  } catch (error) {
    console.error("Falha na autenticação", error);
    return Response.json({ error: "Não foi possível acessar sua conta agora." }, { status: 503, headers });
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403, headers });
  return Response.json({ signedOut: true }, { headers: { ...headers, "Set-Cookie": await destroySession(request) } });
}
