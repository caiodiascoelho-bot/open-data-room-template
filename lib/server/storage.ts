import { env } from "cloudflare:workers";
export function db() {
  if (!env.DB) throw new Error("Database is unavailable");
  return env.DB;
}
export async function rows<T>(sql: string, ...values: unknown[]) {
  const result = await db()
    .prepare(sql)
    .bind(...values)
    .all<T>();
  return result.results;
}
export async function one<T>(sql: string, ...values: unknown[]) {
  return db()
    .prepare(sql)
    .bind(...values)
    .first<T>();
}
export async function run(sql: string, ...values: unknown[]) {
  return db()
    .prepare(sql)
    .bind(...values)
    .run();
}
export function bucket() {
  if (!env.BUCKET) throw new Error("Document storage is unavailable");
  return env.BUCKET;
}
export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();
export async function digest(s: string | ArrayBuffer) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        typeof s === "string" ? new TextEncoder().encode(s) : s,
      ),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function token() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function logAudit(actor: string, action: string, entity: string) {
  await run(
    "INSERT INTO audit (id,actor_id,action,entity_id,created_at) VALUES (?,?,?,?,?)",
    id(),
    actor,
    action,
    entity,
    now(),
  );
}
export async function rateGuard(key: string, max = 10, seconds = 900) {
  const k = await digest(key);
  const t = Date.now();
  await run("DELETE FROM guards WHERE expires>0 AND expires<?", t - 86400000);
  const r = await db()
    .prepare(
      "INSERT INTO guards(key,value,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET value=CASE WHEN expires<? THEN 1 ELSE value+1 END, expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END RETURNING value",
    )
    .bind(k, t + seconds * 1000, t, t)
    .first<{ value: number }>();
  if (!r || r.value > max) throw new HttpError(429, "Too many attempts. Please try again later.");
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function readLimited(req: Request, max: number) {
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new HttpError(413, "Request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
export async function authRate(req: Request) {
  const ip = req.headers.get("cf-connecting-ip");
  if (ip) await rateGuard(`auth-ip:${ip}`, 60, 900);
  await rateGuard("auth-global", 500, 300);
}
