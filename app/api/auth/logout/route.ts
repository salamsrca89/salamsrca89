import {
  hashSessionToken,
  readCookie,
  sessionCookie,
  SESSION_COOKIE,
} from "../../../../db/auth";
import { ensureSchema, getD1 } from "../../../../db/platform";

export async function POST(request: Request) {
  await ensureSchema();
  const token = readCookie(request, SESSION_COOKIE);
  if (token) {
    await getD1()
      .prepare("DELETE FROM auth_sessions WHERE token_hash = ?")
      .bind(await hashSessionToken(token))
      .run();
  }
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": sessionCookie(request, "", 0) } },
  );
}
