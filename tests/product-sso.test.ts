import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Copy into the DataLog checkout's tests/ directory before running. No network,
// passwords, production database or real sessions are used. SQL is executed by
// SQLite, including RETURNING, FK cascades and one-use exchange predicates.
const fixture = vi.hoisted(() => ({
  sqlite: null as DatabaseSync | null,
  sessionId: null as string | null,
  rates: [] as Array<unknown[]>,
  exchangeBarrier: null as null | (() => Promise<void>),
}));
vi.mock("../lib/server/auth", () => ({
  auth: () => ({
    api: {
      getSession: async () =>
        fixture.sessionId ? { session: { id: fixture.sessionId }, user: { id: "unused" } } : null,
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
  const prepare = (sql: string) => {
    let values: unknown[] = [];
    return {
      bind(...args: unknown[]) {
        values = args;
        return this;
      },
      async first() {
        if (sql.startsWith("UPDATE product_sso_grants SET token_hash=") && fixture.exchangeBarrier)
          await fixture.exchangeBarrier();
        return fixture.sqlite!.prepare(sql).get(...(values as never[])) ?? null;
      },
      async run() {
        return fixture.sqlite!.prepare(sql).run(...(values as never[]));
      },
    };
  };
  return {
    HttpError,
    db: () => ({ prepare }),
    one: async (sql: string, ...args: unknown[]) =>
      prepare(sql)
        .bind(...args)
        .first(),
    run: async (sql: string, ...args: unknown[]) =>
      prepare(sql)
        .bind(...args)
        .run(),
    digest: async (s: string) =>
      Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))))
        .map((x) => x.toString(16).padStart(2, "0"))
        .join(""),
    token: () =>
      Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((x) => x.toString(16).padStart(2, "0"))
        .join(""),
    rateGuard: async (...args: unknown[]) => {
      fixture.rates.push(args);
    },
    readLimited: async (req: Request, max: number) => {
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (bytes.length > max) throw new HttpError(413, "Request is too large.");
      return bytes;
    },
  };
});

import { loginReturn } from "../lib/client/login-return";
import {
  PRODUCT_CALLBACK,
  PRODUCT_CLIENT,
  productSso,
  s256,
  validAuthorization,
} from "../lib/server/product-sso";

const BASE = "https://data-room.example.com";
const verifier = `correct-verifier-${"a".repeat(48)}`;
const state = `state-${"b".repeat(48)}`;
function seedMember(id: string, email: string, status = "active", banned = 0) {
  fixture
    .sqlite!.prepare("INSERT INTO user(id,banned,banExpires) VALUES(?,?,NULL)")
    .run(id, banned);
  fixture
    .sqlite!.prepare("INSERT INTO members(id,name,email,status) VALUES(?,?,?,?)")
    .run(id, id, email, status);
  fixture
    .sqlite!.prepare("INSERT INTO session(id,userId,expiresAt) VALUES(?,?,?)")
    .run(`session-${id}`, id, Date.now() + 3600000);
}
async function authorization(overrides: Record<string, string | undefined> = {}) {
  const query = new URLSearchParams({
    client_id: PRODUCT_CLIENT,
    redirect_uri: PRODUCT_CALLBACK,
    response_type: "code",
    code_challenge_method: "S256",
    code_challenge: await s256(verifier),
    state,
    ...overrides,
  } as Record<string, string>);
  return productSso(new Request(`${BASE}/api/sso/authorize?${query}`));
}
async function getCode() {
  const response = await authorization();
  expect(response.status).toBe(303);
  return new URL(response.headers.get("Location")!).searchParams.get("code")!;
}
function post(operation: string, body?: unknown, headers: HeadersInit = {}) {
  return productSso(
    new Request(`${BASE}/api/sso/${operation}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
function exchange(code: string, overrides: Record<string, unknown> = {}) {
  return post("token", {
    grant_type: "authorization_code",
    client_id: PRODUCT_CLIENT,
    redirect_uri: PRODUCT_CALLBACK,
    code,
    code_verifier: verifier,
    ...overrides,
  });
}
async function grant() {
  const response = await exchange(await getCode());
  expect(response.status).toBe(200);
  return (await response.json()) as { access_token: string; expires_in: number };
}
function introspect(token: string) {
  return post("introspect", undefined, { Authorization: `Bearer ${token}` });
}

beforeEach(() => {
  fixture.sqlite = new DatabaseSync(":memory:");
  fixture.sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE user(id TEXT PRIMARY KEY, email TEXT, banned INTEGER, banExpires INTEGER);
    CREATE TABLE members(id TEXT PRIMARY KEY, name TEXT, email TEXT, status TEXT);
    CREATE TABLE session(id TEXT PRIMARY KEY, userId TEXT REFERENCES user(id), expiresAt INTEGER);`);
  fixture.sqlite.exec(
    readFileSync(new URL("../drizzle/0006_red_quentin_quire.sql", import.meta.url), "utf8"),
  );
  fixture.sqlite.exec(
    readFileSync(new URL("../drizzle/0007_amazing_wallflower.sql", import.meta.url), "utf8"),
  );
  fixture.sqlite.exec(
    readFileSync(new URL("../drizzle/0008_keen_post.sql", import.meta.url), "utf8"),
  );
  seedMember("owner", "owner@example.com");
  seedMember("teammate", "teammate@example.com");
  fixture.sessionId = "session-owner";
  fixture.rates = [];
  fixture.exchangeBarrier = null;
});
afterEach(() => {
  fixture.sqlite?.close();
  fixture.sqlite = null;
});

