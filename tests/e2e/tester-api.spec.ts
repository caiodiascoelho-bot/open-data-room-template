import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";

const base = "http://127.0.0.1:5173";
test("tester registration, SSO and analytics are isolated from the private data room", async ({
  request,
}) => {
  const email = `qa-${randomBytes(5).toString("hex")}@example.com`,
    password = `QA-only-${randomBytes(15).toString("hex")}`;
  const profile = {
    name: "Synthetic QA Tester",
    phone: "+1 305 555 0189",
    email,
    organization: "Fictional QA Organization",
    password,
    consent: true,
  };
  expect(
    (
      await request.post("/api/testers/register", {
        headers: { Origin: base },
        data: { ...profile, role: "admin" },
      })
    ).status(),
  ).toBe(400);
  const registration = await request.post("/api/testers/register", {
    headers: { Origin: base },
    data: profile,
  });
  expect(registration.status(), await registration.text()).toBe(200);
  expect(
    (
      await request.post("/api/testers/register", { headers: { Origin: base }, data: profile })
    ).status(),
  ).toBe(409);
  const login = await request.post("/api/testers/login", {
    headers: { Origin: base },
    data: { email, password },
  });
  expect(login.status(), await login.text()).toBe(200);
  expect((await request.get("/api/testers/session")).status()).toBe(200);
  for (const route of [
    "/api/room",
    "/api/tasks",
    "/api/testers/list",
    "/api/testers/detail?id=anything",
  ])
    expect([401, 403]).toContain((await request.get(route)).status());
  const verifier = randomBytes(32).toString("hex"),
    state = randomBytes(32).toString("hex");
  const query = new URLSearchParams({
    client_id: "company-product-mvp",
    redirect_uri: "https://product.example.com/auth/callback",
    response_type: "code",
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    state,
    entry: "tester",
  });
  const authorization = await request.get(`/api/sso/authorize?${query}`, { maxRedirects: 0 });
  expect(authorization.status(), await authorization.text()).toBe(303);
  const callback = new URL(authorization.headers().location);
  expect(callback.origin + callback.pathname).toBe("https://product.example.com/auth/callback");
  expect(callback.searchParams.get("state")).toBe(state);
  const exchange = await request.post("/api/sso/token", {
    data: {
      client_id: "company-product-mvp",
      redirect_uri: "https://product.example.com/auth/callback",
      grant_type: "authorization_code",
      code: callback.searchParams.get("code"),
      code_verifier: verifier,
    },
  });
  expect(exchange.status(), await exchange.text()).toBe(200);
  const token = (await exchange.json()).access_token,
    headers = { Authorization: `Bearer ${token}` };
  const identity = await request.post("/api/sso/introspect", { headers });
  expect((await identity.json()).user.role).toBe("tester");
  const visitId = createHash("sha256").update(`company-visit:${token}`).digest("hex");
  const start = {
    id: `start-${visitId}`,
    visitId,
    kind: "start",
    value: "workspace",
    occurredAt: new Date().toISOString(),
  };
  const tracked = await request.post("/api/sso/activity", { headers, data: [start] });
  expect(tracked.status(), await tracked.text()).toBe(200);
  expect((await request.post("/api/sso/activity", { headers, data: [start] })).status()).toBe(200);
  const beat = await request.post("/api/sso/heartbeat", {
    headers,
    data: { visitId, page: "Schedule", tab: crypto.randomUUID(), sequence: 1, active: true },
  });
  expect(beat.status(), await beat.text()).toBe(200);
  expect((await request.post("/api/sso/revoke", { headers })).status()).toBe(200);
  expect((await request.post("/api/sso/introspect", { headers })).status()).toBe(401);
});
