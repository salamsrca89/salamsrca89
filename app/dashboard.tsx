"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type RefObject,
  type ReactNode,
} from "react";
import { parseEmployeeSchedule, type PdfTextPosition } from "./employee-pdf-parser";

type Role = "admin" | "sector_supervisor" | "point_supervisor" | "employee";
type Actor = {
  id: number;
  email: string;
  username: string | null;
  displayName: string;
  role: Role;
  pointId: number | null;
  employeeId: number | null;
  mustChangePassword: number;
};
type Point = { id: number; name: string; sortOrder: number; employeeCount: number };
type Employee = {
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
  certificateCount: number;
  formCount: number;
  custodyCount: number;
  latestScore: number | null;
};
type Certificate = {
  id: number;
  employeeId: number;
  name: string;
  issuer: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  notes: string | null;
  attachmentKey: string | null;
  attachmentName: string | null;
};
type Performance = {
  id: number;
  employeeId: number;
  period: string;
  score: number;
  rating: string;
  weaknesses: string | null;
  improvements: string | null;
  notes: string | null;
  reviewerEmail: string;
  createdAt: string;
};
type FormTemplate = {
  id: number;
  category: string;
  name: string;
  templateText: string;
  attachmentKey: string | null;
  attachmentName: string | null;
  updatedAt: string;
};
type FormRecord = {
  id: number;
  employeeId: number;
  templateId: number | null;
  title: string;
  content: string;
  eventDate: string;
  status: string;
  attachmentKey: string | null;
  attachmentName: string | null;
  createdBy: string;
};
type Custody = {
  id: number;
  employeeId: number;
  pointId: number;
  deviceName: string;
  serialNumber: string;
  deliveredAt: string | null;
  itemCondition: string;
  status: string;
  returnedAt: string | null;
  notes: string | null;
};
type AccessUser = {
  id: number;
  email: string;
  username: string | null;
  displayName: string;
  role: Role;
  pointId: number | null;
  pointName: string | null;
  employeeId: number | null;
  passwordChangedAt: string | null;
  active: number;
};
type Activity = {
  id: number;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: number | null;
  details: string | null;
  createdAt: string;
};
type PasswordResetRequest = {
  id: number;
  userId: number;
  username: string;
  displayName: string;
  status: string;
  requestedAt: string;
};
type Notification = {
  id: number;
  employeeId: number;
  pointId: number | null;
  name: string;
  expiryDate: string;
  employeeName: string;
};
type ImportPreview = {
  importId: number;
  reportYear: number;
  reportMonth: number;
  totalRows: number;
  acceptedRows: number;
  excludedRows: number;
  newRows: number;
  updatedRows: number;
  archivedRows: number;
  distribution: Array<{ pointName: string; count: number }>;
  employees: Array<{
    fullName: string;
    employeeCode: string;
    teamCode: string;
    mobile: string;
    jobNature: string;
    pointName: string;
  }>;
  excluded: Array<{
    fullName: string;
    employeeCode: string;
    teamCode: string;
    reason: string;
  }>;
};
type EmployeeDetails = {
  employee: Employee;
  certificates: Certificate[];
  performance: Performance[];
  forms: FormRecord[];
  custody: Custody[];
};
type DashboardData = {
  actor: Actor;
  points: Point[];
  employees: Employee[];
  employeeDetails: EmployeeDetails | null;
  templates: FormTemplate[];
  users: AccessUser[];
  passwordResetRequests: PasswordResetRequest[];
  notifications: Notification[];
  activity: Activity[];
  summary: {
    employees: number;
    expiringCertificates: number;
    activeCustody: number;
    savedForms: number;
    generalResponseSeconds: number | null;
    emergencyResponseSeconds: number | null;
    echoResponseSeconds: number | null;
    incidentResponseSeconds: number | null;
  };
};

type View = "home" | "employees" | "templates" | "users" | "activity";
type ProfileTab = "overview" | "certificates" | "performance" | "forms" | "custody";
type ModalState =
  | { type: "employee"; item?: Employee }
  | { type: "certificate"; item?: Certificate }
  | { type: "performance"; item?: Performance }
  | { type: "custody"; item?: Custody }
  | { type: "template"; item?: FormTemplate }
  | { type: "record"; item?: FormRecord; template?: FormTemplate }
  | { type: "user"; item?: AccessUser }
  | null;

const roleNames: Record<Role, string> = {
  admin: "الإدارة",
  sector_supervisor: "مشرف القطاع",
  point_supervisor: "مشرف نقطة",
  employee: "موظف",
};

