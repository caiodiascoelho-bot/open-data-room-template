"use client";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  ExternalLink,
  FileText,
  FolderOpen,
  GripVertical,
  LayoutDashboard,
  Lightbulb,
  Link2,
  ListTodo,
  LockKeyhole,
  LogOut,
  Menu,
  MessageSquare,
  Microscope,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import {
  cloneElement,
  type FormEvent,
  lazy,
  type ReactElement,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/client/api";
import { initializeTelemetry } from "@/lib/client/telemetry";
import { registerRoomTools } from "@/lib/client/webmcp";
import {
  calendarCells,
  type Doc,
  type Interview,
  type Milestone,
  type OutreachContact,
  percentageChange,
  type RoomData,
  type Thesis,
  weekStart,
} from "@/lib/contracts";
import { type Identity, Loading } from "./data-room";

const TesterBoard = lazy(() => import("./tester-board"));
const TaskBoard = lazy(() => import("./task-board"));
const InvestorActivity = lazy(() => import("./investor-activity"));
const GrowthChart = lazy(() => import("./growth-chart"));
const tabs = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "traction", label: "Traction", icon: TrendingUp },
  { id: "pitch", label: "Pitch deck", icon: FileText },
  { id: "discovery", label: "Market discovery", icon: Microscope },
  { id: "strategy", label: "Strategy & pivots", icon: Lightbulb },
  { id: "documents", label: "Documents", icon: FolderOpen },
  { id: "team", label: "Team", icon: UsersRound },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "investor-activity", label: "Investor activity", icon: UsersRound },
  { id: "access", label: "Access & connections", icon: ShieldCheck },
];
const fmt = new Intl.NumberFormat("en-US");
const money = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v / 100);
const day = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const human = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const statusLabel: Record<string, string> = {
  inbox: "Conversations logged",
  signal: "Patterns emerging",
  action: "Decisions & experiments",
  green: "Low priority",
  yellow: "Medium priority",
  red: "High priority",
};
const activityLabels: Record<string, string> = {
  "task.created": "Ticket created",
  "task.updated": "Ticket updated",
  "task.moved": "Ticket status changed",
  "task.note_added": "Ticket note added",
  "task.step_added": "Checklist step added",
  "task.step_completed": "Checklist step completed",
  "task.step_reopened": "Checklist step reopened",
  "task.step_removed": "Checklist step removed",
  "platform.user_registered": "New platform users",
  "platform.user_upgraded": "Users upgraded",
  "platform.user_cancelled": "Subscriptions cancelled",
  "interview.created": "Interview added",
  "interview.updated": "Interview edited",
  "interview.moved": "Interview moved",
  "document.uploaded": "New PDF version",
  "document.published": "Document published",
  "document.unpublished": "Document made private",
  "thesis.version_created": "Strategy updated",
  "event.created": "Event added",
  "event.updated": "Event edited",
  "admin.invited": "Admin invited",
  "admin.activated": "Admin joined",
  "admin.revoked": "Admin access revoked",
  "share.created": "Investor password created",
  "share.revoked": "Investor password revoked",
  "viewer.entered": "Investor visit",
  "feedback.created": "Feedback received",
  "feedback.read": "Feedback read",
  "metrics.updated": "Platform numbers updated",
};
const activityDay = (date: string) =>
  new Date(date).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
