import { auth } from "./auth";
import { db, digest, HttpError, one, rateGuard, readLimited, run, token } from "./storage";
import { ingestTesterEvents, recordHeartbeat } from "./testers";

export const PRODUCT_CALLBACK = "https://product.example.com/auth/callback";
export const PRODUCT_CLIENT = "company-product-mvp";
const founders = new Set(["owner@example.com", "teammate@example.com"]);
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
const redirect = (url: string) =>
  new Response(null, { status: 303, headers: { ...headers, Location: url } });
export async function s256(value: string) {
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return btoa(String.fromCharCode(...hash))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
export function validAuthorization(q: URLSearchParams) {
  return (
    q.get("client_id") === PRODUCT_CLIENT &&
    q.get("redirect_uri") === PRODUCT_CALLBACK &&
    q.get("response_type") === "code" &&
    q.get("code_challenge_method") === "S256" &&
    /^[A-Za-z0-9_-]{43}$/.test(q.get("code_challenge") || "") &&
    /^[A-Za-z0-9_-]{32,128}$/.test(q.get("state") || "")
  );
}
type Member = {
  id: string;
  name: string;
  email: string;
  expires: number;
  role?: "admin" | "tester";
};
async function activeSource(sessionId: string) {
  const m = await one<Member>(
    `SELECT m.id,m.name,m.email,s.expiresAt AS expires
    FROM members m JOIN session s ON s.userId=m.id JOIN user u ON u.id=m.id
    WHERE s.id=? AND s.expiresAt>? AND m.status='active' AND COALESCE(u.banned,0)=0`,
    sessionId,
    Date.now(),
  );
  if (m && founders.has(m.email.toLowerCase())) return { ...m, role: "admin" as const };
  const tester = await one<Member>(
    `SELECT t.user_id AS id,t.name,u.email,s.expiresAt AS expires FROM product_testers t JOIN session s ON s.userId=t.user_id JOIN user u ON u.id=t.user_id WHERE s.id=? AND s.expiresAt>? AND t.status='active' AND COALESCE(u.banned,0)=0`,
    sessionId,
    Date.now(),
  );
  return tester ? { ...tester, role: "tester" as const } : null;
}
export async function productSso(req: Request) {
  try {
    const url = new URL(req.url);
    const operation = url.pathname.split("/").pop();
    if (operation === "authorize" && req.method === "GET") {
      if (!validAuthorization(url.searchParams))
        throw new HttpError(400, "Invalid application authorization request.");
      const s = await auth().api.getSession({ headers: req.headers });
      if (!s)
        return redirect(
          `${url.searchParams.get("entry") === "tester" ? "/testers" : "/"}?returnTo=${encodeURIComponent(url.pathname + url.search)}`,
        );
      const m = await activeSource(s.session.id);
      if (!m)
        throw new HttpError(
          403,
          "This account does not have active product MVP access. Use your tester account or contact the company team.",
        );
      await rateGuard(`product-sso:${m.id}`, 20, 60);
      await run(
        "DELETE FROM product_sso_grants WHERE COALESCE(token_expires,code_expires)<?",
        Date.now(),
      );
      const code = token();
      await run(
        `INSERT INTO product_sso_grants(code_hash,session_id,challenge,code_expires) VALUES (?,?,?,?)`,
        await digest(code),
        s.session.id,
        url.searchParams.get("code_challenge"),
        Date.now() + 60000,
      );
      const callback = new URL(PRODUCT_CALLBACK);
      callback.searchParams.set("code", code);
      callback.searchParams.set("state", url.searchParams.get("state")!);
      return redirect(callback.toString());
    }
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed.");
    if (req.headers.get("origin")) throw new HttpError(403, "Server-to-server endpoint.");
    if (operation === "token") {
      await rateGuard(
        `product-exchange:${req.headers.get("cf-connecting-ip") || "server"}`,
        100,
        60,
      );
      let b: Record<string, string>;
      try {
        b = JSON.parse(new TextDecoder().decode(await readLimited(req, 4096)));
      } catch {
        throw new HttpError(400, "Invalid authorization exchange.");
      }
      if (
        !b ||
        b.client_id !== PRODUCT_CLIENT ||
        b.redirect_uri !== PRODUCT_CALLBACK ||
        b.grant_type !== "authorization_code" ||
        !/^[a-f0-9]{64}$/.test(b.code || "") ||
        !/^[A-Za-z0-9._~-]{43,128}$/.test(b.code_verifier || "")
      )
        throw new HttpError(400, "Invalid authorization exchange.");
      const codeHash = await digest(b.code);
      const grant = await one<{ session_id: string; challenge: string }>(
        "SELECT session_id,challenge FROM product_sso_grants WHERE code_hash=? AND code_expires>? AND token_hash IS NULL",
        codeHash,
        Date.now(),
      );
      if (!grant || grant.challenge !== (await s256(b.code_verifier)))
        throw new HttpError(401, "Authorization expired or invalid.");
      const m = await activeSource(grant.session_id);
      if (!m) throw new HttpError(401, "Data Room session is no longer active.");
      const accessToken = token(),
        expires = Math.min(Date.now() + 43200000, m.expires);
      const used = await db()
        .prepare(
          "UPDATE product_sso_grants SET token_hash=?,token_expires=? WHERE code_hash=? AND code_expires>? AND token_hash IS NULL RETURNING code_hash",
        )
        .bind(await digest(accessToken), expires, codeHash, Date.now())
        .first();
      if (!used) throw new HttpError(401, "Authorization already used.");
      return json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: Math.floor((expires - Date.now()) / 1000),
        audience: PRODUCT_CLIENT,
      });
    }
    if (["introspect", "revoke", "activity", "heartbeat"].includes(operation || "")) {
      const bearer = req.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
      if (!bearer) throw new HttpError(401, "Application session required.");
      const hash = await digest(bearer);
      if (operation === "revoke") {
        await run("DELETE FROM product_sso_grants WHERE token_hash=?", hash);
        return json({ ok: true });
      }
      const grant = await one<{ session_id: string; token_expires: number }>(
        "SELECT session_id,token_expires FROM product_sso_grants WHERE token_hash=? AND token_expires>?",
        hash,
        Date.now(),
      );
      const m = grant && (await activeSource(grant.session_id));
      if (!m || !grant) return json({ active: false }, 401);
      if (operation === "activity" || operation === "heartbeat") {
        if (m.role !== "tester")
          return json({
            ignored: true,
            reason: "Founder usage is excluded from tester analytics.",
          });
        let input: unknown;
        try {
          input = JSON.parse(new TextDecoder().decode(await readLimited(req, 16384)));
        } catch {
          throw new HttpError(400, "Invalid usage payload.");
        }
        return json(
          operation === "activity"
            ? await ingestTesterEvents(m.id, input)
            : await recordHeartbeat(m.id, input),
        );
      }
      return json({
        active: true,
        audience: PRODUCT_CLIENT,
        expires_at: grant.token_expires,
        user: { id: m.id, name: m.name, email: m.email, role: m.role },
      });
    }
    throw new HttpError(404, "Endpoint not found.");
  } catch (e) {
    return json(
      {
        error: e instanceof HttpError ? e.message : "Data Room sign-in is temporarily unavailable.",
      },
      e instanceof HttpError ? e.status : 503,
    );
  }
}