const categoryNames: Record<string, string> = {
  incident: "الحوادث",
  handover: "استلام وتسليم العهد",
  violation: "المخالفات",
  cpr: "CPR ناجح",
  other: "أخرى",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar-SA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function expiryTone(value?: string | null) {
  if (!value) return "neutral";
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
  if (days < 0) return "danger";
  if (days <= 90) return "warning";
  return "success";
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

function formatResponseTime(value?: number | null, empty = "—") {
  if (value === null || value === undefined || !Number.isFinite(value)) return empty;
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function readError(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  return payload.error || "تعذر إكمال العملية";
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const [view, setView] = useState<View>("home");
  const [selectedPointId, setSelectedPointId] = useState<number>(0);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number>(0);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [profileTab, setProfileTab] = useState<ProfileTab>("overview");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<{ text: string; tone: "success" | "danger" } | null>(null);

  async function load(pointId = selectedPointId, employeeId = selectedEmployeeId) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (pointId) params.set("pointId", String(pointId));
      if (employeeId) params.set("employeeId", String(employeeId));
      const response = await fetch(`/api/dashboard?${params}`, { cache: "no-store" });
      if (response.status === 401) {
        setData(null);
        setAuthStatus("unauthenticated");
        return;
      }
      if (!response.ok) throw new Error(await readError(response));
      const next = (await response.json()) as DashboardData;
      setData(next);
      setAuthStatus("authenticated");
      if (next.actor.mustChangePassword) setPasswordOpen(true);
      if (next.actor.role === "employee" && next.employeeDetails?.employee) {
        setView("employees");
        setSelectedPointId(Number(next.employeeDetails.employee.pointId || 0));
        setSelectedEmployeeId(next.employeeDetails.employee.id);
        setProfileTab((current) =>
          ["overview", "certificates", "performance"].includes(current)
            ? current
            : "overview",
        );
      }
      if (!next.employeeDetails && next.actor.role !== "employee") {
        setSelectedEmployeeId(0);
      }
    } catch (error) {
      setToast({
        text: error instanceof Error ? error.message : "تعذر تحميل البيانات",
        tone: "danger",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const previewLogin =
      window.location.hostname === "terminal.local" &&
      new URLSearchParams(window.location.search).has("login-preview");
    if (previewLogin) {
      const timer = window.setTimeout(() => {
        setLoading(false);
        setAuthStatus("unauthenticated");
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => void load(0, 0), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredEmployees = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLocaleLowerCase("ar");
    if (!term) return data.employees;
    return data.employees.filter((employee) =>
      [employee.fullName, employee.employeeCode, employee.mobile, employee.nationalId, employee.teamCode, employee.jobNature]
        .join(" ")
        .toLocaleLowerCase("ar")
        .includes(term),
    );
  }, [data, search]);

  async function readEmployeePdf(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLocaleLowerCase("en").endsWith(".pdf")) {
      throw new Error("اختر ملف PDF فقط");
    }
    if (file.size > 20 * 1024 * 1024) throw new Error("حجم ملف PDF يتجاوز 20MB");
    type PdfJsModule = {
      GlobalWorkerOptions: { workerSrc: string };
      getDocument: (input: { data: Uint8Array }) => {
        promise: Promise<{
          numPages: number;
          getPage: (pageNumber: number) => Promise<{
            getTextContent: () => Promise<{
              items: Array<{ str?: string; transform?: number[] }>;
            }>;
          }>;
        }>;
      };
    };
    const pdfGlobal = window as typeof window & { __alsalamPdfJs?: PdfJsModule };
    if (!pdfGlobal.__alsalamPdfJs) {
      await new Promise<void>((resolve, reject) => {
        const ready = () => resolve();
        window.addEventListener("alsalam-pdfjs-ready", ready, { once: true });
        const existing = document.querySelector<HTMLScriptElement>('script[data-alsalam-pdfjs="1"]');
        if (existing) return;
        const script = document.createElement("script");
        script.type = "module";
        script.src = "/pdfjs/loader.mjs";
        script.dataset.alsalamPdfjs = "1";
        script.onerror = () => {
          window.removeEventListener("alsalam-pdfjs-ready", ready);
          script.remove();
          reject(new Error("تعذر تشغيل قارئ ملفات PDF"));
        };
        document.head.appendChild(script);
      });
    }
    const pdfjs = pdfGlobal.__alsalamPdfJs;
    if (!pdfjs) throw new Error("تعذر تشغيل قارئ ملفات PDF");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.mjs";
    const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: PdfTextPosition[][] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items.flatMap((item) => {
          if (!item.str || !item.transform || item.transform.length < 6) return [];
          return [{ str: item.str, x: item.transform[4], y: item.transform[5] }];
        }),
      );
    }
    return parseEmployeeSchedule(pages);
  }

  async function previewEmployeeImport(file: File) {
    setImporting(true);
    try {
      const parsed = await readEmployeePdf(file);
      const response = await fetch("/api/employee-import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "preview", fileName: file.name, ...parsed }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setImportPreview((await response.json()) as ImportPreview);
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : "تعذر قراءة جدول الموظفين", tone: "danger" });
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  async function applyEmployeeImport() {
    if (!importPreview) return;
    setImporting(true);
    try {
      const response = await fetch("/api/employee-import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "apply", importId: importPreview.importId }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setImportPreview(null);
      setSelectedEmployeeId(0);
      setSelectedPointId(0);
      setToast({ text: "تم اعتماد جدول الموظفين وإنشاء الحسابات بنجاح", tone: "success" });
      await load(0, 0);
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : "تعذر اعتماد الاستيراد", tone: "danger" });
    } finally {
      setImporting(false);
    }
  }

  async function mutate(action: string, values: Record<string, string | number | boolean | null>) {
    const response = await fetch("/api/mutations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, data: values }),
    });
    if (!response.ok) throw new Error(await readError(response));
    setToast({ text: "تم الحفظ بنجاح", tone: "success" });
    setModal(null);
    await load();
  }

  async function remove(
    action: string,
    id: number,
    label: string,
    extra: Record<string, string | number | boolean | null> = {},
  ) {
    if (!window.confirm(`هل تريد ${label}؟`)) return;
    try {
      await mutate(action, { id, ...extra });
      if (action === "archive_employee") {
        setSelectedEmployeeId(0);
        setProfileTab("overview");
      }
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : "تعذر الحذف", tone: "danger" });
    }
  }

  async function openPoint(pointId: number) {
    setSelectedPointId(pointId);
    setSelectedEmployeeId(0);
    setView("employees");
    setProfileTab("overview");
    await load(pointId, 0);
  }

  async function openEmployee(employeeId: number) {
    setSelectedEmployeeId(employeeId);
    setProfileTab("overview");
    await load(selectedPointId, employeeId);
  }

  async function openNotification() {
    if (data?.actor.role === "admin" && data.passwordResetRequests[0]) {
      setView("users");
      setSelectedEmployeeId(0);
      return;
    }
    const notification = data?.notifications[0];
    if (!notification) return;
    setView("employees");
    setSelectedPointId(Number(notification.pointId || 0));
    setSelectedEmployeeId(notification.employeeId);
    setProfileTab("certificates");
    await load(Number(notification.pointId || 0), notification.employeeId);
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setData(null);
      setAuthStatus("unauthenticated");
      setView("home");
      setSelectedEmployeeId(0);
      setSelectedPointId(0);
      setProfileTab("overview");
    }
  }

  if (authStatus === "unauthenticated") {
    return <LoginScreen onSuccess={() => void load(0, 0)} />;
  }
  if (!data && loading) return <LoadingScreen />;
  if (!data) return <LoadingScreen message="تعذر فتح النظام" />;

  const canManageEmployees = data.actor.role !== "employee";
  const canManageTemplates = ["admin", "sector_supervisor"].includes(data.actor.role);
  const currentPoint = data.points.find((point) => point.id === selectedPointId);

  return (
    <div className="app-shell" dir="rtl">
      <aside className="sidebar">
        {data.actor.role !== "employee" ? (
          <>
            <div className="sector-card sector-card-prominent">
              <span className="sector-icon">س</span>
              <div>
                <strong>قطاع السلام</strong>
              </div>
              <span className="live-dot" aria-label="متصل" />
            </div>
            <nav className="sidebar-main-nav" aria-label="القائمة الرئيسية">
              <button
                className={view === "home" ? "active" : ""}
                onClick={() => {
                  setView("home");
                  setSelectedEmployeeId(0);
                  setSelectedPointId(data.actor.role === "point_supervisor" ? Number(data.actor.pointId || 0) : 0);
                  void load(data.actor.role === "point_supervisor" ? Number(data.actor.pointId || 0) : 0, 0);
                }}
              >
                <span className="nav-icon">⌂</span>
                <span>الرئيسية</span>
              </button>
              <button
                className={view === "employees" && !selectedEmployeeId ? "active" : ""}
                onClick={() => void openPoint(data.actor.role === "point_supervisor" ? Number(data.actor.pointId || 0) : 0)}
              >
                <span className="nav-icon">♙</span>
                <span>إدارة الموظفين</span>
              </button>
              <button
                className={pointsOpen ? "active" : ""}
                onClick={() => setPointsOpen((open) => !open)}
                aria-expanded={pointsOpen}
              >
                <span className="nav-icon">⌖</span>
                <span>نقاط الانطلاق</span>
                <b>{pointsOpen ? "⌃" : "⌄"}</b>
              </button>
            </nav>
            {pointsOpen && (
              <nav className="points-nav points-dropdown" aria-label="نقاط الانطلاق">
                {data.actor.role !== "point_supervisor" && (
                  <button
                    className={!selectedPointId && view === "employees" ? "active" : ""}
                    onClick={() => void openPoint(0)}
                  >
                    <span className="nav-icon">⌂</span>
                    <span>جميع النقاط</span>
                    <b>{data.points.reduce((sum, point) => sum + Number(point.employeeCount), 0)}</b>
                  </button>
                )}
                {data.points.map((point) => (
                  <button
                    key={point.id}
                    className={selectedPointId === point.id && view === "employees" ? "active" : ""}
                    onClick={() => void openPoint(point.id)}
                  >
                    <span className="nav-icon">⌖</span>
                    <span>{point.name}</span>
                    <b>{point.employeeCount}</b>
                  </button>
                ))}
              </nav>
            )}
          </>
        ) : (
          <div className="employee-side-card">
            <div className="avatar large">{initials(data.actor.displayName)}</div>
            <strong>{data.actor.displayName}</strong>
          </div>
        )}

        <div className="sidebar-tools">
          {data.actor.role !== "employee" && (
            <button
              className={view === "templates" ? "active" : ""}
              onClick={() => {
                setView("templates");
                setSelectedEmployeeId(0);
              }}
            >
              <span>▤</span> مكتبة النماذج
            </button>
          )}
          {data.actor.role === "admin" && (
            <button
              className={view === "users" ? "active" : ""}
              onClick={() => {
                setView("users");
                setSelectedEmployeeId(0);
                setSelectedPointId(0);
                void load(0, 0);
              }}
            >
              <span>♙</span> المستخدمون والصلاحيات
            </button>
          )}
          {data.actor.role !== "point_supervisor" && data.actor.role !== "employee" && (
            <button
              className={view === "activity" ? "active" : ""}
              onClick={() => {
                setView("activity");
                setSelectedEmployeeId(0);
              }}
            >
              <span>◷</span> سجل العمليات
            </button>
          )}
        </div>

        <div className="user-panel">
          <div className="user-panel-main">
            <div className="avatar">{initials(data.actor.displayName)}</div>
            <div>
              <strong>{data.actor.displayName}</strong>
              <small>{data.actor.username || roleNames[data.actor.role]}</small>
            </div>
            <span className="online-indicator" />
          </div>
          <div className="user-panel-actions">
            {data.actor.username && (
              <button onClick={() => setPasswordOpen(true)}>تغيير كلمة المرور</button>
            )}
            <button onClick={() => void logout()}>تسجيل الخروج</button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <h1>
              {view === "home"
                ? "الرئيسية"
                : view === "employees" && selectedEmployeeId
                ? data.employeeDetails?.employee.fullName || "ملف الموظف"
                : view === "employees"
                  ? currentPoint
                    ? `نقطة انطلاق ${currentPoint.name}`
                    : "إدارة موظفي قطاع السلام"
                  : view === "templates"
                    ? "مكتبة النماذج"
                    : view === "users"
                      ? "المستخدمون والصلاحيات"
                      : "سجل العمليات"}
            </h1>
          </div>
          <div className="top-actions">
            {view === "employees" && !selectedEmployeeId && (
              <label className="search-box">
                <span>⌕</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="بحث بالاسم أو الكود أو الجوال"
                  aria-label="بحث الموظفين"
                />
              </label>
            )}
            <button className="icon-button" aria-label="التنبيهات" onClick={() => void openNotification()}>
              ♢
              {data.summary.expiringCertificates + data.passwordResetRequests.length > 0 && (
                <b>{data.summary.expiringCertificates + data.passwordResetRequests.length}</b>
              )}
            </button>
            <div className="sync-chip"><span /> محفوظ سحابيًا</div>
          </div>
        </header>

        <div className="content-area">
          {view === "home" && data.actor.role !== "employee" && (
            <ManagementHome data={data} />
          )}

          {view === "employees" && !selectedEmployeeId && (
            <EmployeesView
              employees={filteredEmployees}
              currentPoint={currentPoint}
              canManage={canManageEmployees}
              canImport={data.actor.role === "admin"}
              importing={importing}
              importInputRef={importInputRef}
              onImport={(file) => void previewEmployeeImport(file)}
              onAdd={() => setModal({ type: "employee" })}
              onOpen={(id) => void openEmployee(id)}
              onEdit={(item) => setModal({ type: "employee", item })}
              onArchive={(id) => void remove("archive_employee", id, "أرشفة الموظف")}
            />
          )}

          {view === "employees" && selectedEmployeeId > 0 && data.employeeDetails && (
            <EmployeeProfile
              details={data.employeeDetails}
              templates={data.templates}
              tab={profileTab}
              actor={data.actor}
              onTab={setProfileTab}
              onBack={() => {
                setSelectedEmployeeId(0);
                setProfileTab("overview");
                void load(selectedPointId, 0);
              }}
              onEditEmployee={() => setModal({ type: "employee", item: data.employeeDetails!.employee })}
              onModal={setModal}
              onDelete={(action, id, label, extra) => void remove(action, id, label, extra)}
            />
          )}

          {view === "templates" && (
            <TemplatesView
              templates={data.templates}
              employees={data.employees}
              canManage={canManageTemplates}
              onAdd={() => setModal({ type: "template" })}
              onEdit={(item) => setModal({ type: "template", item })}
              onUse={(template) => setModal({ type: "record", template })}
              onDelete={(id) => void remove("delete_template", id, "أرشفة هذا القالب")}
              onRemoveAttachment={(id) => void remove("remove_attachment", id, "حذف المرفق", { entityType: "template" })}
            />
          )}

          {view === "users" && data.actor.role === "admin" && (
            <UsersView
              users={data.users}
              resetRequests={data.passwordResetRequests}
              currentActorId={data.actor.id}
              onAdd={() => setModal({ type: "user" })}
              onEdit={(item) => setModal({ type: "user", item })}
              onDelete={(id) => void remove("delete_user", id, "تعطيل المستخدم")}
              onReset={(id) => void remove("reset_user_password", id, "إعادة كلمة المرور إلى 997")}
              onResolveReset={(id, decision) => void remove(
                "resolve_password_reset",
                id,
                decision === "approve" ? "اعتماد الطلب وإعادة كلمة المرور إلى 997" : "رفض طلب الاستعادة",
                { decision },
              )}
            />
          )}

          {view === "activity" && <ActivityView rows={data.activity} />}
        </div>
      </main>

      {loading && <div className="loading-bar" />}
      {toast && <div className={`toast ${toast.tone}`}>{toast.text}</div>}
      {modal && (
        <EntityModal
          state={modal}
          data={data}
          currentPointId={selectedPointId}
          currentEmployeeId={selectedEmployeeId}
          onClose={() => setModal(null)}
          onSave={mutate}
          onError={(text) => setToast({ text, tone: "danger" })}
        />
      )}
      {passwordOpen && (
        <ChangePasswordModal
          required={Boolean(data.actor.mustChangePassword)}
          onClose={() => {
            if (!data.actor.mustChangePassword) setPasswordOpen(false);
          }}
          onSuccess={() => {
            setPasswordOpen(false);
            setToast({ text: "تم تغيير كلمة المرور بنجاح", tone: "success" });
            void load();
          }}
          onError={(text) => setToast({ text, tone: "danger" })}
        />
      )}
      {importPreview && (
        <EmployeeImportModal
          preview={importPreview}
          saving={importing}
          onClose={() => setImportPreview(null)}
          onApply={() => void applyEmployeeImport()}
        />
      )}
    </div>
  );
}

