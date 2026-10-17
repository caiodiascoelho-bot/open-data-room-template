import { env } from "cloudflare:workers";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { z } from "zod";
import {
  calendarCells,
  email,
  eventInput,
  type Interview,
  interviewInput,
  metricInput,
  outreachContactInput,
  password,
  thesisInput,
} from "@/lib/contracts";
import { auth, checkOrigin, identity, requireUser } from "@/lib/server/auth";
import { investorInterview } from "@/lib/server/interview-privacy";
import { recordInvestorView } from "@/lib/server/investor-activity";
import {
  authRate,
  bucket,
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
  token,
} from "@/lib/server/storage";
import { taskRequest } from "@/lib/server/tasks";
import { testerSummary } from "@/lib/server/testers";

const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers });
}
async function body(req: Request) {
  const text = new TextDecoder().decode(await readLimited(req, 65536));
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}
async function invite(address: string, name: string, actor: string) {
  let resetToken = "";
  const a = auth((t) => {
    resetToken = t;
  });
  let member = await one<{ id: string; status: string }>(
    "SELECT id,status FROM members WHERE email=?",
    address,
  );
  if (member?.status === "active")
    throw new HttpError(409, "This administrator already has access.");
  if (!member) {
    const existing = await one<{ id: string }>("SELECT id FROM user WHERE email=?", address);
    const result = existing
      ? { user: existing }
      : await a.api.createUser({ body: { email: address, name, role: "admin" } });
    member = { id: result.user.id, status: "pending" };
    await run(
      "INSERT INTO members(id,email,name,status,created_at) VALUES (?,?,?,'pending',?)",
      member.id,
      address,
      name,
      now(),
    );
  }
  if (member.status.startsWith("activating")) {
    const started = Number(member.status.split(":")[1]);
    if (!started || Date.now() - started < 600000)
      throw new HttpError(409, "Activation is in progress. Please try later.");
    await run(
      "UPDATE members SET status='pending' WHERE id=? AND status=?",
      member.id,
      member.status,
    );
  }
  await run("UPDATE members SET status='pending' WHERE id=? AND status='revoked'", member.id);
  await run(
    "DELETE FROM verification WHERE value=? AND identifier LIKE 'reset-password:%'",
    member.id,
  );
  await a.api.requestPasswordReset({ body: { email: address, redirectTo: env.BETTER_AUTH_URL } });
  if (!resetToken) throw new HttpError(503, "Unable to prepare an invitation.");
  await logAudit(actor, "admin.invited", member.id);
  return {
    email: address,
    url: `${env.BETTER_AUTH_URL}/?invite=${encodeURIComponent(resetToken)}`,
    expiresInMinutes: 60,
  };
}

