import {
  apiError,
  canAccessEmployee,
  ensureSchema,
  getD1,
  isManagement,
  resolveActor,
} from "../../../db/platform";

const defaultTemplates = [
  {
    category: "incident",
    name: "نموذج الحوادث",
    text: `بيانات الحادث\n\nتاريخ ووقت الحادث:\nالموقع:\nوصف الحادث:\nالإجراء المتخذ:\nالأطراف ذات العلاقة:\nالنتيجة والتوصيات:\n`,
  },
  {
    category: "handover",
    name: "نموذج استلام وتسليم العهد",
    text: `بيانات استلام وتسليم العهد\n\nاسم المستلم:\nاسم المسلّم:\nاسم العهدة ورقمها التسلسلي:\nحالة العهدة عند التسليم:\nتاريخ ووقت التسليم:\nملاحظات:\n`,
  },
  {
    category: "violation",
    name: "نموذج المخالفات",
    text: `بيانات المخالفة\n\nتاريخ ووقت المخالفة:\nنوع المخالفة:\nوصف الواقعة:\nالإجراء المتخذ:\nإفادة الموظف:\nالملاحظات والتوصيات:\n`,
  },
  {
    category: "cpr",
    name: "نموذج CPR ناجح",
    text: `توثيق حالة CPR ناجح\n\nرقم البلاغ:\nتاريخ ووقت البلاغ:\nموقع الحالة:\nبيانات الحالة الأساسية:\nالإجراءات الإنعاشية المتخذة:\nوقت عودة النبض ROSC:\nالفريق المشارك:\nالمستشفى المنقول إليه:\nملاحظات الحالة:\n`,
  },
];

