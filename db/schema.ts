import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const points = sqliteTable("points", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const employees = sqliteTable("employees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pointId: integer("point_id"),
  fullName: text("full_name").notNull(),
  employeeCode: text("employee_code").notNull().unique(),
  mobile: text("mobile").notNull(),
  nationalId: text("national_id").unique(),
  birthDate: text("birth_date"),
  email: text("email"),
  teamCode: text("team_code"),
  jobNature: text("job_nature"),
  managedByImport: integer("managed_by_import", { mode: "boolean" }).notNull().default(false),
  responseTimeSeconds: integer("response_time_seconds"),
  emergencyResponseSeconds: integer("emergency_response_seconds"),
  echoResponseSeconds: integer("echo_response_seconds"),
  incidentResponseSeconds: integer("incident_response_seconds"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const accessUsers = sqliteTable("access_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  username: text("username").unique(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(),
  pointId: integer("point_id"),
  employeeId: integer("employee_id"),
  passwordHash: text("password_hash"),
  passwordSalt: text("password_salt"),
  passwordIterations: integer("password_iterations"),
  passwordChangedAt: text("password_changed_at"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const certificates = sqliteTable("certificates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull(),
  name: text("name").notNull(),
  issuer: text("issuer"),
  issueDate: text("issue_date"),
  expiryDate: text("expiry_date"),
  notes: text("notes"),
  attachmentKey: text("attachment_key"),
  attachmentName: text("attachment_name"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const performanceReviews = sqliteTable("performance_reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull(),
  period: text("period").notNull(),
  score: integer("score").notNull(),
  rating: text("rating").notNull(),
  weaknesses: text("weaknesses"),
  improvements: text("improvements"),
  notes: text("notes"),
  reviewerEmail: text("reviewer_email").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const authSessions = sqliteTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
});

export const loginAttempts = sqliteTable("login_attempts", {
  username: text("username").primaryKey(),
  failures: integer("failures").notNull().default(0),
  lockedUntil: text("locked_until"),
  updatedAt: text("updated_at").notNull(),
});

export const passwordResetRequests = sqliteTable("password_reset_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  username: text("username").notNull(),
  displayName: text("display_name").notNull(),
  status: text("status").notNull().default("pending"),
  requestedAt: text("requested_at").notNull(),
  resolvedAt: text("resolved_at"),
  resolvedBy: text("resolved_by"),
});

export const employeeImports = sqliteTable("employee_imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileName: text("file_name").notNull(),
  reportYear: integer("report_year").notNull(),
  reportMonth: integer("report_month").notNull(),
  status: text("status").notNull().default("preview"),
  totalRows: integer("total_rows").notNull(),
  acceptedRows: integer("accepted_rows").notNull(),
  excludedRows: integer("excluded_rows").notNull(),
  newRows: integer("new_rows").notNull(),
  updatedRows: integer("updated_rows").notNull(),
  archivedRows: integer("archived_rows").notNull(),
  previewJson: text("preview_json").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  appliedAt: text("applied_at"),
});

export const formTemplates = sqliteTable("form_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category").notNull(),
  name: text("name").notNull(),
  templateText: text("template_text").notNull(),
  attachmentKey: text("attachment_key"),
  attachmentName: text("attachment_name"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const formRecords = sqliteTable("form_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull(),
  templateId: integer("template_id"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  eventDate: text("event_date").notNull(),
  status: text("status").notNull().default("محفوظ"),
  attachmentKey: text("attachment_key"),
  attachmentName: text("attachment_name"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const custodyItems = sqliteTable("custody_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull(),
  pointId: integer("point_id").notNull(),
  deviceName: text("device_name").notNull(),
  serialNumber: text("serial_number").notNull(),
  deliveredAt: text("delivered_at"),
  itemCondition: text("item_condition").notNull().default("سليم"),
  status: text("status").notNull().default("بعهدة الموظف"),
  returnedAt: text("returned_at"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const activityLog = sqliteTable("activity_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  details: text("details"),
  createdAt: text("created_at").notNull(),
});
