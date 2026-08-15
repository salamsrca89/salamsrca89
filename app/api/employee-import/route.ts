import { INITIAL_PASSWORD_CREDENTIALS, normalizeUsername } from "../../../db/auth";
import { apiError, ensureSchema, getD1, logActivity, resolveActor } from "../../../db/platform";

type RawEmployee = {
  fullName?: string;
  employeeCode?: string;
  teamCode?: string;
  mobile?: string;
  jobNature?: string;
};

type NormalizedEmployee = {
  fullName: string;
  employeeCode: string;
  teamCode: string;
  mobile: string;
  jobNature: string;
  pointId: number | null;
  pointName: string;
};

type ExcludedEmployee = {
  fullName: string;
  employeeCode: string;
  teamCode: string;
  reason: string;
};

type StoredPreview = {
  employees: NormalizedEmployee[];
  excluded: ExcludedEmployee[];
  distribution: Array<{ pointName: string; count: number }>;
};

const numericPoints: Record<string, string | null> = {
  "0": null,
  "1": "الميقات",
  "2": "سلطانة",
  "3": "شوران",
  "4": "طيبة",
  "5": "العزيزية",
};

const letterPoints: Record<string, string> = {
  س: "سلطانة",
  ش: "شوران",
  ص: "القصر",
  ط: "طيبة",
  ع: "العزيزية",
  ق: "مسجد القبلتين",
  م: "الميقات",
  د: "الميقات",
};

function clean(value: unknown) {
  return String(value ?? "").normalize("NFKC").replace(/ـ/g, "").replace(/\s+/g, " ").trim();
}

function normalizeDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/\D/g, "");
}

function normalizeMobile(value: string) {
  const digits = normalizeDigits(value);
  if (digits.length === 9 && digits.startsWith("5")) return `0${digits}`;
  if (digits.length === 10 && digits.startsWith("05")) return digits;
  return "";
}

function normalizedSymbol(value: string) {
  return clean(value)
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/\s/g, "");
}

async function runBatches(statements: ReturnType<ReturnType<typeof getD1>["prepare"]>[], size = 50) {
  const db = getD1();
  for (let index = 0; index < statements.length; index += size) {
    await db.batch(statements.slice(index, index + size));
  }
}

async function latestAppliedMonth(excludeId = 0) {
  return getD1()
    .prepare(
      `SELECT id, report_year AS reportYear, report_month AS reportMonth
       FROM employee_imports
       WHERE status = 'applied' AND id != ?
       ORDER BY report_year DESC, report_month DESC, id DESC LIMIT 1`,
    )
    .bind(excludeId)
    .first<{ id: number; reportYear: number; reportMonth: number }>();
}