function EmployeeImportModal({
  preview,
  saving,
  onClose,
  onApply,
}: {
  preview: ImportPreview;
  saving: boolean;
  onClose: () => void;
  onApply: () => void;
}) {
  const monthName = [
    "", "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
  ][preview.reportMonth];
  const stats = [
    ["إجمالي الملف", preview.totalRows],
    ["سيتم اعتماده", preview.acceptedRows],
    ["مستبعد", preview.excludedRows],
    ["موظف جديد", preview.newRows],
    ["سيتم تحديثه", preview.updatedRows],
    ["سيتم أرشفته", preview.archivedRows],
  ];
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card import-modal" role="dialog" aria-modal="true" aria-label="معاينة استيراد جدول الموظفين">
        <div className="modal-header">
          <div><h2>معاينة جدول {monthName} {preview.reportYear}</h2></div>
          <button className="close-button" onClick={onClose} disabled={saving} aria-label="إغلاق">×</button>
        </div>
        <div className="modal-body import-modal-body">
          <div className="import-stats">
            {stats.map(([label, value]) => <article key={String(label)}><span>{label}</span><strong>{value}</strong></article>)}
          </div>
          <section className="import-section">
            <h3>التوزيع على نقاط الانطلاق</h3>
            <div className="distribution-list">
              {preview.distribution.map((item) => <span key={item.pointName}>{item.pointName}<b>{item.count}</b></span>)}
            </div>
          </section>
          <section className="import-section">
            <h3>الموظفون المعتمدون ({preview.acceptedRows})</h3>
            <div className="table-wrap import-table"><table><thead><tr><th>الاسم الرباعي</th><th>الكود الوظيفي</th><th>رمز الفرقة</th><th>نقطة الانطلاق</th><th>رقم الجوال</th><th>طبيعة العمل</th></tr></thead><tbody>{preview.employees.map((employee) => <tr key={employee.employeeCode}><td><strong>{employee.fullName}</strong></td><td><span className="code-chip">{employee.employeeCode}</span></td><td><span className="code-chip">{employee.teamCode}</span></td><td>{employee.pointName}</td><td dir="ltr">{employee.mobile}</td><td>{employee.jobNature}</td></tr>)}</tbody></table></div>
          </section>
          {preview.excluded.length > 0 && (
            <section className="import-section excluded-section">
              <h3>السجلات المستبعدة ({preview.excludedRows})</h3>
              <div className="table-wrap import-table"><table><thead><tr><th>الاسم</th><th>الكود الوظيفي</th><th>الرمز</th><th>سبب الاستبعاد</th></tr></thead><tbody>{preview.excluded.map((employee) => <tr key={employee.employeeCode}><td>{employee.fullName}</td><td>{employee.employeeCode}</td><td>{employee.teamCode || "—"}</td><td>{employee.reason}</td></tr>)}</tbody></table></div>
            </section>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>إلغاء</button>
          <button type="button" className="primary-button" onClick={onApply} disabled={saving}>
            {saving ? "جاري الاعتماد…" : "اعتماد الاستيراد"}
          </button>
        </div>
      </section>
    </div>
  );
}

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const values = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: values.get("username"),
          password: values.get("password"),
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      onSuccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تسجيل الدخول");
    } finally {
      setSubmitting(false);
    }
  }

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    const values = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: values.get("username") }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = (await response.json()) as { message?: string };
      setMessage(payload.message || "تم إرسال الطلب إلى الإدارة");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إرسال الطلب");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-screen" dir="rtl">
      <section className="login-card">
        <div className="login-brand">
          <span>+</span>
          <div><strong>قطاع السلام</strong></div>
        </div>
        <div className="login-heading"><h1>{forgotOpen ? "استعادة كلمة المرور" : "تسجيل الدخول"}</h1></div>
        {forgotOpen ? (
          <form onSubmit={requestReset}>
            <Field label="اسم المستخدم" name="username" placeholder="admin أو الكود الوظيفي" required ltr autoComplete="username" />
            {error && <div className="login-error" role="alert">{error}</div>}
            {message && <div className="login-success" role="status">{message}</div>}
            <button className="primary-button login-button" type="submit" disabled={submitting || Boolean(message)}>
              {submitting ? "جاري الإرسال…" : "إرسال الطلب للإدارة"}
            </button>
            <button className="login-link-button" type="button" onClick={() => { setForgotOpen(false); setError(""); setMessage(""); }}>
              العودة لتسجيل الدخول
            </button>
          </form>
        ) : (
          <form onSubmit={submit}>
            <Field label="اسم المستخدم" name="username" placeholder="admin أو الكود الوظيفي" required ltr autoComplete="username" />
            <Field label="كلمة المرور" name="password" type="password" required ltr autoComplete="current-password" />
            {error && <div className="login-error" role="alert">{error}</div>}
            <button className="primary-button login-button" type="submit" disabled={submitting}>
              {submitting ? "جاري الدخول…" : "دخول المنصة"}
            </button>
            <button className="login-link-button" type="button" onClick={() => { setForgotOpen(true); setError(""); }}>
              نسيت كلمة المرور
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function LoadingScreen({ message = "جاري تجهيز النظام…" }: { message?: string }) {
  return (
    <main className="loading-screen" dir="rtl">
      <div className="loading-logo">+</div>
      <h1>قطاع السلام</h1>
      <p>{message}</p>
      <span className="spinner" />
    </main>
  );
}

function ManagementHome({ data }: { data: DashboardData }) {
  const stats = [
    { label: "زمن الاستجابة العام", value: formatResponseTime(data.summary.generalResponseSeconds), icon: "◷", tone: "navy" },
    { label: "زمن البلاغات الطارئة", value: formatResponseTime(data.summary.emergencyResponseSeconds), icon: "!", tone: "amber" },
    { label: "زمن حالات الإيكو", value: formatResponseTime(data.summary.echoResponseSeconds), icon: "♡", tone: "green" },
    { label: "زمن الحوادث", value: formatResponseTime(data.summary.incidentResponseSeconds), icon: "△", tone: "blue" },
  ];
  return (
    <section className="summary-grid response-home-grid" aria-label="أزمنة الاستجابة">
      {stats.map((stat) => (
        <article className="summary-card" key={stat.label}>
          <span className={`summary-icon ${stat.tone}`}>{stat.icon}</span>
          <div><small>{stat.label}</small><strong>{stat.value}</strong></div>
        </article>
      ))}
    </section>
  );
}

function EmployeesView({
  employees,
  currentPoint,
  canManage,
  canImport,
  importing,
  importInputRef,
  onImport,
  onAdd,
  onOpen,
  onEdit,
  onArchive,
}: {
  employees: Employee[];
  currentPoint?: Point;
  canManage: boolean;
  canImport: boolean;
  importing: boolean;
  importInputRef: RefObject<HTMLInputElement | null>;
  onImport: (file: File) => void;
  onAdd: () => void;
  onOpen: (id: number) => void;
  onEdit: (employee: Employee) => void;
  onArchive: (id: number) => void;
}) {
  return (
      <section className="panel employees-panel">
        <div className="panel-header">
          <div><h2>{currentPoint ? `موظفو نقطة ${currentPoint.name}` : "جميع موظفي القطاع"}</h2></div>
          <div className="panel-header-actions">
            {canImport && (
              <>
                <input
                  ref={importInputRef}
                  className="visually-hidden"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onImport(file);
                  }}
                />
                <button className="secondary-button" onClick={() => importInputRef.current?.click()} disabled={importing}>
                  {importing ? "جاري قراءة الجدول…" : "⇧ استيراد جدول القطاع"}
                </button>
              </>
            )}
            {canManage && <button className="primary-button" onClick={onAdd}>＋ إضافة موظف</button>}
          </div>
        </div>
        {employees.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>الموظف</th><th>الكود الوظيفي</th><th>رمز الفرقة</th><th>طبيعة العمل</th><th>رقم الجوال</th><th>زمن الاستجابة العام</th><th>نقطة الانطلاق</th><th>الملف</th><th>الإجراءات</th></tr></thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td>
                      <button className="employee-name" onClick={() => onOpen(employee.id)}>
                        <span className="avatar">{initials(employee.fullName)}</span>
                        <span><strong>{employee.fullName}</strong><small>ملف موظف قطاع السلام</small></span>
                      </button>
                    </td>
                    <td><span className="code-chip">{employee.employeeCode}</span></td>
                    <td><span className="code-chip">{employee.teamCode || "—"}</span></td>
                    <td>{employee.jobNature || "—"}</td>
                    <td dir="ltr">{employee.mobile}</td>
                    <td><span className="response-chip">◷ {formatResponseTime(employee.responseTimeSeconds)}</span></td>
                    <td><span className="point-chip">⌖ {employee.pointName}</span></td>
                    <td>
                      <div className="record-counts">
                        <span title="الشهادات">◇ {employee.certificateCount}</span>
                        <span title="العهد">▣ {employee.custodyCount}</span>
                        <span title="النماذج">▤ {employee.formCount}</span>
                      </div>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button onClick={() => onOpen(employee.id)}>فتح</button>
                        {canManage && <button onClick={() => onEdit(employee)}>تعديل</button>}
                        {canManage && <button className="danger-link" onClick={() => onArchive(employee.id)}>أرشفة</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="♙" title="لا يوجد موظفون مسجلون" text="ابدأ بإضافة أول موظف إلى نقطة الانطلاق المحددة." action={canManage ? onAdd : undefined} />
        )}
      </section>
  );
}

