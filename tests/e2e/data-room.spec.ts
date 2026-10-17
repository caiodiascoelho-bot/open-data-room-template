import { execFileSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  type APIRequestContext,
  expect,
  request as playwrightRequest,
  test,
} from "@playwright/test";

const origin = "http://127.0.0.1:5173";
const reportDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const config = Object.fromEntries(
  readFileSync(".dev.vars", "utf8")
    .trim()
    .split("\n")
    .map((x) => x.split("=")),
);
const statePath = ".sites-runtime/e2e-login.json";
let password = "";
async function initialize(ctx: APIRequestContext) {
  if (existsSync(statePath)) {
    password = JSON.parse(readFileSync(statePath, "utf8")).password;
    return;
  }
  let invitations: { email: string; url: string }[];
  if (existsSync(".sites-runtime/local-invitations.json"))
    invitations = JSON.parse(
      readFileSync(".sites-runtime/local-invitations.json", "utf8"),
    ).invitations;
  else {
    const r = await ctx.post("/api/bootstrap", {
      headers: { Authorization: `Bearer ${config.BOOTSTRAP_SECRET}` },
      data: {},
    });
    expect(r.ok()).toBeTruthy();
    invitations = (await r.json()).invitations;
  }
  password = `Local-test-${randomBytes(16).toString("hex")}`;
  for (const inv of invitations) {
    const token = new URL(inv.url).searchParams.get("invite");
    const r = await ctx.post("/api/activate", {
      headers: { Origin: origin },
      data: { email: inv.email, token, password, confirm: password },
    });
    expect(r.status(), await r.text()).toBe(200);
    const again = await ctx.post("/api/activate", {
      headers: { Origin: origin },
      data: { email: inv.email, token, password, confirm: password },
    });
    expect(again.status()).toBe(400);
  }
  writeFileSync(statePath, JSON.stringify({ password }), { mode: 0o600 });
}
async function login(ctx: APIRequestContext) {
  const r = await ctx.post("/api/login", {
    headers: { Origin: origin },
    data: { email: "owner@example.com", password },
  });
  expect(r.status(), await r.text()).toBe(200);
}
function localSql(sql: string) {
  // Test-only local D1 access: never uses remote credentials or a production database.
  execFileSync(
    process.execPath,
    [
      "--import",
      "./scripts/sites-env.mjs",
      "./node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "DB",
      "--local",
      "--config",
      "dist/server/wrangler.json",
      "--persist-to",
      ".wrangler/state",
      "--command",
      sql,
    ],
    { stdio: "pipe" },
  );
}
test.beforeAll(async () => {
  const ctx = await playwrightRequest.newContext({ baseURL: origin });
  await initialize(ctx);
  await ctx.dispose();
});
test("server permissions, private PDFs, genuine snapshot ingestion and revocation", async ({
  request,
}) => {
  expect((await request.get("/api/room")).status()).toBe(401);
  expect(
    (
      await request.post("/api/auth/sign-up/email", {
        headers: { Origin: origin },
        data: { email: "intruder@example.test", password: "not-a-valid-signup", name: "Intruder" },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/login", {
        headers: { Origin: "https://evil.example" },
        data: { email: "owner@example.com", password },
      })
    ).status(),
  ).toBe(403);
  await login(request);
  const suffix = Date.now().toString();
  const interview = {
    name: `Private customer ${suffix}`,
    email: `contact-${suffix}@example.test`,
    company: "CONFIDENTIAL",
    date: reportDate,
    segment: "Marketing",
    insights: "PRIVATE: raw budget and contact details",
    public_summary: "Teams need help selecting a repeatable workflow.",
    published: true,
    stage: "signal",
    priority: "red",
  };
  const ir = await request.post("/api/interviews", {
    headers: { Origin: origin },
    data: interview,
  });
  expect(ir.ok()).toBeTruthy();
  const interviewId = (await ir.json()).id;
  expect(
    (
      await request.post("/api/interviews", {
        headers: { Origin: origin },
        data: { ...interview, published: true, public_summary: "" },
      })
    ).status(),
  ).toBe(400);
  const upload = await request.post("/api/documents", {
    headers: { Origin: origin },
    multipart: {
      title: `Test PDF ${suffix}`,
      category: "pitch",
      notes: "Synthetic local test",
      file: {
        name: "sample.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF"),
      },
    },
  });
  expect(upload.status(), await upload.text()).toBe(200);
  const doc = (await upload.json()).id;
  const share = await request.post("/api/shares", {
    headers: { Origin: origin },
    data: { label: `Local test ${suffix}`, days: 1 },
  });
  expect(share.ok()).toBeTruthy();
  const access = await share.json();
  const viewerPassword = access.password;
  expect(viewerPassword).toMatch(/^[A-Za-z0-9_-]{18}$/);
  const viewer = await playwrightRequest.newContext({ baseURL: origin });
  expect(
    (
      await viewer.post("/api/viewer-session", {
        headers: { Origin: origin },
        data: {
          name: "Test investor",
          email: "investor@example.test",
          password: "wrong",
        },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await viewer.post("/api/viewer-session", {
        headers: { Origin: origin },
        data: {
          name: "Test investor",
          email: "investor@example.test",
          password: viewerPassword,
        },
      })
    ).ok(),
  ).toBeTruthy();
  expect((await viewer.get("/api/investor-activity")).status()).toBe(403);
  expect(
    (
      await viewer.post("/api/viewer-activity", {
        headers: { Origin: origin },
        data: { kind: "page", target: "overview" },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await viewer.post("/api/viewer-activity", {
        headers: { Origin: origin },
        data: { kind: "page", target: "investor-activity" },
      })
    ).status(),
  ).toBe(400);
  const room = await (await viewer.get("/api/room")).json();
  const safe = room.interviews.find((i: { id: string }) => i.id === interviewId);
  const adminInterview = (await (await request.get("/api/room")).json()).interviews.find(
    (i: { id: string }) => i.id === interviewId,
  );
  expect(adminInterview.name).toBe(interview.name);
  expect(adminInterview.email).toBe(interview.email);
  expect(safe.name).toBe(`Interview #${adminInterview.number}`);
  expect(safe.number).toBeGreaterThan(0);
  expect(safe).not.toHaveProperty("email");
  expect(safe).not.toHaveProperty("company");
  expect(safe.insights).toBe(interview.public_summary);
  expect(JSON.stringify(room)).not.toContain("CONFIDENTIAL");
  expect(JSON.stringify(room)).not.toContain("PRIVATE: raw");
  expect(JSON.stringify(room)).not.toContain(interview.email);
  expect(JSON.stringify(room)).not.toContain(interview.name);
  expect(
    room.activities
      .filter((a: { entity_id: string }) => a.entity_id === interviewId)
      .every((a: { title: string }) => a.title === safe.name),
  ).toBe(true);
  const revised = {
    ...interview,
    date: "2026-01-01",
    segment: `Marketing at ${interview.company}`,
    public_summary: `${interview.name} at ${interview.company} needs reminders. Contact ${interview.email}.`,
  };
  expect(
    (
      await request.patch(`/api/interviews/${interviewId}`, {
        headers: { Origin: origin },
        data: revised,
      })
    ).ok(),
  ).toBe(true);
  const revisedSafe = (await (await viewer.get("/api/room")).json()).interviews.find(
    (i: { id: string }) => i.id === interviewId,
  );
  expect(revisedSafe.name).toBe(safe.name);
  expect(revisedSafe.segment).toBe("Marketing at [private]");
  for (const privateValue of [interview.name, interview.email, interview.company])
    expect(JSON.stringify(revisedSafe)).not.toContain(privateValue);
  expect(
    (
      await request.patch(`/api/interviews/${interviewId}`, {
        headers: { Origin: origin },
        data: { ...revised, published: false },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (await (await viewer.get("/api/room")).json()).interviews.some(
      (i: { id: string }) => i.id === interviewId,
    ),
  ).toBe(false);
  expect(
    (
      await request.patch(`/api/interviews/${interviewId}`, {
        headers: { Origin: origin },
        data: interview,
      })
    ).ok(),
  ).toBe(true);
  expect(
    (await (await viewer.get("/api/room")).json()).interviews.find(
      (i: { id: string }) => i.id === interviewId,
    ).name,
  ).toBe(safe.name);
  expect(
    (await viewer.post("/api/summary", { headers: { Origin: origin }, data: {} })).status(),
  ).toBe(403);
  expect(
    (
      await viewer.post("/api/viewer-activity", {
        headers: { Origin: origin },
        data: { kind: "interview", target: interviewId },
      })
    ).ok(),
  ).toBe(true);
  expect((await viewer.get(`/api/documents/${doc}/file`)).status()).toBe(404);
  for (const path of ["events", "interviews", "shares", "admins", "theses"])
    expect(
      (await viewer.post(`/api/${path}`, { headers: { Origin: origin }, data: {} })).status(),
    ).toBe(403);
  expect(
    (
      await viewer.post("/api/feedback", {
        headers: { Origin: origin },
        data: { page: "overview", body: "Please clarify the customer evidence." },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await request.post(`/api/documents/${doc}/publish`, {
        headers: { Origin: origin },
        data: { published: true },
      })
    ).ok(),
  ).toBeTruthy();
  const pdf = await viewer.get(`/api/documents/${doc}/file`, { headers: { Range: "bytes=0-4" } });
  expect(pdf.status()).toBe(206);
  expect(await pdf.text()).toBe("%PDF-");
  expect(pdf.headers()["cache-control"]).toContain("no-store");
  expect(
    (
      await viewer.get(`/api/documents/${doc}/file`, { headers: { Range: "bytes=999999-" } })
    ).status(),
  ).toBe(416);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const metric = {
    eventId: `test-${suffix}`,
    date: reportDate,
    free: 37,
    paid: 5,
    revenueCents: 12000,
    mrrCents: 9000,
    source: "company-platform",
    timezone: "America/New_York",
    asOf: new Date().toISOString(),
  };
  const raw = JSON.stringify(metric);
  const signature = createHmac("sha256", config.INTEGRATION_SECRET)
    .update(`${timestamp}.${raw}`)
    .digest("hex");
  const h = {
    "Content-Type": "application/json",
    "x-company-timestamp": timestamp,
    "x-company-signature": signature,
  };
  expect(
    (
      await request.post("/api/integrations/metrics", {
        headers: { ...h, "x-company-signature": "0".repeat(64) },
        data: raw,
      })
    ).status(),
  ).toBe(401);
  expect(
    (await request.post("/api/integrations/metrics", { headers: h, data: raw })).ok(),
  ).toBeTruthy();
  expect(
    (await (await request.post("/api/integrations/metrics", { headers: h, data: raw })).json())
      .duplicate,
  ).toBe(true);
  const beforeStale = await (await request.get("/api/room")).json();
  const staleRaw = JSON.stringify({
    ...metric,
    eventId: `stale-${suffix}`,
    free: 1,
    asOf: new Date(Date.now() - 600000).toISOString(),
  });
  const staleSignature = createHmac("sha256", config.INTEGRATION_SECRET)
    .update(`${timestamp}.${staleRaw}`)
    .digest("hex");
  expect(
    (
      await request.post("/api/integrations/metrics", {
        headers: { ...h, "x-company-signature": staleSignature },
        data: staleRaw,
      })
    ).ok(),
  ).toBeTruthy();
  const afterStale = await (await request.get("/api/room")).json();
  expect(afterStale.metrics.find((m: { date: string }) => m.date === reportDate).free).toBe(37);
  expect(
    afterStale.activities.filter((a: { action: string }) => a.action === "metrics.updated"),
  ).toHaveLength(
    beforeStale.activities.filter((a: { action: string }) => a.action === "metrics.updated").length,
  );
  const activityRaw = JSON.stringify({
    eventId: `signup-${suffix}`,
    action: "platform.user_registered",
    count: 3,
    occurredAt: new Date().toISOString(),
  });
  const activityHeaders = {
    "Content-Type": "application/json",
    "x-company-timestamp": String(Math.floor(Date.now() / 1000)),
    "x-company-signature": "",
  };
  activityHeaders["x-company-signature"] = createHmac("sha256", config.INTEGRATION_SECRET)
    .update(`${activityHeaders["x-company-timestamp"]}.${activityRaw}`)
    .digest("hex");
  expect(
    (
      await request.post("/api/integrations/activity", {
        headers: activityHeaders,
        data: activityRaw,
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await (
        await request.post("/api/integrations/activity", {
          headers: activityHeaders,
          data: activityRaw,
        })
      ).json()
    ).duplicate,
  ).toBe(true);
  const visibleHistory = await (await viewer.get("/api/room")).json();
  expect(
    visibleHistory.activities.some(
      (a: { action: string }) => a.action === "platform.user_registered",
    ),
  ).toBe(true);
  expect(
    visibleHistory.activities.some(
      (a: { action: string }) => a.action.startsWith("share.") || a.action.startsWith("admin."),
    ),
  ).toBe(false);
  expect(JSON.stringify(visibleHistory.activities)).not.toContain(interview.name);
  const adminRoom = await (await request.get("/api/room")).json();
  expect(
    adminRoom.activities.some(
      (a: { action: string; entity_id: string }) =>
        a.action === "document.uploaded" && a.entity_id === doc,
    ),
  ).toBe(true);
  expect(
    adminRoom.activities.filter((a: { action: string }) => a.action === "platform.user_registered")
      .length,
  ).toBeGreaterThan(0);

  const sh = adminRoom.shares.find((s: { label: string }) => s.label === `Local test ${suffix}`);
  expect(
    (
      await request.post(`/api/shares/${sh.id}/revoke`, { headers: { Origin: origin }, data: {} })
    ).ok(),
  ).toBeTruthy();
  expect((await viewer.get("/api/room")).status()).toBe(401);
  expect((await viewer.get(`/api/documents/${doc}/file`)).status()).toBe(401);
  const adminLog = await (await request.get("/api/investor-activity")).json();
  expect(
    adminLog.items.some(
      (x: { action: string; email: string }) =>
        x.action === "page_view" && x.email === "investor@example.test",
    ),
  ).toBe(true);
  expect(
    adminLog.items.some(
      (x: { action: string; target: string }) => x.action === "document_open" && x.target === doc,
    ),
  ).toBe(true);
  expect(JSON.stringify(visibleHistory)).not.toContain("page_view");
  await viewer.dispose();
});
test("Always passwords preserve session expiry and immediate revocation", async ({ request }) => {
  await login(request);
  const suffix = Date.now().toString();
  for (const days of [null, 0, -1, 31, "forever"]) {
    expect(
      (
        await request.post("/api/shares", {
          headers: { Origin: origin },
          data: { label: "Invalid duration", days },
        })
      ).status(),
    ).toBe(400);
  }
  const created = await request.post("/api/shares", {
    headers: { Origin: origin },
    data: { label: `Always ${suffix}`, days: "always" },
  });
  expect(created.status()).toBe(200);
  const access = await created.json();
  expect(access.password).toMatch(/^[A-Za-z0-9_-]{18}$/);
  const finite = await request.post("/api/shares", {
    headers: { Origin: origin },
    data: { label: `Finite ${suffix}`, days: 1 },
  });
  expect(finite.status()).toBe(200);
  const finiteAccess = await finite.json();
  const room = await (await request.get("/api/room")).json();
  const share = room.shares.find((s: { label: string }) => s.label === `Always ${suffix}`);
  expect(share.expires_at).toBeNull();
  const finiteShare = room.shares.find((s: { label: string }) => s.label === `Finite ${suffix}`);
  expect(Date.parse(finiteShare.expires_at)).toBeGreaterThan(Date.now());
  const viewer = await playwrightRequest.newContext({ baseURL: origin });
  const credentials = {
    name: "Always test investor",
    email: `always-${suffix}@example.test`,
    password: access.password,
  };
  const enter = await viewer.post("/api/viewer-session", {
    headers: { Origin: origin },
    data: credentials,
  });
  expect(enter.status(), await enter.text()).toBe(200);
  expect(enter.headers()["set-cookie"]).toContain("Max-Age=28800");
  expect((await viewer.get("/api/room")).status()).toBe(200);
  expect((await viewer.get("/api/investor-activity")).status()).toBe(403);

  localSql(
    `UPDATE viewers SET expires_at='2000-01-01T00:00:00.000Z' WHERE email='always-${suffix}@example.test'; UPDATE shares SET expires_at='2000-01-01T00:00:00.000Z' WHERE label='Finite ${suffix}';`,
  );
  expect((await viewer.get("/api/room")).status()).toBe(401);
  expect(
    (
      await viewer.post("/api/viewer-session", {
        headers: { Origin: origin },
        data: { ...credentials, password: finiteAccess.password },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await viewer.post("/api/viewer-session", { headers: { Origin: origin }, data: credentials })
    ).status(),
  ).toBe(200);
  expect((await viewer.get("/api/room")).status()).toBe(200);
  expect(
    (
      await request.post(`/api/shares/${share.id}/revoke`, {
        headers: { Origin: origin },
        data: {},
      })
    ).status(),
  ).toBe(200);
  expect((await viewer.get("/api/room")).status()).toBe(401);
  expect(
    (
      await viewer.post("/api/viewer-session", { headers: { Origin: origin }, data: credentials })
    ).status(),
  ).toBe(401);
  await viewer.dispose();
});
test("dashboard, calendar badge, event editor, discovery and mobile reduced motion", async ({
  page,
  context,
}) => {
  await login(context.request);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Every step, a clearer picture." })).toBeVisible();
  await expect(page.getByText("42", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/overview.png", fullPage: true });
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Calendar", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "A timeline of what matters." })).toBeVisible();
  await page.getByRole("button", { name: `${reportDate}: 42 platform users`, exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("37");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Add event", exact: true }).click();
  await page.getByLabel("Event title").fill(`Local launch ${Date.now()}`);
  await page.getByLabel("Date", { exact: true }).fill(reportDate);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({ path: "test-results/calendar.png", fullPage: true });
  await page.getByRole("button", { name: "Market discovery", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The discovery journal." })).toBeVisible();
  await page.getByRole("button", { name: "Generate digest", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Extractive digest");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Add interview", exact: true }).click();
  const interviewName = `Local interview ${Date.now()}`;
  await page.getByLabel("Interviewee name · admins only", { exact: true }).fill(interviewName);
  await page
    .getByLabel("Interviewee email · admins only", { exact: true })
    .fill("private-ui@example.test");
  await page
    .getByLabel("Key insights · what did you actually learn?", { exact: true })
    .fill("Synthetic local evidence");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: interviewName, exact: true }).click();
  await expect(page.getByLabel("Interviewee email · admins only", { exact: true })).toHaveValue(
    "private-ui@example.test",
  );
  await expect(page.getByRole("dialog")).toContainText(/Investors see Interview #\d+/);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Access & connections", exact: true }).click();
  await page.getByRole("button", { name: "Generate investor password", exact: true }).click();
  const accessLabel = `UI Always ${Date.now()}`;
  await page.getByLabel("Access label", { exact: true }).fill(accessLabel);
  await page.getByLabel("Expires in").selectOption("always");
  await page.getByRole("button", { name: "Generate password", exact: true }).click();
  await expect(page.getByLabel("Generated investor password")).toHaveValue(/^[A-Za-z0-9_-]{18}$/);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const accessRow = page.getByRole("row").filter({ hasText: accessLabel });
  await expect(accessRow.getByRole("cell", { name: "Always", exact: true })).toBeVisible();
  await expect(accessRow.getByRole("cell", { name: "Active", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Every step, a clearer picture." })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});
test("login is clean, labeled and responsive", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "data room", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Team log in", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Investor log in", exact: true }).click();
  await expect(page.getByLabel("Private invitation link")).toHaveCount(0);
  await expect(page.getByLabel("Investor password · 18 characters")).toBeVisible();
  await expect(page.getByLabel("Full name")).toBeVisible();
  await page.getByRole("button", { name: "Team log in", exact: true }).click();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/login.png", fullPage: true });
});

test("private tasks persist, reject stale writes and stay out of investor data", async ({
  request,
}) => {
  expect((await request.get("/api/tasks")).status()).toBe(401);
  await login(request);
  const headers = { Origin: origin };
  const sentinel = `INTERNAL-TASK-${Date.now()}`;
  const created = await request.post("/api/tasks", {
    headers,
    data: { title: sentinel, description: "Private execution plan", priority: "high" },
  });
  expect(created.status(), await created.text()).toBe(200);
  let detail = await created.json();
  const id = detail.task.id;
  const root = `/api/tasks/${id}`;
  const originalVersion = detail.task.version;
  expect(
    (
      await request.patch(root, {
        headers: { Origin: "https://evil.test" },
        data: { status: "resolved", version: 1 },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/tasks", { headers, data: { title: "Invalid", published: true } })
    ).status(),
  ).toBe(400);
  const note = await request.post(`${root}/notes`, {
    headers,
    data: { version: originalVersion, body: `${sentinel}-NOTE` },
  });
  expect(note.status()).toBe(200);
  detail = await note.json();
  const stale = await request.post(`${root}/steps`, {
    headers,
    data: { version: originalVersion, label: "STALE-STEP-MUST-NOT-EXIST" },
  });
  expect(stale.status()).toBe(409);
  const step = await request.post(`${root}/steps`, {
    headers,
    data: { version: detail.task.version, label: `${sentinel}-STEP` },
  });
  expect(step.status()).toBe(200);
  detail = await step.json();
  expect(detail.steps).toHaveLength(1);
  expect(detail.task.note_count).toBe(1);
  const stepId = detail.steps[0].id;
  const checked = await request.patch(`${root}/steps/${stepId}`, {
    headers,
    data: { version: detail.task.version, completed: true },
  });
  expect(checked.status()).toBe(200);
  detail = await checked.json();
  expect(detail.task.completed_count).toBe(1);
  const listed = (await (await request.get("/api/tasks")).json()).tasks.find(
    (t: { id: string }) => t.id === id,
  );
  expect(listed.steps).toEqual(detail.steps);
  expect(listed.version).toBe(detail.task.version);
  expect(listed.steps[0]).toEqual({ id: stepId, label: `${sentinel}-STEP`, completed: 1 });
  const other = await (
    await request.post("/api/tasks", { headers, data: { title: "Another private task" } })
  ).json();
  expect(
    (
      await request.patch(`/api/tasks/${other.task.id}/steps/${stepId}`, {
        headers,
        data: { version: 1, completed: false },
      })
    ).status(),
  ).toBe(404);
  for (const status of ["in_progress", "paused", "resolved", "todo"]) {
    const moved = await request.patch(root, {
      headers,
      data: { version: detail.task.version, status },
    });
    expect(moved.status()).toBe(200);
    detail = await moved.json();
    expect(detail.task.status).toBe(status);
  }
  // Two simultaneous writers: exactly one succeeds, including its child and audit record.
  const racing = await Promise.all(
    ["A", "B"].map((label) =>
      request.post(`${root}/notes`, {
        headers,
        data: { version: detail.task.version, body: `Concurrent ${label}` },
      }),
    ),
  );
  expect(racing.map((r) => r.status()).sort()).toEqual([200, 409]);
  detail = await (await request.get(root)).json();
  expect(detail.notes).toHaveLength(2);
  const adminRoom = await (await request.get(`/api/room?month=${reportDate.slice(0, 7)}`)).json();
  expect(
    adminRoom.activities.some(
      (a: { action: string; title: string }) => a.action === "task.created" && a.title === sentinel,
    ),
  ).toBe(true);
  expect(
    adminRoom.activities.filter(
      (a: { entity_id: string; action: string }) =>
        a.entity_id === id && a.action === "task.note_added",
    ),
  ).toHaveLength(2);
  const shareLabel = `Task test ${Date.now()}`;
  const share = await (
    await request.post("/api/shares", {
      headers,
      data: { label: shareLabel, days: 1 },
    })
  ).json();
  const shareRoom = await (await request.get("/api/room")).json();
  const shareId = shareRoom.shares.find((s: { label: string }) => s.label === shareLabel).id;
  const viewer = await playwrightRequest.newContext({ baseURL: origin });
  expect(
    (
      await viewer.post(`${origin}/api/viewer-session`, {
        headers,
        data: {
          name: "Task test investor",
          email: "task-investor@example.test",
          password: share.password,
        },
      })
    ).status(),
  ).toBe(200);
  for (const path of [
    "/api/tasks",
    root,
    `${root}/notes`,
    `${root}/steps`,
    "/api/tasks/not-a-real-id",
  ]) {
    expect((await viewer.get(`${origin}${path}`)).status()).toBe(403);
    expect(
      (
        await viewer.post(`${origin}${path}`, {
          headers,
          data: { version: detail.task.version, title: "FORGED" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await viewer.patch(`${origin}${path}`, {
          headers,
          data: { version: detail.task.version, status: "resolved" },
        })
      ).status(),
    ).toBe(403);
  }
  expect(
    (
      await viewer.patch(`${origin}${root}/steps/${stepId}`, {
        headers,
        data: { version: detail.task.version, remove: true },
      })
    ).status(),
  ).toBe(403);
  const investorRoomResponse = await viewer.get(
    `${origin}/api/room?month=${reportDate.slice(0, 7)}`,
  );
  expect(investorRoomResponse.headers()["cache-control"]).toContain("no-store");
  const investorText = await investorRoomResponse.text();
  expect(investorText).not.toContain(sentinel);
  expect(investorText).not.toContain(id);
  expect(investorText).not.toContain("task.");
  expect(
    (
      await viewer.post(`${origin}/api/viewer-activity`, {
        headers,
        data: { kind: "page", target: "tasks" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await viewer.post(`${origin}/api/viewer-activity`, {
        headers,
        data: { kind: "event", target: id },
      })
    ).status(),
  ).toBe(404);
  expect(await (await request.get(root)).json()).toEqual(detail);
  await request.post(`/api/shares/${shareId}/revoke`, { headers, data: {} });
  expect((await viewer.get(`${origin}/api/tasks`)).status()).toBe(401);
  await viewer.dispose();
});

test("task board supports tickets, notes, steps, drag, keyboard status and mobile", async ({
  page,
  context,
}) => {
  await login(context.request);
  await page.goto("/");
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Make progress visible." })).toBeVisible();
  await page.getByRole("button", { name: "New ticket", exact: true }).click();
  const title = `Launch checklist ${Date.now()}`;
  await page.getByLabel("Ticket title", { exact: true }).fill(title);
  await page.getByLabel("Description", { exact: true }).fill("Prepare the platform launch.");
  await page.getByLabel("Priority", { exact: true }).selectOption("high");
  await page.getByRole("button", { name: "Save ticket", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(title);
  await page.getByLabel("New checklist step").fill("Check onboarding");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  const onboardingStep = page
    .getByRole("dialog")
    .getByRole("checkbox", { name: "Check onboarding", exact: true });
  await expect(onboardingStep).toBeEnabled();
  await onboardingStep.click();
  await expect(onboardingStep).toBeChecked();
  await expect(page.getByRole("dialog").getByText("1/1 steps", { exact: true })).toBeVisible();
  await page.getByLabel("New note").fill("Onboarding reviewed with the team.");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Onboarding reviewed with the team.");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const card = page
    .getByTestId("task-card")
    .filter({ has: page.getByRole("button", { name: title, exact: true }) });
  await expect(card).toContainText("High priority");
  const inlineStep = card.getByRole("checkbox", { name: "Check onboarding", exact: true });
  await expect(inlineStep).toBeChecked();
  await inlineStep.click();
  await expect(inlineStep).not.toBeChecked();
  await expect(card.getByText("0/1 steps", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(inlineStep).not.toBeChecked();
  await inlineStep.click();
  await expect(inlineStep).toBeChecked();
  await expect(card.getByText("1/1 steps", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await card
    .getByRole("combobox", { name: `Move ${title}`, exact: true })
    .selectOption("in_progress");
  await expect(page.getByRole("region", { name: "In progress", exact: true })).toContainText(title);
  await card
    .locator(".task-drag-handle")
    .dragTo(page.getByRole("region", { name: "Paused", exact: true }));
  await expect(page.getByRole("region", { name: "Paused", exact: true })).toContainText(title);
  await test.info().attach("tasks-desktop", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await card.getByRole("button", { name: title, exact: true }).click();
  await page.getByRole("button", { name: "Edit ticket", exact: true }).click();
  const description = page
    .getByRole("dialog")
    .getByPlaceholder("What needs to happen?", { exact: true });
  await expect(description).toBeVisible();
  await description.fill("My preserved local draft");
  const tickets = await (await context.request.get("/api/tasks")).json();
  const current = tickets.tasks.find((t: { title: string }) => t.title === title);
  await context.request.patch(`/api/tasks/${current.id}`, {
    headers: { Origin: origin },
    data: { version: current.version, description: "Another admin update" },
  });
  await page.getByRole("button", { name: "Save ticket", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("This ticket changed");
  await expect(description).toHaveValue("My preserved local draft");
  await page.getByRole("button", { name: "Review latest version", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Another admin update");
  await expect(description).toHaveValue("My preserved local draft");
  await page.getByLabel("Priority", { exact: true }).selectOption("low");
  await page.getByLabel("Status", { exact: true }).selectOption("resolved");
  await page.getByRole("button", { name: "Save ticket", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Low priority");
  await test.info().attach("task-details", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("region", { name: "Resolved", exact: true })).toContainText(title);
  await page.getByLabel("Search tickets").fill(title);
  await expect(page.getByTestId("task-card")).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("region", { name: "Resolved", exact: true })).toContainText(title);
  await expect(inlineStep).toBeVisible();
  await expect(inlineStep).toBeChecked();
  await card.getByRole("combobox", { name: `Move ${title}`, exact: true }).selectOption("todo");
  await expect(page.getByRole("region", { name: "To do", exact: true })).toContainText(title);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await test.info().attach("tasks-mobile", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("investor navigation and calendar exclude private task content", async ({
  request,
  browser,
}) => {
  await login(request);
  const headers = { Origin: origin };
  const sentinel = `PRIVATE-UI-${Date.now()}`;
  await request.post("/api/tasks", { headers, data: { title: sentinel } });
  const interview = await (
    await request.post("/api/interviews", {
      headers,
      data: {
        name: sentinel,
        email: "hidden-person@example.test",
        company: "Hidden company",
        date: reportDate,
        insights: "Private raw notes",
        public_summary: "Appointment follow-up needs attention.",
        published: true,
      },
    })
  ).json();
  const captured = (await (await request.get("/api/room")).json()).interviews.find(
    (i: { id: string }) => i.id === interview.id,
  );
  const label = `Interview #${captured.number}`;
  const access = await (
    await request.post("/api/shares", {
      headers,
      data: { label: "Investor task UI test", days: 1 },
    })
  ).json();
  const viewer = await browser.newContext();
  await viewer.request.post(`${origin}/api/viewer-session`, {
    headers,
    data: { name: "Test investor", email: "viewer-ui@example.test", password: access.password },
  });
  const page = await viewer.newPage();
  await page.goto(origin);
  await expect(page.getByRole("heading", { name: "Every step, a clearer picture." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tasks", exact: true })).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Calendar", exact: true })
    .click();
  await expect(page.locator("body")).not.toContainText(sentinel);
  await expect(page.locator("body")).not.toContainText("hidden-person@example.test");
  await page.getByRole("button", { name: "Market discovery", exact: true }).click();
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(label);
  await expect(page.getByRole("dialog")).toContainText("Appointment follow-up needs attention.");
  await expect(page.getByRole("dialog")).not.toContainText(sentinel);
  await expect(page.getByRole("dialog")).not.toContainText("hidden-person@example.test");
  await expect(page.getByRole("dialog")).not.toContainText("Hidden company");
  await expect(page.getByRole("dialog").getByRole("textbox")).toHaveCount(0);
  await viewer.close();
});

test("category dropdown separates SECURITY, preserves All and filters on mobile", async ({
  page,
  context,
}) => {
  await login(context.request);
  const stamp = Date.now();
  const security = `SECURITY category regression ${stamp}`;
  const finance = `Stripe category regression ${stamp}`;
  const headers = { Origin: origin };
  for (const title of [security, finance]) {
    const created = await context.request.post("/api/tasks", {
      headers,
      data: { title, priority: "high" },
    });
    expect(created.ok()).toBeTruthy();
  }
  await page.goto("/");
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  const category = page.getByLabel("Filter task category");
  const card = (title: string) =>
    page
      .getByTestId("task-card")
      .filter({ has: page.getByRole("button", { name: title, exact: true }) });
  await expect(card(security)).toBeVisible();
  await expect(card(finance)).toBeVisible();
  await category.selectOption("security");
  await expect(card(security)).toBeVisible();
  await expect(card(finance)).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(category).toHaveValue("security");
  await category.selectOption("non-security");
  await expect(card(security)).toHaveCount(0);
  await expect(card(finance)).toBeVisible();
  await page.getByLabel("Filter priority").selectOption("low");
  await expect(card(finance)).toHaveCount(0);
  await page.getByRole("button", { name: "Show all tasks", exact: true }).click();
  await expect(category).toHaveValue("all");
  await expect(page.getByLabel("Filter priority")).toHaveValue("all");
  await expect(card(security)).toBeVisible();
  await expect(card(finance)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await category.selectOption("finance");
  await expect(card(finance)).toBeVisible();
  await expect(card(security)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