describe("DataLog product authorization bridge", () => {
  it("sends logged-out users to DataLog with only the validated local authorization return path", async () => {
    fixture.sessionId = null;
    const r = await authorization();
    expect(r.status).toBe(303);
    const location = new URL(r.headers.get("Location")!, BASE);
    expect(location.origin).toBe(BASE);
    expect(location.pathname).toBe("/");
    expect(location.searchParams.get("returnTo")).toMatch(/^\/api\/sso\/authorize\?/);
    expect(fixture.sqlite!.prepare("SELECT count(*) AS n FROM product_sso_grants").get()).toEqual({
      n: 0,
    });
  });
  it.each(["owner", "teammate"])(
    "authorizes the existing active %s account without a password or full DataLog token",
    async (id) => {
      fixture.sessionId = `session-${id}`;
      const r = await authorization();
      const url = new URL(r.headers.get("Location")!);
      expect(url.origin + url.pathname).toBe(PRODUCT_CALLBACK);
      expect(url.searchParams.get("state")).toBe(state);
      expect(url.searchParams.get("code")).toMatch(/^[a-f0-9]{64}$/);
      const row = fixture.sqlite!.prepare("SELECT * FROM product_sso_grants").get()!;
      expect(row.code_hash).not.toBe(url.searchParams.get("code"));
      expect(row.token_hash).toBeNull();
      expect(row.session_id).toBe(`session-${id}`);
    },
  );
  it.each(["pending", "revoked"])("denies a %s founder membership", async (status) => {
    fixture.sqlite!.prepare("UPDATE members SET status=? WHERE id='owner'").run(status);
    expect((await authorization()).status).toBe(403);
  });
  it("denies an unrelated administrator, banned founder and nonexistent source session", async () => {
    seedMember("other", "other@company.example.com");
    fixture.sessionId = "session-other";
    expect((await authorization()).status).toBe(403);
    fixture.sessionId = "session-owner";
    fixture.sqlite!.exec("UPDATE user SET banned=1 WHERE id='owner'");
    expect((await authorization()).status).toBe(403);
    fixture.sessionId = "missing";
    expect((await authorization()).status).toBe(403);
  });
  it.each([
    { redirect_uri: "https://attacker.example/auth/callback" },
    { redirect_uri: `${PRODUCT_CALLBACK}/` },
    { client_id: "other" },
    { response_type: "token" },
    { code_challenge_method: "plain" },
    { code_challenge: "short" },
    { state: "short" },
  ])("rejects invalid authorization parameters without redirecting: %j", async (override) => {
    const r = await authorization(override);
    expect(r.status).toBe(400);
    expect(r.headers.has("Location")).toBe(false);
  });
  it("rejects the wrong PKCE verifier without consuming the valid pending authorization", async () => {
    const code = await getCode();
    expect((await exchange(code, { code_verifier: "x".repeat(64) })).status).toBe(401);
    expect((await exchange(code)).status).toBe(200);
    expect((await exchange(code)).status).toBe(401);
  });
  it("allows exactly one atomic exchange for simultaneous requests", async () => {
    const code = await getCode();
    let arrivals = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fixture.exchangeBarrier = async () => {
      if (++arrivals === 2) release();
      await gate;
    };
    const replies = await Promise.all([exchange(code), exchange(code)]);
    expect(arrivals).toBe(2);
    expect(replies.map((r) => r.status).sort()).toEqual([200, 401]);
    expect(
      fixture
        .sqlite!.prepare(
          "SELECT count(*) AS n FROM product_sso_grants WHERE token_hash IS NOT NULL",
        )
        .get(),
    ).toEqual({ n: 1 });
  });
  it("denies expired codes and source revocation between authorization and exchange", async () => {
    const expired = await getCode();
    fixture.sqlite!.exec(`UPDATE product_sso_grants SET code_expires=${Date.now() - 1}`);
    expect((await exchange(expired)).status).toBe(401);
    const revoked = await getCode();
    fixture.sqlite!.exec("UPDATE members SET status='revoked' WHERE id='owner'");
    expect((await exchange(revoked)).status).toBe(401);
  });
  it.each([
    { client_id: "other" },
    { redirect_uri: "https://attacker.example" },
    { grant_type: "password" },
    { code_verifier: "short" },
    { code: "short" },
  ])("rejects malformed or redirected token exchanges: %j", async (override) => {
    expect((await exchange(await getCode(), override)).status).toBe(400);
  });
  it("returns minimal scoped identity and caps delegation at source expiry", async () => {
    const sourceExpiry = Date.now() + 300000;
    fixture
      .sqlite!.prepare("UPDATE session SET expiresAt=? WHERE id='session-owner'")
      .run(sourceExpiry);
    const token = await grant();
    expect(token.expires_in).toBeGreaterThan(290);
    expect(token.expires_in).toBeLessThanOrEqual(300);
    const r = await introspect(token.access_token);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      active: true,
      audience: PRODUCT_CLIENT,
      expires_at: sourceExpiry,
      user: { id: "owner", name: "owner", email: "owner@example.com", role: "admin" },
    });
  });
  it.each([
    "UPDATE session SET expiresAt=1 WHERE id='session-owner'",
    "DELETE FROM session WHERE id='session-owner'",
    "UPDATE members SET status='revoked' WHERE id='owner'",
    "UPDATE members SET email='other@company.example.com' WHERE id='owner'",
    "UPDATE user SET banned=1 WHERE id='owner'",
    "UPDATE product_sso_grants SET token_expires=1",
  ])("fresh introspection denies upstream revocation/expiry: %s", async (sql) => {
    const token = await grant();
    fixture.sqlite!.exec(sql);
    const r = await introspect(token.access_token);
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ active: false });
  });
  it("revokes only the delegated token, preserving the DataLog session and other delegation", async () => {
    const first = await grant(),
      second = await grant();
    const request = () =>
      post("revoke", undefined, { Authorization: `Bearer ${first.access_token}` });
    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(200);
    expect((await introspect(first.access_token)).status).toBe(401);
    expect((await introspect(second.access_token)).status).toBe(200);
    expect(
      fixture.sqlite!.prepare("SELECT count(*) AS n FROM session WHERE id='session-owner'").get(),
    ).toEqual({ n: 1 });
  });
  it.each(["token", "introspect", "revoke"])(
    "denies browser-origin POSTs to %s",
    async (operation) => {
      expect((await post(operation, {}, { Origin: "https://product.example.com" })).status).toBe(
        403,
      );
    },
  );
  it("rejects missing/malformed Bearer tokens and unsupported methods", async () => {
    expect((await post("introspect")).status).toBe(401);
    expect((await introspect("invalid")).status).toBe(401);
    expect((await introspect("f".repeat(64))).status).toBe(401);
    expect((await productSso(new Request(`${BASE}/api/sso/token`))).status).toBe(405);
  });
  it("marks success, errors and redirects noncacheable with no-referrer", async () => {
    const token = await grant();
    for (const r of [
      await authorization(),
      await introspect(token.access_token),
      await post("token", {}),
    ]) {
      expect(r.headers.get("Cache-Control")).toContain("no-store");
      expect(r.headers.get("Referrer-Policy")).toBe("no-referrer");
    }
  });
});

