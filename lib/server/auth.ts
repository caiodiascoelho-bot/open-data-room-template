import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { digest, HttpError, now, one } from "./storage";
export type Identity = { id: string; name: string; email: string; role: "admin" | "viewer" };
export function auth(capture?: (token: string) => void) {
  if (!env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL)
    throw new HttpError(503, "Private access is being configured. Please try again shortly.");
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), { provider: "sqlite", schema, transaction: false }),
    trustedOrigins: [env.BETTER_AUTH_URL],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ token }) => {
        if (!capture) throw new Error("Invitation delivery not configured");
        capture(token);
      },
    },
    session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: "database" },
    advanced: { useSecureCookies: env.BETTER_AUTH_URL.startsWith("https:") },
    plugins: [admin()],
  });
}
export async function identity(req: Request): Promise<Identity | null> {
  const s = await auth().api.getSession({ headers: req.headers });
  if (s) {
    const m = await one<{ id: string; email: string; name: string; status: string }>(
      "SELECT id,email,name,status FROM members WHERE id=?",
      s.user.id,
    );
    if (m?.status === "active") return { ...m, role: "admin" };
  }
  const cookie = req.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("company_viewer="))
    ?.slice(12);
  if (!cookie) return null;
  const v = await one<Identity>(
    "SELECT v.id,v.name,v.email FROM viewers v JOIN shares s ON s.id=v.share_id WHERE v.session_hash=? AND v.expires_at>? AND (s.never_expires=1 OR s.expires_at>?) AND s.revoked=0",
    await digest(cookie),
    now(),
    now(),
  );
  return v ? { ...v, role: "viewer" } : null;
}
export async function requireUser(req: Request, adminOnly = false) {
  const u = await identity(req);
  if (!u) throw new HttpError(401, "Sign in to continue.");
  if (adminOnly && u.role !== "admin")
    throw new HttpError(403, "This action is available to administrators only.");
  return u;
}
export function checkOrigin(req: Request) {
  const expected = env.BETTER_AUTH_URL;
  if (!expected || req.headers.get("origin") !== new URL(expected).origin)
    throw new HttpError(403, "Request origin is not allowed.");
}
