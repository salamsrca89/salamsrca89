import {
  createSessionToken,
  hashSessionToken,
  normalizeUsername,
  sessionCookie,
  SESSION_DURATION_SECONDS,
  verifyPassword,
} from "../../../../db/auth";
import { apiError, ensureSchema, getD1, type Role } from "../../../../db/platform";

type LoginUser = {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  active: number;
  passwordHash: string | null;
  passwordSalt: string | null;
  passwordIterations: number | null;
  mustChangePassword: number;
};

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = (await request.json()) as { username?: string; password?: string };
    const username = normalizeUsername(body.username ?? "");
    const password = body.password ?? "";
    if (!username || !password) {
      return Response.json(
        { error: "أدخل الكود الوظيفي وكلمة المرور" },
        { status: 400 },
      );
    }

    const db = getD1();
    const now = new Date();
    const attempt = await db
      .prepare(
        "SELECT failures, locked_until AS lockedUntil FROM login_attempts WHERE username = ?",
      )
      .bind(username)
      .first<{ failures: number; lockedUntil: string | null }>();
    if (attempt?.lockedUntil && attempt.lockedUntil > now.toISOString()) {
      return Response.json(
        { error: "تم إيقاف المحاولات مؤقتًا. حاول بعد 15 دقيقة" },
        { status: 429 },
      );
    }

    const user = await db
      .prepare(
        `SELECT id, username, display_name AS displayName, role, active,
          password_hash AS passwordHash, password_salt AS passwordSalt,
          password_iterations AS passwordIterations,
          CASE WHEN upper(username) = 'ADMIN' AND password_changed_at IS NULL THEN 1 ELSE 0 END AS mustChangePassword
         FROM access_users
         WHERE upper(username) = ?
           AND (
             upper(username) = 'ADMIN'
             OR EXISTS (
               SELECT 1 FROM employees e
               WHERE e.id = access_users.employee_id
                 AND upper(e.employee_code) = upper(access_users.username)
                 AND e.active = 1
             )
           )
         LIMIT 1`,
      )
      .bind(username)
      .first<LoginUser>();
    const valid = Boolean(
      user?.active &&
        user.passwordHash &&
        user.passwordSalt &&
        (await verifyPassword(
          password,
          user.passwordSalt,
          user.passwordHash,
          user.passwordIterations,
        )),
    );

    if (!valid || !user) {
      const failures = (attempt?.failures ?? 0) + 1;
      const lockedUntil = failures >= 5
        ? new Date(now.getTime() + 15 * 60 * 1000).toISOString()
        : null;
      await db
        .prepare(
          `INSERT INTO login_attempts (username, failures, locked_until, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(username) DO UPDATE SET failures = excluded.failures,
             locked_until = excluded.locked_until, updated_at = excluded.updated_at`,
        )
        .bind(username, failures >= 5 ? 0 : failures, lockedUntil, now.toISOString())
        .run();
      return Response.json(
        { error: "الكود الوظيفي أو كلمة المرور غير صحيحة" },
        { status: 401 },
      );
    }

    await db.prepare("DELETE FROM login_attempts WHERE username = ?").bind(username).run();
    await db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").bind(now.toISOString()).run();
    const token = createSessionToken();
    const tokenHash = await hashSessionToken(token);
    const expiresAt = new Date(
      now.getTime() + SESSION_DURATION_SECONDS * 1000,
    ).toISOString();
    await db
      .prepare(
        `INSERT INTO auth_sessions (token_hash, user_id, expires_at, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(tokenHash, user.id, expiresAt, now.toISOString(), now.toISOString())
      .run();

    return Response.json(
      {
        ok: true,
        user: {
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          mustChangePassword: Boolean(user.mustChangePassword),
        },
      },
      { headers: { "Set-Cookie": sessionCookie(request, token) } },
    );
  } catch (error) {
    return apiError(error);
  }
}