function EmployeeProfile({
  details,
  templates,
  tab,
  actor,
  onTab,
  onBack,
  onEditEmployee,
  onModal,
  onDelete,
}: {
  details: EmployeeDetails;
  templates: FormTemplate[];
  tab: ProfileTab;
  actor: Actor;
  onTab: (tab: ProfileTab) => void;
  onBack: () => void;
  onEditEmployee: () => void;
  onModal: (state: ModalState) => void;
  onDelete: (action: string, id: number, label: string, extra?: Record<string, string | number | boolean | null>) => void;
}) {
  const employee = details.employee;
  const isEmployee = actor.role === "employee";
  const canManage = !isEmployee;
  const latestReview = details.performance[0];
  const allTabs: { id: ProfileTab; label: string; count?: number }[] = [
    { id: "overview", label: isEmployee ? "البيانات الأساسية والأزمنة" : "الملخص" },
    { id: "certificates", label: "الشهادات والدورات", count: details.certificates.length },
    { id: "performance", label: "الأداء الوظيفي", count: details.performance.length },
    { id: "forms", label: "النماذج", count: details.forms.length },
    { id: "custody", label: "العهد الطبية", count: details.custody.length },
  ];
  const tabs = isEmployee
    ? allTabs.filter((item) => ["overview", "certificates", "performance"].includes(item.id))
    : allTabs;
  return (
    <section className="profile-page">
      {!isEmployee && <button className="back-button" onClick={onBack}>→ العودة إلى الموظفين</button>}
      <div className="profile-hero">
        <div className="profile-avatar">{initials(employee.fullName)}</div>
        <div className="profile-title">
          <span className="status-pill"><i /> ملف نشط</span>
          <h2>{employee.fullName}</h2>
          <p>الكود الوظيفي {employee.employeeCode} · نقطة انطلاق {employee.pointName}</p>
        </div>
        <div className="profile-score">
          <span>آخر تقييم</span>
          <strong>{latestReview ? `${latestReview.score}%` : "—"}</strong>
          <small>{latestReview?.rating || "لم يُضف تقييم"}</small>
        </div>
        <button className="secondary-button" onClick={onEditEmployee}>
          {isEmployee ? "تعديل بياناتي الأساسية" : "تعديل البيانات الأساسية"}
        </button>
      </div>
      <div className="profile-tabs">
        {tabs.map((item) => (
          <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => onTab(item.id)}>
            {item.label}{item.count !== undefined && <b>{item.count}</b>}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <ResponseTimeCards employee={employee} />
          <div className="profile-grid">
          <article className="panel info-card">
            <div className="panel-mini-header"><h3>البيانات الأساسية</h3><button onClick={onEditEmployee}>تعديل</button></div>
            <dl>
              <Info label="الاسم الرباعي" value={employee.fullName} />
              <Info label="الكود الوظيفي" value={employee.employeeCode} />
              <Info label="رقم الجوال" value={employee.mobile} ltr />
              <Info label="رقم الهوية الوطنية" value={employee.nationalId || "غير مسجل"} ltr />
              <Info label="تاريخ الميلاد" value={formatDate(employee.birthDate)} />
              <Info label="البريد المرتبط" value={employee.email || "غير مرتبط"} ltr />
              <Info label="نقطة الانطلاق" value={employee.pointName} />
              <Info label="رمز الفرقة" value={employee.teamCode || "غير مسجل"} />
              <Info label="طبيعة العمل" value={employee.jobNature || "غير مسجلة"} />
            </dl>
          </article>
          {!isEmployee && <article className="panel quick-card">
            <h3>ملخص الملف</h3>
            <div className="quick-stat"><span className="blue">◇</span><div><strong>{details.certificates.length}</strong><small>شهادة ودورة</small></div><button onClick={() => onTab("certificates")}>عرض</button></div>
            <div className="quick-stat"><span className="green">▤</span><div><strong>{details.forms.length}</strong><small>نموذج محفوظ</small></div><button onClick={() => onTab("forms")}>عرض</button></div>
            <div className="quick-stat"><span className="amber">▣</span><div><strong>{details.custody.filter((item) => item.status !== "مُعاد").length}</strong><small>عهدة نشطة</small></div><button onClick={() => onTab("custody")}>عرض</button></div>
          </article>}
          <article className="panel expiring-card">
            <div className="panel-mini-header"><h3>تنبيهات الشهادات</h3><button onClick={() => onTab("certificates")}>الكل</button></div>
            {details.certificates.filter((item) => expiryTone(item.expiryDate) !== "success").slice(0, 4).map((item) => (
              <div className="alert-row" key={item.id}>
                <span className={expiryTone(item.expiryDate)}>!</span>
                <div><strong>{item.name}</strong><small>الانتهاء: {formatDate(item.expiryDate)}</small></div>
              </div>
            ))}
            {!details.certificates.some((item) => expiryTone(item.expiryDate) !== "success") && <p className="muted-text">لا توجد شهادات منتهية أو قريبة الانتهاء.</p>}
          </article>
          </div>
        </>
      )}

      {tab === "certificates" && (
        <RecordsPanel title="الشهادات والدورات" text="يمكن للموظف والإدارة إضافة الشهادات وتحديثها وإرفاق نسخة منها." actionLabel="إضافة شهادة أو دورة" onAdd={() => onModal({ type: "certificate" })}>
          {details.certificates.length ? (
            <div className="cards-list">
              {details.certificates.map((item) => (
                <article className="record-card" key={item.id}>
                  <span className={`record-symbol ${expiryTone(item.expiryDate)}`}>◇</span>
                  <div className="record-main"><h4>{item.name}</h4><p>{item.issuer || "الجهة غير محددة"}</p><div><span>الإصدار: {formatDate(item.issueDate)}</span><span>الانتهاء: {formatDate(item.expiryDate)}</span></div>{item.notes && <small>{item.notes}</small>}</div>
                  <div className="record-side"><span className={`tone-label ${expiryTone(item.expiryDate)}`}>{expiryTone(item.expiryDate) === "danger" ? "منتهية" : expiryTone(item.expiryDate) === "warning" ? "تنتهي قريبًا" : "سارية"}</span>{item.attachmentKey && <AttachmentMenu attachmentKey={item.attachmentKey} attachmentName={item.attachmentName || "المرفق"} onReplace={() => onModal({ type: "certificate", item })} onDelete={() => onDelete("remove_attachment", item.id, "حذف مرفق الشهادة", { entityType: "certificate" })} />}<div><button onClick={() => onModal({ type: "certificate", item })}>تعديل</button><button className="danger-link" onClick={() => onDelete("delete_certificate", item.id, "حذف الشهادة")}>حذف</button></div></div>
                </article>
              ))}
            </div>
          ) : <EmptyState icon="◇" title="لا توجد شهادات أو دورات" text="أضف أول شهادة أو دورة لهذا الموظف." action={() => onModal({ type: "certificate" })} />}
        </RecordsPanel>
      )}

      {tab === "performance" && (
        <RecordsPanel title="تقييم الأداء الوظيفي" text="التقييم مرئي للموظف، وإضافته أو تعديله متاح للمشرفين والإدارة فقط." actionLabel={canManage ? "إضافة تقييم" : undefined} onAdd={canManage ? () => onModal({ type: "performance" }) : undefined}>
          {details.performance.length ? (
            <div className="performance-grid">
              {details.performance.map((item) => (
                <article className="performance-card" key={item.id}>
                  <div className="score-ring" style={{ "--score": `${item.score * 3.6}deg` } as CSSProperties}><span>{item.score}<small>%</small></span></div>
                  <div className="performance-content"><span className="section-kicker">{item.period}</span><h4>{item.rating}</h4><div className="review-points"><div className="weakness"><strong>نقاط الضعف</strong><p>{item.weaknesses || "لم تُسجل نقاط ضعف"}</p></div><div className="improvement"><strong>نقاط التحسين</strong><p>{item.improvements || "لم تُسجل نقاط تحسين"}</p></div></div>{item.notes && <p className="review-notes">{item.notes}</p>}<small>أضيف بواسطة {item.reviewerEmail} · {formatDate(item.createdAt)}</small></div>
                  {canManage && <div className="record-actions"><button onClick={() => onModal({ type: "performance", item })}>تعديل</button><button className="danger-link" onClick={() => onDelete("delete_performance", item.id, "حذف التقييم")}>حذف</button></div>}
                </article>
              ))}
            </div>
          ) : <EmptyState icon="◎" title="لم يُضف تقييم أداء" text={canManage ? "أضف أول تقييم أداء للموظف." : "سيظهر التقييم هنا بعد اعتماده من الإدارة."} action={canManage ? () => onModal({ type: "performance" }) : undefined} />}
        </RecordsPanel>
      )}

      {tab === "forms" && (
        <RecordsPanel title="نماذج الموظف" text="اختر أحد القوالب الجاهزة، أكمل النص المطلوب ثم احفظه في ملف الموظف." actionLabel="إنشاء نموذج" onAdd={() => onModal({ type: "record", template: templates[0] })}>
          <div className="template-shortcuts">
            {templates.map((template) => <button key={template.id} onClick={() => onModal({ type: "record", template })}><span>▤</span>{template.name}</button>)}
          </div>
          {details.forms.length ? (
            <div className="table-wrap compact"><table><thead><tr><th>النموذج</th><th>التاريخ</th><th>الحالة</th><th>أضيف بواسطة</th><th>الإجراءات</th></tr></thead><tbody>{details.forms.map((item) => <tr key={item.id}><td><strong>{item.title}</strong></td><td>{formatDate(item.eventDate)}</td><td><span className="status-chip">{item.status}</span></td><td>{item.createdBy}</td><td><div className="row-actions"><button onClick={() => onModal({ type: "record", item })}>فتح وتعديل</button><button className="danger-link" onClick={() => onDelete("delete_form_record", item.id, "حذف النموذج")}>حذف</button>{item.attachmentKey && <AttachmentMenu attachmentKey={item.attachmentKey} attachmentName={item.attachmentName || "المرفق"} onReplace={() => onModal({ type: "record", item })} onDelete={() => onDelete("remove_attachment", item.id, "حذف مرفق النموذج", { entityType: "form_record" })} />}</div></td></tr>)}</tbody></table></div>
          ) : <EmptyState icon="▤" title="لا توجد نماذج محفوظة" text="استخدم أحد القوالب أعلاه لتوثيق أول حالة." />}
        </RecordsPanel>
      )}

      {tab === "custody" && (
        <RecordsPanel title="العهد الطبية" text="سجل الأجهزة والعهد المسلّمة للموظف وحالتها وتاريخ إرجاعها." actionLabel={canManage ? "إضافة عهدة" : undefined} onAdd={canManage ? () => onModal({ type: "custody" }) : undefined}>
          {details.custody.length ? (
            <div className="table-wrap compact"><table><thead><tr><th>اسم الجهاز</th><th>السيريال نمبر</th><th>تاريخ التسليم</th><th>الحالة</th><th>الوضع</th>{canManage && <th>الإجراءات</th>}</tr></thead><tbody>{details.custody.map((item) => <tr key={item.id}><td><strong>{item.deviceName}</strong></td><td><span className="code-chip">{item.serialNumber}</span></td><td>{formatDate(item.deliveredAt)}</td><td>{item.itemCondition}</td><td><span className={`tone-label ${item.status === "مُعاد" ? "neutral" : "success"}`}>{item.status}</span></td>{canManage && <td><div className="row-actions"><button onClick={() => onModal({ type: "custody", item })}>تعديل</button><button className="danger-link" onClick={() => onDelete("delete_custody", item.id, "حذف العهدة")}>حذف</button></div></td>}</tr>)}</tbody></table></div>
          ) : <EmptyState icon="▣" title="لا توجد عهد طبية" text={canManage ? "أضف أول جهاز أو عهدة مسلّمة للموظف." : "لا توجد عهد مسجلة على ملفك."} action={canManage ? () => onModal({ type: "custody" }) : undefined} />}
        </RecordsPanel>
      )}
    </section>
  );
}

