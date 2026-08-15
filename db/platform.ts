import { getBindings } from "./runtime-env";
import {
  hashSessionToken,
  INITIAL_PASSWORD_CREDENTIALS,
  readCookie,
  SESSION_COOKIE,
} from "./auth";

export type Role =
  | "admin"
  | "sector_supervisor"
  | "point_supervisor"
  | "employee";

export type Actor = {
  id: number;
  email: string;
  username: string | null;
  displayName: string;
  role: Role;
  pointId: number | null;
  employeeId: number | null;
  active: number;
  mustChangePassword: number;
};

const pointNames = [
  "سلطانة",
  "الميقات",
  "العزيزية",
  "شوران",
  "طيبة",
  "القصر",
  "مسجد القبلتين",
];

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS points (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS employees (id INTEGER PRIMARY KEY AUTOINCREMENT, point_id INTEGER, full_name TEXT NOT NULL, employee_code TEXT NOT NULL UNIQUE, mobile TEXT NOT NULL, national_id TEXT UNIQUE, birth_date TEXT, email TEXT, team_code TEXT, job_nature TEXT, managed_by_import INTEGER NOT NULL DEFAULT 0, response_time_seconds INTEGER, emergency_response_seconds INTEGER, echo_response_seconds INTEGER, incident_response_seconds INTEGER, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS access_users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, username TEXT UNIQUE, display_name TEXT NOT NULL, role TEXT NOT NULL, point_id INTEGER, employee_id INTEGER, password_hash TEXT, password_salt TEXT, password_iterations INTEGER, password_changed_at TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS certificates (id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL, name TEXT NOT NULL, issuer TEXT, issue_date TEXT, expiry_date TEXT, notes TEXT, attachment_key TEXT, attachment_name TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS performance_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL, period TEXT NOT NULL, score INTEGER NOT NULL, rating TEXT NOT NULL, weaknesses TEXT, improvements TEXT, notes TEXT, reviewer_email TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS form_templates (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT NOT NULL, name TEXT NOT NULL, template_text TEXT NOT NULL, attachment_key TEXT, attachment_name TEXT, active INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS form_records (id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL, template_id INTEGER, title TEXT NOT NULL, content TEXT NOT NULL, event_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'محفوظ', attachment_key TEXT, attachment_name TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS custody_items (id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL, point_id INTEGER NOT NULL, device_name TEXT NOT NULL, serial_number TEXT NOT NULL, delivered_at TEXT, item_condition TEXT NOT NULL DEFAULT 'سليم', status TEXT NOT NULL DEFAULT 'بعهدة الموظف', returned_at TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_email TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id INTEGER, details TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (username TEXT PRIMARY KEY, failures INTEGER NOT NULL DEFAULT 0, locked_until TEXT, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS password_reset_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, username TEXT NOT NULL, display_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', requested_at TEXT NOT NULL, resolved_at TEXT, resolved_by TEXT)`,
  `CREATE TABLE IF NOT EXISTS employee_imports (id INTEGER PRIMARY KEY AUTOINCREMENT, file_name TEXT NOT NULL, report_year INTEGER NOT NULL, report_month INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'preview', total_rows INTEGER NOT NULL, accepted_rows INTEGER NOT NULL, excluded_rows INTEGER NOT NULL, new_rows INTEGER NOT NULL, updated_rows INTEGER NOT NULL, archived_rows INTEGER NOT NULL, preview_json TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, applied_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS employees_point_idx ON employees(point_id, active)`,
  `CREATE INDEX IF NOT EXISTS certificates_employee_idx ON certificates(employee_id)`,
  `CREATE INDEX IF NOT EXISTS performance_employee_idx ON performance_reviews(employee_id)`,
  `CREATE INDEX IF NOT EXISTS forms_employee_idx ON form_records(employee_id)`,
  `CREATE INDEX IF NOT EXISTS custody_employee_idx ON custody_items(employee_id)`,
  `CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id, expires_at)`,
  `CREATE INDEX IF NOT EXISTS password_resets_status_idx ON password_reset_requests(status, requested_at)`,
  `CREATE INDEX IF NOT EXISTS employee_imports_status_idx ON employee_imports(status, report_year, report_month)`,
];

let initialized = false;

export function getD1() {
  const db = getBindings().DB;
  if (!db) throw new Error("قاعدة البيانات غير متاحة حاليًا");
  return db;
}

export async function ensureSchema() {
  if (initialized) return;
  const db = getD1();
  await db.batch(schemaStatements.map((sql) => db.prepare(sql)));
  const columnMigrations: Record<string, Record<string, string>> = {
    employees: {
      team_code: "ALTER TABLE employees ADD COLUMN team_code TEXT",
      job_nature: "ALTER TABLE employees ADD COLUMN job_nature TEXT",
      managed_by_import:
        "ALTER TABLE employees ADD COLUMN managed_by_import INTEGER NOT NULL DEFAULT 0",
      response_time_seconds:
        "ALTER TABLE employees ADD COLUMN response_time_seconds INTEGER",
      emergency_response_seconds:
        "ALTER TABLE employees ADD COLUMN emergency_response_seconds INTEGER",
      echo_response_seconds:
        "ALTER TABLE employees ADD COLUMN echo_response_seconds INTEGER",
      incident_response_seconds:
        "ALTER TABLE employees ADD COLUMN incident_response_seconds INTEGER",
    },
    access_users: {
      username: "ALTER TABLE access_users ADD COLUMN username TEXT",
      password_hash: "ALTER TABLE access_users ADD COLUMN password_hash TEXT",
      password_salt: "ALTER TABLE access_users ADD COLUMN password_salt TEXT",
      password_iterations:
        "ALTER TABLE access_users ADD COLUMN password_iterations INTEGER",
      password_changed_at:
        "ALTER TABLE access_users ADD COLUMN password_changed_at TEXT",
    },
    performance_reviews: {
      weaknesses: "ALTER TABLE performance_reviews ADD COLUMN weaknesses TEXT",
      improvements: "ALTER TABLE performance_reviews ADD COLUMN improvements TEXT",
    },
  };
  for (const [table, columns] of Object.entries(columnMigrations)) {
    const info = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    const existing = new Set(info.results.map((column) => column.name));
    for (const [column, sql] of Object.entries(columns)) {
      if (!existing.has(column)) {
        try {
          await db.prepare(sql).run();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!message.toLowerCase().includes("duplicate column")) throw error;
        }
      }
    }
  }
  await db.prepare(
    "CREATE UNIQUE INDEX IF NOT EXISTS access_users_username_unique ON access_users(username)",
  ).run();
  await db.batch(
    pointNames.map((name, index) =>
      db
        .prepare("INSERT OR IGNORE INTO points (name, sort_order) VALUES (?, ?)")
        .bind(name, index + 1),
    ),
  );
  const primaryAdmin = await db
    .prepare("SELECT id FROM access_users WHERE upper(username) = 'ADMIN' LIMIT 1")
    .first<{ id: number }>();
  if (!primaryAdmin) {
    const password = INITIAL_PASSWORD_CREDENTIALS;
    await db
      .prepare(
        `INSERT OR IGNORE INTO access_users
          (email, username, display_name, role, point_id, employee_id,
           password_hash, password_salt, password_iterations, password_changed_at,
           active, created_at)
         VALUES ('admin@alsalam.local', 'ADMIN', 'الإدارة', 'admin', NULL, NULL,
           ?, ?, ?, NULL, 1, ?)`,
      )
      .bind(password.hash, password.salt, password.iterations, new Date().toISOString())
      .run();
  }
  initialized = true;
}

function previewIdentity(request: Request) {
  const hostname = new URL(request.url).hostname;
  if (hostname === "terminal.local" || hostname === "localhost") {
    return { email: "admin.preview@alsalam.local", displayName: "إدارة قطاع السلام" };
  }
  return null;
}

export async function resolveActor(request: Request): Promise<Actor> {
  await ensureSchema();
  const db = getD1();
  const sessionToken = readCookie(request, SESSION_COOKIE);
  if (sessionToken) {
    const tokenHash = await hashSessionToken(sessionToken);
    const sessionActor = await db
      .prepare(
        `SELECT u.id, u.email, u.username, u.display_name AS displayName, u.role,
          u.point_id AS pointId, u.employee_id AS employeeId, u.active,
          CASE WHEN upper(u.username) = 'ADMIN' AND u.password_changed_at IS NULL THEN 1 ELSE 0 END AS mustChangePassword
         FROM auth_sessions s
         JOIN access_users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1`,
      )
      .bind(tokenHash, new Date().toISOString())
      .first<Actor>();
    if (sessionActor?.active) {
      await db
        .prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE token_hash = ?")
        .bind(new Date().toISOString(), tokenHash)
        .run();
      return ensureEmployeeLink(sessionActor);
    }
  }
  const preview = previewIdentity(request);
  if (!preview) throw new Error("AUTH_REQUIRED");
  const email = preview.email;
  const displayName = preview.displayName;

  let actor = await db
    .prepare(
      "SELECT id, email, username, display_name AS displayName, role, point_id AS pointId, employee_id AS employeeId, active, CASE WHEN upper(username) = 'ADMIN' AND password_changed_at IS NULL THEN 1 ELSE 0 END AS mustChangePassword FROM access_users WHERE lower(email) = lower(?) LIMIT 1",
    )
    .bind(email)
    .first<Actor>();

  if (!actor) {
    await db
      .prepare(
        "INSERT INTO access_users (email, display_name, role, active, created_at) VALUES (?, ?, ?, 1, ?)",
      )
      .bind(email, displayName, "admin", new Date().toISOString())
      .run();
    actor = await db
      .prepare(
        "SELECT id, email, username, display_name AS displayName, role, point_id AS pointId, employee_id AS employeeId, active, CASE WHEN upper(username) = 'ADMIN' AND password_changed_at IS NULL THEN 1 ELSE 0 END AS mustChangePassword FROM access_users WHERE lower(email) = lower(?) LIMIT 1",
      )
      .bind(email)
      .first<Actor>();
  }

  if (!actor || !actor.active) throw new Error("ACCESS_DENIED");
  return ensureEmployeeLink(actor);
}

async function ensureEmployeeLink(actor: Actor): Promise<Actor> {
  if (actor.role !== "employee" || actor.employeeId || !actor.username) return actor;
  const db = getD1();
  const employee = await db
    .prepare(
      `SELECT id, point_id AS pointId, full_name AS fullName
       FROM employees
       WHERE upper(employee_code) = upper(?) AND active = 1
       LIMIT 1`,
    )
    .bind(actor.username)
    .first<{ id: number; pointId: number | null; fullName: string }>();
  if (!employee) return actor;
  await db
    .prepare(
      `UPDATE access_users
       SET employee_id = ?, point_id = ?, display_name = ?
       WHERE id = ?`,
    )
    .bind(employee.id, employee.pointId, employee.fullName, actor.id)
    .run();
  return {
    ...actor,
    employeeId: employee.id,
    pointId: employee.pointId,
    displayName: employee.fullName,
  };
}

export function isManagement(actor: Actor) {
  return actor.role === "admin" || actor.role === "sector_supervisor";
}

export function canManagePoint(actor: Actor, pointId: number | null) {
  return isManagement(actor) ||
    (actor.role === "point_supervisor" && actor.pointId === pointId);
}

export async function canAccessEmployee(actor: Actor, employeeId: number) {
  if (isManagement(actor)) return true;
  if (actor.role === "employee") return actor.employeeId === employeeId;
  const employee = await getD1()
    .prepare("SELECT point_id AS pointId FROM employees WHERE id = ? LIMIT 1")
    .bind(employeeId)
    .first<{ pointId: number | null }>();
  return actor.role === "point_supervisor" && employee?.pointId === actor.pointId;
}

export async function logActivity(
  actor: Actor,
  action: string,
  entityType: string,
  entityId: number | null,
  details = "",
) {
  await getD1()
    .prepare(
      "INSERT INTO activity_log (actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(actor.username || actor.email, action, entityType, entityId, details, new Date().toISOString())
    .run();
}

export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  if (message === "AUTH_REQUIRED") {
    return Response.json({ error: "يلزم تسجيل الدخول" }, { status: 401 });
  }
  if (message === "ACCESS_DENIED") {
    return Response.json({ error: "ليس لديك صلاحية لتنفيذ هذا الإجراء" }, { status: 403 });
  }
  return Response.json({ error: "تعذر إكمال العملية", detail: message }, { status: 500 });
}
