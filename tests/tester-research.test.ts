import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  db: null as DatabaseSync | null,
  role: "admin",
  createCalls: [] as unknown[],
  clock: Date.parse("2026-10-08T12:00:00Z"),
  batchBarrier: null as null | (() => Promise<void>),
  failProfile: false,
}));
vi.mock("../lib/server/auth", () => ({
  checkOrigin: (req: Request) => {
    if (req.headers.get("origin") !== "https://data-room.example.com")
      throw Object.assign(Error("Forbidden"), { status: 403 });
  },
  requireUser: async () => {
    if (f.role !== "admin")
      throw new (await import("../lib/server/storage")).HttpError(
        f.role === "viewer" ? 403 : 401,
        "Denied",
      );
    return { id: "admin" };
  },
  auth: () => ({
    api: {
      getSession: async () => null,
      signInEmail: async () => Response.json({ ok: true }),
      createUser: async ({ body }: { body: { email: string; name: string; role: string } }) => {
        f.createCalls.push(body);
        const id = crypto.randomUUID();
        f.db!.prepare("INSERT INTO user(id,email) VALUES(?,?)").run(id, body.email);
        return { user: { id } };
      },
    },
  }),
}));
vi.mock("../lib/server/storage", () => {
  class HttpError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  }
  function prepare(sql: string) {
    let values: unknown[] = [];
    return {
      bind(...v: unknown[]) {
        values = v;
        return this;
      },
      async first() {
        return f.db!.prepare(sql).get(...(values as never[])) ?? null;
      },
      async all() {
        return { results: f.db!.prepare(sql).all(...(values as never[])) };
      },
      exec() {
        if (f.failProfile && sql.startsWith("INSERT INTO product_testers"))
          throw Error("database failure");
        const r = f.db!.prepare(sql).run(...(values as never[]));
        return { meta: { changes: Number(r.changes) } };
      },
      async run() {
        return this.exec();
      },
    };
  }
  return {
    HttpError,
    db: () => ({
      prepare,
      batch: async (q: { exec: () => unknown }[]) => {
        if (f.batchBarrier) await f.batchBarrier();
        f.db!.exec("BEGIN");
        try {
          const result = [];
          for (const item of q) result.push(item.exec());
          f.db!.exec("COMMIT");
          return result;
        } catch (e) {
          f.db!.exec("ROLLBACK");
          throw e;
        }
      },
    }),
    one: async (sql: string, ...v: unknown[]) =>
      prepare(sql)
        .bind(...v)
        .first(),
    rows: async (sql: string, ...v: unknown[]) =>
      (
        await prepare(sql)
          .bind(...v)
          .all()
      ).results,
    run: async (sql: string, ...v: unknown[]) =>
      prepare(sql)
        .bind(...v)
        .run(),
    id: () => crypto.randomUUID(),
    now: () => new Date(f.clock).toISOString(),
    digest: async (s: string) =>
      Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))).toString(
        "hex",
      ),
    rateGuard: async () => {},
    authRate: async () => {},
    logAudit: async () => {},
    readLimited: async (req: Request) => new Uint8Array(await req.arrayBuffer()),
  };
});

import {
  ingestTesterEvents,
  recordHeartbeat,
  testerRoute,
  testerSummary,
} from "../lib/server/testers";
import { testerRegistration } from "../lib/tester-contracts";

const visit = "a".repeat(64),
  other = "b".repeat(64),
  tab = "f4774d7e-8261-49ad-8fe4-32136a8d4e78";
