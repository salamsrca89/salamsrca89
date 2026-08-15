import { apiError, canAccessEmployee, getD1, resolveActor } from "../../../db/platform";
import { getBindings } from "../../../db/runtime-env";

const allowedTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "image/jpeg",
  "image/png",
]);

function safeName(name: string) {
  return name.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 120) || "file";
}

export async function POST(request: Request) {
  try {
    const actor = await resolveActor(request);
    const bucket = getBindings().BUCKET;
    if (!bucket) throw new Error("مخزن الملفات غير متاح");
    const form = await request.formData();
    const file = form.get("file");
    const scope = String(form.get("scope") || "attachments");
    if (actor.role === "employee" && scope !== "certificate") {
      throw new Error("ACCESS_DENIED");
    }
    if (!(file instanceof File)) {
      return Response.json({ error: "اختر ملفًا للرفع" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return Response.json({ error: "الحد الأعلى لحجم الملف 10 ميجابايت" }, { status: 413 });
    }
    if (!allowedTypes.has(file.type)) {
      return Response.json({ error: "الصيغ المتاحة: PDF وWord وJPG وPNG" }, { status: 415 });
    }
    const key = `${safeName(scope)}/${Date.now()}-${crypto.randomUUID()}-${safeName(file.name)}`;
    await bucket.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: {
        originalName: file.name,
        uploadedBy: actor.username || actor.email,
      },
    });
    return Response.json({
      key,
      name: file.name,
      size: file.size,
      contentType: file.type,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(request: Request) {
  try {
    const actor = await resolveActor(request);
    const bucket = getBindings().BUCKET;
    if (!bucket) throw new Error("مخزن الملفات غير متاح");
    const url = new URL(request.url);
    const key = url.searchParams.get("key") || "";
    if (!key || key.includes("..")) {
      return Response.json({ error: "رابط الملف غير صحيح" }, { status: 400 });
    }
    const db = getD1();
    const certificate = await db
      .prepare("SELECT employee_id AS employeeId FROM certificates WHERE attachment_key = ? LIMIT 1")
      .bind(key)
      .first<{ employeeId: number }>();
    const formRecord = certificate
      ? null
      : await db
          .prepare("SELECT employee_id AS employeeId FROM form_records WHERE attachment_key = ? LIMIT 1")
          .bind(key)
          .first<{ employeeId: number }>();
    const template = certificate || formRecord
      ? null
      : await db
          .prepare("SELECT id FROM form_templates WHERE attachment_key = ? AND active = 1 LIMIT 1")
          .bind(key)
          .first<{ id: number }>();
    const allowed = certificate
      ? await canAccessEmployee(actor, certificate.employeeId)
      : formRecord
        ? actor.role !== "employee" && await canAccessEmployee(actor, formRecord.employeeId)
        : Boolean(template && actor.role !== "employee");
    if (!allowed) throw new Error("ACCESS_DENIED");
    const object = await bucket.get(key);
    if (!object) return Response.json({ error: "الملف غير موجود" }, { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, max-age=300");
    const name = object.customMetadata?.originalName || "attachment";
    const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline";
    headers.set("content-disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`);
    return new Response(object.body, { headers });
  } catch (error) {
    return apiError(error);
  }
}