function isOlder(year: number, month: number, latest?: { reportYear: number; reportMonth: number } | null) {
  if (!latest) return false;
  return year * 12 + month < latest.reportYear * 12 + latest.reportMonth;
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const actor = await resolveActor(request);
    if (actor.role !== "admin") throw new Error("ACCESS_DENIED");
    const body = (await request.json()) as {
      action?: "preview" | "apply";
      fileName?: string;
      reportYear?: number;
      reportMonth?: number;
      employees?: RawEmployee[];
      importId?: number;
    };
    const db = getD1();
    const now = new Date().toISOString();

    if (body.action === "preview") {
      const reportYear = Number(body.reportYear || 0);
      const reportMonth = Number(body.reportMonth || 0);
      const rawEmployees = Array.isArray(body.employees) ? body.employees : [];
      if (!/^20\d{2}$/.test(String(reportYear)) || reportMonth < 1 || reportMonth > 12) {
        return Response.json({ error: "شهر أو سنة الجدول غير صحيحة" }, { status: 400 });
      }
      if (rawEmployees.length < 10 || rawEmployees.length > 500) {
        return Response.json({ error: "عدد سجلات الموظفين في الملف غير متوقع" }, { status: 400 });
      }
      const latest = await latestAppliedMonth();
      if (isOlder(reportYear, reportMonth, latest)) {
        return Response.json(
          {
            error: `لا يمكن اعتماد جدول أقدم من الجدول المحفوظ (${latest?.reportMonth}/${latest?.reportYear})`,
          },
          { status: 409 },
        );
      }

      const pointRows = await db.prepare("SELECT id, name FROM points").all<{ id: number; name: string }>();
      const pointIds = new Map(pointRows.results.map((point) => [point.name, point.id]));
      const employees: NormalizedEmployee[] = [];
      const excluded: ExcludedEmployee[] = [];
      const unknownSymbols = new Set<string>();
      const seenCodes = new Set<string>();
      const duplicateCodes = new Set<string>();

      for (const raw of rawEmployees) {
        const fullName = clean(raw.fullName).replace(/االله/g, "الله");
        const employeeCode = normalizeUsername(clean(raw.employeeCode));
        const teamCode = normalizedSymbol(clean(raw.teamCode));
        const mobile = normalizeMobile(clean(raw.mobile));
        const jobNature = clean(raw.jobNature);
        if (!fullName || !employeeCode || !mobile || !jobNature) {
          return Response.json(
            { error: `بيانات الموظف ${fullName || employeeCode || "غير المعروف"} غير مكتملة` },
            { status: 400 },
          );
        }
        if (seenCodes.has(employeeCode)) duplicateCodes.add(employeeCode);
        seenCodes.add(employeeCode);
        if (!teamCode) {
          excluded.push({ fullName, employeeCode, teamCode, reason: "لا يوجد رمز فرقة" });
          continue;
        }
        if (teamCode === "911") {
          excluded.push({ fullName, employeeCode, teamCode, reason: "رمز 911 مستبعد" });
          continue;
        }

        let pointName: string | null | undefined;
        if (Object.prototype.hasOwnProperty.call(numericPoints, teamCode)) {
          pointName = numericPoints[teamCode];
        } else {
          pointName = letterPoints[Array.from(teamCode)[0]];
        }
        if (pointName === undefined) {
          unknownSymbols.add(teamCode);
          continue;
        }
        const pointId = pointName === null ? null : pointIds.get(pointName);
        if (pointName !== null && !pointId) {
          return Response.json({ error: `نقطة الانطلاق ${pointName} غير موجودة` }, { status: 400 });
        }
        employees.push({
          fullName,
          employeeCode,
          teamCode,
          mobile,
          jobNature,
          pointId: pointId ?? null,
          pointName: pointName ?? "إدارة قطاع السلام",
        });
      }

      if (duplicateCodes.size) {
        return Response.json(
          { error: `يوجد كود وظيفي مكرر في الملف: ${Array.from(duplicateCodes).join("، ")}` },
          { status: 400 },
        );
      }
      if (unknownSymbols.size) {
        return Response.json(
          { error: `توجد رموز فرق غير معرّفة: ${Array.from(unknownSymbols).join("، ")}` },
          { status: 400 },
        );
      }
      if (!employees.length) {
        return Response.json({ error: "لا توجد سجلات قابلة للاستيراد" }, { status: 400 });
      }

      const existingRows = await db
        .prepare("SELECT employee_code AS employeeCode, active FROM employees")
        .all<{ employeeCode: string; active: number }>();
      const existing = new Map(existingRows.results.map((employee) => [employee.employeeCode.toUpperCase(), employee]));
      const acceptedCodes = new Set(employees.map((employee) => employee.employeeCode));
      const newRows = employees.filter((employee) => !existing.has(employee.employeeCode)).length;
      const updatedRows = employees.length - newRows;
      const archivedRows = existingRows.results.filter(
        (employee) => employee.active && !acceptedCodes.has(employee.employeeCode.toUpperCase()),
      ).length;
      const distributionMap = new Map<string, number>();
      for (const employee of employees) {
        distributionMap.set(employee.pointName, (distributionMap.get(employee.pointName) || 0) + 1);
      }
      const distribution = Array.from(distributionMap, ([pointName, count]) => ({ pointName, count }));
      const preview: StoredPreview = { employees, excluded, distribution };
      const insert = await db
        .prepare(
          `INSERT INTO employee_imports
            (file_name, report_year, report_month, status, total_rows, accepted_rows,
             excluded_rows, new_rows, updated_rows, archived_rows, preview_json,
             created_by, created_at)
           VALUES (?, ?, ?, 'preview', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          clean(body.fileName).slice(0, 180) || "جدول قطاع السلام.pdf",
          reportYear,
          reportMonth,
          rawEmployees.length,
          employees.length,
          excluded.length,
          newRows,
          updatedRows,
          archivedRows,
          JSON.stringify(preview),
          actor.username || actor.email,
          now,
        )
        .run();

      return Response.json({
        importId: Number(insert.meta.last_row_id || 0),
        reportYear,
        reportMonth,
        totalRows: rawEmployees.length,
        acceptedRows: employees.length,
        excludedRows: excluded.length,
        newRows,
        updatedRows,
        archivedRows,
        distribution,
        employees,
        excluded,
      });
    }

    if (body.action === "apply") {
      const importId = Number(body.importId || 0);
      const importRow = await db
        .prepare(
          `SELECT id, report_year AS reportYear, report_month AS reportMonth,
            status, preview_json AS previewJson, accepted_rows AS acceptedRows,
            excluded_rows AS excludedRows, new_rows AS newRows,
            updated_rows AS updatedRows, archived_rows AS archivedRows
           FROM employee_imports WHERE id = ? LIMIT 1`,
        )
        .bind(importId)
        .first<{
          id: number;
          reportYear: number;
          reportMonth: number;
          status: string;
          previewJson: string;
          acceptedRows: number;
          excludedRows: number;
          newRows: number;
          updatedRows: number;
          archivedRows: number;
        }>();
      if (!importRow || importRow.status !== "preview") {
        return Response.json({ error: "معاينة الاستيراد غير موجودة أو سبق اعتمادها" }, { status: 404 });
      }
      const latest = await latestAppliedMonth(importId);
      if (isOlder(importRow.reportYear, importRow.reportMonth, latest)) {
        return Response.json({ error: "أصبح هذا الجدول أقدم من آخر جدول معتمد" }, { status: 409 });
      }
      const preview = JSON.parse(importRow.previewJson) as StoredPreview;
      if (!preview.employees.length || preview.employees.length !== importRow.acceptedRows) {
        return Response.json({ error: "بيانات المعاينة غير مكتملة" }, { status: 400 });
      }

      const employeeStatements = preview.employees.map((employee) =>
        db
          .prepare(
            `INSERT INTO employees
              (point_id, full_name, employee_code, mobile, national_id, birth_date,
               team_code, job_nature, managed_by_import, active, created_at, updated_at)
             VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, 1, 1, ?, ?)
             ON CONFLICT(employee_code) DO UPDATE SET
               point_id = excluded.point_id,
               full_name = excluded.full_name,
               mobile = excluded.mobile,
               team_code = excluded.team_code,
               job_nature = excluded.job_nature,
               managed_by_import = 1,
               active = 1,
               updated_at = excluded.updated_at`,
          )
          .bind(
            employee.pointId,
            employee.fullName,
            employee.employeeCode,
            employee.mobile,
            employee.teamCode,
            employee.jobNature,
            now,
            now,
          ),
      );
      await runBatches(employeeStatements);

      const employeeRows = await db
        .prepare(
          `SELECT id, employee_code AS employeeCode, full_name AS fullName,
            point_id AS pointId FROM employees WHERE active = 1`,
        )
        .all<{ id: number; employeeCode: string; fullName: string; pointId: number | null }>();
      const acceptedCodes = new Set(preview.employees.map((employee) => employee.employeeCode));
      const acceptedEmployees = employeeRows.results.filter((employee) =>
        acceptedCodes.has(employee.employeeCode.toUpperCase()),
      );
      const archivedEmployees = employeeRows.results.filter((employee) =>
        !acceptedCodes.has(employee.employeeCode.toUpperCase()),
      );

      const accountRows = await db
        .prepare(
          `SELECT id, username, employee_id AS employeeId, role, point_id AS pointId
           FROM access_users WHERE username IS NOT NULL`,
        )
        .all<{
          id: number;
          username: string;
          employeeId: number | null;
          role: string;
          pointId: number | null;
        }>();
      const byEmployeeId = new Map(accountRows.results.filter((user) => user.employeeId).map((user) => [user.employeeId, user]));
      const byUsername = new Map(accountRows.results.map((user) => [user.username.toUpperCase(), user]));
      const password = INITIAL_PASSWORD_CREDENTIALS;
      const accountStatements = acceptedEmployees.map((employee) => {
        const existing = byEmployeeId.get(employee.id) || byUsername.get(employee.employeeCode.toUpperCase());
        if (existing) {
          const accountPointId = ["employee", "point_supervisor"].includes(existing.role)
            ? employee.pointId
            : existing.pointId;
          return db
            .prepare(
              `UPDATE access_users SET username = ?, display_name = ?, point_id = ?,
                employee_id = ?, active = 1 WHERE id = ?`,
            )
            .bind(employee.employeeCode, employee.fullName, accountPointId, employee.id, existing.id);
        }
        return db
          .prepare(
            `INSERT INTO access_users
              (email, username, display_name, role, point_id, employee_id,
               password_hash, password_salt, password_iterations, active, created_at)
             VALUES (?, ?, ?, 'employee', ?, ?, ?, ?, ?, 1, ?)`,
          )
          .bind(
            `employee-${employee.id}@alsalam.local`,
            employee.employeeCode,
            employee.fullName,
            employee.pointId,
            employee.id,
            password.hash,
            password.salt,
            password.iterations,
            now,
          );
      });
      await runBatches(accountStatements);

      if (archivedEmployees.length) {
        const archivedIds = archivedEmployees.map((employee) => employee.id);
        for (let index = 0; index < archivedIds.length; index += 50) {
          const ids = archivedIds.slice(index, index + 50);
          const placeholders = ids.map(() => "?").join(",");
          await db
            .prepare(`UPDATE employees SET active = 0, updated_at = ? WHERE id IN (${placeholders})`)
            .bind(now, ...ids)
            .run();
          await db
            .prepare(`UPDATE access_users SET active = 0 WHERE employee_id IN (${placeholders})`)
            .bind(...ids)
            .run();
          await db
            .prepare(
              `DELETE FROM auth_sessions WHERE user_id IN
                (SELECT id FROM access_users WHERE employee_id IN (${placeholders}))`,
            )
            .bind(...ids)
            .run();
        }
      }

      await db
        .prepare("UPDATE employee_imports SET status = 'applied', applied_at = ? WHERE id = ?")
        .bind(now, importId)
        .run();
      await logActivity(
        actor,
        "اعتماد جدول موظفي القطاع",
        "employee_import",
        importId,
        `${importRow.reportMonth}/${importRow.reportYear} - ${importRow.acceptedRows} موظف`,
      );
      return Response.json({
        ok: true,
        acceptedRows: importRow.acceptedRows,
        excludedRows: importRow.excludedRows,
        newRows: importRow.newRows,
        updatedRows: importRow.updatedRows,
        archivedRows: archivedEmployees.length,
      });
    }

    return Response.json({ error: "الإجراء غير معروف" }, { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}
