import {
  type Task,
  type TaskStep,
  taskInput,
  taskNoteInput,
  taskStepInput,
  taskStepUpdate,
  taskUpdate,
} from "@/lib/contracts";
import { db, HttpError, id, now, one, rows } from "./storage";

const projection = `SELECT id,title,description,status,priority,version,created_by,created_at,updated_at,
 (SELECT COUNT(*) FROM task_steps s WHERE s.task_id=tasks.id) AS step_count,
 (SELECT COUNT(*) FROM task_steps s WHERE s.task_id=tasks.id AND s.completed=1) AS completed_count,
 (SELECT COUNT(*) FROM task_notes n WHERE n.task_id=tasks.id) AS note_count FROM tasks`;
async function detail(taskId: string) {
  const task = await one<Task>(`${projection} WHERE id=?`, taskId);
  if (!task) throw new HttpError(404, "Ticket not found.");
  const [steps, notes] = await Promise.all([
    rows(
      "SELECT id,label,completed FROM task_steps WHERE task_id=? ORDER BY created_at,id",
      taskId,
    ),
    rows(
      `SELECT n.id,n.body,n.created_at,COALESCE(m.name,'Administrator') AS author
      FROM task_notes n LEFT JOIN members m ON n.author_id=m.id WHERE n.task_id=? ORDER BY n.created_at,n.id`,
      taskId,
    ),
  ]);
  return { task, steps, notes };
}
function audit(actor: string, action: string, taskId: string, timestamp: string, mutation: string) {
  return db()
    .prepare(`INSERT INTO audit(id,actor_id,action,entity_id,created_at)
    SELECT ?,?,?,?,? FROM tasks WHERE id=? AND mutation_id=?`)
    .bind(id(), actor, action, taskId, timestamp, taskId, mutation);
}

// Called only from the authenticated route. Defense in depth keeps authorization
// ahead of every query, including unknown IDs and invalid mutation bodies.
export async function taskRequest(
  user: { id: string; role: string },
  method: string,
  parts: string[],
  readBody: () => Promise<unknown>,
) {
  if (user.role !== "admin") throw new HttpError(403, "Administrator access required.");
  const taskId = parts[1];
  if (method === "GET" && parts.length === 1) {
    // Keep step state, counts and optimistic versions in one read transaction.
    const [tickets, checklist] = await db().batch([
      db().prepare(
        `${projection} ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,created_at DESC,id`,
      ),
      db().prepare(
        "SELECT task_id,id,label,completed FROM task_steps ORDER BY task_id,created_at,id",
      ),
    ]);
    const byTask = new Map<string, TaskStep[]>();
    for (const step of checklist.results as (TaskStep & { task_id: string })[]) {
      const items = byTask.get(step.task_id) || [];
      items.push({ id: step.id, label: step.label, completed: step.completed });
      byTask.set(step.task_id, items);
    }
    return {
      tasks: (tickets.results as Task[]).map((task) => ({
        ...task,
        steps: byTask.get(task.id) || [],
      })),
    };
  }
  if (method === "GET" && parts.length === 2) return detail(taskId);
  const timestamp = now();
  const mutation = id();
  if (method === "POST" && parts.length === 1) {
    const b = taskInput.parse(await readBody());
    const newId = id();
    await db().batch([
      db()
        .prepare(`INSERT INTO tasks(id,title,description,status,priority,created_by,created_at,updated_at,mutation_id)
        VALUES(?,?,?,?,?,?,?,?,?)`)
        .bind(
          newId,
          b.title,
          b.description,
          b.status,
          b.priority,
          user.id,
          timestamp,
          timestamp,
          mutation,
        ),
      audit(user.id, "task.created", newId, timestamp, mutation),
    ]);
    return detail(newId);
  }
  let version: number;
  let action: string;
  let update: D1PreparedStatement;
  const children: D1PreparedStatement[] = [];
  if (method === "PATCH" && parts.length === 2) {
    const { version: v, ...changes } = taskUpdate.parse(await readBody());
    version = v;
    action = changes.status ? "task.moved" : "task.updated";
    const fields = Object.keys(changes); // strict Zod schema: column names are allowlisted.
    update = db()
      .prepare(
        `UPDATE tasks SET ${fields.map((k) => `${k}=?`).join(",")},version=version+1,updated_at=?,mutation_id=? WHERE id=? AND version=?`,
      )
      .bind(...Object.values(changes), timestamp, mutation, taskId, version);
  } else if (method === "POST" && parts.length === 3 && parts[2] === "notes") {
    const b = taskNoteInput.parse(await readBody());
    version = b.version;
    action = "task.note_added";
    children.push(
      db()
        .prepare(`INSERT INTO task_notes(id,task_id,body,author_id,created_at)
      SELECT ?,id,?,?,? FROM tasks WHERE id=? AND mutation_id=?`)
        .bind(id(), b.body, user.id, timestamp, taskId, mutation),
    );
    update = touch(taskId, version, timestamp, mutation);
  } else if (method === "POST" && parts.length === 3 && parts[2] === "steps") {
    const b = taskStepInput.parse(await readBody());
    version = b.version;
    action = "task.step_added";
    children.push(
      db()
        .prepare(`INSERT INTO task_steps(id,task_id,label,created_at)
      SELECT ?,id,?,? FROM tasks WHERE id=? AND mutation_id=?`)
        .bind(id(), b.label, timestamp, taskId, mutation),
    );
    update = touch(taskId, version, timestamp, mutation);
  } else if (method === "PATCH" && parts.length === 4 && parts[2] === "steps") {
    const b = taskStepUpdate.parse(await readBody());
    if (!(await one("SELECT id FROM task_steps WHERE id=? AND task_id=?", parts[3], taskId)))
      throw new HttpError(404, "Checklist step not found.");
    version = b.version;
    action = b.remove
      ? "task.step_removed"
      : b.completed
        ? "task.step_completed"
        : "task.step_reopened";
    const guard =
      "WHERE id=? AND task_id=? AND EXISTS(SELECT 1 FROM tasks WHERE id=? AND mutation_id=?)";
    children.push(
      b.remove
        ? db().prepare(`DELETE FROM task_steps ${guard}`).bind(parts[3], taskId, taskId, mutation)
        : db()
            .prepare(`UPDATE task_steps SET completed=? ${guard}`)
            .bind(Number(b.completed), parts[3], taskId, taskId, mutation),
    );
    update = touch(taskId, version, timestamp, mutation);
  } else throw new HttpError(404, "Task endpoint not found.");
  // D1 batch is atomic. The per-mutation token guards both children and audit
  // against stale versions, including two admins editing at the same time.
  const result = await db().batch([
    update,
    ...children,
    audit(user.id, action, taskId, timestamp, mutation),
  ]);
  if (!result[0].meta.changes) {
    if (!(await one("SELECT id FROM tasks WHERE id=?", taskId)))
      throw new HttpError(404, "Ticket not found.");
    throw new HttpError(409, "This ticket changed. Reload it before saving your changes.");
  }
  return detail(taskId);
}
function touch(taskId: string, version: number, timestamp: string, mutation: string) {
  return db()
    .prepare(
      "UPDATE tasks SET version=version+1,updated_at=?,mutation_id=? WHERE id=? AND version=?",
    )
    .bind(timestamp, mutation, taskId, version);
}
