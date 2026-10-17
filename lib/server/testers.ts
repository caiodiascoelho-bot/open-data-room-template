import { z } from "zod";
import {
  heartbeat,
  type TesterRow,
  type TesterSummary,
  testerEdit,
  testerLogin,
  testerRegistration,
  usageEvent,
} from "../tester-contracts";
import { auth, checkOrigin, requireUser } from "./auth";
import {
  authRate,
  db,
  digest,
  HttpError,
  id,
  logAudit,
  now,
  one,
  rateGuard,
  readLimited,
  rows,
  run,
} from "./storage";

const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
const json = (x: unknown, status = 200) => Response.json(x, { status, headers });
const body = async (req: Request) =>
  JSON.parse(new TextDecoder().decode(await readLimited(req, 16384)));
export async function testerSummary(): Promise<TesterSummary> {
  const r = await one<{
    registered: number;
    activated: number;
    returning: number;
    lastSync: string | null;
  }>(
    `SELECT COUNT(*) AS registered,COALESCE(SUM((SELECT COUNT(*) FROM product_tester_visits v WHERE v.user_id=t.user_id)>0),0) AS activated,COALESCE(SUM((SELECT COUNT(*) FROM product_tester_visits v WHERE v.user_id=t.user_id)>1),0) AS "returning",(SELECT MAX(last_at) FROM product_tester_visits v JOIN product_testers p ON p.user_id=v.user_id WHERE p.excluded=0) AS lastSync FROM product_testers t WHERE t.excluded=0`,
  );
  if (!r) throw new HttpError(503, "Tester metrics unavailable.");
  return r;
}
const selection = `SELECT t.*,u.email,(SELECT COUNT(*) FROM product_tester_visits v WHERE v.user_id=t.user_id) AS visits,(SELECT COUNT(*) FROM product_tester_events e WHERE e.user_id=t.user_id AND kind='action') AS actions,COALESCE((SELECT SUM(active_ms) FROM product_tester_pages p WHERE p.user_id=t.user_id),0) AS active_ms,(SELECT MAX(last_at) FROM product_tester_visits v WHERE v.user_id=t.user_id) AS last_at,(SELECT page FROM product_tester_pages p WHERE p.user_id=t.user_id ORDER BY active_ms DESC,views DESC LIMIT 1) AS top_page FROM product_testers t JOIN user u ON u.id=t.user_id`;
export async function testerRoute(req: Request) {
  try {
    const operation = new URL(req.url).pathname.split("/").pop();
    if (req.method !== "GET") checkOrigin(req);
    if (operation === "register" && req.method === "POST") {
      await authRate(req);
      await rateGuard("tester-registration-global", 100, 3600);
      const b = testerRegistration.parse(await body(req));
      await rateGuard(`tester-register:${b.email}`, 5, 3600);
      const existing = await one<{ id: string }>(
        "SELECT id FROM user WHERE lower(email)=?",
        b.email,
      );
      if (existing)
        return json(
          {
            error:
              "Unable to create this account. If you already have a company account, sign in instead.",
          },
          409,
        );
      let createdId: string | undefined;
      try {
        const result = await auth().api.createUser({
          body: { name: b.name, email: b.email, password: b.password, role: "user" },
        });
        createdId = result.user.id;
        const excluded = /(^|@)(example\.(com|org|net)|.*\.invalid)$/i.test(b.email) ? 1 : 0;
        await run(
          "INSERT INTO product_testers(user_id,name,phone,organization,excluded,consent_at,created_at) VALUES(?,?,?,?,?,?,?)",
          createdId,
          b.name,
          b.phone,
          b.organization,
          excluded,
          now(),
          now(),
        );
      } catch {
        if (createdId)
          await run(
            "DELETE FROM user WHERE id=? AND NOT EXISTS(SELECT 1 FROM product_testers WHERE user_id=?) AND NOT EXISTS(SELECT 1 FROM members WHERE id=?)",
            createdId,
            createdId,
            createdId,
          );
        throw new HttpError(
          409,
          "Unable to create this account. If you already have a company account, sign in instead.",
        );
      }
      await logAudit(createdId, "product_tester.registered", createdId);
      return json({ ok: true });
    }
    if (operation === "login" && req.method === "POST") {
      await authRate(req);
      const b = testerLogin.parse(await body(req));
      await rateGuard(`tester-login:${b.email.toLowerCase()}`, 12, 900);
      // Ordinary password authentication; the tester page never grants Data Room membership.
      return await auth().api.signInEmail({ body: b, headers: req.headers, asResponse: true });
    }
    if (operation === "session" && req.method === "GET") {
      const session = await auth().api.getSession({ headers: req.headers });
      if (!session) return json({ eligible: false });
      const tester = await one(
        "SELECT user_id FROM product_testers WHERE user_id=? AND status='active'",
        session.user.id,
      );
      const founder = await one(
        "SELECT id FROM members WHERE id=? AND status='active' AND lower(email) IN ('owner@example.com','teammate@example.com')",
        session.user.id,
      );
      return json({ eligible: !!tester || !!founder });
    }
    const admin = await requireUser(req, true);
    if (operation === "list" && req.method === "GET") {
      const q = new URL(req.url).searchParams,
        offset = z.coerce
          .number()
          .int()
          .min(0)
          .max(100000)
          .parse(q.get("offset") || 0),
        search = (q.get("search") || "").slice(0, 120),
        include = q.get("excluded") === "1";
      const where = ` WHERE ${include ? "1=1" : "t.excluded=0"} AND (t.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR t.organization LIKE ? ESCAPE '\\')`;
      const query = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
      const items = await rows<TesterRow>(
        `${selection + where} ORDER BY t.created_at DESC,t.user_id LIMIT 101 OFFSET ?`,
        query,
        query,
        query,
        offset,
      );
      return json({
        items: items.slice(0, 100),
        next: items.length > 100 ? offset + 100 : null,
        summary: await testerSummary(),
      });
    }
    if (operation === "detail" && req.method === "GET") {
      const userId = z.string().min(1).max(100).parse(new URL(req.url).searchParams.get("id"));
      const tester = await one<TesterRow>(`${selection} WHERE t.user_id=?`, userId);
      if (!tester) throw new HttpError(404, "Tester not found.");
      const [pages, visits, events] = await Promise.all([
        rows(
          "SELECT page,active_ms,views,last_at FROM product_tester_pages WHERE user_id=? ORDER BY active_ms DESC,views DESC",
          userId,
        ),
        rows(
          "SELECT id,started_at,last_at FROM product_tester_visits WHERE user_id=? ORDER BY started_at DESC LIMIT 100",
          userId,
        ),
        rows(
          "SELECT id,kind,value,occurred_at,received_at FROM product_tester_events WHERE user_id=? ORDER BY occurred_at DESC,id DESC LIMIT 500",
          userId,
        ),
      ]);
      return json({ tester, pages, visits, events, limits: { visits: 100, events: 500 } });
    }
    if (operation === "update" && req.method === "POST") {
      const b = testerEdit.parse(await body(req));
      const r = await db()
        .prepare(
          "UPDATE product_testers SET stage=?,notes=?,excluded=?,status=?,version=version+1 WHERE user_id=? AND version=? RETURNING user_id",
        )
        .bind(b.stage, b.notes, b.excluded ? 1 : 0, b.status, b.id, b.version)
        .first();
      if (!r) throw new HttpError(409, "This tester changed. Refresh before saving.");
      await logAudit(admin.id, "product_tester.updated", b.id);
      return json({ ok: true });
    }
    throw new HttpError(404, "Endpoint not found.");
  } catch (e) {
    return json(
      {
        error:
          e instanceof HttpError
            ? e.message
            : e instanceof z.ZodError
              ? "Check all required fields and use a password of 12–128 characters."
              : "The tester service is temporarily unavailable.",
      },
      e instanceof HttpError
        ? e.status
        : e instanceof z.ZodError || e instanceof SyntaxError
          ? 400
          : 503,
    );
  }
}
export async function ingestTesterEvents(userId: string, input: unknown) {
  const events = z.array(usageEvent).min(1).max(25).parse(input);
  await rateGuard(`tester-events:${userId}`, 160, 60);
  const accepted: string[] = [];
  for (const e of events) {
    if (Date.parse(e.occurredAt) > Date.now() + 60000)
      throw new HttpError(400, "Event timestamp is out of range.");
    const fingerprint = await digest(JSON.stringify(e)),
      existing = await one<{ fingerprint: string; user_id: string }>(
        "SELECT fingerprint,user_id FROM product_tester_events WHERE id=?",
        e.id,
      );
    if (existing) {
      if (existing.user_id !== userId || existing.fingerprint !== fingerprint)
        throw new HttpError(409, "Event identifier already used.");
      accepted.push(e.id);
      continue;
    }
    const batch = [];
    if (e.kind === "start")
      batch.push(
        db()
          .prepare(
            "INSERT INTO product_tester_visits(id,user_id,started_at,last_at) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM product_tester_events WHERE id=?) ON CONFLICT(id) DO NOTHING",
          )
          .bind(e.visitId, userId, e.occurredAt, e.occurredAt, e.id),
      );
    batch.push(
      db()
        .prepare(
          "INSERT INTO product_tester_events(id,user_id,visit_id,kind,value,occurred_at,received_at,fingerprint) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM product_tester_visits WHERE id=? AND user_id=?) ON CONFLICT(id) DO NOTHING",
        )
        .bind(
          e.id,
          userId,
          e.visitId,
          e.kind,
          e.value,
          e.occurredAt,
          now(),
          fingerprint,
          e.visitId,
          userId,
        ),
    );
    batch.push(
      db()
        .prepare(
          "UPDATE product_tester_visits SET last_at=MAX(last_at,?) WHERE id=? AND user_id=? AND EXISTS(SELECT 1 FROM product_tester_events WHERE id=? AND user_id=? AND fingerprint=?)",
        )
        .bind(e.occurredAt, e.visitId, userId, e.id, userId, fingerprint),
    );
    await db().batch(batch);
    const saved = await one<{ fingerprint: string; user_id: string }>(
      "SELECT fingerprint,user_id FROM product_tester_events WHERE id=?",
      e.id,
    );
    if (!saved) throw new HttpError(403, "This visit does not belong to the tester.");
    if (saved.user_id !== userId || saved.fingerprint !== fingerprint)
      throw new HttpError(409, "Event identifier already used.");
    accepted.push(e.id);
  }
  return { accepted };
}
export async function recordHeartbeat(userId: string, input: unknown) {
  const b = heartbeat.parse(input);
  await rateGuard(`tester-heartbeat:${userId}`, 100, 60);
  const v = await one<{
    user_id: string;
    heartbeat_at: number;
    page: string;
    tab: string;
    sequence: number;
    active: number;
    heartbeat_claim: string;
  }>("SELECT * FROM product_tester_visits WHERE id=? AND user_id=?", b.visitId, userId);
  if (!v) throw new HttpError(404, "Open the MVP workspace before tracking activity.");
  if (v.tab === b.tab && b.sequence <= v.sequence) return { ok: true, replayed: true };
  const t = await one<{ last_heartbeat: number; heartbeat_claim: string }>(
    "SELECT last_heartbeat,heartbeat_claim FROM product_testers WHERE user_id=?",
    userId,
  );
  if (!t) throw new HttpError(403, "Tester not active.");
  const stamp = Date.now();
  const gap = stamp - v.heartbeat_at;
  // A tab holds a 25-second lease; another tab cannot inflate active time.
  if (v.tab && v.tab !== b.tab && gap < 25000) return { ok: true, anotherTabActive: true };
  const ms =
    b.active && v.active && v.page === b.page && gap >= 1000 && gap <= 25000
      ? Math.max(0, Math.min(gap, stamp - (t.last_heartbeat || stamp)))
      : 0;
  const newPage = v.page !== b.page;
  const pageId = await digest(`${userId}:${b.page}`);
  const claim = id();
  const results = await db().batch([
    db()
      .prepare(
        "UPDATE product_testers SET last_heartbeat=?,heartbeat_claim=? WHERE user_id=? AND last_heartbeat=? AND heartbeat_claim=?",
      )
      .bind(stamp, claim, userId, t.last_heartbeat, t.heartbeat_claim),
    db()
      .prepare(
        "UPDATE product_tester_visits SET heartbeat_at=?,page=?,tab=?,sequence=?,active=?,last_at=?,heartbeat_claim=? WHERE id=? AND user_id=? AND heartbeat_at=? AND heartbeat_claim=? AND EXISTS(SELECT 1 FROM product_testers WHERE user_id=? AND heartbeat_claim=?)",
      )
      .bind(
        stamp,
        b.page,
        b.tab,
        b.sequence,
        b.active ? 1 : 0,
        now(),
        claim,
        b.visitId,
        userId,
        v.heartbeat_at,
        v.heartbeat_claim,
        userId,
        claim,
      ),
    db()
      .prepare(
        "INSERT INTO product_tester_pages(id,user_id,page,active_ms,views,last_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM product_tester_visits WHERE id=? AND heartbeat_claim=?) AND EXISTS(SELECT 1 FROM product_testers WHERE user_id=? AND heartbeat_claim=?) ON CONFLICT(id) DO UPDATE SET active_ms=active_ms+excluded.active_ms,views=views+excluded.views,last_at=excluded.last_at",
      )
      .bind(pageId, userId, b.page, ms, newPage ? 1 : 0, now(), b.visitId, claim, userId, claim),
  ]);
  return { ok: true, recorded: !!results[1].meta.changes };
}