const start = (id = visit) => ({
  id: `start-${id}`,
  visitId: id,
  kind: "start",
  value: "workspace",
  occurredAt: new Date(f.clock).toISOString(),
});
const beat = (id = visit, sequence = 1, active = true, page = "Schedule") => ({
  visitId: id,
  tab,
  sequence,
  active,
  page,
});
function count(sql: string) {
  return f.db!.prepare(sql).get() as { n: number };
}
function seed(id: string, excluded = 0) {
  f.db!.prepare("INSERT INTO user(id,email) VALUES(?,?)").run(id, `${id}@example.com`);
  f.db!.prepare(
    "INSERT INTO product_testers(user_id,name,phone,organization,excluded,consent_at,created_at) VALUES(?,?, '5555550101','Synthetic organization',?,?,?)",
  ).run(id, id, excluded, new Date(f.clock).toISOString(), new Date(f.clock).toISOString());
}
beforeEach(() => {
  f.clock = Date.parse("2026-10-08T12:00:00Z");
  vi.spyOn(Date, "now").mockImplementation(() => f.clock);
  f.db = new DatabaseSync(":memory:");
  f.db.exec(
    "PRAGMA foreign_keys=ON; CREATE TABLE user(id TEXT PRIMARY KEY,email TEXT UNIQUE);CREATE TABLE members(id TEXT PRIMARY KEY);",
  );
  for (const name of ["0007_amazing_wallflower.sql", "0008_keen_post.sql"])
    f.db.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8"));
  f.role = "admin";
  f.createCalls = [];
  f.batchBarrier = null;
  f.failProfile = false;
  seed("alice");
  seed("bob");
});
afterEach(() => {
  f.db?.close();
  vi.restoreAllMocks();
});
function raceBarrier() {
  let reached = 0;
  let release: () => void;
  const wait = new Promise<void>((r) => {
    release = r;
  });
  f.batchBarrier = async () => {
    if (++reached === 2) release();
    await wait;
  };
}
const req = (path: string, body?: unknown) =>
  new Request(`https://data-room.example.com/api/testers/${path}`, {
    method: body ? "POST" : "GET",
    headers: body
      ? { origin: "https://data-room.example.com", "content-type": "application/json" }
      : {},
    body: body ? JSON.stringify(body) : undefined,
  });