function ResponseTimeCards({ employee }: { employee: Employee }) {
  const times = [
    { label: "زمن الاستجابة العام", value: employee.responseTimeSeconds, icon: "◷", tone: "navy" },
    { label: "زمن البلاغات الطارئة", value: employee.emergencyResponseSeconds, icon: "!", tone: "amber" },
    { label: "زمن حالات الإيكو", value: employee.echoResponseSeconds, icon: "♡", tone: "green" },
    { label: "زمن الحوادث", value: employee.incidentResponseSeconds, icon: "△", tone: "blue" },
  ];
  return (
    <section className="response-times-grid" aria-label="أزمنة الاستجابة">
      {times.map((time) => (
        <article className="response-time-card" key={time.label}>
          <span className={`summary-icon ${time.tone}`}>{time.icon}</span>
          <div><small>{time.label}</small><strong>{formatResponseTime(time.value)}</strong></div>
        </article>
      ))}
    </section>
  );
}

function RecordsPanel({ title, actionLabel, onAdd, children }: { title: string; text: string; actionLabel?: string; onAdd?: () => void; children: ReactNode }) {
  return <section className="panel records-panel"><div className="panel-header"><div><h2>{title}</h2></div>{actionLabel && onAdd && <button className="primary-button" onClick={onAdd}>＋ {actionLabel}</button>}</div>{children}</section>;
}