describe("strict DataLog login return path", () => {
  it("preserves the local authorize route only", () => {
    const target = "/api/sso/authorize?client_id=company-product-mvp";
    expect(loginReturn(`?returnTo=${encodeURIComponent(target)}`)).toBe(target);
    expect(
      loginReturn("?returnTo=https%3A%2F%2Fattacker.example%2Fapi%2Fsso%2Fauthorize"),
    ).toBeNull();
    expect(loginReturn("?returnTo=%2Fapi%2Ftasks")).toBeNull();
    expect(loginReturn("?returnTo=%2Fapi%2Fsso%2Fauthorize%23fragment")).toBeNull();
  });
  it("treats malformed URLs as an absent return target instead of breaking ordinary login", () => {
    expect(loginReturn(`?returnTo=${encodeURIComponent("http://[")}`)).toBeNull();
  });
  it("checks the full authorization shape before a code can be issued", () => {
    expect(validAuthorization(new URLSearchParams("client_id=company-product-mvp"))).toBe(false);
  });
});

function seedTester(status = "active", banned = 0) {
  fixture
    .sqlite!.prepare("INSERT INTO user(id,email,banned) VALUES('tester','tester@example.com',?)")
    .run(banned);
  fixture
    .sqlite!.prepare(
      "INSERT INTO product_testers(user_id,name,phone,organization,status,consent_at,created_at) VALUES('tester','Tester','5555550123','Test organization',?,?,?)",
    )
    .run(status, new Date().toISOString(), new Date().toISOString());
  fixture
    .sqlite!.prepare("INSERT INTO session(id,userId,expiresAt) VALUES('session-tester','tester',?)")
    .run(Date.now() + 3600000);
  fixture.sessionId = "session-tester";
}
describe("Tester SSO boundaries", () => {
  it("directs logged-out testers to the separate portal", async () => {
    fixture.sessionId = null;
    const r = await authorization({ entry: "tester" });
    expect(new URL(r.headers.get("location")!, BASE).pathname).toBe("/testers");
  });
  it("gives a separate tester role without creating a member", async () => {
    seedTester();
    const token = await grant();
    const r = await introspect(token.access_token);
    const b = (await r.json()) as { user: { role: string } };
    expect(b.user.role).toBe("tester");
    expect(
      fixture.sqlite!.prepare("SELECT COUNT(*) AS n FROM members WHERE id='tester'").get(),
    ).toEqual({ n: 0 });
  });
  it.each([
    ["revoked", 0],
    ["active", 1],
  ])("denies inactive/banned tester %s %s", async (status, banned) => {
    seedTester(String(status), Number(banned));
    expect((await authorization()).status).toBe(403);
  });
  it("checks tester revocation on every introspection", async () => {
    seedTester();
    const token = await grant();
    fixture.sqlite!.exec("UPDATE product_testers SET status='revoked' WHERE user_id='tester'");
    expect((await introspect(token.access_token)).status).toBe(401);
  });
  it("does not count founder usage", async () => {
    const token = await grant();
    const r = await post("activity", [], { Authorization: `Bearer ${token.access_token}` });
    expect(await r.json()).toMatchObject({ ignored: true });
  });
});