async function seedTemplates(email: string) {
  const db = getD1();
  const current = await db
    .prepare("SELECT COUNT(*) AS total FROM form_templates")
    .first<{ total: number }>();
  if (Number(current?.total ?? 0) > 0) return;
  const now = new Date().toISOString();
  await db.batch(
    defaultTemplates.map((template) =>
      db
        .prepare(
          "INSERT INTO form_templates (category, name, template_text, active, created_by, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)",
        )
        .bind(template.category, template.name, template.text, email, now, now),
    ),
  );
}

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const actor = await resolveActor(request);
    const db = getD1();
    await seedTemplates(actor.email);

    const url = new URL(request.url);
    const requestedPointId = Number(url.searchParams.get("pointId") || 0);
    const requestedEmployeeId = Number(url.searchParams.get("employeeId") || 0);
    const employeeId = actor.role === "employee"
      ? Number(actor.employeeId || 0)
      : requestedEmployeeId;

    const pointRows = await db
      .prepare(
        `SELECT p.id, p.name, p.sort_order AS sortOrder,
          COUNT(CASE WHEN e.active = 1 THEN 1 END) AS employeeCount
         FROM points p
         LEFT JOIN employees e ON e.point_id = p.id
         GROUP BY p.id, p.name, p.sort_order
         ORDER BY p.sort_order`,
      )
      .all<{ id: number; name: string; sortOrder: number; employeeCount: number }>();
    const visiblePoints = actor.role === "employee"
      ? []
      : actor.role === "point_supervisor"
        ? pointRows.results.filter((point) => point.id === actor.pointId)
        : pointRows.results;

    let employeeWhere = "e.active = 1";
    const employeeBinds: number[] = [];
    if (actor.role === "employee") {
      employeeWhere += " AND e.id = ?";
      employeeBinds.push(actor.employeeId ?? -1);
    } else if (actor.role === "point_supervisor") {
      employeeWhere += " AND e.point_id = ?";
      employeeBinds.push(actor.pointId ?? -1);
    } else if (requestedPointId) {
      employeeWhere += " AND e.point_id = ?";
      employeeBinds.push(requestedPointId);
    }

    const employeesStatement = db.prepare(
      `SELECT e.id, e.point_id AS pointId, COALESCE(p.name, 'إدارة قطاع السلام') AS pointName,
        e.full_name AS fullName, e.employee_code AS employeeCode,
        e.mobile, e.national_id AS nationalId, e.birth_date AS birthDate,
        e.email, e.team_code AS teamCode, e.job_nature AS jobNature,
        e.response_time_seconds AS responseTimeSeconds,
        e.emergency_response_seconds AS emergencyResponseSeconds,
        e.echo_response_seconds AS echoResponseSeconds,
        e.incident_response_seconds AS incidentResponseSeconds, e.active,
        (SELECT COUNT(*) FROM certificates c WHERE c.employee_id = e.id) AS certificateCount,
        (SELECT COUNT(*) FROM form_records f WHERE f.employee_id = e.id) AS formCount,
        (SELECT COUNT(*) FROM custody_items ci WHERE ci.employee_id = e.id AND ci.status != 'مُعاد') AS custodyCount,
        (SELECT score FROM performance_reviews pr WHERE pr.employee_id = e.id ORDER BY pr.created_at DESC LIMIT 1) AS latestScore
       FROM employees e
       LEFT JOIN points p ON p.id = e.point_id
       WHERE ${employeeWhere}
       ORDER BY e.full_name`,
    );
    const employeeRows = await employeesStatement
      .bind(...employeeBinds)
      .all<{
        id: number;
        pointId: number | null;
        pointName: string;
        fullName: string;
        employeeCode: string;
        mobile: string;
        nationalId: string | null;
        birthDate: string | null;
        email: string | null;
        teamCode: string | null;
        jobNature: string | null;
        responseTimeSeconds: number | null;
        emergencyResponseSeconds: number | null;
        echoResponseSeconds: number | null;
        incidentResponseSeconds: number | null;
        active: number;
        certificateCount: number;
        formCount: number;
        custodyCount: number;
        latestScore: number | null;
      }>();

    const templates = actor.role === "employee"
      ? { results: [] }
      : await db
          .prepare(
            `SELECT id, category, name, template_text AS templateText,
              attachment_key AS attachmentKey, attachment_name AS attachmentName,
              created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
             FROM form_templates WHERE active = 1 ORDER BY id`,
          )
          .all();

    let employeeDetails = null;
    if (employeeId) {
      if (!(await canAccessEmployee(actor, employeeId))) {
        throw new Error("ACCESS_DENIED");
      }
      const employee = await db
        .prepare(
          `SELECT e.id, e.point_id AS pointId, COALESCE(p.name, 'إدارة قطاع السلام') AS pointName,
            e.full_name AS fullName, e.employee_code AS employeeCode,
            e.mobile, e.national_id AS nationalId, e.birth_date AS birthDate,
            e.email, e.team_code AS teamCode, e.job_nature AS jobNature,
            e.response_time_seconds AS responseTimeSeconds,
            e.emergency_response_seconds AS emergencyResponseSeconds,
            e.echo_response_seconds AS echoResponseSeconds,
            e.incident_response_seconds AS incidentResponseSeconds,
            e.active, e.created_at AS createdAt, e.updated_at AS updatedAt
           FROM employees e LEFT JOIN points p ON p.id = e.point_id
           WHERE e.id = ? LIMIT 1`,
        )
        .bind(employeeId)
        .first();
      const certificates = await db
        .prepare(
          `SELECT id, employee_id AS employeeId, name, issuer,
            issue_date AS issueDate, expiry_date AS expiryDate, notes,
            attachment_key AS attachmentKey, attachment_name AS attachmentName,
            created_at AS createdAt, updated_at AS updatedAt
           FROM certificates WHERE employee_id = ? ORDER BY expiry_date`,
        )
        .bind(employeeId)
        .all();
      const performance = await db
        .prepare(
          `SELECT id, employee_id AS employeeId, period, score, rating,
            weaknesses, improvements, notes,
            reviewer_email AS reviewerEmail, created_at AS createdAt, updated_at AS updatedAt
           FROM performance_reviews WHERE employee_id = ? ORDER BY created_at DESC`,
        )
        .bind(employeeId)
        .all();
      const forms = await db
        .prepare(
          `SELECT id, employee_id AS employeeId, template_id AS templateId,
            title, content, event_date AS eventDate, status,
            attachment_key AS attachmentKey, attachment_name AS attachmentName,
            created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
           FROM form_records WHERE employee_id = ? ORDER BY event_date DESC, id DESC`,
        )
        .bind(employeeId)
        .all();
      const custody = await db
        .prepare(
          `SELECT id, employee_id AS employeeId, point_id AS pointId,
            device_name AS deviceName, serial_number AS serialNumber,
            delivered_at AS deliveredAt, item_condition AS itemCondition,
            status, returned_at AS returnedAt, notes,
            created_at AS createdAt, updated_at AS updatedAt
           FROM custody_items WHERE employee_id = ? ORDER BY created_at DESC`,
        )
        .bind(employeeId)
        .all();
      employeeDetails = {
        employee,
        certificates: certificates.results,
        performance: performance.results,
        forms: forms.results,
        custody: custody.results,
      };
    }

    const visibleEmployeeIds = employeeRows.results.map((employee) => employee.id);
    let activity: unknown[] = [];
    if (isManagement(actor)) {
      const activityRows = await db
        .prepare(
          `SELECT id, actor_email AS actorEmail, action, entity_type AS entityType,
            entity_id AS entityId, details, created_at AS createdAt
           FROM activity_log ORDER BY id DESC LIMIT 30`,
        )
        .all();
      activity = activityRows.results;
    } else if (actor.role === "employee") {
      const activityRows = await db
        .prepare(
          `SELECT id, actor_email AS actorEmail, action, entity_type AS entityType,
            entity_id AS entityId, details, created_at AS createdAt
           FROM activity_log WHERE actor_email = ? ORDER BY id DESC LIMIT 20`,
        )
        .bind(actor.username || actor.email)
        .all();
      activity = activityRows.results;
    }

    let users: unknown[] = [];
    if (actor.role === "admin") {
      const userRows = await db
        .prepare(
          `SELECT u.id, u.email, u.username, u.display_name AS displayName, u.role,
            u.point_id AS pointId, p.name AS pointName,
            u.employee_id AS employeeId, u.password_changed_at AS passwordChangedAt,
            u.active, u.created_at AS createdAt
           FROM access_users u LEFT JOIN points p ON p.id = u.point_id
           WHERE u.username IS NOT NULL
           ORDER BY u.active DESC, u.display_name`,
        )
        .all();
      users = userRows.results;
    }

    let passwordResetRequests: unknown[] = [];
    if (actor.role === "admin") {
      const requestRows = await db
        .prepare(
          `SELECT id, user_id AS userId, username, display_name AS displayName,
            status, requested_at AS requestedAt
           FROM password_reset_requests
           WHERE status = 'pending'
           ORDER BY requested_at DESC`,
        )
        .all();
      passwordResetRequests = requestRows.results;
    }

    const today = new Date();
    const inNinetyDays = new Date(today);
    inNinetyDays.setDate(today.getDate() + 90);
    const visibleIdsSql = visibleEmployeeIds.length
      ? visibleEmployeeIds.map(() => "?").join(",")
      : "NULL";
    const expiring = visibleEmployeeIds.length
      ? await db
          .prepare(
            `SELECT COUNT(*) AS total FROM certificates
             WHERE employee_id IN (${visibleIdsSql})
               AND expiry_date IS NOT NULL AND expiry_date != ''
               AND date(expiry_date) BETWEEN date(?) AND date(?)`,
          )
          .bind(
            ...visibleEmployeeIds,
            today.toISOString().slice(0, 10),
            inNinetyDays.toISOString().slice(0, 10),
          )
          .first<{ total: number }>()
      : { total: 0 };
    const certificateNotifications = visibleEmployeeIds.length
      ? await db
          .prepare(
            `SELECT c.id, c.employee_id AS employeeId, e.point_id AS pointId,
              c.name, c.expiry_date AS expiryDate, e.full_name AS employeeName
             FROM certificates c
             JOIN employees e ON e.id = c.employee_id
             WHERE c.employee_id IN (${visibleIdsSql})
               AND c.expiry_date IS NOT NULL AND c.expiry_date != ''
               AND date(c.expiry_date) BETWEEN date(?) AND date(?)
             ORDER BY date(c.expiry_date), c.id
             LIMIT 20`,
          )
          .bind(
            ...visibleEmployeeIds,
            today.toISOString().slice(0, 10),
            inNinetyDays.toISOString().slice(0, 10),
          )
          .all()
      : { results: [] };

    const averageTime = (
      key:
        | "responseTimeSeconds"
        | "emergencyResponseSeconds"
        | "echoResponseSeconds"
        | "incidentResponseSeconds",
    ) => {
      const values = employeeRows.results
        .map((employee) => employee[key])
        .filter((value): value is number => typeof value === "number");
      if (!values.length) return null;
      return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
    };

    return Response.json({
      actor,
      points: visiblePoints,
      employees: employeeRows.results,
      employeeDetails,
      templates: templates.results,
      users,
      passwordResetRequests,
      notifications: certificateNotifications.results,
      activity,
      summary: {
        employees: employeeRows.results.length,
        expiringCertificates: Number(expiring?.total ?? 0),
        activeCustody: employeeRows.results.reduce(
          (total, employee) => total + Number(employee.custodyCount ?? 0),
          0,
        ),
        savedForms: employeeRows.results.reduce(
          (total, employee) => total + Number(employee.formCount ?? 0),
          0,
        ),
        generalResponseSeconds: averageTime("responseTimeSeconds"),
        emergencyResponseSeconds: averageTime("emergencyResponseSeconds"),
        echoResponseSeconds: averageTime("echoResponseSeconds"),
        incidentResponseSeconds: averageTime("incidentResponseSeconds"),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
