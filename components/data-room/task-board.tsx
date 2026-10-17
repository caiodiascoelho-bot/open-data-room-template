"use client";
import {
  CheckCheck,
  ClipboardList,
  GripVertical,
  LockKeyhole,
  MessageSquare,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
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
import type {
  Task,
  TaskDetail,
  TaskListItem,
  TaskPriority,
  TaskStatus,
  TaskStep,
} from "@/lib/contracts";
import {
  isTaskCategoryFilter,
  matchesTaskCategory,
  type TaskCategoryFilter,
  taskCategories,
  taskCategory,
} from "@/lib/task-categories";

const stages: { id: TaskStatus; label: string; description: string }[] = [
  { id: "todo", label: "To do", description: "Ready for the next step" },
  { id: "in_progress", label: "In progress", description: "Work happening now" },
  { id: "paused", label: "Paused", description: "Waiting or blocked" },
  { id: "resolved", label: "Resolved", description: "Done and delivered" },
];
const priorities: { id: TaskPriority; label: string; color: string }[] = [
  { id: "high", label: "High", color: "red" },
  { id: "medium", label: "Medium", color: "yellow" },
  { id: "low", label: "Low", color: "green" },
];
const timestamp = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const ticketCode = (id: string) => `BYD-${id.slice(0, 8).toUpperCase()}`;
function Priority({ value }: { value: TaskPriority }) {
  const p = priorities.find((p) => p.id === value)!;
  return <span className={`priority ${p.color}`}>{p.label} priority</span>;
}
function Progress({ completed, total }: { completed: number; total: number }) {
  return (
    <div className="task-progress">
      <span>
        <CheckCheck size={14} />
        {completed}/{total} steps
      </span>
      <progress
        value={completed}
        max={total || 1}
        aria-label={`${completed} of ${total} steps complete`}
      />
    </div>
  );
}
export default function TaskBoard({ onChange }: { onChange: () => Promise<void> }) {
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("all");
  const [category, setCategory] = useState<TaskCategoryFilter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [createStage, setCreateStage] = useState<TaskStatus | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const requestNumber = useRef(0);
  const mutationInFlight = useRef(false);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("company-task-category");
      if (saved && isTaskCategoryFilter(saved)) setCategory(saved);
    } catch {
      /* Filtering still works when browser storage is unavailable. */
    }
  }, []);
  function chooseCategory(value: string) {
    if (!isTaskCategoryFilter(value)) return;
    setCategory(value);
    try {
      sessionStorage.setItem("company-task-category", value);
    } catch {
      /* Optional preference only. */
    }
  }
  const load = useCallback(async () => {
    const n = ++requestNumber.current;
    setLoading(true);
    try {
      const r = await api<{ tasks: TaskListItem[] }>("tasks");
      if (n !== requestNumber.current) return;
      setTasks(r.tasks);
      setLoaded(true);
      setError("");
    } catch (e) {
      if (n === requestNumber.current)
        setError(e instanceof Error ? e.message : "Unable to load tickets.");
    } finally {
      if (n === requestNumber.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !mutationInFlight.current) void load();
    }, 15000);
    return () => {
      clearInterval(timer);
      requestNumber.current++;
    };
  }, [load]);
  async function changed() {
    await Promise.all([load(), onChange()]);
  }
  async function move(task: Task, status: TaskStatus) {
    if (mutationInFlight.current || task.status === status) return;
    mutationInFlight.current = true;
    requestNumber.current++;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, version: task.version }),
      });
      await changed();
      setNotice(`${task.title} moved to ${stages.find((s) => s.id === status)?.label}.`);
    } catch (e) {
      await load();
      setError(e instanceof Error ? e.message : "Unable to move ticket.");
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }
  async function toggleStep(task: TaskListItem, step: TaskStep, completed: boolean) {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    requestNumber.current++;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const detail = await api<TaskDetail>(`tasks/${task.id}/steps/${step.id}`, {
        method: "PATCH",
        body: JSON.stringify({ version: task.version, completed }),
      });
      setTasks((items) =>
        items.map((item) => (item.id === task.id ? { ...detail.task, steps: detail.steps } : item)),
      );
      await changed();
      setNotice(completed ? "Checklist step completed." : "Checklist step reopened.");
    } catch (e) {
      await load();
      setError(
        e instanceof ApiError && e.status === 409
          ? "This ticket changed. Review the latest checklist before trying again."
          : e instanceof Error
            ? e.message
            : "Unable to update checklist step.",
      );
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }
  const visible = tasks.filter(
    (t) =>
      matchesTaskCategory(t.title, category) &&
      (priority === "all" || t.priority === priority) &&
      `${t.title} ${t.description} ${ticketCode(t.id)}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="section-title">
        <div>
          <div className="eyebrow">INTERNAL OPERATIONS</div>
          <h1>Make progress visible.</h1>
          <p>One place for the work ahead. Private to administrators.</p>
        </div>
        <Button onClick={() => setCreateStage("todo")}>
          <Plus size={16} />
          New ticket
        </Button>
      </div>
      <div className="task-toolbar">
        <select
          className="select task-category-select"
          aria-label="Filter task category"
          value={category}
          onChange={(e) => chooseCategory(e.target.value)}
        >
          <option value="all">All tasks ({tasks.length})</option>
          <option value="non-security">
            Without SECURITY (
            {tasks.filter((t) => matchesTaskCategory(t.title, "non-security")).length})
          </option>
          {taskCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} ({tasks.filter((t) => taskCategory(t.title) === c.id).length})
            </option>
          ))}
        </select>
        <Input
          aria-label="Search tickets"
          placeholder="Search tickets…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="select"
          aria-label="Filter priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="all">All priorities</option>
          {priorities.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} priority
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          aria-label="Refresh tickets"
          disabled={loading || busy}
          onClick={() => void load()}
        >
          <RefreshCw size={15} />
        </Button>
        <span className="task-private">
          <LockKeyhole size={13} />
          Admins only
        </span>
      </div>
      <div className="task-filter-summary">
        <span>
          {loaded ? `${visible.length} of ${tasks.length} tickets` : "Loading tickets…"} ·
          Categories follow ticket titles.
        </span>
        {(category !== "all" || priority !== "all" || query) && (
          <button
            type="button"
            onClick={() => {
              chooseCategory("all");
              setPriority("all");
              setQuery("");
            }}
          >
            Show all tasks
          </button>
        )}
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}{" "}
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}
      <div className="task-announcement" role="status" aria-live="polite">
        {busy ? "Saving change…" : notice}
      </div>
      {!loaded ? (
        <div className="task-board" role="status" aria-label="Loading task board">
          {stages.map((s) => (
            <div key={s.id} className="skeleton-box task-skeleton" />
          ))}
        </div>
      ) : (
        <div className="task-board" aria-busy={busy}>
          {stages.map((s) => {
            const items = visible.filter((t) => t.status === s.id);
            return (
              <section
                key={s.id}
                className={`task-column ${over === s.id ? "drop-target" : ""}`}
                aria-label={s.label}
                onDragOver={(e) => {
                  if (dragging && !busy) {
                    e.preventDefault();
                    setOver(s.id);
                  }
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const task = tasks.find((t) => t.id === dragging);
                  setOver(null);
                  setDragging(null);
                  if (task) void move(task, s.id);
                }}
              >
                <header className="task-column-heading">
                  <div>
                    <h2>
                      <span className={`stage-dot ${s.id}`} />
                      {s.label}
                      <span className="task-count">{items.length}</span>
                    </h2>
                    <p>{s.description}</p>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Add ticket to ${s.label}`}
                    onClick={() => setCreateStage(s.id)}
                  >
                    <Plus size={16} />
                  </button>
                </header>
                <div className="task-cards">
                  {items.map((task) => (
                    <article
                      key={task.id}
                      data-testid="task-card"
                      className={`task-card ${dragging === task.id ? "dragging" : ""}`}
                    >
                      <div className="card-meta">
                        <Priority value={task.priority} />
                        <button
                          type="button"
                          aria-label={`Move ${task.title} using status menu`}
                          onClick={(e) =>
                            e.currentTarget.closest("article")?.querySelector("select")?.focus()
                          }
                          draggable={!busy}
                          className="task-drag-handle"
                          title="Drag to move; use the status menu for keyboard or touch"
                          onDragStart={(e) => {
                            setDragging(task.id);
                            e.dataTransfer.setData("text/plain", task.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            setDragging(null);
                            setOver(null);
                          }}
                        >
                          <GripVertical size={15} />
                        </button>
                      </div>
                      <button
                        type="button"
                        className="card-title-button"
                        onClick={() => setSelected(task.id)}
                      >
                        {task.title}
                      </button>
                      <span className="task-category-label">
                        {taskCategories.find((c) => c.id === taskCategory(task.title))?.label}
                      </span>
                      {task.description && (
                        <p className="task-card-description">{task.description}</p>
                      )}
                      {task.steps.length > 0 && (
                        <ul className="task-card-steps" aria-label={`Checklist for ${task.title}`}>
                          {task.steps.slice(0, 3).map((step) => (
                            <li key={step.id}>
                              <label className={step.completed ? "completed" : ""}>
                                <input
                                  type="checkbox"
                                  checked={!!step.completed}
                                  disabled={busy}
                                  onChange={(e) => void toggleStep(task, step, e.target.checked)}
                                />
                                <span>{step.label}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                      {task.steps.length > 3 && (
                        <button
                          type="button"
                          className="task-view-steps"
                          onClick={() => setSelected(task.id)}
                        >
                          View all {task.steps.length} steps
                        </button>
                      )}
                      {task.step_count > 0 && (
                        <Progress completed={task.completed_count} total={task.step_count} />
                      )}
                      <div className="task-card-meta">
                        <span>{ticketCode(task.id)}</span>
                        <span>
                          <MessageSquare size={13} />
                          {task.note_count}
                        </span>
                      </div>
                      <select
                        className="board-select"
                        aria-label={`Move ${task.title}`}
                        value={task.status}
                        disabled={busy}
                        onChange={(e) => void move(task, e.target.value as TaskStatus)}
                      >
                        {stages.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    </article>
                  ))}
                  {!items.length && (
                    <div className="task-empty">
                      <ClipboardList size={22} />
                      <p>
                        {query || priority !== "all" || category !== "all"
                          ? "No matching tickets"
                          : "Nothing here yet"}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <p className="task-footnote">
        Drag tickets between columns, or use their status menu. Updates sync every 15 seconds.
      </p>
      <Dialog
        open={createStage !== null}
        onOpenChange={(v) => {
          if (!v) setCreateStage(null);
        }}
      >
        <DialogContent className="task-dialog">
          <DialogHeader>
            <DialogTitle>New ticket</DialogTitle>
            <DialogDescription>A clear next step, visible only to your team.</DialogDescription>
          </DialogHeader>
          {createStage && (
            <TicketForm
              initial={{ title: "", description: "", status: createStage, priority: "medium" }}
              onSave={async (value) => {
                const r = await api<TaskDetail>("tasks", {
                  method: "POST",
                  body: JSON.stringify(value),
                });
                setCreateStage(null);
                setSelected(r.task.id);
                await changed();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <DialogContent className="task-dialog">
          <DialogHeader>
            <DialogTitle>Ticket details</DialogTitle>
            <DialogDescription>Notes, steps and progress · Admins only</DialogDescription>
          </DialogHeader>
          {selected && <TicketDetails key={selected} id={selected} onChange={changed} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

type TicketFields = Pick<Task, "title" | "description" | "status" | "priority">;
function TicketForm({
  initial,
  onSave,
  onCancel,
  onReload,
}: {
  initial: TicketFields;
  onSave: (value: TicketFields) => Promise<void>;
  onCancel?: () => void;
  onReload?: () => Promise<TicketFields>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<TicketFields | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await onSave(Object.fromEntries(form) as TicketFields);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save ticket.");
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
        setLatest(null);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="task-form">
      <label htmlFor="task-title">
        Ticket title
        <Input
          id="task-title"
          name="title"
          disabled={busy}
          required
          maxLength={160}
          defaultValue={initial.title}
          autoFocus
        />
      </label>
      <label htmlFor="task-description">
        Description
        <Textarea
          id="task-description"
          name="description"
          disabled={busy}
          maxLength={10000}
          rows={4}
          defaultValue={initial.description}
          placeholder="What needs to happen?"
        />
      </label>
      <div className="task-form-row">
        <label>
          Status
          <select
            aria-label="Status"
            disabled={busy}
            name="status"
            className="select"
            defaultValue={initial.status}
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select
            disabled={busy}
            aria-label="Priority"
            name="priority"
            className="select"
            defaultValue={initial.priority}
          >
            {priorities.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} · {p.color}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {conflict && onReload && (
        <div className="task-conflict">
          <p>
            Your draft is preserved. Review the latest saved version before applying your edits.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setLatest(await onReload());
                setError("");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Unable to reload.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Review latest version
          </Button>
          {latest && (
            <div>
              <strong>Latest saved version</strong>
              <p>{latest.title}</p>
              <p>{latest.description || "No description"}</p>
              <p>
                {stages.find((s) => s.id === latest.status)?.label} · {latest.priority} priority
              </p>
              <small>
                Saving will apply the fields above. Cancel editing to keep the saved version.
              </small>
            </div>
          )}
        </div>
      )}
      <div className="task-actions">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel editing
          </Button>
        )}
        <Button type="submit" disabled={busy || (conflict && !latest)}>
          {busy ? "Saving…" : "Save ticket"}
        </Button>
      </div>
    </form>
  );
}
function TicketDetails({ id, onChange }: { id: string; onChange: () => Promise<void> }) {
  const [data, setData] = useState<TaskDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [step, setStep] = useState("");
  const [note, setNote] = useState("");
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setData(await api<TaskDetail>(`tasks/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load ticket.");
    } finally {
      setBusy(false);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  async function mutate(suffix: string, method: string, value: object) {
    if (!data) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setData(
        await api<TaskDetail>(`tasks/${id}${suffix}`, {
          method,
          body: JSON.stringify({ ...value, version: data.task.version }),
        }),
      );
      setNotice("Saved.");
      await onChange();
    } finally {
      setBusy(false);
    }
  }
  async function action(suffix: string, method: string, value: object, done?: () => void) {
    try {
      await mutate(suffix, method, value);
      done?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save changes.");
    }
  }
  if (!data)
    return (
      <>
        {error ? (
          <div className="error-box" role="alert">
            {error}
            <Button onClick={() => void load()}>Retry</Button>
          </div>
        ) : (
          <div
            className="skeleton-box task-detail-skeleton"
            role="status"
            aria-label="Loading ticket"
          />
        )}
      </>
    );
  const { task, steps, notes } = data;
  return (
    <div className="task-detail" aria-busy={busy}>
      <div className="task-detail-top">
        <span className="eyebrow">{ticketCode(id)}</span>
        <Priority value={task.priority} />
      </div>
      {editing ? (
        <TicketForm
          initial={task}
          onReload={async () => {
            const next = await api<TaskDetail>(`tasks/${id}`);
            setData(next);
            return next.task;
          }}
          onCancel={() => {
            setEditing(false);
            void load();
          }}
          onSave={async (v) => {
            await mutate("", "PATCH", v);
            setEditing(false);
          }}
        />
      ) : (
        <>
          <h2>{task.title}</h2>
          <p className="task-description">{task.description || "No description yet."}</p>
          <div className="task-detail-controls">
            <span className="task-status">{stages.find((s) => s.id === task.status)?.label}</span>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setEditing(true)}>
              Edit ticket
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void load()}>
              <RefreshCw size={13} />
              Reload
            </Button>
          </div>
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          <div className="task-save-status" role="status">
            {busy ? "Saving…" : notice}
          </div>
          <section className="task-detail-section" aria-label="Checklist">
            <h3>
              <CheckCheck size={17} />
              Checklist
            </h3>
            <Progress completed={task.completed_count} total={task.step_count} />
            {!steps.length && (
              <p className="small muted">Break this ticket into manageable steps.</p>
            )}
            <ul className="task-steps">
              {steps.map((s) => (
                <li key={s.id}>
                  <label className={s.completed ? "completed" : ""}>
                    <input
                      type="checkbox"
                      checked={!!s.completed}
                      disabled={busy}
                      onChange={(e) =>
                        void action(`/steps/${s.id}`, "PATCH", { completed: e.target.checked })
                      }
                    />
                    <span>{s.label}</span>
                  </label>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove step ${s.label}`}
                    disabled={busy}
                    onClick={() => void action(`/steps/${s.id}`, "PATCH", { remove: true })}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="task-add-step"
              onSubmit={(e) => {
                e.preventDefault();
                void action("/steps", "POST", { label: step }, () => setStep(""));
              }}
            >
              <Input
                disabled={busy}
                aria-label="New checklist step"
                placeholder="Add a step…"
                required
                maxLength={300}
                value={step}
                onChange={(e) => setStep(e.target.value)}
              />
              <Button type="submit" variant="outline" disabled={busy || !step.trim()}>
                <Plus size={14} />
                Add step
              </Button>
            </form>
          </section>
          <section className="task-detail-section" aria-label="Notes">
            <h3>
              <MessageSquare size={17} />
              Notes <span className="task-count">{notes.length}</span>
            </h3>
            <form
              className="task-form"
              onSubmit={(e) => {
                e.preventDefault();
                void action("/notes", "POST", { body: note }, () => setNote(""));
              }}
            >
              <Textarea
                disabled={busy}
                aria-label="New note"
                placeholder="Share an update, decision or blocker…"
                rows={3}
                maxLength={5000}
                required
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="task-actions">
                <Button type="submit" disabled={busy || !note.trim()}>
                  Add note
                </Button>
              </div>
            </form>
            <div className="task-notes">
              {[...notes].reverse().map((n) => (
                <article key={n.id} className="task-note">
                  <header>
                    <strong>{n.author}</strong>
                    <time dateTime={n.created_at}>{timestamp(n.created_at)}</time>
                  </header>
                  <p>{n.body}</p>
                </article>
              ))}
              {!notes.length && (
                <p className="small muted">No notes yet. Keep the context with the work.</p>
              )}
            </div>
          </section>
        </>
      )}
      <p className="small muted">
        Created {timestamp(task.created_at)} · Updated {timestamp(task.updated_at)} · New York time
      </p>
    </div>
  );
}