function AttachmentMenu({ attachmentKey, attachmentName, onReplace, onDelete }: { attachmentKey: string; attachmentName: string; onReplace?: () => void; onDelete?: () => void }) {
  const baseUrl = `/api/files?key=${encodeURIComponent(attachmentKey)}`;
  return (
    <details className="attachment-menu">
      <summary aria-label={`خيارات المرفق ${attachmentName}`} title={attachmentName}>☰</summary>
      <div>
        <a href={baseUrl} target="_blank" rel="noreferrer">عرض</a>
        <a href={`${baseUrl}&download=1`}>تنزيل</a>
        {onReplace && <button type="button" onClick={onReplace}>استبدال</button>}
        {onDelete && <button type="button" className="danger-link" onClick={onDelete}>حذف</button>}
      </div>
    </details>
  );
}

function TemplatesView({ templates, employees, canManage, onAdd, onEdit, onUse, onDelete, onRemoveAttachment }: { templates: FormTemplate[]; employees: Employee[]; canManage: boolean; onAdd: () => void; onEdit: (item: FormTemplate) => void; onUse: (item: FormTemplate) => void; onDelete: (id: number) => void; onRemoveAttachment: (id: number) => void }) {
  return (
    <section className="panel templates-panel">
      <div className="panel-header">
        <div><h2>مكتبة النماذج</h2></div>
        {canManage && <button className="primary-button" onClick={onAdd}>＋ إضافة نموذج</button>}
      </div>
      <div className="template-grid">
        {templates.map((template) => (
          <article className="template-card" key={template.id}>
            <div className={`template-icon ${template.category}`}>▤</div>
            <span className="category-chip">{categoryNames[template.category] || template.category}</span>
            <h3>{template.name}</h3>
            <p>{template.templateText.slice(0, 110)}{template.templateText.length > 110 ? "…" : ""}</p>
            {template.attachmentKey && (
              <AttachmentMenu
                attachmentKey={template.attachmentKey}
                attachmentName={template.attachmentName || "المرفق"}
                onReplace={canManage ? () => onEdit(template) : undefined}
                onDelete={canManage ? () => onRemoveAttachment(template.id) : undefined}
              />
            )}
            <div className="template-actions">
              <button className="primary-small" onClick={() => onUse(template)} disabled={!employees.length}>استخدام النموذج</button>
              {canManage && <button onClick={() => onEdit(template)}>تعديل</button>}
              {canManage && <button className="danger-link" onClick={() => onDelete(template.id)}>أرشفة</button>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function UsersView({ users, resetRequests, currentActorId, onAdd, onEdit, onDelete, onReset, onResolveReset }: { users: AccessUser[]; resetRequests: PasswordResetRequest[]; currentActorId: number; onAdd: () => void; onEdit: (item: AccessUser) => void; onDelete: (id: number) => void; onReset: (id: number) => void; onResolveReset: (id: number, decision: "approve" | "reject") => void }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div><h2>المستخدمون والصلاحيات</h2></div>
        <button className="primary-button" onClick={onAdd}>＋ إضافة مستخدم</button>
      </div>
      {resetRequests.length > 0 && (
        <div className="password-reset-section" id="password-reset-requests">
          <h3>طلبات استعادة كلمة المرور</h3>
          <div className="password-reset-list">
            {resetRequests.map((request) => (
              <article key={request.id}>
                <div>
                  <strong>{request.displayName}</strong>
                  <span dir="ltr">{request.username}</span>
                  <small>{formatDate(request.requestedAt)}</small>
                </div>
                <div className="row-actions">
                  <button onClick={() => onResolveReset(request.id, "approve")}>اعتماد وإعادة 997</button>
                  <button className="danger-link" onClick={() => onResolveReset(request.id, "reject")}>رفض</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
      <div className="role-guide">{(["admin", "sector_supervisor", "point_supervisor", "employee"] as Role[]).map((role) => <div key={role}><span className={`role-dot ${role}`} /><strong>{roleNames[role]}</strong><small>{role === "admin" ? "كامل النظام والصلاحيات" : role === "sector_supervisor" ? "إدارة جميع نقاط القطاع" : role === "point_supervisor" ? "إدارة موظفي نقطته" : "ملفه الشخصي فقط"}</small></div>)}</div>
      <div className="table-wrap"><table><thead><tr><th>المستخدم</th><th>اسم المستخدم</th><th>الصلاحية</th><th>نقطة الانطلاق</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{users.map((user) => { const primaryAdmin = user.username?.toUpperCase() === "ADMIN"; return <tr key={user.id}><td><div className="user-cell"><span className="avatar">{initials(user.displayName)}</span><div><strong>{user.displayName}</strong><small>{primaryAdmin ? "الحساب الرئيسي" : user.username ? "حساب موظف" : "دخول محمي"}</small></div></div></td><td><span className="code-chip">{user.username || "دخول محمي"}</span></td><td><span className="role-chip">{roleNames[user.role]}</span></td><td>{user.pointName || "جميع النقاط"}</td><td><span className={`tone-label ${user.active ? "success" : "danger"}`}>{user.active ? "نشط" : "معطل"}</span></td><td><div className="row-actions">{user.username && !primaryAdmin && <button onClick={() => onEdit(user)}>تعديل</button>}{user.username && user.id !== currentActorId && <button onClick={() => onReset(user.id)}>إعادة 997</button>}{user.username && !primaryAdmin && user.active ? <button className="danger-link" onClick={() => onDelete(user.id)}>تعطيل</button> : null}</div></td></tr>; })}</tbody></table></div>
    </section>
  );
}

function ActivityView({ rows }: { rows: Activity[] }) {
  return <section className="panel"><div className="panel-header"><div><h2>سجل العمليات</h2></div></div>{rows.length ? <div className="timeline">{rows.map((row) => <div className="timeline-row" key={row.id}><span className="timeline-mark" /><div><strong>{row.action}</strong><p>{row.details || row.entityType}</p><small>{row.actorEmail} · {formatDate(row.createdAt)}</small></div></div>)}</div> : <EmptyState icon="◷" title="لا توجد عمليات مسجلة" text="" />}</section>;
}

function ChangePasswordModal({ required, onClose, onSuccess, onError }: { required: boolean; onClose: () => void; onSuccess: () => void; onError: (text: string) => void }) {
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const values = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: values.get("currentPassword"),
          newPassword: values.get("newPassword"),
          confirmPassword: values.get("confirmPassword"),
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      onSuccess();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "تعذر تغيير كلمة المرور");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (!required && event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-label="تغيير كلمة المرور">
        <div className="modal-header"><div><h2>{required ? "تعيين كلمة مرور جديدة" : "تغيير كلمة المرور"}</h2></div>{!required && <button className="close-button" onClick={onClose} aria-label="إغلاق">×</button>}</div>
        <form onSubmit={submit}>
          <div className="modal-body"><div className="form-grid">
            <Field label="كلمة المرور الحالية" name="currentPassword" type="password" required wide autoComplete="current-password" />
            <Field label="كلمة المرور الجديدة" name="newPassword" type="password" required wide autoComplete="new-password" placeholder="8 أحرف أو أرقام على الأقل" />
            <Field label="تأكيد كلمة المرور الجديدة" name="confirmPassword" type="password" required wide autoComplete="new-password" />
          </div></div>
          <div className="modal-footer">{!required && <button type="button" className="secondary-button" onClick={onClose}>إلغاء</button>}<button type="submit" className="primary-button" disabled={saving}>{saving ? "جاري الحفظ…" : "تحديث كلمة المرور"}</button></div>
        </form>
      </section>
    </div>
  );
}

function EntityModal({ state, data, currentPointId, currentEmployeeId, onClose, onSave, onError }: { state: NonNullable<ModalState>; data: DashboardData; currentPointId: number; currentEmployeeId: number; onClose: () => void; onSave: (action: string, values: Record<string, string | number | boolean | null>) => Promise<void>; onError: (text: string) => void }) {
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const title = state.type === "employee" ? (data.actor.role === "employee" ? "تعديل بياناتي الأساسية" : state.item ? "تعديل بيانات الموظف" : "إضافة موظف") : state.type === "certificate" ? (state.item ? "تعديل الشهادة أو الدورة" : "إضافة شهادة أو دورة") : state.type === "performance" ? (state.item ? "تعديل تقييم الأداء" : "إضافة تقييم أداء") : state.type === "custody" ? (state.item ? "تعديل العهدة" : "إضافة عهدة طبية") : state.type === "template" ? (state.item ? "تعديل قالب النموذج" : "إضافة قالب نموذج") : state.type === "record" ? (state.item ? "فتح وتعديل النموذج" : "إنشاء نموذج جديد") : state.item ? "تعديل المستخدم" : "إضافة مستخدم";

  async function upload(scope: string) {
    if (!file) return null;
    const body = new FormData();
    body.set("file", file);
    body.set("scope", scope);
    const response = await fetch("/api/files", { method: "POST", body });
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as { key: string; name: string };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      let action = "";
      const payload: Record<string, string | number | boolean | null> = {};
      for (const [key, value] of Object.entries(values)) if (typeof value === "string") payload[key] = value;
      if ("item" in state && state.item) payload.id = state.item.id;
      if (["certificate", "performance", "custody", "record"].includes(state.type)) payload.employeeId = payload.employeeId || currentEmployeeId;
      if (state.type === "employee") action = data.actor.role === "employee" ? "update_self_employee" : "save_employee";
      if (state.type === "certificate") action = "save_certificate";
      if (state.type === "performance") action = "save_performance";
      if (state.type === "custody") action = "save_custody";
      if (state.type === "template") action = "save_template";
      if (state.type === "record") action = "save_form_record";
      if (state.type === "user") {
        action = "save_user";
        payload.active = payload.active === "1";
      }
      if (["certificate", "template", "record"].includes(state.type)) {
        const uploaded = await upload(state.type);
        if (uploaded) {
          payload.attachmentKey = uploaded.key;
          payload.attachmentName = uploaded.name;
        } else if ("item" in state && state.item && "attachmentKey" in state.item) {
          payload.attachmentKey = state.item.attachmentKey;
          payload.attachmentName = state.item.attachmentName;
        }
      }
      await onSave(action, payload);
    } catch (error) {
      onError(error instanceof Error ? error.message : "تعذر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal-card ${state.type === "record" || state.type === "template" ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><div><h2>{title}</h2></div><button className="close-button" onClick={onClose} aria-label="إغلاق">×</button></div><form onSubmit={submit}><div className="modal-body"><ModalFields state={state} data={data} currentPointId={currentPointId} currentEmployeeId={currentEmployeeId} file={file} onFile={setFile} /></div><div className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>إلغاء</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "جاري الحفظ…" : "حفظ واعتماد"}</button></div></form></section></div>;
}

function ModalFields({ state, data, currentPointId, currentEmployeeId, file, onFile }: { state: NonNullable<ModalState>; data: DashboardData; currentPointId: number; currentEmployeeId: number; file: File | null; onFile: (file: File | null) => void }) {
  if (state.type === "employee") {
    const item = state.item;
    if (data.actor.role === "employee") {
      return (
        <div className="form-grid">
          <div className="readonly-field wide"><span>الكود الوظيفي</span><strong dir="ltr">{item?.employeeCode}</strong></div>
          <div className="readonly-field wide"><span>نقطة الانطلاق</span><strong>{item?.pointName}</strong></div>
          <div className="readonly-field"><span>رمز الفرقة</span><strong>{item?.teamCode || "غير مسجل"}</strong></div>
          <div className="readonly-field"><span>طبيعة العمل</span><strong>{item?.jobNature || "غير مسجلة"}</strong></div>
          <Field label="الاسم الرباعي" name="fullName" defaultValue={item?.fullName} required wide />
          <Field label="رقم الجوال" name="mobile" defaultValue={item?.mobile} required ltr />
          <Field label="رقم الهوية الوطنية" name="nationalId" defaultValue={item?.nationalId || ""} ltr />
          <Field label="تاريخ الميلاد" name="birthDate" type="date" defaultValue={item?.birthDate || ""} />
          <Field label="البريد الإلكتروني" name="email" type="email" defaultValue={item?.email || ""} ltr wide />
        </div>
      );
    }
    return (
      <div className="form-grid">
        <Field label="الاسم الرباعي" name="fullName" defaultValue={item?.fullName} required wide />
        <Field label="الكود الوظيفي" name="employeeCode" defaultValue={item?.employeeCode} required />
        <Field label="رقم الجوال" name="mobile" defaultValue={item?.mobile} required ltr />
        <Field label="رقم الهوية الوطنية" name="nationalId" defaultValue={item?.nationalId || ""} ltr />
        <Field label="تاريخ الميلاد" name="birthDate" type="date" defaultValue={item?.birthDate || ""} />
        <Field label="رمز الفرقة" name="teamCode" defaultValue={item?.teamCode || ""} />
        <Field label="طبيعة العمل" name="jobNature" defaultValue={item?.jobNature || ""} />
        <Field label="زمن الاستجابة العام" name="responseTime" defaultValue={formatResponseTime(item?.responseTimeSeconds, "")} placeholder="08:30" ltr />
        <Field label="زمن البلاغات الطارئة" name="emergencyResponseTime" defaultValue={formatResponseTime(item?.emergencyResponseSeconds, "")} placeholder="08:30" ltr />
        <Field label="زمن حالات الإيكو" name="echoResponseTime" defaultValue={formatResponseTime(item?.echoResponseSeconds, "")} placeholder="08:30" ltr />
        <Field label="زمن الحوادث" name="incidentResponseTime" defaultValue={formatResponseTime(item?.incidentResponseSeconds, "")} placeholder="08:30" ltr />
        <SelectField
          label="نقطة الانطلاق"
          name="pointId"
          defaultValue={String(item?.pointId || currentPointId || "")}
          required={data.actor.role === "point_supervisor"}
          options={[{ value: "", label: "إدارة قطاع السلام" }, ...data.points.map((point) => ({ value: String(point.id), label: point.name }))]}
        />
        <Field label="البريد الإلكتروني المرتبط" name="email" type="email" defaultValue={item?.email || ""} ltr />
      </div>
    );
  }
  if (state.type === "certificate") {
    const item = state.item;
    return (
      <div className="form-grid">
        <Field label="اسم الدورة أو الشهادة" name="name" defaultValue={item?.name} required wide />
        <Field label="الجهة المانحة" name="issuer" defaultValue={item?.issuer || ""} />
        <Field label="تاريخ الإصدار" name="issueDate" type="date" defaultValue={item?.issueDate || ""} />
        <Field label="تاريخ الانتهاء" name="expiryDate" type="date" defaultValue={item?.expiryDate || ""} />
        <TextArea label="الملاحظات" name="notes" defaultValue={item?.notes || ""} wide />
        <FileField file={file} currentName={item?.attachmentName} onFile={onFile} />
      </div>
    );
  }
  if (state.type === "performance") {
    const item = state.item;
    return (
      <div className="form-grid">
        <Field label="فترة التقييم" name="period" placeholder="مثال: النصف الأول 2026" defaultValue={item?.period} required />
        <Field label="الدرجة من 100" name="score" type="number" min="0" max="100" defaultValue={item?.score ?? ""} required />
        <SelectField
          label="التقدير"
          name="rating"
          defaultValue={item?.rating || "ممتاز"}
          required
          options={["ممتاز", "جيد جدًا", "جيد", "مقبول", "يحتاج تحسين"].map((value) => ({ value, label: value }))}
        />
        <TextArea label="نقاط الضعف" name="weaknesses" defaultValue={item?.weaknesses || ""} wide />
        <TextArea label="نقاط التحسين" name="improvements" defaultValue={item?.improvements || ""} wide />
        <TextArea label="الملاحظات والتوصيات" name="notes" defaultValue={item?.notes || ""} wide />
      </div>
    );
  }
  if (state.type === "custody") {
    const item = state.item;
    return (
      <div className="form-grid">
        <Field label="اسم الجهاز أو العهدة" name="deviceName" defaultValue={item?.deviceName} required />
        <Field label="السيريال نمبر" name="serialNumber" defaultValue={item?.serialNumber} required ltr />
        <Field label="تاريخ التسليم" name="deliveredAt" type="date" defaultValue={item?.deliveredAt || ""} />
        <SelectField label="حالة العهدة" name="itemCondition" defaultValue={item?.itemCondition || "سليم"} options={["سليم", "يحتاج صيانة", "تالف"].map((value) => ({ value, label: value }))} />
        <SelectField label="الوضع" name="status" defaultValue={item?.status || "بعهدة الموظف"} options={["بعهدة الموظف", "تحت الصيانة", "مُعاد"].map((value) => ({ value, label: value }))} />
        <Field label="تاريخ الإرجاع" name="returnedAt" type="date" defaultValue={item?.returnedAt || ""} />
        <TextArea label="الملاحظات" name="notes" defaultValue={item?.notes || ""} wide />
      </div>
    );
  }
  if (state.type === "template") {
    const item = state.item;
    return (
      <div className="form-grid">
        <Field label="اسم النموذج" name="name" defaultValue={item?.name} required />
        <SelectField label="التصنيف" name="category" defaultValue={item?.category || "other"} options={Object.entries(categoryNames).map(([value, label]) => ({ value, label }))} />
        <TextArea label="النص الجاهز للنموذج" name="templateText" defaultValue={item?.templateText || ""} rows={14} required wide />
        <FileField file={file} currentName={item?.attachmentName} onFile={onFile} />
      </div>
    );
  }
  if (state.type === "record") {
    const item = state.item;
    const template = state.template || data.templates.find((entry) => entry.id === item?.templateId);
    return (
      <div className="form-grid">
        <SelectField label="الموظف" name="employeeId" defaultValue={String(item?.employeeId || currentEmployeeId || data.employees[0]?.id || "")} required options={data.employees.map((employee) => ({ value: String(employee.id), label: `${employee.fullName} — ${employee.pointName}` }))} />
        <SelectField label="القالب" name="templateId" defaultValue={String(template?.id || "")} options={data.templates.map((entry) => ({ value: String(entry.id), label: entry.name }))} />
        <Field label="عنوان الحالة" name="title" defaultValue={item?.title || template?.name || ""} required />
        <Field label="تاريخ الحالة" name="eventDate" type="date" defaultValue={item?.eventDate || new Date().toISOString().slice(0, 10)} required />
        <SelectField label="الحالة" name="status" defaultValue={item?.status || "محفوظ"} options={["مسودة", "محفوظ", "مراجع", "مغلق"].map((value) => ({ value, label: value }))} />
        <TextArea label="نص النموذج" name="content" defaultValue={item?.content || template?.templateText || ""} rows={18} required wide />
        <FileField file={file} currentName={item?.attachmentName} onFile={onFile} />
      </div>
    );
  }
  const item = state.item;
  return (
    <div className="form-grid">
      <SelectField label="الموظف المرتبط بالحساب" name="employeeId" defaultValue={String(item?.employeeId || "")} required options={[{ value: "", label: "اختر الموظف" }, ...data.employees.map((employee) => ({ value: String(employee.id), label: `${employee.fullName} — ${employee.employeeCode}` }))]} />
      <SelectField label="الصلاحية" name="role" defaultValue={item?.role || "employee"} required options={(Object.keys(roleNames) as Role[]).map((value) => ({ value, label: roleNames[value] }))} />
      <SelectField label="نقطة الانطلاق" name="pointId" defaultValue={String(item?.pointId || "")} options={[{ value: "", label: "جميع النقاط / غير محدد" }, ...data.points.map((point) => ({ value: String(point.id), label: point.name }))]} />
      <SelectField label="حالة الحساب" name="active" defaultValue={String(item?.active ?? 1)} options={[{ value: "1", label: "نشط" }, { value: "0", label: "معطل" }]} />
    </div>
  );
}

function Field({ label, name, type = "text", defaultValue = "", required, wide, ltr, placeholder, min, max, autoComplete }: { label: string; name: string; type?: string; defaultValue?: string | number; required?: boolean; wide?: boolean; ltr?: boolean; placeholder?: string; min?: string; max?: string; autoComplete?: string }) {
  return <label className={`field ${wide ? "wide" : ""}`}><span>{label}{required && <b>*</b>}</span><input name={name} type={type} defaultValue={defaultValue} required={required} dir={ltr ? "ltr" : undefined} placeholder={placeholder} min={min} max={max} autoComplete={autoComplete} /></label>;
}

function TextArea({ label, name, defaultValue = "", required, wide, rows = 5 }: { label: string; name: string; defaultValue?: string; required?: boolean; wide?: boolean; rows?: number }) {
  return <label className={`field ${wide ? "wide" : ""}`}><span>{label}{required && <b>*</b>}</span><textarea name={name} defaultValue={defaultValue} required={required} rows={rows} /></label>;
}

function SelectField({ label, name, defaultValue, required, options }: { label: string; name: string; defaultValue?: string; required?: boolean; options: { value: string; label: string }[] }) {
  return <label className="field"><span>{label}{required && <b>*</b>}</span><select name={name} defaultValue={defaultValue} required={required}>{options.map((option) => <option key={`${name}-${option.value}`} value={option.value}>{option.label}</option>)}</select></label>;
}

function FileField({ file, currentName, onFile }: { file: File | null; currentName?: string | null; onFile: (file: File | null) => void }) {
  return <label className="field wide file-field"><span>المرفق <small>PDF أو Word أو صورة — حتى 10MB</small></span><div><span>⇧</span><strong>{file?.name || currentName || "اختر ملفًا أو اسحبه هنا"}</strong><input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(event) => onFile(event.target.files?.[0] || null)} /></div></label>;
}

function Info({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return <div><dt>{label}</dt><dd dir={ltr ? "ltr" : undefined}>{value}</dd></div>;
}

function EmptyState({ icon, title, text, action }: { icon: string; title: string; text: string; action?: () => void }) {
  return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{text}</p>{action && <button className="primary-small" onClick={action}>＋ إضافة الآن</button>}</div>;
}