async function handle(req: Request) {
  const path = new URL(req.url).pathname.replace(/^\/api\//, "").replace(/\/$/, "");
  const parts = path.split("/");
  const method = req.method;
  if (path === "health" && method === "GET")
    return json({ status: "ok", service: "company-datalog" });
  if (path === "session" && method === "GET") return json({ user: await identity(req) });
  if (
    method !== "GET" &&
    path !== "bootstrap" &&
    path !== "integrations/metrics" &&
    path !== "integrations/activity"
  )
    checkOrigin(req);
  if (path === "bootstrap" && method === "POST") {
    const key = req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
    if (!env.BOOTSTRAP_SECRET || (await digest(key)) !== (await digest(env.BOOTSTRAP_SECRET)))
      throw new HttpError(401, "Unauthorized.");
    await rateGuard("bootstrap-operation", 1, 60);
    const invitations = [];
    const configuredAdmins = (env.BOOTSTRAP_ADMINS || "owner@example.com:Owner")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [address, ...nameParts] = entry.split(":");
        return [address.trim().toLowerCase(), nameParts.join(":").trim() || "Administrator"];
      });
    for (const [address, name] of configuredAdmins) {
      const member = await one<{ status: string }>(
        "SELECT status FROM members WHERE email=?",
        address,
      );
      if (member?.status === "active" || member?.status === "revoked") continue;
      invitations.push(await invite(address, name, "bootstrap"));
    }
    await run("INSERT OR IGNORE INTO guards(key,value,expires) VALUES ('bootstrap-complete',1,0)");
    return json({ invitations });
  }
  if (path === "login" && method === "POST") {
    await authRate(req);
    const b = z.object({ email, password: z.string().min(1).max(128) }).parse(await body(req));
    await rateGuard(`login:${b.email}`);
    const r = await auth().api.signInEmail({ body: b, headers: req.headers, asResponse: true });
    if (!r.ok) return json({ error: "Email or password is incorrect." }, 401);
    return r;
  }
  if (path === "activate" && method === "POST") {
    await authRate(req);
    const b = z
      .object({ token: z.string().min(12).max(300), email, password, confirm: password })
      .refine((x) => x.password === x.confirm, "Passwords do not match")
      .parse(await body(req));
    await rateGuard(`activate:${b.email}`, 10);
    const v = await one<{ value: string }>(
      "SELECT value FROM verification WHERE identifier=? AND expiresAt>?",
      `reset-password:${b.token}`,
      Date.now(),
    );
    const m = v
      ? await one<{ email: string; status: string }>(
          "SELECT email,status FROM members WHERE id=?",
          v.value,
        )
      : null;
    if (!m || m.email !== b.email || m.status !== "pending")
      throw new HttpError(400, "Invitation is invalid, expired or already used.");
    const claim = `activating:${Date.now()}:${id()}`;
    const claimed = await one<{ id: string }>(
      "UPDATE members SET status=? WHERE id=? AND status='pending' RETURNING id",
      claim,
      v!.value,
    );
    if (!claimed) throw new HttpError(409, "This invitation is already being activated.");
    try {
      await auth().api.resetPassword({ body: { token: b.token, newPassword: b.password } });
      const active = await one<{ id: string }>(
        "UPDATE members SET status='active' WHERE id=? AND status=? RETURNING id",
        v!.value,
        claim,
      );
      if (!active)
        throw new HttpError(409, "This invitation was revoked. Contact an administrator.");
    } catch (e) {
      await run("UPDATE members SET status='pending' WHERE id=? AND status=?", v!.value, claim);
      throw e;
    }
    await logAudit(v!.value, "admin.activated", v!.value);
    return json({ ok: true });
  }
  if (path === "logout" && method === "POST") {
    const u = await identity(req);
    if (u?.role === "viewer") {
      await run("DELETE FROM viewers WHERE id=?", u.id);
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "Set-Cookie": "company_viewer=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
        },
      });
    }
    return auth().api.signOut({ headers: req.headers, asResponse: true });
  }
  if (path === "viewer-session" && method === "POST") {
    await authRate(req);
    const b = z
      .object({
        token: z.string().length(64).optional(),
        password: z.string().min(1).max(128),
        name: z.string().trim().min(2).max(100),
        email,
      })
      .parse(await body(req));
    await rateGuard(`viewer-email:${b.email}`, 30, 900);
    const share = await one<{
      id: string;
      password_hash: string;
      expires_at: string;
      never_expires: number;
    }>(
      "SELECT id,password_hash,expires_at,never_expires FROM shares WHERE code_lookup=? AND revoked=0 AND (never_expires=1 OR expires_at>?)",
      await digest(b.password),
      now(),
    );
    if (!share || !(await verifyPassword({ password: b.password, hash: share.password_hash })))
      throw new HttpError(401, "The password is invalid, or access has expired.");
    const sessionToken = token();
    const vid = id();
    const expiry = new Date(
      share.never_expires === 1
        ? Date.now() + 8 * 3600000
        : Math.min(Date.parse(share.expires_at), Date.now() + 8 * 3600000),
    ).toISOString();
    await run(
      "INSERT INTO viewers(id,session_hash,share_id,name,email,expires_at,created_at) VALUES(?,?,?,?,?,?,?)",
      vid,
      await digest(sessionToken),
      share.id,
      b.name,
      b.email,
      expiry,
      now(),
    );
    await logAudit(vid, "viewer.entered", share.id);
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Set-Cookie": `company_viewer=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${env.BETTER_AUTH_URL?.startsWith("https:") ? "; Secure" : ""}`,
      },
    });
  }
  if (["integrations/metrics", "integrations/activity"].includes(path) && method === "POST") {
    if (!env.INTEGRATION_SECRET) throw new HttpError(503, "Metrics integration is not connected.");
    const raw = new TextDecoder().decode(await readLimited(req, 65536));
    const timestamp = req.headers.get("x-company-timestamp") || "";
    if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp) * 1000) > 300000)
      throw new HttpError(401, "Expired signature.");
    const signature = req.headers.get("x-company-signature") || "";
    if (!/^[a-f0-9]{64}$/.test(signature)) throw new HttpError(401, "Invalid signature.");
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.INTEGRATION_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signatureBytes = Uint8Array.from(signature.match(/../g)!, (x) => parseInt(x, 16));
    if (
      !(await crypto.subtle.verify(
        "HMAC",
        key,
        signatureBytes,
        new TextEncoder().encode(`${timestamp}.${raw}`),
      ))
    )
      throw new HttpError(401, "Invalid signature.");
    if (path === "integrations/activity") {
      const a = z
        .object({
          eventId: z.string().min(8).max(150),
          action: z.enum([
            "platform.user_registered",
            "platform.user_upgraded",
            "platform.user_cancelled",
          ]),
          count: z.number().int().min(1).max(1000000),
          occurredAt: z.string().datetime(),
        })
        .strict()
        .parse(JSON.parse(raw));
      if (Date.parse(a.occurredAt) > Date.now() + 300000)
        throw new HttpError(400, "Future activity is not accepted");
      if (await one("SELECT id FROM integration_events WHERE id=?", a.eventId))
        return json({ ok: true, duplicate: true });
      await db().batch([
        db()
          .prepare(
            "INSERT INTO audit(id,actor_id,action,entity_id,created_at) SELECT ?,'platform',?,?,? WHERE NOT EXISTS(SELECT 1 FROM integration_events WHERE id=?)",
          )
          .bind(id(), a.action, String(a.count), a.occurredAt, a.eventId),
        db()
          .prepare("INSERT OR IGNORE INTO integration_events(id,type,received_at) VALUES(?,?,?)")
          .bind(a.eventId, a.action, now()),
      ]);
      return json({ ok: true });
    }
    const b = metricInput.parse(JSON.parse(raw));
    if (
      Date.parse(b.asOf) > Date.now() + 300000 ||
      b.date > new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })
    )
      throw new HttpError(400, "Future metrics are not accepted.");
    if (await one("SELECT id FROM integration_events WHERE id=?", b.eventId))
      return json({ ok: true, duplicate: true });
    const received = now();
    await db().batch([
      db()
        .prepare(
          "INSERT INTO metrics(date,free,paid,revenue_cents,mrr_cents,source,timezone,as_of,received_at) SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM integration_events WHERE id=?) ON CONFLICT(date) DO UPDATE SET free=excluded.free,paid=excluded.paid,revenue_cents=excluded.revenue_cents,mrr_cents=excluded.mrr_cents,as_of=excluded.as_of,received_at=excluded.received_at WHERE excluded.as_of>=metrics.as_of",
        )
        .bind(
          b.date,
          b.free,
          b.paid,
          b.revenueCents,
          b.mrrCents,
          b.source,
          b.timezone,
          b.asOf,
          received,
          b.eventId,
        ),
      db()
        .prepare(
          "INSERT INTO audit(id,actor_id,action,entity_id,created_at) SELECT ?,'platform','metrics.updated',?,? WHERE NOT EXISTS(SELECT 1 FROM integration_events WHERE id=?) AND EXISTS(SELECT 1 FROM metrics WHERE date=? AND as_of=? AND received_at=?)",
        )
        .bind(id(), b.date, received, b.eventId, b.date, b.asOf, received),
      db()
        .prepare(
          "INSERT OR IGNORE INTO integration_events(id,type,received_at) VALUES(?,'metrics.snapshot',?)",
        )
        .bind(b.eventId, received),
    ]);
    return json({ ok: true });
  }
  const u = await requireUser(req);
  const isAdmin = u.role === "admin";
  if (parts[0] === "tasks") return json(await taskRequest(u, method, parts, () => body(req)));
  if (path === "viewer-activity" && method === "POST") {
    if (u.role !== "viewer") throw new HttpError(403, "Investor session required.");
    await rateGuard(`view:${u.id}`, 180, 60);
    const b = z
      .object({
        kind: z.enum(["page", "interview", "event", "day", "thesis"]),
        target: z.string().min(1).max(100),
      })
      .strict()
      .parse(await body(req));
    let label = b.target;
    if (b.kind === "page") {
      const pages: Record<string, string> = {
        overview: "Overview",
        calendar: "Calendar",
        traction: "Traction",
        pitch: "Pitch deck",
        discovery: "Market discovery",
        strategy: "Strategy & pivots",
        documents: "Documents",
        team: "Team",
        messages: "Messages",
      };
      if (!pages[b.target]) throw new HttpError(400, "Unknown page");
      label = pages[b.target];
    } else if (b.kind === "day") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.target)) throw new HttpError(400, "Invalid date");
      label = `Calendar · ${b.target}`;
    } else {
      const table = { interview: "interviews", event: "events", thesis: "theses" }[b.kind];
      const item = await one<{ label: string }>(
        b.kind === "interview"
          ? "SELECT 'Interview #' || n.number AS label FROM interviews i JOIN interview_numbers n ON n.interview_id=i.id WHERE i.id=? AND i.published=1"
          : `SELECT title AS label FROM ${table} WHERE id=? AND published=1`,
        b.target,
      );
      if (!item) throw new HttpError(404, "Content not found");
      label = item.label;
    }
    await recordInvestorView(
      u,
      b.kind === "page" ? "page_view" : "item_view",
      `${b.kind}:${b.target}`,
      label,
    );
    return json({ ok: true });
  }
  if (path === "investor-activity" && method === "GET") {
    if (!isAdmin) throw new HttpError(403, "Administrator access required.");
    const before = new URL(req.url).searchParams.get("before");
    const cursor = before ? z.string().max(100).parse(before).split("|") : null;
    if (cursor && (cursor.length !== 2 || !z.string().datetime().safeParse(cursor[0]).success))
      throw new HttpError(400, "Invalid cursor");
    const items = await rows<{ id: string; created_at: string }>(
      `SELECT * FROM investor_activity ${cursor ? "WHERE created_at<? OR (created_at=? AND id<?)" : ""} ORDER BY created_at DESC,id DESC LIMIT 101`,
      ...(cursor ? [cursor[0], cursor[0], cursor[1]] : []),
    );
    const page = items.slice(0, 100);
    const last = page.at(-1);
    return json({
      items: page,
      next: items.length > 100 && last ? `${last.created_at}|${last.id}` : null,
    });
  }
  if (path === "telemetry-config" && method === "GET") return json({ dsn: env.SENTRY_DSN || null });
  if (path === "room" && method === "GET") {
    const selectedMonth = new URL(req.url).searchParams.get("month") || now().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonth)) throw new HttpError(400, "Invalid month");
    const cells = calendarCells(
      Number(selectedMonth.slice(0, 4)),
      Number(selectedMonth.slice(5)) - 1,
    );
    const start = new Date(Date.parse(`${cells[0]}T00:00:00Z`) - 86400000).toISOString();
    const end = new Date(Date.parse(`${cells[41]}T00:00:00Z`) + 172800000).toISOString();
    const activities = await rows(
      `SELECT a.id,a.action,a.entity_id,a.created_at,
      CASE WHEN i.id IS NOT NULL THEN ${isAdmin ? "i.name" : "'Interview #' || n.number"}
        WHEN d.id IS NOT NULL THEN d.title || ' · v' || d.version
        WHEN t.id IS NOT NULL THEN t.title WHEN e.id IS NOT NULL THEN e.title
        ${isAdmin ? "WHEN k.id IS NOT NULL THEN k.title" : ""}
        WHEN m.id IS NOT NULL THEN m.name WHEN a.action LIKE 'platform.%' THEN a.entity_id || ' user(s)' ELSE '' END AS title
      FROM audit a
      LEFT JOIN interviews i ON a.action LIKE 'interview.%' AND a.entity_id=i.id
      LEFT JOIN interview_numbers n ON n.interview_id=i.id
      LEFT JOIN documents d ON a.action LIKE 'document.%' AND a.entity_id=d.id
      LEFT JOIN theses t ON a.action LIKE 'thesis.%' AND a.entity_id=t.id
      LEFT JOIN events e ON a.action LIKE 'event.%' AND a.entity_id=e.id
      LEFT JOIN members m ON a.action LIKE 'admin.%' AND a.entity_id=m.id
      ${isAdmin ? "LEFT JOIN tasks k ON a.action LIKE 'task.%' AND a.entity_id=k.id" : ""}
      WHERE a.created_at>=? AND a.created_at<? ${isAdmin ? "" : "AND (i.published=1 OR d.published=1 OR t.published=1 OR e.published=1 OR a.action='metrics.updated' OR a.action LIKE 'platform.%')"}
      ORDER BY a.created_at DESC`,
      start,
      end,
    );
    const [
      interviews,
      outreachContacts,
      events,
      metrics,
      documents,
      theses,
      members,
      messages,
      shares,
    ] = await Promise.all([
      rows<Interview>(
        `SELECT i.*,n.number FROM interviews i JOIN interview_numbers n ON n.interview_id=i.id ${isAdmin ? "" : "WHERE i.published=1"} ORDER BY i.date DESC,n.number DESC`,
      ),
      isAdmin
        ? rows(
            "SELECT id,name,phone,practice,specialty,relationship,status,next_step,notes,updated_at FROM outreach_contacts ORDER BY CASE status WHEN 'scheduled' THEN 0 WHEN 'contacted' THEN 1 WHEN 'referred' THEN 2 WHEN 'paused' THEN 3 ELSE 4 END, updated_at DESC",
          )
        : Promise.resolve([]),
      rows(`SELECT * FROM events ${isAdmin ? "" : "WHERE published=1"} ORDER BY date`),
      rows("SELECT * FROM metrics ORDER BY date DESC LIMIT 400"),
      rows(
        `SELECT id,title,category,version,notes,size,published,created_at FROM documents ${isAdmin ? "" : "WHERE published=1"} ORDER BY created_at DESC`,
      ),
      rows(`SELECT * FROM theses ${isAdmin ? "" : "WHERE published=1"} ORDER BY created_at DESC`),
      rows(
        isAdmin
          ? "SELECT * FROM members ORDER BY created_at"
          : "SELECT id,name,title,status FROM members WHERE status='active'",
      ),
      isAdmin
        ? rows("SELECT * FROM messages ORDER BY created_at DESC LIMIT 500")
        : rows("SELECT * FROM messages WHERE author_id=? ORDER BY created_at DESC LIMIT 100", u.id),
      isAdmin
        ? rows(
            "SELECT id,label,CASE WHEN never_expires=1 THEN NULL ELSE expires_at END AS expires_at,revoked,created_at FROM shares ORDER BY created_at DESC",
          )
        : Promise.resolve([]),
    ]);
    return json({
      activities,
      interviews: isAdmin ? interviews : interviews.map(investorInterview),
      ...(isAdmin ? { outreachContacts } : {}),
      events,
      metrics,
      documents,
      theses,
      members,
      messages,
      shares,
      ...(isAdmin ? { testerSummary: await testerSummary().catch(() => null) } : {}),
      updatedAt: now(),
    });
  }
  if (path === "feedback" && method === "POST") {
    const b = z
      .object({ page: z.string().min(1).max(80), body: z.string().trim().min(3).max(5000) })
      .parse(await body(req));
    await rateGuard(`feedback:${u.id}`, 30, 3600);
    const messageId = id();
    await run(
      "INSERT INTO messages(id,author_id,name,email,page,body,created_at) VALUES(?,?,?,?,?,?,?)",
      messageId,
      u.id,
      u.name,
      u.email,
      b.page,
      b.body,
      now(),
    );
    await logAudit(u.id, "feedback.created", messageId);
    return json({ ok: true });
  }
  if (parts[0] === "documents" && parts[2] === "file" && method === "GET") {
    const d = await one<{ object_key: string; size: number; title: string; version: number }>(
      `SELECT object_key,size,title,version FROM documents WHERE id=? ${isAdmin ? "" : "AND published=1"}`,
      parts[1],
    );
    if (!d) throw new HttpError(404, "Document not found.");
    const range = req.headers.get("range");
    let start = 0,
      end = d.size - 1;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!m || (!m[1] && !m[2]))
        return new Response(null, {
          status: 416,
          headers: { ...headers, "Content-Range": `bytes */${d.size}` },
        });
      if (!m[1]) start = Math.max(0, d.size - Number(m[2]));
      else {
        start = Number(m[1]);
        end = m[2] ? Math.min(Number(m[2]), end) : end;
      }
      if (start > end || start >= d.size)
        return new Response(null, {
          status: 416,
          headers: { ...headers, "Content-Range": `bytes */${d.size}` },
        });
    }
    const object = await bucket().get(
      d.object_key,
      range ? { range: { offset: start, length: end - start + 1 } } : undefined,
    );
    if (!object) throw new HttpError(404, "Document file unavailable.");
    await recordInvestorView(u, "document_open", parts[1], `${d.title} · v${d.version}`);
    return new Response(object.body, {
      status: range ? 206 : 200,
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=company-document.pdf",
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${d.size}` } : {}),
      },
    });
  }
  if (!isAdmin) throw new HttpError(403, "This action is available to administrators only.");
  if (path === "admins" && method === "POST") {
    const b = z.object({ email, name: z.string().trim().min(1).max(100) }).parse(await body(req));
    await rateGuard(`invite:${u.id}`, 20, 3600);
    return json(await invite(b.email, b.name, u.id));
  }
  if (parts[0] === "members" && parts[2] === "revoke" && method === "POST") {
    if (parts[1] === u.id) throw new HttpError(400, "You cannot revoke your own access.");
    const revoked = await one<{ id: string }>(
      "UPDATE members SET status='revoked' WHERE id=? AND id!=? AND EXISTS(SELECT 1 FROM members WHERE id=? AND status='active') AND (status!='active' OR (SELECT COUNT(*) FROM members WHERE status='active')>1) RETURNING id",
      parts[1],
      u.id,
      u.id,
    );
    if (!revoked) throw new HttpError(409, "Keep at least one active administrator.");
    await run("DELETE FROM session WHERE userId=?", parts[1]);
    await logAudit(u.id, "admin.revoked", parts[1]);
    return json({ ok: true });
  }
  if (path === "shares" && method === "POST") {
    const b = z
      .object({
        label: z.string().trim().min(1).max(100),
        days: z.union([z.number().int().min(1).max(30), z.literal("always")]),
      })
      .parse(await body(req));
    const password = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18))))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .slice(0, 18);
    const sid = id();
    await run(
      "INSERT INTO shares(id,token_hash,password_hash,code_lookup,label,expires_at,never_expires,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?)",
      sid,
      await digest(token()),
      await hashPassword(password),
      await digest(password),
      b.label,
      // Keep the legacy NOT NULL timestamp; it is ignored for Always credentials.
      new Date(Date.now() + (b.days === "always" ? 0 : b.days) * 86400000).toISOString(),
      b.days === "always" ? 1 : 0,
      now(),
      u.id,
    );
    await logAudit(u.id, "share.created", sid);
    return json({ url: `${env.BETTER_AUTH_URL}/?investor=1`, password });
  }
  if (parts[0] === "shares" && parts[2] === "revoke" && method === "POST") {
    await run("UPDATE shares SET revoked=1 WHERE id=?", parts[1]);
    await logAudit(u.id, "share.revoked", parts[1]);
    return json({ ok: true });
  }
  if (path === "interviews" && method === "POST") {
    const b = interviewInput.parse(await body(req));
    const iid = id();
    await db().batch([
      db()
        .prepare(
          "INSERT INTO interviews(id,name,email,company,date,segment,insights,problem,next_step,stage,priority,published,public_summary,updated_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          iid,
          b.name,
          b.email,
          b.company,
          b.date,
          b.segment,
          b.insights,
          b.problem,
          b.next_step,
          b.stage,
          b.priority,
          Number(b.published),
          b.public_summary,
          now(),
          u.id,
        ),
      db().prepare("INSERT INTO interview_numbers(interview_id) VALUES(?)").bind(iid),
    ]);
    await logAudit(u.id, "interview.created", iid);
    return json({ id: iid });
  }
  if (path === "outreach-contacts" && method === "POST") {
    const b = outreachContactInput.parse(await body(req));
    const contactId = id();
    await run(
      "INSERT INTO outreach_contacts(id,name,phone,practice,specialty,relationship,status,next_step,notes,updated_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      contactId,
      b.name,
      b.phone,
      b.practice,
      b.specialty,
      b.relationship,
      b.status,
      b.next_step,
      b.notes,
      now(),
      u.id,
    );
    await logAudit(u.id, "outreach.created", contactId);
    return json({ id: contactId });
  }
  if (parts[0] === "outreach-contacts" && parts.length === 2 && method === "PATCH") {
    const b = outreachContactInput.parse(await body(req));
    const changed = await one<{ id: string }>(
      "UPDATE outreach_contacts SET name=?,phone=?,practice=?,specialty=?,relationship=?,status=?,next_step=?,notes=?,updated_at=? WHERE id=? RETURNING id",
      b.name,
      b.phone,
      b.practice,
      b.specialty,
      b.relationship,
      b.status,
      b.next_step,
      b.notes,
      now(),
      parts[1],
    );
    if (!changed) throw new HttpError(404, "Outreach contact not found");
    await logAudit(u.id, "outreach.updated", parts[1]);
    return json({ ok: true });
  }
  if (
    parts[0] === "interviews" &&
    parts.length === 3 &&
    parts[2] === "stage" &&
    method === "PATCH"
  ) {
    const b = z
      .object({ stage: z.enum(["inbox", "signal", "action"]) })
      .strict()
      .parse(await body(req));
    const changed = await one<{ id: string }>(
      "UPDATE interviews SET stage=?,updated_at=? WHERE id=? RETURNING id",
      b.stage,
      now(),
      parts[1],
    );
    if (!changed) throw new HttpError(404, "Interview not found");
    await logAudit(u.id, "interview.moved", parts[1]);
    return json({ ok: true });
  }
  if (parts[0] === "interviews" && parts.length === 2 && method === "PATCH") {
    const b = interviewInput.parse(await body(req));
    await run(
      "UPDATE interviews SET name=?,email=?,company=?,date=?,segment=?,insights=?,problem=?,next_step=?,stage=?,priority=?,published=?,public_summary=?,updated_at=? WHERE id=?",
      b.name,
      b.email,
      b.company,
      b.date,
      b.segment,
      b.insights,
      b.problem,
      b.next_step,
      b.stage,
      b.priority,
      Number(b.published),
      b.public_summary,
      now(),
      parts[1],
    );
    await logAudit(u.id, "interview.updated", parts[1]);
    return json({ ok: true });
  }
  if (path === "summary" && method === "POST") {
    const list = await rows<{
      id: string;
      name: string;
      date: string;
      insights: string;
      problem: string;
      priority: string;
      next_step: string;
    }>(
      "SELECT id,name,date,insights,problem,priority,next_step FROM interviews ORDER BY date DESC",
    );
    const base = {
      generatedAt: now(),
      method: "Automated evidence synthesis",
      count: list.length,
      highPriority: list.filter((x) => x.priority === "red").length,
      items: list.map((x) => ({
        id: x.id,
        name: x.name,
        date: x.date,
        insight: x.insights.length > 480 ? `${x.insights.slice(0, 477)}…` : x.insights,
        problem: x.problem,
        nextStep: x.next_step,
        priority: x.priority,
      })),
    };
    if (!env.OPENAI_API_KEY || list.length === 0) {
      const withNextSteps = list.filter((x) => x.next_step.trim());
      return json({
        ...base,
        method: "Evidence-based automated synthesis · AI provider not configured",
        executiveSummary:
          list.length === 0
            ? "No interviews have been logged yet."
            : `${list.length} interviews are available for review. ${withNextSteps.length} include an explicit next step and ${base.highPriority} are marked high priority.`,
        readyNow: list.slice(0, 3).map((x) => x.insights.slice(0, 180)),
        improvements: [
          "Confirm recurring themes across multiple independent interviewees.",
          "Separate observed behavior from product requests and assumptions.",
        ],
        nextSteps: withNextSteps.slice(0, 5).map((x) => x.next_step),
      });
    }
    const synthesis = z
      .object({
        executiveSummary: z.string().max(3000),
        readyNow: z.array(z.string().max(500)).max(6),
        improvements: z.array(z.string().max(500)).max(6),
        nextSteps: z.array(z.string().max(500)).max(8),
      })
      .parse(
        JSON.parse(
          String(
            (
              (await (
                await fetch("https://api.openai.com/v1/chat/completions", {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${env.OPENAI_API_KEY}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    model: "gpt-4.1-mini",
                    temperature: 0.2,
                    response_format: { type: "json_object" },
                    messages: [
                      {
                        role: "system",
                        content:
                          "You are a rigorous product product discovery analyst. Use only the supplied interviews. Distinguish evidence, readiness, gaps, and prioritized next steps. Return JSON with executiveSummary, readyNow, improvements, and nextSteps. Do not invent quotes, users, traction, or facts.",
                      },
                      { role: "user", content: JSON.stringify(list) },
                    ],
                  }),
                })
              ).json()) as { choices?: { message?: { content?: string } }[] }
            ).choices?.[0]?.message?.content || "{}",
          ),
        ),
      );
    return json({
      ...base,
      ...synthesis,
      method: "AI-assisted synthesis grounded in interview records",
    });
  }
  if (path === "events" && method === "POST") {
    const b = eventInput.parse(await body(req));
    const eid = id();
    await run(
      "INSERT INTO events(id,title,date,description,kind,published,updated_at) VALUES(?,?,?,?,?,?,?)",
      eid,
      b.title,
      b.date,
      b.description,
      b.kind,
      Number(b.published),
      now(),
    );
    await logAudit(u.id, "event.created", eid);
    return json({ id: eid });
  }
  if (parts[0] === "events" && parts.length === 2 && method === "PATCH") {
    const b = eventInput.parse(await body(req));
    await run(
      "UPDATE events SET title=?,date=?,description=?,kind=?,published=?,updated_at=? WHERE id=?",
      b.title,
      b.date,
      b.description,
      b.kind,
      Number(b.published),
      now(),
      parts[1],
    );
    await logAudit(u.id, "event.updated", parts[1]);
    return json({ ok: true });
  }
  if (path === "theses" && method === "POST") {
    const b = thesisInput.parse(await body(req));
    const tid = id();
    await run(
      "INSERT INTO theses(id,kind,title,body,status,published,created_at,created_by) VALUES(?,?,?,?,?,?,?,?)",
      tid,
      b.kind,
      b.title,
      b.body,
      b.status,
      Number(b.published),
      now(),
      u.id,
    );
    await logAudit(u.id, "thesis.version_created", tid);
    return json({ id: tid });
  }
  if (path === "documents" && method === "POST") {
    if (Number(req.headers.get("content-length") || 0) > 11 * 1024 * 1024)
      throw new HttpError(413, "PDF must be 10 MB or smaller.");
    const bytes = await readLimited(req, 11 * 1024 * 1024);
    const form = await new Response(bytes as unknown as BodyInit, {
      headers: { "content-type": req.headers.get("content-type") || "" },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 10 * 1024 * 1024 || file.size < 5)
      throw new HttpError(400, "Choose a PDF file up to 10 MB.");
    const buffer = await file.arrayBuffer();
    if (new TextDecoder().decode(buffer.slice(0, 5)) !== "%PDF-")
      throw new HttpError(400, "The file must be a valid PDF.");
    const meta = z
      .object({
        title: z.string().trim().min(1).max(150),
        category: z.enum(["pitch", "financial", "legal", "product", "research"]),
        notes: z.string().max(3000),
      })
      .parse({
        title: form.get("title"),
        category: form.get("category"),
        notes: form.get("notes") || "",
      });
    const did = id();
    const key = `documents/${did}.pdf`;
    await bucket().put(key, buffer, { httpMetadata: { contentType: "application/pdf" } });
    try {
      await run(
        "INSERT INTO documents(id,title,category,version,notes,object_key,size,sha256,published,created_at,created_by) SELECT ?,?,?,COALESCE(MAX(version),0)+1,?,?,?,?,0,?,? FROM documents WHERE category=?",
        did,
        meta.title,
        meta.category,
        meta.notes,
        key,
        file.size,
        await digest(buffer),
        now(),
        u.id,
        meta.category,
      );
    } catch (e) {
      await bucket().delete(key);
      throw e;
    }
    await logAudit(u.id, "document.uploaded", did);
    return json({ id: did });
  }
  if (parts[0] === "documents" && parts[2] === "publish" && method === "POST") {
    const b = z.object({ published: z.boolean() }).parse(await body(req));
    await run("UPDATE documents SET published=? WHERE id=?", Number(b.published), parts[1]);
    await logAudit(u.id, b.published ? "document.published" : "document.unpublished", parts[1]);
    return json({ ok: true });
  }
  if (parts[0] === "messages" && parts[2] === "read" && method === "POST") {
    await run("UPDATE messages SET status='read' WHERE id=?", parts[1]);
    await logAudit(u.id, "feedback.read", parts[1]);
    return json({ ok: true });
  }
  throw new HttpError(404, "Not found.");
}
async function dispatch(req: Request) {
  const requestId = id();
  return trace.getTracer("company-datalog").startActiveSpan("api.request", async (span) => {
    try {
      const response = await handle(req);
      response.headers.set("X-Request-ID", requestId);
      return response;
    } catch (e) {
      const status = e instanceof HttpError ? e.status : e instanceof z.ZodError ? 400 : 500;
      span.setStatus({ code: SpanStatusCode.ERROR });
      console.error(
        JSON.stringify({
          event: "request_failed",
          requestId,
          status,
          method: req.method,
          route: new URL(req.url).pathname.split("/").slice(0, 3).join("/"),
          errorType: e instanceof Error ? e.name : "Unknown",
        }),
      );
      return json(
        {
          error:
            e instanceof HttpError
              ? e.message
              : e instanceof z.ZodError
                ? e.issues.map((x) => x.message).join(". ")
                : "Unable to complete the request. Please try again.",
          requestId,
        },
        status,
      );
    } finally {
      span.end();
    }
  });
}

export { dispatch as GET, dispatch as POST, dispatch as PATCH };
