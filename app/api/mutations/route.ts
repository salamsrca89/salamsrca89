import {
  apiError,
  canAccessEmployee,
  canManagePoint,
  getD1,
  isManagement,
  logActivity,
  resolveActor,
  type Actor,
  type Role,
} from "../../../db/platform";
import { INITIAL_PASSWORD_CREDENTIALS, normalizeUsername } from "../../../db/auth";
import { getBindings } from "../../../db/runtime-env";

type Value = string | number | boolean | null | undefined;
type Payload = { action?: string; data?: Record<string, Value> };

function textValue(data: Record<string, Value>, key: string) {
  const value = data[key];
  return value === null || value === undefined ? "" : String(value).trim();
}

function optionalText(data: Record<string, Value>, key: string) {
  const value = textValue(data, key);
  return value || null;
}

function numberValue(data: Record<string, Value>, key: string) {
  const value = Number(data[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function responseTimeValue(data: Record<string, Value>, key: string) {
  const raw = textValue(data, key);
  if (!raw) return null;
  const match = raw.match(/^(\d{1,3}):([0-5]\d)$/);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function deny() {
  throw new Error("ACCESS_DENIED");
}

async function employeePoint(employeeId: number) {
  return getD1()
    .prepare("SELECT point_id AS pointId FROM employees WHERE id = ? AND active = 1")
    .bind(employeeId)
    .first<{ pointId: number | null }>();
}

async function requireEmployeeAccess(actor: Actor, employeeId: number) {
  if (!employeeId || !(await canAccessEmployee(actor, employeeId))) deny();
}

async function requireEmployeeManagement(actor: Actor, employeeId: number) {
  if (actor.role === "employee") deny();
  const employee = await employeePoint(employeeId);
  if (!employee || !canManagePoint(actor, employee.pointId)) deny();
}

async function deleteStoredFile(key: string | null | undefined) {
  if (!key) return;
  const bucket = getBindings().BUCKET;
  if (bucket) await bucket.delete(key);
}

export async function POST(request: Request) {
  let attemptedAction = "";
  try {
    const actor = await resolveActor(request);
    const payload = (await request.json()) as Payload;
    const action = payload.action ?? "";
    attemptedAction = action;
    const data = payload.data ?? {};
    const db = getD1();
    const now = new Date().toISOString();

    if (action === "update_self_employee") {
      if (actor.role !== "employee" || !actor.employeeId) deny();
      const fullName = textValue(data, "fullName");
      const mobile = textValue(data, "mobile");
      if (!fullName || !mobile) {
        return Response.json({ error: "الاسم الرباعي ورقم الجوال مطلوبان" }, { status: 400 });
      }
      await db
        .prepare(
          `UPDATE employees
           SET full_name = ?, mobile = ?, national_id = ?, birth_date = ?,
             email = ?, updated_at = ?
           WHERE id = ? AND active = 1`,
        )
        .bind(
          fullName,
          mobile,
          optionalText(data, "nationalId"),
          optionalText(data, "birthDate"),
          optionalText(data, "email"),
          now,
          actor.employeeId,
        )
        .run();
      await db
        .prepare("UPDATE access_users SET display_name = ? WHERE id = ?")
        .bind(fullName, actor.id)
        .run();
      await logActivity(actor, "تحديث البيانات الشخصية", "employee", actor.employeeId, fullName);
      return Response.json({ ok: true });
    }

    if (action === "save_employee") {
      if (actor.role === "employee") deny();
      const id = numberValue(data, "id");
      const pointId = numberValue(data, "pointId") || null;
      if (!canManagePoint(actor, pointId)) deny();
      const fullName = textValue(data, "fullName");
      const employeeCode = textValue(data, "employeeCode");
      const mobile = textValue(data, "mobile");
      const nationalId = optionalText(data, "nationalId");
      const birthDate = optionalText(data, "birthDate");
      const teamCode = optionalText(data, "teamCode");
      const jobNature = optionalText(data, "jobNature");
      const responseTimeSeconds = responseTimeValue(data, "responseTime");
      const emergencyResponseSeconds = responseTimeValue(data, "emergencyResponseTime");
      const echoResponseSeconds = responseTimeValue(data, "echoResponseTime");
      const incidentResponseSeconds = responseTimeValue(data, "incidentResponseTime");
      if (!fullName || !employeeCode || !mobile) {
        return Response.json({ error: "الاسم والكود الوظيفي ورقم الجوال مطلوبة" }, { status: 400 });
      }
      if (
        Number.isNaN(responseTimeSeconds) ||
        Number.isNaN(emergencyResponseSeconds) ||
        Number.isNaN(echoResponseSeconds) ||
        Number.isNaN(incidentResponseSeconds)
      ) {
        return Response.json(
          { error: "اكتب أزمنة الاستجابة بصيغة الدقائق والثواني، مثال 08:30" },
          { status: 400 },
        );
      }
      if (id) {
        await requireEmployeeManagement(actor, id);
        await db
          .prepare(
            `UPDATE employees SET point_id = ?, full_name = ?, employee_code = ?,
              mobile = ?, national_id = ?, birth_date = ?, email = ?, team_code = ?, job_nature = ?,
              response_time_seconds = ?, emergency_response_seconds = ?,
              echo_response_seconds = ?, incident_response_seconds = ?, updated_at = ?
             WHERE id = ?`,
          )
          .bind(
            pointId,
            fullName,
            employeeCode,
            mobile,
            nationalId,
            birthDate,
            optionalText(data, "email"),
            teamCode,
            jobNature,
            responseTimeSeconds,
            emergencyResponseSeconds,
            echoResponseSeconds,
            incidentResponseSeconds,
            now,
            id,
          )
          .run();
        const username = normalizeUsername(employeeCode);
        await db
          .prepare(
            `UPDATE access_users SET username = ?, email = ?, display_name = ?,
              point_id = CASE WHEN role IN ('employee', 'point_supervisor') THEN ? ELSE point_id END
             WHERE employee_id = ? AND username IS NOT NULL`,
          )
          .bind(username, `employee-${id}@alsalam.local`, fullName, pointId, id)
          .run();
        await logActivity(actor, "تعديل بيانات موظف", "employee", id, fullName);
      } else {
        const result = await db
          .prepare(
            `INSERT INTO employees
              (point_id, full_name, employee_code, mobile, national_id, birth_date,
               email, team_code, job_nature, response_time_seconds, emergency_response_seconds,
               echo_response_seconds, incident_response_seconds, active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          )
          .bind(
            pointId,
            fullName,
            employeeCode,
            mobile,
            nationalId,
            birthDate,
            optionalText(data, "email"),
            teamCode,
            jobNature,
            responseTimeSeconds,
            emergencyResponseSeconds,
            echoResponseSeconds,
            incidentResponseSeconds,
            now,
            now,
          )
          .run();
        const newId = Number(result.meta.last_row_id ?? 0);
        await logActivity(actor, "إضافة موظف", "employee", newId, fullName);
      }
      return Response.json({ ok: true });
    }

    if (action === "archive_employee") {
      const id = numberValue(data, "id");
      await requireEmployeeManagement(actor, id);
      await db.prepare("UPDATE employees SET active = 0, updated_at = ? WHERE id = ?").bind(now, id).run();
      await logActivity(actor, "أرشفة موظف", "employee", id);
      return Response.json({ ok: true });
    }

    if (action === "save_certificate") {
      const id = numberValue(data, "id");
      const employeeId = numberValue(data, "employeeId");
      await requireEmployeeAccess(actor, employeeId);
      const name = textValue(data, "name");
      if (!name) return Response.json({ error: "اسم الدورة أو الشهادة مطلوب" }, { status: 400 });
      if (id) {
        const existing = await db
          .prepare(
            "SELECT employee_id AS employeeId, attachment_key AS attachmentKey FROM certificates WHERE id = ?",
          )
          .bind(id)
          .first<{ employeeId: number; attachmentKey: string | null }>();
        if (!existing || existing.employeeId !== employeeId) deny();
        const nextAttachmentKey = optionalText(data, "attachmentKey");
        await db
          .prepare(
            `UPDATE certificates SET name = ?, issuer = ?, issue_date = ?, expiry_date = ?,
              notes = ?, attachment_key = ?, attachment_name = ?, updated_at = ? WHERE id = ?`,
          )
          .bind(
            name,
            optionalText(data, "issuer"),
            optionalText(data, "issueDate"),
            optionalText(data, "expiryDate"),
            optionalText(data, "notes"),
            nextAttachmentKey,
            optionalText(data, "attachmentName"),
            now,
            id,
          )
          .run();
        if (existing.attachmentKey && existing.attachmentKey !== nextAttachmentKey) {
          await deleteStoredFile(existing.attachmentKey);
        }
        await logActivity(actor, "تعديل شهادة", "certificate", id, name);
      } else {
        const result = await db
          .prepare(
            `INSERT INTO certificates
              (employee_id, name, issuer, issue_date, expiry_date, notes, attachment_key, attachment_name, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            employeeId,
            name,
            optionalText(data, "issuer"),
            optionalText(data, "issueDate"),
            optionalText(data, "expiryDate"),
            optionalText(data, "notes"),
            optionalText(data, "attachmentKey"),
            optionalText(data, "attachmentName"),
            now,
            now,
          )
          .run();
        await logActivity(actor, "إضافة شهادة", "certificate", Number(result.meta.last_row_id ?? 0), name);
      }
      return Response.json({ ok: true });
    }

    if (action === "delete_certificate") {
      const id = numberValue(data, "id");
      const row = await db
        .prepare(
          "SELECT employee_id AS employeeId, attachment_key AS attachmentKey FROM certificates WHERE id = ?",
        )
        .bind(id)
        .first<{ employeeId: number; attachmentKey: string | null }>();
      if (!row) return Response.json({ ok: true });
      await requireEmployeeAccess(actor, row.employeeId);
      await db.prepare("DELETE FROM certificates WHERE id = ?").bind(id).run();
      await deleteStoredFile(row.attachmentKey);
      await logActivity(actor, "حذف شهادة", "certificate", id);
      return Response.json({ ok: true });
    }

    if (action === "save_performance") {
      const id = numberValue(data, "id");
      const employeeId = numberValue(data, "employeeId");
      await requireEmployeeManagement(actor, employeeId);
      const period = textValue(data, "period");
      const score = Math.max(0, Math.min(100, numberValue(data, "score")));
      const rating = textValue(data, "rating");
      const weaknesses = optionalText(data, "weaknesses");
      const improvements = optionalText(data, "improvements");
      if (!period || !rating) return Response.json({ error: "الفترة والتقدير مطلوبان" }, { status: 400 });
      if (id) {
        await db
          .prepare(
            `UPDATE performance_reviews SET period = ?, score = ?, rating = ?, weaknesses = ?,
              improvements = ?, notes = ?,
              reviewer_email = ?, updated_at = ? WHERE id = ? AND employee_id = ?`,
          )
          .bind(
            period,
            score,
            rating,
            weaknesses,
            improvements,
            optionalText(data, "notes"),
            actor.username || actor.email,
            now,
            id,
            employeeId,
          )
          .run();
        await logActivity(actor, "تعديل تقييم أداء", "performance", id, period);
      } else {
        const result = await db
          .prepare(
            `INSERT INTO performance_reviews
              (employee_id, period, score, rating, weaknesses, improvements, notes, reviewer_email, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            employeeId,
            period,
            score,
            rating,
            weaknesses,
            improvements,
            optionalText(data, "notes"),
            actor.username || actor.email,
            now,
            now,
          )
          .run();
        await logActivity(actor, "إضافة تقييم أداء", "performance", Number(result.meta.last_row_id ?? 0), period);
      }
      return Response.json({ ok: true });
    }

    if (action === "delete_performance") {
      const id = numberValue(data, "id");
      const row = await db
        .prepare("SELECT employee_id AS employeeId FROM performance_reviews WHERE id = ?")
        .bind(id)
        .first<{ employeeId: number }>();
      if (!row) return Response.json({ ok: true });
      await requireEmployeeManagement(actor, row.employeeId);
      await db.prepare("DELETE FROM performance_reviews WHERE id = ?").bind(id).run();
      await logActivity(actor, "حذف تقييم أداء", "performance", id);
      return Response.json({ ok: true });
    }

    if (action === "save_custody") {
      const id = numberValue(data, "id");
      const employeeId = numberValue(data, "employeeId");
      await requireEmployeeManagement(actor, employeeId);
      const employee = await employeePoint(employeeId);
      if (!employee) return Response.json({ error: "الموظف غير موجود" }, { status: 404 });
      if (!employee.pointId) {
        return Response.json({ error: "لا يمكن إسناد عهدة لموظف إدارة القطاع دون نقطة انطلاق" }, { status: 400 });
      }
      const deviceName = textValue(data, "deviceName");
      const serialNumber = textValue(data, "serialNumber");
      if (!deviceName || !serialNumber) {
        return Response.json({ error: "اسم الجهاز والرقم التسلسلي مطلوبان" }, { status: 400 });
      }
      if (id) {
        await db
          .prepare(
            `UPDATE custody_items SET device_name = ?, serial_number = ?, delivered_at = ?,
              item_condition = ?, status = ?, returned_at = ?, notes = ?, point_id = ?, updated_at = ?
             WHERE id = ? AND employee_id = ?`,
          )
          .bind(
            deviceName,
            serialNumber,
            optionalText(data, "deliveredAt"),
            textValue(data, "itemCondition") || "سليم",
            textValue(data, "status") || "بعهدة الموظف",
            optionalText(data, "returnedAt"),
            optionalText(data, "notes"),
            employee.pointId,
            now,
            id,
            employeeId,
          )
          .run();
        await logActivity(actor, "تعديل عهدة", "custody", id, deviceName);
      } else {
        const result = await db
          .prepare(
            `INSERT INTO custody_items
              (employee_id, point_id, device_name, serial_number, delivered_at, item_condition, status, returned_at, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            employeeId,
            employee.pointId,
            deviceName,
            serialNumber,
            optionalText(data, "deliveredAt"),
            textValue(data, "itemCondition") || "سليم",
            textValue(data, "status") || "بعهدة الموظف",
            optionalText(data, "returnedAt"),
            optionalText(data, "notes"),
            now,
            now,
          )
          .run();
        await logActivity(actor, "إضافة عهدة", "custody", Number(result.meta.last_row_id ?? 0), deviceName);
      }
      return Response.json({ ok: true });
    }

    if (action === "delete_custody") {
      const id = numberValue(data, "id");
      const row = await db
        .prepare("SELECT employee_id AS employeeId FROM custody_items WHERE id = ?")
        .bind(id)
        .first<{ employeeId: number }>();
      if (!row) return Response.json({ ok: true });
      await requireEmployeeManagement(actor, row.employeeId);
      await db.prepare("DELETE FROM custody_items WHERE id = ?").bind(id).run();
      await logActivity(actor, "حذف عهدة", "custody", id);
      return Response.json({ ok: true });
    }

    if (action === "save_template") {
      if (!isManagement(actor)) deny();
      const id = numberValue(data, "id");
      const category = textValue(data, "category");
      const name = textValue(data, "name");
      const templateText = textValue(data, "templateText");
      if (!category || !name || !templateText) {
        return Response.json({ error: "اسم النموذج وتصنيفه ونصه مطلوبة" }, { status: 400 });
      }
      if (id) {
        const existing = await db
          .prepare("SELECT attachment_key AS attachmentKey FROM form_templates WHERE id = ? AND active = 1")
          .bind(id)
          .first<{ attachmentKey: string | null }>();
        if (!existing) return Response.json({ error: "النموذج غير موجود" }, { status: 404 });
        const nextAttachmentKey = optionalText(data, "attachmentKey");
        await db
          .prepare(
            `UPDATE form_templates SET category = ?, name = ?, template_text = ?,
              attachment_key = ?, attachment_name = ?, updated_at = ? WHERE id = ?`,
          )
          .bind(
            category,
            name,
            templateText,
            nextAttachmentKey,
            optionalText(data, "attachmentName"),
            now,
            id,
          )
          .run();
        if (existing.attachmentKey && existing.attachmentKey !== nextAttachmentKey) {
          await deleteStoredFile(existing.attachmentKey);
        }
        await logActivity(actor, "تعديل قالب نموذج", "template", id, name);
      } else {
        const result = await db
          .prepare(
            `INSERT INTO form_templates
              (category, name, template_text, attachment_key, attachment_name, active, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
          )
          .bind(
            category,
            name,
            templateText,
            optionalText(data, "attachmentKey"),
            optionalText(data, "attachmentName"),
            actor.username || actor.email,
            now,
            now,
          )
          .run();
        await logActivity(actor, "إضافة قالب نموذج", "template", Number(result.meta.last_row_id ?? 0), name);
      }
      return Response.json({ ok: true });
    }

    if (action === "delete_template") {
      if (!isManagement(actor)) deny();
      const id = numberValue(data, "id");
      const row = await db
        .prepare("SELECT attachment_key AS attachmentKey FROM form_templates WHERE id = ? AND active = 1")
        .bind(id)
        .first<{ attachmentKey: string | null }>();
      if (!row) return Response.json({ ok: true });
      await db.prepare("UPDATE form_templates SET active = 0, updated_at = ? WHERE id = ?").bind(now, id).run();
      await deleteStoredFile(row.attachmentKey);
      await logActivity(actor, "أرشفة قالب نموذج", "template", id);
      return Response.json({ ok: true });
    }

    if (action === "save_form_record") {
      const id = numberValue(data, "id");
      const employeeId = numberValue(data, "employeeId");
      await requireEmployeeManagement(actor, employeeId);
      const title = textValue(data, "title");
      const content = textValue(data, "content");
      const eventDate = textValue(data, "eventDate");
      if (!title || !content || !eventDate) {
        return Response.json({ error: "عنوان النموذج وتاريخه ومحتواه مطلوبة" }, { status: 400 });
      }
      if (id) {
        const existing = await db
          .prepare(
            "SELECT employee_id AS employeeId, attachment_key AS attachmentKey FROM form_records WHERE id = ?",
          )
          .bind(id)
          .first<{ employeeId: number; attachmentKey: string | null }>();
        if (!existing || existing.employeeId !== employeeId) deny();
        const nextAttachmentKey = optionalText(data, "attachmentKey");
        await db
          .prepare(
            `UPDATE form_records SET template_id = ?, title = ?, content = ?, event_date = ?,
              status = ?, attachment_key = ?, attachment_name = ?, updated_at = ?
             WHERE id = ?`,
          )
          .bind(
            numberValue(data, "templateId") || null,
            title,
            content,
            eventDate,
            textValue(data, "status") || "محفوظ",
            nextAttachmentKey,
            optionalText(data, "attachmentName"),
            now,
            id,
          )
          .run();
        if (existing.attachmentKey && existing.attachmentKey !== nextAttachmentKey) {
          await deleteStoredFile(existing.attachmentKey);
        }
        await logActivity(actor, "تعديل نموذج موظف", "form_record", id, title);
      } else {
        const result = await db
          .prepare(
            `INSERT INTO form_records
              (employee_id, template_id, title, content, event_date, status, attachment_key, attachment_name, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            employeeId,
            numberValue(data, "templateId") || null,
            title,
            content,
            eventDate,
            textValue(data, "status") || "محفوظ",
            optionalText(data, "attachmentKey"),
            optionalText(data, "attachmentName"),
            actor.username || actor.email,
            now,
            now,
          )
          .run();
        await logActivity(actor, "حفظ نموذج موظف", "form_record", Number(result.meta.last_row_id ?? 0), title);
      }
      return Response.json({ ok: true });
    }

    if (action === "delete_form_record") {
      const id = numberValue(data, "id");
      const row = await db
        .prepare(
          "SELECT employee_id AS employeeId, attachment_key AS attachmentKey FROM form_records WHERE id = ?",
        )
        .bind(id)
        .first<{ employeeId: number; attachmentKey: string | null }>();
      if (!row) return Response.json({ ok: true });
      await requireEmployeeManagement(actor, row.employeeId);
      await db.prepare("DELETE FROM form_records WHERE id = ?").bind(id).run();
      await deleteStoredFile(row.attachmentKey);
      await logActivity(actor, "حذف نموذج موظف", "form_record", id);
      return Response.json({ ok: true });
    }

    if (action === "remove_attachment") {
      const id = numberValue(data, "id");
      const entityType = textValue(data, "entityType");
      let attachmentKey: string | null = null;
      if (entityType === "certificate") {
        const row = await db
          .prepare(
            "SELECT employee_id AS employeeId, attachment_key AS attachmentKey FROM certificates WHERE id = ?",
          )
          .bind(id)
          .first<{ employeeId: number; attachmentKey: string | null }>();
        if (!row) return Response.json({ ok: true });
        await requireEmployeeAccess(actor, row.employeeId);
        attachmentKey = row.attachmentKey;
        await db
          .prepare(
            "UPDATE certificates SET attachment_key = NULL, attachment_name = NULL, updated_at = ? WHERE id = ?",
          )
          .bind(now, id)
          .run();
      } else if (entityType === "template") {
        if (!isManagement(actor)) deny();
        const row = await db
          .prepare("SELECT attachment_key AS attachmentKey FROM form_templates WHERE id = ?")
          .bind(id)
          .first<{ attachmentKey: string | null }>();
        if (!row) return Response.json({ ok: true });
        attachmentKey = row.attachmentKey;
        await db
          .prepare(
            "UPDATE form_templates SET attachment_key = NULL, attachment_name = NULL, updated_at = ? WHERE id = ?",
          )
          .bind(now, id)
          .run();
      } else if (entityType === "form_record") {
        const row = await db
          .prepare(
            "SELECT employee_id AS employeeId, attachment_key AS attachmentKey FROM form_records WHERE id = ?",
          )
          .bind(id)
          .first<{ employeeId: number; attachmentKey: string | null }>();
        if (!row) return Response.json({ ok: true });
        await requireEmployeeManagement(actor, row.employeeId);
        attachmentKey = row.attachmentKey;
        await db
          .prepare(
            "UPDATE form_records SET attachment_key = NULL, attachment_name = NULL, updated_at = ? WHERE id = ?",
          )
          .bind(now, id)
          .run();
      } else {
        return Response.json({ error: "نوع المرفق غير صحيح" }, { status: 400 });
      }
      await deleteStoredFile(attachmentKey);
      await logActivity(actor, "حذف مرفق", entityType, id);
      return Response.json({ ok: true });
    }

    if (action === "save_user") {
      if (actor.role !== "admin") deny();
      const id = numberValue(data, "id");
      const role = textValue(data, "role") as Role;
      const allowedRoles: Role[] = ["admin", "sector_supervisor", "point_supervisor", "employee"];
      const employeeId = numberValue(data, "employeeId") || null;
      if (!employeeId || !allowedRoles.includes(role)) {
        return Response.json({ error: "أكمل بيانات المستخدم والصلاحية" }, { status: 400 });
      }
      const employee = await db
        .prepare(
          `SELECT id, full_name AS fullName, employee_code AS employeeCode,
            point_id AS pointId FROM employees WHERE id = ? AND active = 1 LIMIT 1`,
        )
        .bind(employeeId)
        .first<{ id: number; fullName: string; employeeCode: string; pointId: number | null }>();
      if (!employee) {
        return Response.json({ error: "ملف الموظف غير موجود أو غير نشط" }, { status: 404 });
      }
      const linkedAccount = await db
        .prepare(
          "SELECT id FROM access_users WHERE employee_id = ? AND id != ? LIMIT 1",
        )
        .bind(employeeId, id || -1)
        .first<{ id: number }>();
      if (linkedAccount) {
        return Response.json(
          { error: "يوجد حساب دخول مرتبط بهذا الموظف مسبقًا" },
          { status: 409 },
        );
      }
      const username = normalizeUsername(employee.employeeCode);
      const email = `employee-${employee.id}@alsalam.local`;
      const displayName = employee.fullName;
      const pointId = role === "point_supervisor"
        ? numberValue(data, "pointId") || employee.pointId
        : role === "employee"
          ? employee.pointId
          : null;
      if (role === "point_supervisor" && !pointId) {
        return Response.json({ error: "حدد نقطة الانطلاق لمشرف النقطة" }, { status: 400 });
      }
      if (id) {
        const existing = await db
          .prepare("SELECT username FROM access_users WHERE id = ?")
          .bind(id)
          .first<{ username: string | null }>();
        if (!existing?.username) {
          return Response.json(
            { error: "حساب الإدارة الأساسي يُدار من إعدادات الوصول ولا يُحوّل إلى حساب موظف" },
            { status: 400 },
          );
        }
        if (existing.username.toUpperCase() === "ADMIN") {
          return Response.json({ error: "الحساب الرئيسي ثابت ولا يرتبط بملف موظف" }, { status: 400 });
        }
        await db
          .prepare(
            `UPDATE access_users SET email = ?, username = ?, display_name = ?, role = ?,
              point_id = ?, employee_id = ?, active = ? WHERE id = ?`,
          )
          .bind(email, username, displayName, role, pointId, employeeId, numberValue(data, "active") ? 1 : 0, id)
          .run();
        await logActivity(actor, "تعديل صلاحية مستخدم", "user", id, username);
      } else {
        const password = INITIAL_PASSWORD_CREDENTIALS;
        const result = await db
          .prepare(
            `INSERT INTO access_users
              (email, username, display_name, role, point_id, employee_id,
               password_hash, password_salt, password_iterations, active, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          )
          .bind(
            email,
            username,
            displayName,
            role,
            pointId,
            employeeId,
            password.hash,
            password.salt,
            password.iterations,
            now,
          )
          .run();
        await logActivity(actor, "إضافة مستخدم", "user", Number(result.meta.last_row_id ?? 0), username);
      }
      return Response.json({ ok: true });
    }

    if (action === "reset_user_password") {
      if (actor.role !== "admin") deny();
      const id = numberValue(data, "id");
      if (!id) return Response.json({ error: "المستخدم غير موجود" }, { status: 404 });
      if (id === actor.id) {
        return Response.json({ error: "استخدم خيار تغيير كلمة المرور لحسابك الحالي" }, { status: 400 });
      }
      const user = await db
        .prepare("SELECT username FROM access_users WHERE id = ?")
        .bind(id)
        .first<{ username: string | null }>();
      if (!user?.username) {
        return Response.json({ error: "هذا الحساب لا يستخدم كلمة مرور داخلية" }, { status: 400 });
      }
      const password = INITIAL_PASSWORD_CREDENTIALS;
      await db
        .prepare(
          `UPDATE access_users SET password_hash = ?, password_salt = ?,
            password_iterations = ?, password_changed_at = NULL WHERE id = ?`,
        )
        .bind(password.hash, password.salt, password.iterations, id)
        .run();
      await db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(id).run();
      await logActivity(actor, "إعادة كلمة المرور", "user", id, user.username);
      return Response.json({ ok: true });
    }

    if (action === "resolve_password_reset") {
      if (actor.role !== "admin") deny();
      const id = numberValue(data, "id");
      const decision = textValue(data, "decision");
      const requestRow = await db
        .prepare(
          `SELECT id, user_id AS userId, username
           FROM password_reset_requests
           WHERE id = ? AND status = 'pending' LIMIT 1`,
        )
        .bind(id)
        .first<{ id: number; userId: number; username: string }>();
      if (!requestRow) {
        return Response.json({ error: "طلب الاستعادة غير موجود" }, { status: 404 });
      }
      if (decision === "approve") {
        const password = INITIAL_PASSWORD_CREDENTIALS;
        await db
          .prepare(
            `UPDATE access_users SET password_hash = ?, password_salt = ?,
              password_iterations = ?, password_changed_at = NULL
             WHERE id = ? AND active = 1`,
          )
          .bind(password.hash, password.salt, password.iterations, requestRow.userId)
          .run();
        await db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(requestRow.userId).run();
      } else if (decision !== "reject") {
        return Response.json({ error: "قرار الطلب غير صحيح" }, { status: 400 });
      }
      await db
        .prepare(
          `UPDATE password_reset_requests
           SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?`,
        )
        .bind(decision === "approve" ? "approved" : "rejected", now, actor.username || actor.email, id)
        .run();
      await logActivity(
        actor,
        decision === "approve" ? "اعتماد استعادة كلمة المرور" : "رفض استعادة كلمة المرور",
        "password_reset",
        id,
        requestRow.username,
      );
      return Response.json({ ok: true });
    }

    if (action === "delete_user") {
      if (actor.role !== "admin") deny();
      const id = numberValue(data, "id");
      if (id === actor.id) {
        return Response.json({ error: "لا يمكن تعطيل حسابك الحالي" }, { status: 400 });
      }
      const protectedUser = await db
        .prepare("SELECT username FROM access_users WHERE id = ?")
        .bind(id)
        .first<{ username: string | null }>();
      if (protectedUser?.username?.toUpperCase() === "ADMIN") {
        return Response.json({ error: "لا يمكن تعطيل الحساب الرئيسي" }, { status: 400 });
      }
      await db.prepare("UPDATE access_users SET active = 0 WHERE id = ?").bind(id).run();
      await logActivity(actor, "تعطيل مستخدم", "user", id);
      return Response.json({ ok: true });
    }

    return Response.json({ error: "الإجراء غير معروف" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("mutation_failed", attemptedAction, message);
    if (message.includes("UNIQUE constraint failed")) {
      return Response.json(
        { error: "البيانات مسجلة مسبقًا؛ راجع الكود الوظيفي أو الهوية أو حساب الدخول" },
        { status: 409 },
      );
    }
    return apiError(error);
  }
}