type Modal = {
  type: string;
  item?: Interview | Milestone | Thesis | Doc | OutreachContact;
  date?: string;
  stage?: string;
} | null;
type Digest = {
  count: number;
  highPriority: number;
  generatedAt: string;
  method: string;
  executiveSummary?: string;
  readyNow?: string[];
  improvements?: string[];
  nextSteps?: string[];
  items: {
    id: string;
    name: string;
    date: string;
    insight: string;
    problem: string;
    nextStep: string;
    priority: string;
  }[];
};
function Empty({
  icon: Icon = Database,
  title,
  description,
  action,
}: {
  icon?: typeof Database;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={24} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
function SectionTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="title-actions">{actions}</div>
    </div>
  );
}
function Panel({
  title,
  sub,
  action,
  children,
  className = "",
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function MetricCard({
  label,
  value,
  caption,
  icon: Icon,
}: {
  label: string;
  value: string;
  caption: string;
  icon: typeof UsersRound;
}) {
  return (
    <div className="metric-card">
      <div className="metric-label">
        {label}
        <Icon size={17} />
      </div>
      <strong className="tabular">{value}</strong>
      <span>{caption}</span>
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  const fieldId = useId();
  return (
    <label className="field" htmlFor={fieldId}>
      <span>{label}</span>
      {cloneElement(children as ReactElement<{ id?: string }>, { id: fieldId })}
    </label>
  );
}
function Publication({ value = false }: { value?: boolean | number }) {
  return (
    <label className="publication">
      <input name="published" type="checkbox" defaultChecked={!!value} />
      <span>
        Visible to investors<small>Only publish information you are ready to share.</small>
      </span>
    </label>
  );
}
function FormSelect({
  id,
  name,
  value,
  options,
}: {
  id?: string;
  name: string;
  value?: string;
  options: [string, string][];
}) {
  return (
    <select id={id} className="select" name={name} defaultValue={value}>
      {options.map(([v, label]) => (
        <option value={v} key={v}>
          {label}
        </option>
      ))}
    </select>
  );
}
export default function Workspace({ user, onLogout }: { user: Identity; onLogout: () => void }) {
  const admin = user.role === "admin";
  const [data, setData] = useState<RoomData | null>(null);
  const [discoverySection, setDiscoverySection] = useState("interviews");
  const [page, setPage] = useState("overview");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [menu, setMenu] = useState(false);
  const [month, setMonth] = useState(() => new Date(`${day()}T12:00:00Z`));
  const [query, setQuery] = useState("");
  const [view, setView] = useState("board");
  const [digest, setDigest] = useState<Digest | null>(null);
  const [link, setLink] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [pdf, setPdf] = useState<Doc | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const latestRequest = useRef(0);
  const reload = useCallback(async () => {
    const requestId = ++latestRequest.current;
    try {
      const next = await api<RoomData>(`room?month=${month.toISOString().slice(0, 7)}`);
      if (requestId !== latestRequest.current) return;
      setData(next);
      setError("");
    } catch (e) {
      if (requestId !== latestRequest.current) return;
      if (e instanceof ApiError && e.status === 401) {
        setData(null);
        onLogout();
        return;
      }
      setError(e instanceof Error ? e.message : "Unable to load this workspace.");
    }
  }, [onLogout, month]);
  useEffect(() => registerRoomTools(admin, api, reload), [admin, reload]);
  useEffect(() => {
    api<{ dsn?: string }>("telemetry-config")
      .then((c) => initializeTelemetry(c.dsn))
      .catch(() => {});
  }, []);
  useEffect(() => {
    reload();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 15000);
    return () => clearInterval(interval);
  }, [reload]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    setQuery("");
    setMenu(false);
    const main = document.getElementById("main-content");
    if (main) {
      main.dataset.page = page;
      main.focus();
    }
  }, [page]);
  const hasLoadedData = !!data;
  useEffect(() => {
    if (admin || !hasLoadedData) return;
    api("viewer-activity", {
      method: "POST",
      body: JSON.stringify({ kind: "page", target: page }),
    }).catch(() => {});
  }, [admin, page, hasLoadedData]);
  useEffect(() => {
    if (admin || !modal) return;
    const kind =
      modal.type === "view-interview"
        ? "interview"
        : modal.type === "view-event"
          ? "event"
          : modal.type === "day"
            ? "day"
            : null;
    if (kind)
      api("viewer-activity", {
        method: "POST",
        body: JSON.stringify({ kind, target: modal.item?.id || modal.date }),
      }).catch(() => {});
  }, [admin, modal]);
  async function act(path: string, value: unknown, method = "POST") {
    setBusy(true);
    setError("");
    try {
      const r = await api(path, { method, body: JSON.stringify(value) });
      await reload();
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modal) return;
    const f = new FormData(e.currentTarget);
    const b: Record<string, unknown> = Object.fromEntries(f);
    b.published = f.get("published") === "on";
    try {
      if (modal.type === "interview") {
        await act(
          modal.item ? `interviews/${modal.item.id}` : "interviews",
          b,
          modal.item ? "PATCH" : "POST",
        );
      } else if (modal.type === "outreach") {
        await act(
          modal.item ? `outreach-contacts/${modal.item.id}` : "outreach-contacts",
          b,
          modal.item ? "PATCH" : "POST",
        );
      } else if (modal.type === "event") {
        await act(
          modal.item ? `events/${modal.item.id}` : "events",
          b,
          modal.item ? "PATCH" : "POST",
        );
      } else if (modal.type === "thesis") {
        await act("theses", b);
      } else if (modal.type === "feedback") {
        await act("feedback", { body: b.body, page });
      } else if (modal.type === "share") {
        const r = await act("shares", {
          label: b.label,
          days: b.days === "always" ? "always" : Number(b.days),
        });
        setAccessCode(String(r.password));
        setLink(String(r.url));
      } else if (modal.type === "admin") {
        const r = await act("admins", { name: b.name, email: b.email });
        setAccessCode("");
        setLink(String(r.url));
      } else if (modal.type === "upload") {
        setBusy(true);
        setProgress(0);
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/documents");
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else {
              try {
                reject(new Error(JSON.parse(xhr.responseText).error));
              } catch {
                reject(new Error("Unable to upload PDF."));
              }
            }
          };
          xhr.onerror = () => reject(new Error("Connection interrupted. Please try again."));
          xhr.send(f);
        });
        await reload();
        setProgress(null);
        setBusy(false);
      }
      setModal(null);
      setNotice("Saved successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
      setBusy(false);
      setProgress(null);
    }
  }
  async function move(i: Interview, stage: string) {
    try {
      await act(`interviews/${i.id}/stage`, { stage }, "PATCH");
      setNotice("Interview moved.");
    } catch {}
  }
  async function summarize() {
    setBusy(true);
    try {
      setDigest(await api<Digest>("summary", { method: "POST", body: "{}" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to generate digest.");
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(accessCode || link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice("Select and copy the link below.");
    }
  }
  if (!data)
    return (
      <>
        <Loading />
        {error && (
          <div className="error-box" role="alert">
            {error}
            <Button onClick={reload}>Retry</Button>
          </div>
        )}
      </>
    );
  const latest = data.metrics[0];
  const total = latest ? latest.free + latest.paid : null;
  const currentWeek = weekStart(day());
  const lastWeek = new Date(`${currentWeek}T12:00:00Z`);
  lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
  const lastWeekStr = lastWeek.toISOString().slice(0, 10);
  const thisCount = data.interviews.filter((x) => weekStart(x.date) === currentWeek).length;
  const priorCount = data.interviews.filter((x) => weekStart(x.date) === lastWeekStr).length;
  const change = percentageChange(thisCount, priorCount);
  const filtered = data.interviews.filter((x) =>
    `${x.name} ${x.company} ${x.insights} ${x.segment}`.toLowerCase().includes(query.toLowerCase()),
  );
  const docs = data.documents.filter((x) => (page === "pitch" ? x.category === "pitch" : true));
  const checklist = [
    {
      label: "Explain the problem",
      done: data.theses.some((x) => x.kind === "problem"),
      page: "strategy",
    },
    {
      label: "Define the first customer",
      done: data.theses.some((x) => x.kind === "icp"),
      page: "strategy",
    },
    { label: "Capture customer evidence", done: data.interviews.length > 0, page: "discovery" },
    {
      label: "Upload your pitch deck",
      done: data.documents.some((x) => x.category === "pitch"),
      page: "pitch",
    },
    { label: "Connect platform metrics", done: !!latest, page: "access" },
    { label: "Document your next milestone", done: data.events.length > 0, page: "calendar" },
  ];
  const done = checklist.filter((x) => x.done).length;
  const metricCards = (
    <div className="metric-grid">
      <MetricCard
        label="Platform users"
        value={total === null ? "—" : fmt.format(total)}
        caption={latest ? `As of ${human(latest.date)}` : "Waiting for platform data"}
        icon={UsersRound}
      />
      <MetricCard
        label="Freemium"
        value={latest ? fmt.format(latest.free) : "—"}
        caption="Registered users on the free plan"
        icon={UserRound}
      />
      <MetricCard
        label="Paying users"
        value={latest ? fmt.format(latest.paid) : "—"}
        caption="Users with a paid subscription"
        icon={TrendingUp}
      />
      <MetricCard
        label="Monthly recurring revenue"
        value={latest ? money(latest.mrr_cents) : "—"}
        caption={latest ? "USD · normalized monthly revenue" : "Waiting for billing data"}
        icon={ArrowUpRight}
      />
    </div>
  );
  const interviewCard = (i: Interview) => (
    <article
      key={i.id}
      className={`interview-card priority-${i.priority}`}
      draggable={admin}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", i.id);
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      <div className="card-meta">
        <span className={`priority ${i.priority}`}>{statusLabel[i.priority]}</span>
        {admin && <GripVertical size={14} />}
      </div>
      <button
        type="button"
        className="card-title-button"
        onClick={() => setModal({ type: admin ? "interview" : "view-interview", item: i })}
      >
        {i.name}
      </button>
      <span className="small muted">
        {i.company || i.segment || "Customer discovery"} · {human(i.date)}
      </span>
      <p className="clamp-4">{i.insights}</p>
      <div className="card-footer">
        <Badge variant="secondary">{i.segment || "Uncategorized"}</Badge>
        {!!i.published && <span className="small muted">Shared</span>}
      </div>
      {admin && (
        <label className="sr-only-label">
          <span>Move {i.name}</span>
          <select
            aria-label={`Move ${i.name}`}
            className="board-select"
            value={i.stage}
            disabled={busy}
            onChange={(e) => move(i, e.target.value)}
          >
            {["inbox", "signal", "action"].map((x) => (
              <option key={x} value={x}>
                {statusLabel[x]}
              </option>
            ))}
          </select>
        </label>
      )}
    </article>
  );
  return (
    <div className="workspace">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <button
          type="button"
          className="brand-link"
          onClick={(e) => {
            e.preventDefault();
            setPage("overview");
          }}
        >
          <img src="/brand/horizontal_ink.svg" alt="company" />
        </button>
        <div className="workspace-label">
          <div className="workspace-mark">
            <FolderOpen size={17} />
          </div>
          <div>
            <strong>Data room</strong>
            <span>{admin ? "Team workspace" : "Investor access"}</span>
          </div>
          <LockKeyhole size={13} />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {tabs
            .filter((t) => admin || !["access", "investor-activity", "tasks"].includes(t.id))
            .map((t) => (
              <button
                type="button"
                key={t.id}
                className={`nav-item ${page === t.id ? "selected" : ""}`}
                aria-current={page === t.id ? "page" : undefined}
                onClick={() => setPage(t.id)}
              >
                <t.icon size={17} />
                <span>{t.label}</span>
                {t.id === "messages" && data.messages.some((x) => x.status === "unread") && (
                  <span className="nav-count">
                    {data.messages.filter((x) => x.status === "unread").length}
                  </span>
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-note">
          <div className="eyebrow">Built in the open.</div>
          <p>Shared with intention.</p>
          <ShieldCheck size={17} />
          <span>Private & permissioned</span>
        </div>
        <div className="profile">
          <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{user.name}</strong>
            <span>{admin ? "Administrator" : "View only"}</span>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Sign out"
            onClick={async () => {
              await api("logout", { method: "POST", body: "{}" });
              onLogout();
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      {menu && (
        <button
          type="button"
          className="menu-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="workspace-body">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              type="button"
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={19} />
            </button>
            <span>Workspace</span>
            <span>/</span>
            <strong>{tabs.find((x) => x.id === page)?.label}</strong>
          </div>
          <div className="topbar-right">
            {admin && (
              <a
                className="mvp-launch-link"
                href="https://product.example.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open product MVP <ArrowUpRight size={14} />
              </a>
            )}
            <span className="access-pill">
              <LockKeyhole size={11} />
              {admin ? "Private workspace" : "View-only access"}
            </span>
            <button
              type="button"
              className="icon-button"
              onClick={reload}
              aria-label="Refresh data"
            >
              <RefreshCw size={15} />
            </button>
            <span className="avatar small-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="main-content">
          <div key={page} className="page reveal">
            {error && (
              <div className="error-box" role="alert">
                {error}
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setError("")}
                  aria-label="Dismiss error"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {page === "overview" && (
              <>
                <SectionTitle
                  title="Every step, a clearer picture."
                  subtitle="The story of company. Grounded in evidence, built together."
                  actions={
                    <>
                      <span className="date-tag">
                        <CalendarDays size={14} />
                        {human(day())}
                      </span>
                      {admin && (
                        <Button onClick={() => setModal({ type: "event", date: day() })}>
                          <Plus />
                          Add milestone
                        </Button>
                      )}
                    </>
                  }
                />
                <div className="welcome-banner">
                  <div>
                    <span className="eyebrow">THE COMPANY JOURNEY</span>
                    <h2>
                      From a good idea.
                      <br />
                      To something that matters.
                    </h2>
                    <p>Track what we learn, what we build, and what comes next.</p>
                    <button type="button" onClick={() => setPage("discovery")}>
                      Explore our discovery <ArrowRight size={16} />
                    </button>
                  </div>
                  <div className="banner-art" aria-hidden="true">
                    <img src="/brand/symbol_ink.svg" alt="" />
                  </div>
                </div>
                {metricCards}
                {admin && (
                  <button
                    type="button"
                    className="mvp-overview"
                    onClick={() => {
                      setDiscoverySection("testers");
                      setPage("discovery");
                    }}
                  >
                    <div>
                      <span className="eyebrow">PRODUCT MVP · PRIVATE RESEARCH</span>
                      <strong>
                        {data.testerSummary?.activated ?? "—"} <small>testers started</small>
                      </strong>
                      <span>
                        {data.testerSummary
                          ? `${data.testerSummary.registered} registered · ${data.testerSummary.returning} returning · founder and QA accounts excluded`
                          : "Tester metrics currently unavailable"}
                      </span>
                    </div>
                    <span>
                      View tester CRM <ArrowRight size={17} />
                    </span>
                  </button>
                )}
                <div className="two-columns">
                  <Panel
                    title="Growth, in perspective"
                    sub={
                      latest
                        ? "Registered users · last 30 recorded days"
                        : "Your platform's real growth will appear here."
                    }
                    action={
                      <Button variant="ghost" size="sm" onClick={() => setPage("traction")}>
                        View traction <ArrowUpRight />
                      </Button>
                    }
                  >
                    {latest ? (
                      <Suspense fallback={<div className="skeleton-box" style={{ height: 230 }} />}>
                        <GrowthChart metrics={data.metrics} />
                      </Suspense>
                    ) : (
                      <Empty
                        title="The first chapter starts here."
                        description="Connect the platform to see real users, subscriptions and revenue. Missing data is never shown as zero."
                        icon={TrendingUp}
                      />
                    )}
                  </Panel>
                  <Panel
                    title="The evidence checklist"
                    sub={`${done} of ${checklist.length} foundations in place`}
                  >
                    <div className="checklist">
                      {checklist.map((c) => (
                        <button
                          type="button"
                          key={c.label}
                          onClick={() =>
                            setPage(c.page === "access" && !admin ? "traction" : c.page)
                          }
                        >
                          <span className={c.done ? "check-circle done" : "check-circle"}>
                            {c.done ? <Check size={12} /> : null}
                          </span>
                          {c.label}
                          <ArrowUpRight size={13} />
                        </button>
                      ))}
                    </div>
                    <div className="panel-foot">
                      Progress reflects recorded evidence, not business traction.
                    </div>
                  </Panel>
                </div>
                <div className="two-columns">
                  <Panel
                    title="What we're learning"
                    sub={`${data.interviews.length} interviews recorded`}
                    action={
                      <Button size="sm" variant="ghost" onClick={() => setPage("discovery")}>
                        View all <ArrowUpRight />
                      </Button>
                    }
                  >
                    {data.interviews.length ? (
                      <div className="compact-list">
                        {data.interviews.slice(0, 3).map((i) => (
                          <button
                            type="button"
                            key={i.id}
                            onClick={() =>
                              setModal({ type: admin ? "interview" : "view-interview", item: i })
                            }
                          >
                            <span className={`priority-dot ${i.priority}`} />
                            <div>
                              <strong>{i.name}</strong>
                              <p>{i.insights}</p>
                            </div>
                            <span>{human(i.date)}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Empty
                        icon={Microscope}
                        title="Listen first. Build with purpose."
                        description="Your customer conversations will become the evidence behind each decision."
                        action={
                          admin ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setModal({ type: "interview" })}
                            >
                              <Plus />
                              First interview
                            </Button>
                          ) : undefined
                        }
                      />
                    )}
                  </Panel>
                  <Panel
                    title="Up next"
                    sub="Important moments in the company journey"
                    action={
                      <Button size="sm" variant="ghost" onClick={() => setPage("calendar")}>
                        Calendar <ArrowUpRight />
                      </Button>
                    }
                  >
                    {data.events.filter((e) => e.date >= day()).length ? (
                      <div className="upcoming-list">
                        {data.events
                          .filter((e) => e.date >= day())
                          .slice(0, 3)
                          .map((e) => (
                            <button
                              type="button"
                              key={e.id}
                              onClick={() =>
                                setModal({ type: admin ? "event" : "view-event", item: e })
                              }
                            >
                              <span className="event-date">
                                <b>{e.date.slice(8)}</b>
                                {new Date(`${e.date}T12:00Z`).toLocaleString("en-US", {
                                  month: "short",
                                })}
                              </span>
                              <div>
                                <strong>{e.title}</strong>
                                <span>{e.kind}</span>
                              </div>
                              <ArrowUpRight size={16} />
                            </button>
                          ))}
                      </div>
                    ) : (
                      <Empty
                        icon={CalendarDays}
                        title="Make the next step visible."
                        description="Add your launch, research goals and other important milestones."
                      />
                    )}
                  </Panel>
                </div>
              </>
            )}
            {page === "traction" && (
              <>
                <SectionTitle
                  title="Traction, with context."
                  subtitle="Measured progress. Clear definitions. A source behind every number."
                />
                {metricCards}
                <div className="two-columns">
                  <Panel title="Platform growth" sub="Each point is a recorded daily snapshot.">
                    {latest ? (
                      <Suspense fallback={<div className="skeleton-box" style={{ height: 230 }} />}>
                        <GrowthChart metrics={data.metrics} />
                      </Suspense>
                    ) : (
                      <Empty
                        icon={TrendingUp}
                        title="Awaiting the first snapshot"
                        description="No platform or billing source is connected yet."
                      />
                    )}
                  </Panel>
                  <Panel title="Revenue & research" sub="Different signals. One view of progress.">
                    <div className="stat-row">
                      <span>Collected revenue · latest day</span>
                      <strong>{latest ? money(latest.revenue_cents) : "—"}</strong>
                    </div>
                    <div className="stat-row">
                      <span>Customer interviews</span>
                      <strong>{data.interviews.length}</strong>
                    </div>
                    <div className="stat-row">
                      <span>Interviews this week</span>
                      <strong>{thisCount}</strong>
                    </div>
                    <div className="stat-row">
                      <span>Week-over-week change</span>
                      <strong>
                        {change === null ? "N/A" : `${change > 0 ? "+" : ""}${change.toFixed(0)}%`}
                      </strong>
                    </div>
                    <div className="panel-foot">
                      Weeks start Monday. Reporting timezone: America/New_York.
                    </div>
                  </Panel>
                </div>
                <Panel
                  title="Source ledger"
                  sub="Snapshots preserve dates, provenance and ingestion time."
                >
                  {data.metrics.length ? (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Total users</th>
                            <th>Freemium</th>
                            <th>Paid</th>
                            <th>Revenue</th>
                            <th>MRR</th>
                            <th>Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.metrics.map((m) => (
                            <tr key={m.date}>
                              <td>{human(m.date)}</td>
                              <td>{fmt.format(m.free + m.paid)}</td>
                              <td>{fmt.format(m.free)}</td>
                              <td>{fmt.format(m.paid)}</td>
                              <td>{money(m.revenue_cents)}</td>
                              <td>{money(m.mrr_cents)}</td>
                              <td>
                                {m.source}
                                <small>{new Date(m.received_at).toLocaleString()}</small>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      title="No imported measurements"
                      description="Manual assumptions and forecasts are kept outside the measured metrics."
                    />
                  )}
                </Panel>
              </>
            )}
            {page === "calendar" && (
              <>
                <SectionTitle
                  title="A timeline of what matters."
                  subtitle="Every change in one place. Milestones, new evidence and real platform users."
                  actions={
                    admin && (
                      <Button onClick={() => setModal({ type: "event", date: day() })}>
                        <Plus />
                        Add event
                      </Button>
                    )
                  }
                />
                <div className="calendar-toolbar">
                  <div>
                    <h2>
                      {month.toLocaleDateString("en-US", {
                        month: "long",
                        year: "numeric",
                        timeZone: "UTC",
                      })}
                    </h2>
                    <span className="small muted">America/New_York · Monday start</span>
                  </div>
                  <div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setMonth(new Date(`${day()}T12:00:00Z`))}
                    >
                      Today
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Previous month"
                      onClick={() =>
                        setMonth(
                          new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)),
                        )
                      }
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Next month"
                      onClick={() =>
                        setMonth(
                          new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)),
                        )
                      }
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                </div>
                <section className="calendar-panel">
                  <div className="calendar-weekdays">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => (
                      <span key={x}>{x}</span>
                    ))}
                  </div>
                  <div className="calendar-grid">
                    {calendarCells(month.getUTCFullYear(), month.getUTCMonth()).map((date) => {
                      const m = data.metrics.find((x) => x.date === date);
                      const events = data.events.filter((x) => x.date === date);
                      const activities = data.activities.filter(
                        (x) => activityDay(x.created_at) === date,
                      );
                      return (
                        <div
                          key={date}
                          className={`calendar-day ${Number(date.slice(5, 7)) - 1 !== month.getUTCMonth() ? "other-month" : ""} ${date === day() ? "today" : ""}`}
                        >
                          <div className="day-top">
                            <span>{Number(date.slice(8))}</span>
                            {admin && (
                              <button
                                type="button"
                                className="day-add"
                                aria-label={`Add event on ${date}`}
                                onClick={() => setModal({ type: "event", date })}
                              >
                                <Plus size={12} />
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            className={`user-pill ${m ? "recorded" : ""}`}
                            onClick={() => setModal({ type: "day", date })}
                            aria-label={`${date}: ${m ? `${fmt.format(m.free + m.paid)} platform users` : "No user data"}`}
                          >
                            <span>
                              <UserRound size={13} />
                            </span>
                            {m ? fmt.format(m.free + m.paid) : "—"}
                          </button>
                          <div className="day-events">
                            {events.map((e) => (
                              <button
                                type="button"
                                key={e.id}
                                className={`calendar-event ${e.kind}`}
                                onClick={() =>
                                  setModal({ type: admin ? "event" : "view-event", item: e })
                                }
                              >
                                {e.title}
                              </button>
                            ))}
                            {activities.slice(0, 2).map((a) => (
                              <button
                                type="button"
                                key={a.id}
                                className="calendar-event activity"
                                onClick={() => setModal({ type: "day", date })}
                              >
                                {activityLabels[a.action] || a.action}
                              </button>
                            ))}
                            {activities.length > 2 && (
                              <button
                                type="button"
                                className="activity-more"
                                onClick={() => setModal({ type: "day", date })}
                              >
                                +{activities.length - 2} more changes
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
                <div className="calendar-legend">
                  <span>
                    <UserRound size={14} /> Total registered platform users at the recorded cutoff
                  </span>
                  <span>— No data recorded · future days have no counts</span>
                </div>
              </>
            )}
            {page === "discovery" && admin && (
              <div className="discovery-subtabs" role="tablist" aria-label="Market discovery">
                <button
                  type="button"
                  role="tab"
                  aria-selected={discoverySection === "interviews"}
                  onClick={() => setDiscoverySection("interviews")}
                >
                  Interviews & evidence
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={discoverySection === "testers"}
                  onClick={() => setDiscoverySection("testers")}
                >
                  MVP testers
                </button>
              </div>
            )}
            {page === "discovery" && admin && discoverySection === "testers" && (
              <Suspense fallback={<Loading />}>
                <TesterBoard />
              </Suspense>
            )}
            {page === "discovery" && (!admin || discoverySection === "interviews") && (
              <>
                <SectionTitle
                  title="The discovery journal."
                  subtitle="Real conversations. Stronger questions. Decisions with a paper trail."
                  actions={
                    admin && (
                      <>
                        <Button
                          variant="outline"
                          onClick={summarize}
                          disabled={busy || data.interviews.length === 0}
                        >
                          <Sparkles />
                          {busy ? "Preparing…" : "Generate research brief"}
                        </Button>
                        <Button onClick={() => setModal({ type: "interview" })}>
                          <Plus />
                          Add interview
                        </Button>
                      </>
                    )
                  }
                />
                <div className="research-stats">
                  <div>
                    <span>Total interviews</span>
                    <strong>{data.interviews.length}</strong>
                  </div>
                  <div>
                    <span>This week</span>
                    <strong>{thisCount}</strong>
                  </div>
                  <div>
                    <span>Previous week</span>
                    <strong>{priorCount}</strong>
                  </div>
                  <div>
                    <span>Week over week</span>
                    <strong>
                      {change === null ? "N/A" : `${change > 0 ? "+" : ""}${change.toFixed(0)}%`}
                    </strong>
                  </div>
                </div>
                <div className="content-toolbar">
                  <div className="search-box">
                    <Search size={16} />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search interviews and insights…"
                      aria-label="Search interviews"
                    />
                  </div>
                  <div className="segmented">
                    <button
                      type="button"
                      aria-pressed={view === "board"}
                      onClick={() => setView("board")}
                    >
                      Board
                    </button>
                    <button
                      type="button"
                      aria-pressed={view === "list"}
                      onClick={() => setView("list")}
                    >
                      Journal
                    </button>
                  </div>
                </div>
                {view === "board" ? (
                  <div className="kanban discovery-kanban">
                    {admin && (
                      <section className="kanban-column outreach-column">
                        <div className="column-heading">
                          <span className="stage-dot outreach" />
                          <h2>People to speak with</h2>
                          <span>
                            {data.outreachContacts?.filter((c) => c.status !== "converted")
                              .length || 0}
                          </span>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label="Add outreach contact"
                            onClick={() => setModal({ type: "outreach" })}
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                        <p className="column-description">
                          People to contact before they become research evidence.
                        </p>
                        <div className="column-cards">
                          {(data.outreachContacts || [])
                            .filter((contact) => contact.status !== "converted")
                            .filter((contact) =>
                              `${contact.name} ${contact.practice} ${contact.specialty}`
                                .toLowerCase()
                                .includes(query.toLowerCase()),
                            )
                            .map((contact) => (
                              <button
                                type="button"
                                className="outreach-card"
                                key={contact.id}
                                onClick={() => setModal({ type: "outreach", item: contact })}
                              >
                                <div className="outreach-card-heading">
                                  <strong>{contact.name}</strong>
                                  <Badge variant="secondary">{contact.status}</Badge>
                                </div>
                                {(contact.specialty || contact.practice) && (
                                  <span>
                                    {[contact.specialty, contact.practice]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </span>
                                )}
                                {contact.next_step && <p>{contact.next_step}</p>}
                              </button>
                            ))}
                          {!data.outreachContacts?.some((c) => c.status !== "converted") && (
                            <div className="column-empty">
                              Add referrals and prospective interviewees here.
                            </div>
                          )}
                        </div>
                      </section>
                    )}
                    {["inbox", "signal", "action"].map((stage) => (
                      // biome-ignore lint/a11y/noStaticElementInteractions: Drag target has an equivalent keyboard-accessible select on every card.
                      <section
                        className="kanban-column"
                        key={stage}
                        onDragOver={(e) => {
                          if (admin) e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const i = data.interviews.find(
                            (i) => i.id === e.dataTransfer.getData("text/plain"),
                          );
                          if (admin && i) move(i, stage);
                        }}
                      >
                        <div className="column-heading">
                          <span className={`stage-dot ${stage}`} />
                          <h2>{statusLabel[stage]}</h2>
                          <span>{filtered.filter((x) => x.stage === stage).length}</span>
                          {admin && (
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={`Add interview to ${statusLabel[stage]}`}
                              onClick={() => setModal({ type: "interview", stage })}
                            >
                              <Plus size={15} />
                            </button>
                          )}
                        </div>
                        <div className="column-cards">
                          {filtered.filter((x) => x.stage === stage).map(interviewCard)}
                          {!filtered.some((x) => x.stage === stage) && (
                            <div className="column-empty">
                              {stage === "inbox"
                                ? "Start with a conversation."
                                : stage === "signal"
                                  ? "Move meaningful evidence here."
                                  : "Turn an insight into a next step."}
                            </div>
                          )}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="journal-grid">
                    {filtered.map(interviewCard)}
                    {filtered.length === 0 && (
                      <Empty
                        icon={Search}
                        title="No interviews found"
                        description="Add your first conversation or try a different search."
                      />
                    )}
                  </div>
                )}
                <div className="calendar-legend">
                  <span>
                    <i className="priority-dot red" /> High priority
                  </span>
                  <span>
                    <i className="priority-dot yellow" /> Medium priority
                  </span>
                  <span>
                    <i className="priority-dot green" /> Low priority
                  </span>
                  <span>Move cards by dragging or using their dropdown.</span>
                </div>
              </>
            )}
            {(page === "pitch" || page === "documents") && (
              <>
                <SectionTitle
                  title={
                    page === "pitch" ? "The story keeps evolving." : "Everything, in its place."
                  }
                  subtitle={
                    page === "pitch"
                      ? "Every pitch deck version. Every change in the narrative."
                      : "A focused library for investor conversations and deeper diligence."
                  }
                  actions={
                    admin && (
                      <Button onClick={() => setModal({ type: "upload" })}>
                        <Upload />
                        Upload PDF
                      </Button>
                    )
                  }
                />
                {docs.length ? (
                  <div className="document-grid">
                    {docs.map((d) => (
                      <article key={d.id} className="document-card">
                        <button type="button" className="document-cover" onClick={() => setPdf(d)}>
                          <img src="/brand/horizontal_white.svg" alt="company" />
                          <span>{d.category === "pitch" ? "The next chapter." : d.title}</span>
                          <div>
                            <span>PRIVATE / {d.category.toUpperCase()}</span>
                            <b>V{d.version.toString().padStart(2, "0")}</b>
                          </div>
                        </button>
                        <div className="document-info">
                          <div>
                            <h3>{d.title}</h3>
                            <Badge variant={d.published ? "secondary" : "outline"}>
                              {d.published ? "Shared with investors" : "Team only"}
                            </Badge>
                          </div>
                          <p>{d.notes || "No change notes added."}</p>
                          <span>
                            {human(d.created_at)} · {(d.size / 1024 / 1024).toFixed(1)} MB
                          </span>
                          <div className="document-actions">
                            <Button variant="outline" size="sm" onClick={() => setPdf(d)}>
                              Open PDF <ArrowUpRight />
                            </Button>
                            {admin && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  act(`documents/${d.id}/publish`, {
                                    published: !d.published,
                                  }).catch(() => {})
                                }
                              >
                                {d.published ? "Make private" : "Publish to room"}
                              </Button>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <Panel title={page === "pitch" ? "Pitch deck history" : "Document library"}>
                    <Empty
                      icon={FileText}
                      title={
                        page === "pitch"
                          ? "Your next chapter starts with a deck."
                          : "Ready for the documents that matter."
                      }
                      description="Upload a PDF to keep a private, versioned record. Publish individual versions when they are ready for investors."
                      action={
                        admin ? (
                          <Button onClick={() => setModal({ type: "upload" })}>
                            <Upload />
                            Upload first PDF
                          </Button>
                        ) : undefined
                      }
                    />
                  </Panel>
                )}
                {page === "documents" && (
                  <Panel
                    title="A lean diligence checklist"
                    sub="Prepared from YC, Sequoia, a16z, Bessemer and investor data-room guidance."
                  >
                    <div className="diligence-grid">
                      {[
                        ["The narrative", "Pitch, problem, ICP and solution"],
                        ["The evidence", "Customer interviews and product traction"],
                        ["The economics", "Revenue, cash, runway and assumptions"],
                        ["The company", "Team, cap table and corporate records"],
                        ["The product", "Roadmap, demos and technical overview"],
                        ["The obligations", "IP, material contracts and risks"],
                      ].map(([title, desc]) => (
                        <div key={title}>
                          <BookOpen size={18} />
                          <h3>{title}</h3>
                          <p>{desc}</p>
                        </div>
                      ))}
                    </div>
                    <div className="panel-foot">
                      Keep sensitive legal and personal documents in a separately permissioned
                      diligence process.
                    </div>
                  </Panel>
                )}
              </>
            )}
            {page === "strategy" && (
              <>
                <SectionTitle
                  title="What we believe. What we learn."
                  subtitle="Make hypotheses explicit. Let the evidence change the plan."
                  actions={
                    admin && (
                      <Button onClick={() => setModal({ type: "thesis" })}>
                        <Plus />
                        New version
                      </Button>
                    )
                  }
                />
                <div className="strategy-grid">
                  {[
                    ["problem", "The problem", Target],
                    ["icp", "Our first customer", UsersRound],
                    ["idea", "The idea space", Lightbulb],
                    ["pivot", "Pivots & decisions", ArrowUpRight],
                    ["traction", "Traction narrative", TrendingUp],
                  ].map(([kind, label, Icon]) => {
                    const list = data.theses.filter((t) => t.kind === kind);
                    const t = list[0];
                    const Glyph = Icon as typeof Target;
                    return (
                      <Panel
                        key={String(kind)}
                        title={String(label)}
                        sub={
                          t ? `${t.status} · ${human(t.created_at)}` : "No statement recorded yet"
                        }
                        action={<Glyph size={18} />}
                      >
                        {t ? (
                          <div className="thesis-body">
                            <h3>{t.title}</h3>
                            <p>{t.body}</p>
                            {list.length > 1 && (
                              <details>
                                <summary>
                                  {list.length - 1} earlier version{list.length > 2 ? "s" : ""}
                                </summary>
                                {list.slice(1).map((v) => (
                                  <article key={v.id}>
                                    <span className="small muted">
                                      {human(v.created_at)} · {v.status}
                                    </span>
                                    <h4>{v.title}</h4>
                                    <p>{v.body}</p>
                                  </article>
                                ))}
                              </details>
                            )}
                          </div>
                        ) : (
                          <div className="thesis-empty">
                            {kind === "problem"
                              ? "What hurts, for whom, and how do they solve it today?"
                              : kind === "icp"
                                ? "Who feels the problem most acutely and can decide to buy?"
                                : kind === "idea"
                                  ? "Which opportunity are we exploring, and what is outside our focus?"
                                  : kind === "pivot"
                                    ? "What changed our mind? Link the decision to interview evidence."
                                    : "What measurable behavior suggests customers want this?"}
                          </div>
                        )}
                      </Panel>
                    );
                  })}
                </div>
              </>
            )}
            {page === "team" && (
              <>
                <SectionTitle
                  title="Built by doers."
                  subtitle="The people turning evidence into the next version of company."
                  actions={
                    admin && (
                      <Button onClick={() => setModal({ type: "admin" })}>
                        <Plus />
                        Invite administrator
                      </Button>
                    )
                  }
                />
                <div className="team-grid">
                  {data.members.map((m) => (
                    <article key={m.id} className="team-card">
                      <span className="team-avatar">{m.name.slice(0, 1)}</span>
                      <h2>{m.name}</h2>
                      <p>{m.title}</p>
                      {admin && <span className="small muted">{m.email}</span>}
                      <Badge variant={m.status === "active" ? "secondary" : "outline"}>
                        {m.status}
                      </Badge>
                      {admin && m.id !== user.id && m.status !== "revoked" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => act(`members/${m.id}/revoke`, {}).catch(() => {})}
                        >
                          Revoke access
                        </Button>
                      )}
                    </article>
                  ))}
                </div>
              </>
            )}
            {page === "messages" && (
              <>
                <SectionTitle
                  title="Good feedback moves us forward."
                  subtitle={
                    admin
                      ? "Investor questions and feedback, with the context attached."
                      : "Your feedback, shared privately with the company team."
                  }
                  actions={
                    <Button onClick={() => setModal({ type: "feedback" })}>
                      <MessageSquare />
                      Write feedback
                    </Button>
                  }
                />
                <div className="message-list">
                  {data.messages.length ? (
                    data.messages.map((m) => (
                      <article className="message-card" key={m.id}>
                        <span className="avatar">{m.name.slice(0, 1)}</span>
                        <div>
                          <div className="message-heading">
                            <strong>{m.name}</strong>
                            <span>{new Date(m.created_at).toLocaleString()}</span>
                          </div>
                          <span className="small muted">
                            {m.email} · {m.page}
                          </span>
                          <p>{m.body}</p>
                          {admin && m.status === "unread" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => act(`messages/${m.id}/read`, {}).catch(() => {})}
                            >
                              <Check />
                              Mark read
                            </Button>
                          )}
                        </div>
                      </article>
                    ))
                  ) : (
                    <Panel title="Messages">
                      <Empty
                        icon={MessageSquare}
                        title="A conversation worth having."
                        description="Questions, challenges and observations all belong here."
                      />
                    </Panel>
                  )}
                </div>
              </>
            )}
            {page === "tasks" && admin && (
              <Suspense fallback={<Loading />}>
                <TaskBoard onChange={reload} />
              </Suspense>
            )}
            {page === "investor-activity" && admin && (
              <>
                <SectionTitle
                  title="Know what resonates."
                  subtitle="A private record of investor visits and content accessed."
                />
                <Suspense fallback={<Loading />}>
                  <InvestorActivity />
                </Suspense>
              </>
            )}
            {page === "access" && admin && (
              <>
                <SectionTitle
                  title="The right people. The right access."
                  subtitle="Invite with intention. Keep control as the story evolves."
                  actions={
                    <Button onClick={() => setModal({ type: "share" })}>
                      <Link2 />
                      Generate investor password
                    </Button>
                  }
                />
                <Panel
                  title="Investor passwords"
                  sub="Password protected · Published content only · Revoke at any time"
                >
                  {data.shares.length ? (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Access label</th>
                            <th>Expires</th>
                            <th>Status</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.shares.map((s) => (
                            <tr key={s.id}>
                              <td>{s.label}</td>
                              <td>
                                {s.expires_at ? new Date(s.expires_at).toLocaleString() : "Always"}
                              </td>
                              <td>
                                {s.revoked
                                  ? "Revoked"
                                  : s.expires_at && Date.parse(s.expires_at) <= Date.now()
                                    ? "Expired"
                                    : "Active"}
                              </td>
                              <td>
                                {!s.revoked && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => act(`shares/${s.id}/revoke`, {}).catch(() => {})}
                                  >
                                    Revoke
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      icon={ShieldCheck}
                      title="A private room, by invitation."
                      description="Create a link and password for your next investor conversation. Viewers can leave feedback and cannot edit your data."
                    />
                  )}
                </Panel>
                <div className="two-columns">
                  <Panel
                    title="Platform connection"
                    sub="One source of truth for the company ecosystem"
                  >
                    <div className="connection-row">
                      <Database size={19} />
                      <div>
                        <strong>product.example.com</strong>
                        <p>
                          {latest
                            ? `Last snapshot: ${new Date(latest.received_at).toLocaleString()}`
                            : "Awaiting integration with the future platform"}
                        </p>
                      </div>
                      <Badge variant={latest ? "secondary" : "outline"}>
                        {latest ? "Receiving data" : "Not connected"}
                      </Badge>
                    </div>
                    <div className="connection-row">
                      <ShieldCheck size={19} />
                      <div>
                        <strong>admin.example.com</strong>
                        <p>Access, discounts, users and payments</p>
                      </div>
                      <Badge variant="outline">Planned</Badge>
                    </div>
                    <div className="panel-foot">
                      The room refreshes every 15 seconds while open. Signed API snapshots will
                      supply daily metrics.
                    </div>
                  </Panel>
                  <Panel
                    title="Your next integration steps"
                    sub="Ready to connect when the product is live"
                  >
                    <ol className="integration-list">
                      <li>Send signed, idempotent user and revenue snapshots.</li>
                      <li>Verify payment webhooks before granting product access.</li>
                      <li>Connect a transactional email provider for invitations.</li>
                      <li>Configure monitoring destinations and privacy controls.</li>
                    </ol>
                    <div className="panel-foot">
                      External accounts and credentials are required to activate these services.
                    </div>
                  </Panel>
                </div>
              </>
            )}
          </div>
          <footer className="workspace-footer">
            <span>company / The evidence behind what we build.</span>
            <span>
              Private workspace · Updated{" "}
              {new Date(data.updatedAt).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </footer>
        </main>
      </div>
      {!admin && (
        <Button className="floating-feedback" onClick={() => setModal({ type: "feedback" })}>
          <MessageSquare size={18} />
          Messages
        </Button>
      )}
      {notice && (
        <div className="toast reveal" role="status">
          <CheckCircle2 size={17} />
          {notice}
          <button
            type="button"
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <Dialog
        open={!!modal}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setModal(null);
            setError("");
          }
        }}
      >
        <DialogContent
          className={`company-dialog ${modal?.type === "interview" ? "wide-dialog" : ""}`}
        >
          <DialogHeader>
            <DialogTitle>
              {
                (
                  {
                    interview: modal?.item ? "Edit interview" : "Capture a conversation",
                    outreach: modal?.item ? "Edit outreach contact" : "Add outreach contact",
                    event: modal?.item ? "Edit event" : "A moment that matters",
                    thesis: "A new version of our thinking",
                    feedback: "What are you seeing?",
                    share: "Create investor access",
                    admin: "Invite an administrator",
                    upload: "Add a new document version",
                    day: modal?.date ? human(modal.date) : "Day details",
                    "view-event": "Milestone",
                    "view-interview": "Customer evidence",
                  } as Record<string, string>
                )[modal?.type || ""]
              }
            </DialogTitle>
            <DialogDescription>
              {modal?.type === "feedback"
                ? `Your feedback will be attached to ${tabs.find((t) => t.id === page)?.label}.`
                : modal?.type === "admin"
                  ? "The invitation link expires in one hour. Share it privately with the intended person."
                  : "Keep the record clear, useful and grounded in evidence."}
            </DialogDescription>
          </DialogHeader>
          {modal?.type === "day" ? (
            (() => {
              const m = data.metrics.find((x) => x.date === modal.date);
              return (
                <div className="day-detail">
                  <UserRound size={28} />
                  <strong>{m ? fmt.format(m.free + m.paid) : "—"}</strong>
                  <p>
                    {m ? "Total registered platform users" : "No user data recorded for this day."}
                  </p>
                  {m && (
                    <>
                      <div className="stat-row">
                        <span>Freemium</span>
                        <b>{m.free}</b>
                      </div>
                      <div className="stat-row">
                        <span>Paying</span>
                        <b>{m.paid}</b>
                      </div>
                      <p className="small muted">
                        Source: {m.source}
                        <br />
                        As of: {new Date(m.as_of).toLocaleString()}
                        <br />
                        Reporting timezone: {m.timezone}
                      </p>
                    </>
                  )}
                  <h3>Activity log</h3>
                  {data.activities.filter((a) => activityDay(a.created_at) === modal.date)
                    .length === 0 && (
                    <p className="small muted">No changes recorded for this day.</p>
                  )}
                  {data.activities
                    .filter((a) => activityDay(a.created_at) === modal.date)
                    .map((a) => (
                      <article className="activity-detail" key={a.id}>
                        <time>
                          {new Date(a.created_at).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "America/New_York",
                          })}
                        </time>
                        <div>
                          <b>{activityLabels[a.action] || a.action}</b>
                          {a.title && <p>{a.title}</p>}
                        </div>
                      </article>
                    ))}
                  {data.events
                    .filter((e) => e.date === modal.date)
                    .map((e) => (
                      <div className="event-detail" key={e.id}>
                        <b>{e.title}</b>
                        <p>{e.description}</p>
                      </div>
                    ))}
                </div>
              );
            })()
          ) : modal?.type === "view-event" ? (
            <div className="thesis-body">
              <h3>{(modal.item as Milestone).title}</h3>
              <p>{(modal.item as Milestone).description}</p>
              <span>{human((modal.item as Milestone).date)}</span>
            </div>
          ) : modal?.type === "view-interview" ? (
            <div className="thesis-body">
              <h3>{(modal.item as Interview).name}</h3>
              <Badge variant="secondary">
                {(modal.item as Interview).segment || "Customer discovery"}
              </Badge>
              <p>{(modal.item as Interview).insights}</p>
              <span>{human((modal.item as Interview).date)}</span>
            </div>
          ) : (
            <form
              onSubmit={save}
              className="modal-form"
              key={modal?.type + (modal?.item?.id || "")}
            >
              {modal?.type === "interview" &&
                (() => {
                  const i = modal.item as Interview | undefined;
                  return (
                    <>
                      <div className="form-grid">
                        <Field label="Interviewee name · admins only">
                          <Input name="name" required maxLength={100} defaultValue={i?.name} />
                        </Field>
                        <Field label="Interviewee email · admins only">
                          <Input
                            name="email"
                            type="email"
                            maxLength={254}
                            defaultValue={i?.email}
                          />
                        </Field>
                        <Field label="Company · admins only">
                          <Input name="company" maxLength={120} defaultValue={i?.company} />
                        </Field>
                        <Field label="Interview date">
                          <Input type="date" name="date" required defaultValue={i?.date || day()} />
                        </Field>
                        <Field label="Customer segment">
                          <Input
                            name="segment"
                            placeholder="e.g. Marketing teams"
                            maxLength={100}
                            defaultValue={i?.segment}
                          />
                        </Field>
                      </div>
                      <p className="small muted">
                        {i
                          ? `Investors see Interview #${i.number}. `
                          : "An anonymous interview number is assigned when saved. "}
                        Names, emails, company details and raw notes stay private. Investors see the
                        anonymized summary and discovery details; remove identifying details before
                        publishing.
                      </p>
                      <Field label="Key insights · what did you actually learn?">
                        <Textarea
                          name="insights"
                          required
                          rows={4}
                          maxLength={12000}
                          defaultValue={i?.insights}
                        />
                      </Field>
                      <Field label="Problem & current workaround">
                        <Textarea name="problem" rows={2} defaultValue={i?.problem} />
                      </Field>
                      <Field label="Next experiment or action">
                        <Textarea name="next_step" rows={2} defaultValue={i?.next_step} />
                      </Field>
                      <div className="form-grid">
                        <Field label="Evidence stage">
                          <FormSelect
                            name="stage"
                            value={i?.stage || modal?.stage || "inbox"}
                            options={[
                              ["inbox", "Conversations logged"],
                              ["signal", "Patterns emerging"],
                              ["action", "Decisions & experiments"],
                            ]}
                          />
                        </Field>
                        <Field label="Priority">
                          <FormSelect
                            name="priority"
                            value={i?.priority || "yellow"}
                            options={[
                              ["red", "🔴 High priority"],
                              ["yellow", "🟡 Medium priority"],
                              ["green", "🟢 Low priority"],
                            ]}
                          />
                        </Field>
                      </div>
                      <Field label="Investor summary · remove names and confidential details">
                        <Textarea
                          name="public_summary"
                          rows={3}
                          maxLength={5000}
                          defaultValue={i?.public_summary}
                        />
                      </Field>
                      <Publication value={i?.published} />
                    </>
                  );
                })()}
              {modal?.type === "outreach" &&
                (() => {
                  const contact = modal.item as OutreachContact | undefined;
                  return (
                    <>
                      <div className="form-grid">
                        <Field label="Contact name">
                          <Input
                            name="name"
                            required
                            maxLength={120}
                            defaultValue={contact?.name}
                          />
                        </Field>
                        <Field label="Phone">
                          <Input name="phone" maxLength={40} defaultValue={contact?.phone} />
                        </Field>
                        <Field label="Practice or organization">
                          <Input name="practice" maxLength={160} defaultValue={contact?.practice} />
                        </Field>
                        <Field label="Specialty or role">
                          <Input
                            name="specialty"
                            maxLength={120}
                            defaultValue={contact?.specialty}
                          />
                        </Field>
                      </div>
                      <Field label="Relationship or referral context">
                        <Textarea
                          name="relationship"
                          rows={2}
                          maxLength={500}
                          defaultValue={contact?.relationship}
                        />
                      </Field>
                      <div className="form-grid">
                        <Field label="Outreach status">
                          <FormSelect
                            name="status"
                            value={contact?.status || "referred"}
                            options={[
                              ["referred", "Referred · not contacted"],
                              ["contacted", "Contacted"],
                              ["scheduled", "Interview scheduled"],
                              ["converted", "Converted to evidence"],
                              ["paused", "Paused"],
                            ]}
                          />
                        </Field>
                        <Field label="Next action">
                          <Input
                            name="next_step"
                            maxLength={1000}
                            defaultValue={contact?.next_step}
                          />
                        </Field>
                      </div>
                      <Field label="Private notes">
                        <Textarea
                          name="notes"
                          rows={4}
                          maxLength={5000}
                          defaultValue={contact?.notes}
                        />
                      </Field>
                      <p className="small muted">
                        Outreach contacts are private to administrators and are never shown in the
                        investor room.
                      </p>
                    </>
                  );
                })()}
              {modal?.type === "event" &&
                (() => {
                  const i = modal.item as Milestone | undefined;
                  return (
                    <>
                      <Field label="Event title">
                        <Input
                          name="title"
                          placeholder="e.g. Platform launch"
                          required
                          maxLength={150}
                          defaultValue={i?.title}
                        />
                      </Field>
                      <div className="form-grid">
                        <Field label="Date">
                          <Input
                            type="date"
                            name="date"
                            required
                            defaultValue={i?.date || modal.date || day()}
                          />
                        </Field>
                        <Field label="Type">
                          <FormSelect
                            name="kind"
                            value={i?.kind || "milestone"}
                            options={[
                              ["launch", "Launch"],
                              ["milestone", "Milestone"],
                              ["research", "Research"],
                              ["fundraising", "Fundraising"],
                            ]}
                          />
                        </Field>
                      </div>
                      <Field label="Details">
                        <Textarea
                          name="description"
                          rows={3}
                          maxLength={3000}
                          defaultValue={i?.description}
                        />
                      </Field>
                      <Publication value={i?.published} />
                    </>
                  );
                })()}
              {modal?.type === "thesis" && (
                <>
                  <div className="form-grid">
                    <Field label="Section">
                      <FormSelect
                        name="kind"
                        options={[
                          ["problem", "The problem"],
                          ["icp", "Ideal customer profile"],
                          ["idea", "Idea space"],
                          ["pivot", "Pivot or decision"],
                          ["traction", "Traction narrative"],
                        ]}
                      />
                    </Field>
                    <Field label="Evidence status">
                      <FormSelect
                        name="status"
                        options={[
                          ["hypothesis", "Hypothesis"],
                          ["testing", "Testing"],
                          ["validated", "Validated"],
                          ["retired", "Retired"],
                        ]}
                      />
                    </Field>
                  </div>
                  <Field label="Title">
                    <Input name="title" required maxLength={150} />
                  </Field>
                  <Field label="Statement, evidence and what changed">
                    <Textarea name="body" required rows={7} maxLength={12000} />
                  </Field>
                  <Publication />
                </>
              )}
              {modal?.type === "feedback" && (
                <Field label="Your message">
                  <Textarea
                    name="body"
                    required
                    minLength={3}
                    maxLength={5000}
                    rows={6}
                    placeholder="An observation, a question, or a suggestion for the next step…"
                  />
                </Field>
              )}
              {modal?.type === "share" && (
                <>
                  <Field label="Access label">
                    <Input
                      name="label"
                      required
                      maxLength={100}
                      placeholder="e.g. Seed investor conversations"
                    />
                  </Field>
                  <p className="small muted">
                    A secure 18-character password will be generated automatically and shown once.
                    Investors enter only their name, email and this password.
                  </p>
                  <Field label="Expires in">
                    <FormSelect
                      name="days"
                      value="7"
                      options={[
                        ["1", "1 day"],
                        ["7", "7 days"],
                        ["14", "14 days"],
                        ["30", "30 days"],
                        ["always", "Always"],
                      ]}
                    />
                  </Field>
                  <p className="small muted">
                    Always keeps the password valid until you revoke it. Investors still sign in
                    again after their session expires.
                  </p>
                  <p className="small muted">
                    Viewers can read published content and leave feedback. All investor passwords
                    share this published scope.
                  </p>
                </>
              )}
              {modal?.type === "admin" && (
                <>
                  <Field label="Full name">
                    <Input name="name" required maxLength={100} />
                  </Field>
                  <Field label="Email address">
                    <Input type="email" name="email" required />
                  </Field>
                </>
              )}
              {modal?.type === "upload" && (
                <>
                  <Field label="Document title">
                    <Input
                      name="title"
                      required
                      maxLength={150}
                      placeholder="e.g. Investor pitch — September"
                    />
                  </Field>
                  <Field label="Category">
                    <FormSelect
                      name="category"
                      value={page === "pitch" ? "pitch" : "product"}
                      options={[
                        ["pitch", "Pitch deck"],
                        ["financial", "Financial"],
                        ["product", "Product"],
                        ["research", "Research"],
                        ["legal", "Legal"],
                      ]}
                    />
                  </Field>
                  <Field label="PDF · maximum 10 MB">
                    <Input name="file" type="file" accept="application/pdf,.pdf" required />
                  </Field>
                  <Field label="What changed in this version?">
                    <Textarea name="notes" rows={3} maxLength={3000} />
                  </Field>
                  <p className="small muted">
                    Uploaded files are private to the team until you publish them.
                  </p>
                  {progress !== null && (
                    <div role="status">
                      <progress value={progress} max={100} />
                      <span>
                        {progress === 100
                          ? "Upload complete. Saving securely…"
                          : `Uploading ${progress}%`}
                      </span>
                    </div>
                  )}
                </>
              )}
              {error && (
                <div className="error-box" role="alert">
                  {error}
                </div>
              )}
              <div className="form-actions">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy
                    ? "Saving…"
                    : modal?.type === "feedback"
                      ? "Send feedback"
                      : modal?.type === "share"
                        ? "Generate password"
                        : modal?.type === "admin"
                          ? "Create invitation"
                          : "Save"}
                  {!busy && <ArrowRight />}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!link}
        onOpenChange={(open) => {
          if (!open) {
            setLink("");
            setAccessCode("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {accessCode
                ? "Your investor password is ready."
                : "Your private invitation is ready."}
            </DialogTitle>
            <DialogDescription>
              {accessCode
                ? "Copy this 18-character password now. It is shown only once. Share it only with the intended investors; expiry and revocation apply to everyone using it."
                : "Copy this administrator invitation and share it privately. It expires in one hour."}
            </DialogDescription>
          </DialogHeader>
          <Input
            readOnly
            value={accessCode || link}
            aria-label={accessCode ? "Generated investor password" : "Private access link"}
            onFocus={(e) => e.target.select()}
          />
          <Button onClick={copy}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : accessCode ? "Copy investor password" : "Copy invitation link"}
          </Button>
          <p className="small muted">
            {accessCode ? (
              <>
                Investors sign in at{" "}
                <a href={link} target="_blank" rel="noreferrer">
                  data-room.example.com → Investor log in
                </a>{" "}
                using name, email and this password.
              </>
            ) : (
              "Keep this invitation private."
            )}
          </p>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!digest}
        onOpenChange={(open) => {
          if (!open) setDigest(null);
        }}
      >
        <DialogContent className="wide-dialog company-dialog">
          <DialogHeader>
            <DialogTitle>Market discovery brief</DialogTitle>
            <DialogDescription>
              {digest?.count} interviews · {digest?.highPriority} high priority · {digest?.method}
            </DialogDescription>
          </DialogHeader>
          {digest?.executiveSummary && (
            <section className="research-brief">
              <h3>Executive summary</h3>
              <p>{digest.executiveSummary}</p>
              <div className="research-brief-grid">
                <div>
                  <h4>Ready now</h4>
                  <ul>
                    {digest.readyNow?.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4>Needs improvement</h4>
                  <ul>
                    {digest.improvements?.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4>Recommended next steps</h4>
                  <ol>
                    {digest.nextSteps?.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ol>
                </div>
              </div>
            </section>
          )}
          <div className="digest-list">
            {digest?.items.map((i) => (
              <article key={i.id}>
                <div className="card-meta">
                  <Badge variant="outline">{human(i.date)}</Badge>
                  <span className={`priority ${i.priority}`}>{statusLabel[i.priority]}</span>
                </div>
                <h3>{i.name}</h3>
                <p>{i.insight}</p>
                {i.problem && (
                  <p>
                    <b>Problem: </b>
                    {i.problem}
                  </p>
                )}
                {i.nextStep && (
                  <p>
                    <b>Next step: </b>
                    {i.nextStep}
                  </p>
                )}
                <button
                  type="button"
                  className="text-link"
                  onClick={() => {
                    setDigest(null);
                    const item = data.interviews.find((x) => x.id === i.id);
                    if (item) setModal({ type: "interview", item });
                  }}
                >
                  Open source interview <ArrowUpRight size={13} />
                </button>
              </article>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!pdf}
        onOpenChange={(open) => {
          if (!open) setPdf(null);
        }}
      >
        <DialogContent className="pdf-dialog">
          <DialogHeader>
            <DialogTitle>{pdf?.title}</DialogTitle>
            <DialogDescription>
              Version {pdf?.version} · {pdf && human(pdf.created_at)} ·{" "}
              {pdf?.published ? "Shared with investors" : "Private to the team"}
            </DialogDescription>
          </DialogHeader>
          {pdf && (
            <>
              <iframe
                title={`${pdf.title} PDF`}
                src={`/api/documents/${pdf.id}/file#toolbar=1&navpanes=0`}
                loading="lazy"
              />
              <a
                className="text-link"
                href={`/api/documents/${pdf.id}/file`}
                target="_blank"
                rel="noreferrer"
              >
                Open PDF in a new tab <ExternalLink size={14} />
              </a>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
