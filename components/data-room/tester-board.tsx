"use client";
import {
  ArrowUpRight,
  Building2,
  Download,
  GripVertical,
  Mail,
  Phone,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import {
  type TesterDetail,
  type TesterRow,
  type TesterSummary,
  testerStages,
} from "@/lib/tester-contracts";

const actionLabels: Record<string, string> = {
  role: "Switched practice role",
  record: "Added record",
  intake: "Updated intake",
  insurance: "Updated insurance",
  preference: "Updated contact preference",
  note: "Saved organizational note",
  plan: "Created treatment plan",
  planStage: "Updated treatment stage",
  appointment: "Booked or edited visit",
  moveAppointment: "Moved appointment",
  appointmentStatus: "Updated arrival / visit status",
  confirm: "Confirmed appointment",
  complete: "Completed visit",
  payment: "Recorded payment",
  claim: "Updated claim",
  task: "Created task",
  taskCheck: "Updated task checklist",
  message: "Sent message",
  messageOwner: "Assigned conversation",
  invite: "Invited teammate",
  userRole: "Updated teammate role",
  profile: "Edited profile",
  subscription: "Explored plan",
  automation: "Ran automation",
  integrationTest: "Tested integration",
  support: "Requested support",
  practiceSettings: "Edited scheduling defaults",
  demographics: "Updated record demographics",
  simulation: "Used practice simulation",
  reset: "Reset demo",
};
const duration = (ms: number) =>
  ms < 60000
    ? `${Math.round(ms / 1000)} sec`
    : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} sec`;
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : "Not started";
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const r = await fetch(`/api/testers/${path}`, {
    cache: "no-store",
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const b = (await r.json()) as T & { error?: string };
  if (!r.ok) throw Error(b.error || "Unable to load testers.");
  return b;
}
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export default function TesterBoard() {
  const [items, setItems] = useState<TesterRow[]>([]),
    [summary, setSummary] = useState<TesterSummary | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [excluded, setExcluded] = useState(false),
    [next, setNext] = useState<number | null>(null),
    [detail, setDetail] = useState<TesterDetail | null>(null),
    [draft, setDraft] = useState<TesterRow | null>(null),
    [drag, setDrag] = useState<string | null>(null),
    [view, setView] = useState("board");
  const load = useCallback(
    async (offset = 0) => {
      setBusy(true);
      setError("");
      try {
        const data = await request<{
          items: TesterRow[];
          summary: TesterSummary;
          next: number | null;
        }>(
          `list?offset=${offset}&search=${encodeURIComponent(search)}&excluded=${excluded ? "1" : "0"}`,
        );
        setItems((old) =>
          offset
            ? [...old, ...data.items.filter((x) => !old.some((y) => y.user_id === x.user_id))]
            : data.items,
        );
        setSummary(data.summary);
        setNext(data.next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to load testers.");
      } finally {
        setBusy(false);
      }
    },
    [search, excluded],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function open(id: string) {
    setBusy(true);
    setError("");
    try {
      const d = await request<TesterDetail>(`detail?id=${encodeURIComponent(id)}`);
      setDetail(d);
      setDraft({ ...d.tester });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load report.");
    } finally {
      setBusy(false);
    }
  }
  async function save(t: TesterRow, close = false) {
    setBusy(true);
    setError("");
    try {
      await request("update", {
        method: "POST",
        body: JSON.stringify({
          id: t.user_id,
          version: t.version,
          stage: t.stage,
          notes: t.notes,
          excluded: !!t.excluded,
          status: t.status,
        }),
      });
      if (close) {
        setDetail(null);
        setDraft(null);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update tester.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="tester-crm">
      <div className="section-heading">
        <div>
          <span className="eyebrow">MARKET DISCOVERY / PRODUCT TESTING</span>
          <h1>MVP testers.</h1>
          <p>Every account, every test, a clearer next conversation.</p>
        </div>
        <a
          className="mvp-launch-link"
          href="https://product.example.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open MVP <ArrowUpRight size={15} />
        </a>
      </div>
      <div className="tester-stat-grid">
        {[
          ["Registered", summary?.registered],
          ["Started the MVP", summary?.activated],
          ["Returning testers", summary?.returning],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value ?? "—"}</strong>
          </div>
        ))}
      </div>
      <p className="muted tester-method">
        Counts exclude founders and QA records. A returning tester has more than one MVP sign-in
        session. Registration is not an interview, customer or verified organization. Latest
        activity: {date(summary?.lastSync || null)}.
      </p>
      <div className="tester-controls">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query);
          }}
        >
          <Input
            aria-label="Search testers"
            placeholder="Name, email or organization"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button variant="outline" type="submit">
            Search
          </Button>
        </form>
        <label>
          <input
            type="checkbox"
            checked={excluded}
            onChange={(e) => setExcluded(e.target.checked)}
          />{" "}
          Include QA / excluded
        </label>
        <Button variant="outline" onClick={() => setView(view === "board" ? "table" : "board")}>
          {view === "board" ? "Table view" : "Kanban view"}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => load()}>
          <RefreshCw size={15} /> Refresh
        </Button>
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {!busy && !items.length ? (
        <div className="tester-empty">
          <h2>No testers in this view yet.</h2>
          <p>
            Share the MVP entry page. A new account appears here after registration; usage starts
            when the tester opens the workspace.
          </p>
          <a href="https://product.example.com" target="_blank" rel="noopener noreferrer">
            product.example.com →
          </a>
        </div>
      ) : view === "board" ? (
        <div className="tester-kanban">
          {testerStages.map((stage) => (
            // biome-ignore lint/a11y/noStaticElementInteractions: Drop zone has an equivalent native stage selector on every card.
            <section
              key={stage}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const t = items.find((x) => x.user_id === drag);
                if (t && t.stage !== stage) void save({ ...t, stage });
                setDrag(null);
              }}
            >
              <h3>
                {stage}
                <span>{items.filter((x) => x.stage === stage).length}</span>
              </h3>
              {items
                .filter((x) => x.stage === stage)
                .map((t) => (
                  <article
                    key={t.user_id}
                    draggable={!busy}
                    onDragStart={() => setDrag(t.user_id)}
                    onDragEnd={() => setDrag(null)}
                  >
                    <div className="tester-card-title">
                      <button type="button" onClick={() => open(t.user_id)}>
                        {t.name}
                      </button>
                      <GripVertical size={15} />
                    </div>
                    <p>
                      <Building2 size={13} />
                      {t.organization}
                    </p>
                    <a href={`mailto:${t.email}`}>{t.email}</a>
                    <a href={`tel:${t.phone.replace(/[^+\d]/g, "")}`}>{t.phone}</a>
                    <div className="tester-card-stats">
                      <span>{t.visits} sessions</span>
                      <span>{t.actions} actions</span>
                      <span>{duration(t.active_ms)} active</span>
                    </div>
                    <small>Most active: {t.top_page || "No page activity yet"}</small>
                    <small>Last access: {date(t.last_at)}</small>
                    {t.excluded ? <small>Excluded from totals · QA/internal</small> : null}
                    <label className="tester-stage-label">
                      Stage
                      <select
                        aria-label={`Stage for ${t.name}`}
                        value={t.stage}
                        disabled={busy}
                        onChange={(e) =>
                          save({ ...t, stage: e.target.value as TesterRow["stage"] })
                        }
                      >
                        {testerStages.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => open(t.user_id)}
                    >
                      View full report
                    </Button>
                  </article>
                ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="tester-table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  "Tester",
                  "Organization",
                  "Sessions",
                  "Actions",
                  "Active time",
                  "Top page",
                  "Stage",
                  "Report",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.user_id}>
                  <td>
                    <b>{t.name}</b>
                    <small>{t.email}</small>
                    <small>{t.phone}</small>
                  </td>
                  <td>{t.organization}</td>
                  <td>{t.visits}</td>
                  <td>{t.actions}</td>
                  <td>{duration(t.active_ms)}</td>
                  <td>{t.top_page || "—"}</td>
                  <td>{t.stage}</td>
                  <td>
                    <Button variant="outline" size="sm" onClick={() => open(t.user_id)}>
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {next !== null && (
        <Button variant="outline" disabled={busy} onClick={() => load(next)}>
          Load next 100 testers
        </Button>
      )}
      {busy && <p role="status">Updating tester records…</p>}
      <p className="tester-method">
        Estimated active time counts visible, focused use with recent interaction. Hidden, idle and
        long disconnected intervals are not counted. Multiple tabs share a timing lease. Offline
        actions can arrive later. These research signals are diagnostic estimates, not proof of
        attention or organizational work.
      </p>
      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setDetail(null);
            setDraft(null);
          }
        }}
      >
        <DialogContent className="tester-report">
          <DialogHeader>
            <DialogTitle>{detail?.tester.name} · MVP report</DialogTitle>
            <DialogDescription>
              Private tester research. Contact details are self-reported. No record notes or message
              contents are included.
            </DialogDescription>
          </DialogHeader>
          {detail && draft && (
            <>
              <div className="tester-report-contact">
                <span>
                  <Mail size={15} />
                  {draft.email}
                </span>
                <span>
                  <Phone size={15} />
                  {draft.phone}
                </span>
                <span>
                  <Building2 size={15} />
                  {draft.organization}
                </span>
              </div>
              <div className="tester-stat-grid">
                {[
                  ["Sessions", detail.tester.visits],
                  ["Successful actions", detail.tester.actions],
                  ["Estimated active time", duration(detail.tester.active_ms)],
                ].map(([l, v]) => (
                  <div key={l}>
                    <span>{l}</span>
                    <strong>{v}</strong>
                  </div>
                ))}
              </div>
              <p className="tester-method">
                Registered: {date(draft.created_at)} · Research consent: {date(draft.consent_at)}
              </p>
              <h3>Pages explored</h3>
              <div className="tester-page-chart">
                {detail.pages.length ? (
                  detail.pages.map((page) => (
                    <div key={page.page}>
                      <span>{page.page}</span>
                      <div>
                        <i
                          style={{
                            width: `${Math.max(
                              2,
                              (100 * page.active_ms) /
                                Math.max(1, ...detail.pages.map((p) => p.active_ms)),
                            )}%`,
                          }}
                        />
                      </div>
                      <b>{duration(page.active_ms)}</b>
                      <small>{page.views} page entries</small>
                    </div>
                  ))
                ) : (
                  <p>No page activity received yet.</p>
                )}
              </div>
              <div className="tester-report-columns">
                <section>
                  <h3>What they tested</h3>
                  {Object.entries(
                    detail.events
                      .filter((x) => x.kind === "action")
                      .reduce<Record<string, number>>((a, e) => {
                        a[e.value] = (a[e.value] || 0) + 1;
                        return a;
                      }, {}),
                  ).map(([action, count]) => (
                    <p key={action}>
                      <b>{actionLabels[action] || "Other workflow"}</b>
                      <span>{count}</span>
                    </p>
                  ))}
                  {!detail.events.some((x) => x.kind === "action") && (
                    <p>No successful actions recorded.</p>
                  )}
                  <small>
                    Breakdown from the latest {detail.limits.events} events; totals above cover all
                    received events.
                  </small>
                </section>
                <section>
                  <h3>Sign-in sessions</h3>
                  <div className="tester-session-list">
                    {detail.visits.map((v) => (
                      <p key={v.id}>
                        <b>{date(v.started_at)}</b>
                        <small>Last activity {date(v.last_at)}</small>
                      </p>
                    ))}
                  </div>
                  <small>
                    Latest {detail.limits.visits} sessions shown. Reloading does not create a new
                    sign-in session.
                  </small>
                </section>
              </div>
              <div className="tester-edit-grid">
                <label>
                  Research stage
                  <select
                    value={draft.stage}
                    onChange={(e) =>
                      setDraft({ ...draft, stage: e.target.value as TesterRow["stage"] })
                    }
                  >
                    {testerStages.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  MVP access
                  <select
                    value={draft.status}
                    onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                  >
                    <option value="active">Active</option>
                    <option value="revoked">Revoked</option>
                  </select>
                </label>
                <label className="tester-checkbox">
                  <input
                    type="checkbox"
                    checked={!!draft.excluded}
                    onChange={(e) => setDraft({ ...draft, excluded: e.target.checked ? 1 : 0 })}
                  />
                  Exclude QA/internal record from totals
                </label>
                <label className="tester-notes" htmlFor="tester-follow-up">
                  Follow-up notes
                  <Textarea
                    id="tester-follow-up"
                    value={draft.notes}
                    maxLength={5000}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  />
                </label>
              </div>
              {error && (
                <p className="error-box" role="alert">
                  {error}
                </p>
              )}
              <div className="tester-report-actions">
                <Button
                  variant="outline"
                  onClick={() =>
                    download(
                      {
                        ...detail,
                        exportedAt: new Date().toISOString(),
                        method:
                          "Self-reported identity; estimated visible, focused activity; bounded latest event/session detail. Totals cover all received usage.",
                      },
                      `company-tester-${draft.user_id}.json`,
                    )
                  }
                >
                  <Download size={15} /> Export report
                </Button>
                <Button disabled={busy} onClick={() => save(draft, true)}>
                  Save tester record
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