describe("Tester research isolation and truthful counters", () => {
  it("requires all contact fields, consent and a strong password; rejects role injection", () => {
    const b = {
      name: "Test Person",
      phone: "+1 555 555 0111",
      organization: "Organization",
      email: "test@example.com",
      password: "test-password-long",
      consent: true,
    };
    expect(testerRegistration.safeParse(b).success).toBe(true);
    for (const changed of [
      { phone: "" },
      { consent: false },
      { password: "short" },
      { role: "admin" },
    ])
      expect(testerRegistration.safeParse({ ...b, ...changed }).success).toBe(false);
  });
  it("creates a user-only membership and no Data Room member", async () => {
    const r = await testerRoute(
      req("register", {
        name: "Test Person",
        phone: "+1 555 555 0111",
        organization: "Organization",
        email: "new@example.com",
        password: "test-password-long",
        consent: true,
      }),
    );
    expect(r.status).toBe(200);
    expect(f.createCalls).toHaveLength(1);
    expect(f.createCalls[0]).toMatchObject({ role: "user" });
    expect(count("SELECT COUNT(*) n FROM members").n).toBe(0);
  });
  it("does not overwrite an existing account", async () => {
    const r = await testerRoute(
      req("register", {
        name: "Other Name",
        phone: "+1 555 555 0111",
        organization: "Other organization",
        email: "ALICE@example.com",
        password: "a-new-password-long",
        consent: true,
      }),
    );
    expect(r.status).toBe(409);
    expect(f.createCalls).toHaveLength(0);
  });
  it("cleans up newly created identity if membership write fails", async () => {
    f.failProfile = true;
    const r = await testerRoute(
      req("register", {
        name: "Test Person",
        phone: "+1 555 555 0111",
        organization: "Organization",
        email: "new@example.com",
        password: "test-password-long",
        consent: true,
      }),
    );
    expect(r.status).toBe(409);
    expect(
      f.db!.prepare("SELECT id FROM user WHERE email='new@example.com'").get(),
    ).toBeUndefined();
  });
  it.each(["tester", "viewer"])("denies %s access to every CRM operation", async (role) => {
    f.role = role;
    for (const [path, b] of [
      ["list", undefined],
      ["detail?id=alice", undefined],
      ["update", {}],
    ] as const) {
      const r = await testerRoute(req(path, b));
      expect([401, 403]).toContain(r.status);
    }
  });
  it("counts actual starts separately from registrations and excludes QA", async () => {
    seed("qa", 1);
    expect(await testerSummary()).toMatchObject({ registered: 2, activated: 0, returning: 0 });
    await ingestTesterEvents("alice", [start()]);
    await ingestTesterEvents("alice", [start()]);
    await ingestTesterEvents("qa", [start(other)]);
    expect(await testerSummary()).toMatchObject({ registered: 2, activated: 1, returning: 0 });
  });
  it("rejects cross-owner activity and conflicting event IDs", async () => {
    await ingestTesterEvents("alice", [start()]);
    await expect(
      ingestTesterEvents("bob", [
        {
          id: crypto.randomUUID(),
          visitId: visit,
          kind: "action",
          value: "message",
          occurredAt: new Date(f.clock).toISOString(),
        },
      ]),
    ).rejects.toThrow("does not belong");
    await expect(
      ingestTesterEvents("bob", [{ ...start(other), id: `start-${visit}` }]),
    ).rejects.toThrow("already used");
    expect(count("SELECT COUNT(*) n FROM product_tester_visits").n).toBe(1);
  });
  it("does not credit the first heartbeat, idle intervals, page switches or retry", async () => {
    await ingestTesterEvents("alice", [start()]);
    await recordHeartbeat("alice", beat());
    f.clock += 15000;
    await recordHeartbeat("alice", beat(visit, 2));
    await recordHeartbeat("alice", beat(visit, 2));
    expect(count("SELECT SUM(active_ms) n FROM product_tester_pages").n).toBe(15000);
    f.clock += 70000;
    await recordHeartbeat("alice", beat(visit, 3));
    f.clock += 15000;
    await recordHeartbeat("alice", beat(visit, 4, false));
    f.clock += 15000;
    await recordHeartbeat("alice", beat(visit, 5, true, "Inbox"));
    expect(count("SELECT SUM(active_ms) n FROM product_tester_pages").n).toBe(15000);
  });
  it("uses an atomic claim for duplicate same-millisecond heartbeats", async () => {
    await ingestTesterEvents("alice", [start()]);
    await recordHeartbeat("alice", beat());
    f.clock += 15000;
    raceBarrier();
    await Promise.all([
      recordHeartbeat("alice", beat(visit, 2)),
      recordHeartbeat("alice", beat(visit, 2)),
    ]);
    expect(count("SELECT SUM(active_ms) n FROM product_tester_pages").n).toBe(15000);
  });
  it("does not double count simultaneous visits", async () => {
    await ingestTesterEvents("alice", [start(), start(other)]);
    await recordHeartbeat("alice", beat());
    await recordHeartbeat("alice", beat(other));
    f.clock += 15000;
    raceBarrier();
    await Promise.all([
      recordHeartbeat("alice", beat(visit, 2)),
      recordHeartbeat("alice", beat(other, 2)),
    ]);
    expect(count("SELECT SUM(active_ms) n FROM product_tester_pages").n).toBe(15000);
  });
  it("does not create a phantom visit for concurrently conflicting event IDs", async () => {
    const a = start(),
      b = { ...start(other), id: a.id };
    raceBarrier();
    const results = await Promise.allSettled([
      ingestTesterEvents("alice", [a]),
      ingestTesterEvents("alice", [b]),
    ]);
    expect(results.filter((x) => x.status === "rejected")).toHaveLength(1);
    expect(count("SELECT COUNT(*) n FROM product_tester_visits").n).toBe(1);
  });
  it("accepts historical queued usage without blocking new synchronization", async () => {
    const e = start();
    e.occurredAt = "2026-08-01T12:00:00.000Z";
    expect((await ingestTesterEvents("alice", [e])).accepted).toHaveLength(1);
  });
  it("uses version checks for stage and access changes", async () => {
    const b = {
      id: "alice",
      version: 1,
      stage: "Testing",
      notes: "Follow up",
      excluded: false,
      status: "active",
    };
    expect((await testerRoute(req("update", b))).status).toBe(200);
    expect((await testerRoute(req("update", b))).status).toBe(409);
  });
});
