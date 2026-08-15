import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  readCookie,
  sessionCookie,
  SESSION_COOKIE,
  SESSION_DURATION_SECONDS,
  verifyPassword,
} from "../../../../db/auth";
import { apiError, getD1, resolveActor } from "../../../../db/platform";

export async function POST(request: Request) {
  try {
    const actor = await resolveActor(request);
    if (!actor.username) {
      return Response.json(
        { error: "تغيير كلمة المرور متاح للحسابات المرتبطة بالكود الوظيفي" },
        { status: 400 },
      );
    }
    const body = (await request.json()) as {
      currentPassword?: string;
      newPassword?: string;
      confirmPassword?: string;
    };
    const currentPassword = body.currentPassword ?? "";
    const newPassword = body.newPassword ?? "";
    if (newPassword.length < 8) {
      return Response.json(
        { error: "كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف أو أرقام" },
        { status: 400 },
      );
    }
    if (newPassword !== body.confirmPassword) {
      return Response.json({ error: "تأكيد كلمة المرور غير مطابق" }, { status: 400 });
    }

    const db = getD1();
    const user = await db
      .prepare(
        "SELECT password_hash AS passwordHash, password_salt AS passwordSalt, password_iterations AS passwordIterations FROM access_users WHERE id = ?",
      )
      .bind(actor.id)
      .first<{ passwordHash: string | null; passwordSalt: string | null; passwordIterations: number | null }>();
    if (
      !user?.passwordHash ||
      !user.passwordSalt ||
      !(await verifyPassword(
        currentPassword,
        user.passwordSalt,
        user.passwordHash,
        user.passwordIterations,
      ))
    ) {
      return Response.json({ error: "كلمة المرور الحالية غير صحيحة" }, { status: 401 });
    }

    const next = await hashPassword(newPassword);
    const now = new Date();
    await db
      .prepare(
        `UPDATE access_users SET password_hash = ?, password_salt = ?,
          password_iterations = ?, password_changed_at = ? WHERE id = ?`,
      )
      .bind(next.hash, next.salt, next.iterations, now.toISOString(), actor.id)
      .run();
    const currentToken = readCookie(request, SESSION_COOKIE);
    if (currentToken) {
      await db
        .prepare("DELETE FROM auth_sessions WHERE token_hash = ?")
        .bind(await hashSessionToken(currentToken))
        .run();
    }
    await db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(actor.id).run();
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
      .bind(tokenHash, actor.id, expiresAt, now.toISOString(), now.toISOString())
      .run();

    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": sessionCookie(request, token) } },
    );
  } catch (error) {
    return apiError(error);
  }
}
