import { normalizeUsername } from "../../../../db/auth";
import { apiError, ensureSchema, getD1 } from "../../../../db/platform";

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = (await request.json()) as { username?: string };
    const username = normalizeUsername(body.username ?? "");
    if (!username) {
      return Response.json({ error: "أدخل اسم المستخدم أو الكود الوظيفي" }, { status: 400 });
    }

    const db = getD1();
    const user = await db
      .prepare(
        `SELECT u.id, u.username, u.display_name AS displayName
         FROM access_users u
         LEFT JOIN employees e ON e.id = u.employee_id
         WHERE upper(u.username) = ? AND u.active = 1
           AND (upper(u.username) = 'ADMIN' OR upper(e.employee_code) = upper(u.username))
         LIMIT 1`,
      )
      .bind(username)
      .first<{ id: number; username: string; displayName: string }>();

    if (user) {
      const now = new Date().toISOString();
      const pending = await db
        .prepare(
          "SELECT id FROM password_reset_requests WHERE user_id = ? AND status = 'pending' LIMIT 1",
        )
        .bind(user.id)
        .first<{ id: number }>();
      if (pending) {
        await db
          .prepare("UPDATE password_reset_requests SET requested_at = ? WHERE id = ?")
          .bind(now, pending.id)
          .run();
      } else {
        await db
          .prepare(
            `INSERT INTO password_reset_requests
              (user_id, username, display_name, status, requested_at)
             VALUES (?, ?, ?, 'pending', ?)`,
          )
          .bind(user.id, user.username, user.displayName, now)
          .run();
      }
    }

    return Response.json({
      ok: true,
      message: "تم إرسال طلب الاستعادة إلى الإدارة",
    });
  } catch (error) {
    return apiError(error);
  }
}
