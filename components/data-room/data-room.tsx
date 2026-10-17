"use client";
import { ArrowRight, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { type FormEvent, lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client/api";
import { loginReturn } from "@/lib/client/login-return";

const Workspace = lazy(() => import("./workspace"));
export type Identity = { role: "admin" | "viewer"; name: string; email: string; id: string };
export function Loading() {
  return (
    <div className="page-loading" role="status" aria-label="Loading your data room">
      <div className="skeleton-box" style={{ height: 35, width: 240 }} />
      <div className="loading-cards">
        {[1, 2, 3, 4].map((x) => (
          <div key={x} className="skeleton-box" />
        ))}
      </div>
      <div className="skeleton-box" style={{ height: 280 }} />
      <span className="muted">Loading your data room…</span>
    </div>
  );
}
export function DataRoom() {
  const logout = useCallback(() => setUser(null), []);
  const [user, setUser] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("login");
  const [token, setToken] = useState("");
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("invite")) {
      setMode("activate");
      setToken(q.get("invite") || "");
    }
    if (q.get("share") || q.get("investor")) {
      setMode("viewer");
      setToken(q.get("share") || "");
    }
    api<{ user: Identity | null }>("session")
      .then((x) => {
        const next = loginReturn(location.search);
        if (x.user?.role === "admin" && next) location.assign(next);
        else setUser(x.user);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (mode === "activate" && data.password !== data.confirm)
        throw new Error("Passwords do not match.");
      await api(mode === "login" ? "login" : mode === "viewer" ? "viewer-session" : "activate", {
        method: "POST",
        body: JSON.stringify({ ...data, token: mode === "activate" ? token : undefined }),
      });
      if (mode === "activate") {
        setMode("login");
        history.replaceState({}, "", "/");
        setToken("");
        setSuccess("Account activated. Sign in with your new password.");
      } else {
        const s = await api<{ user: Identity | null }>("session");
        const next = loginReturn(location.search);
        if (s.user?.role === "admin" && next) {
          location.assign(next);
          return;
        }
        setUser(s.user);
        history.replaceState({}, "", "/");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  if (user)
    return (
      <Suspense fallback={<Loading />}>
        <Workspace user={user} onLogout={logout} />
      </Suspense>
    );
  return (
    <main className="login-page">
      <div className="login-top">
        <span>COMPANY / PRIVATE WORKSPACE</span>
        <ShieldCheck size={17} />
      </div>
      <section className="login-panel reveal">
        <img className="login-symbol" src="/brand/symbol_white.svg" alt="" />
        <img className="login-wordmark" src="/brand/wordmark_white.svg" alt="company" />
        <h1>
          {mode === "activate"
            ? "Make it yours."
            : mode === "viewer"
              ? "A closer look."
              : "data room"}
        </h1>
        <p>
          {mode === "activate"
            ? "Create your password to activate your invitation."
            : mode === "viewer"
              ? "Private access to the story behind company."
              : "The evidence behind what we build."}
        </p>
        {mode !== "activate" && (
          <div className="login-modes" role="group" aria-label="Choose login environment">
            <button
              type="button"
              aria-pressed={mode === "login"}
              onClick={() => {
                setMode("login");
                setError("");
                setSuccess("");
              }}
            >
              Team log in
            </button>
            <button
              type="button"
              aria-pressed={mode === "viewer"}
              onClick={() => {
                setMode("viewer");
                setError("");
                setSuccess("");
              }}
            >
              Investor log in
            </button>
          </div>
        )}
        <form className="login-form" onSubmit={submit}>
          {mode === "viewer" && (
            <label className="field" htmlFor="login-name">
              <span>Full name</span>
              <div className="login-input">
                <Input id="login-name" name="name" autoComplete="name" required maxLength={100} />
                <UserRound />
              </div>
            </label>
          )}
          <label className="field" htmlFor="login-email">
            <span>Email address</span>
            <div className="login-input">
              <Input
                id="login-email"
                name="email"
                type="email"
                placeholder="you@company.com"
                autoComplete="username"
                required
              />
              <UserRound />
            </div>
          </label>
          <label className="field" htmlFor="login-password">
            <span>{mode === "viewer" ? "Investor password · 18 characters" : "Password"}</span>
            <div className="login-input">
              <Input
                id="login-password"
                name="password"
                type="password"
                minLength={mode === "activate" ? 12 : mode === "viewer" ? 18 : 1}
                maxLength={mode === "viewer" ? 18 : 128}
                autoComplete={mode === "activate" ? "new-password" : "current-password"}
                required
              />
              <LockKeyhole />
            </div>
          </label>
          {mode === "activate" && (
            <label className="field" htmlFor="login-confirm">
              <span>Confirm password · at least 12 characters</span>
              <div className="login-input">
                <Input
                  id="login-confirm"
                  name="confirm"
                  type="password"
                  minLength={12}
                  autoComplete="new-password"
                  required
                />
                <LockKeyhole />
              </div>
            </label>
          )}
          {success && (
            <div className="success-box" role="status">
              {success}
            </div>
          )}
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          <Button className="login-submit" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "activate"
                ? "Create password"
                : mode === "viewer"
                  ? "Enter data room"
                  : "Sign in"}
            {!busy && <ArrowRight size={16} />}
          </Button>
        </form>
        <p style={{ marginTop: 24 }}>
          {mode === "viewer"
            ? "Private access. Page and document access is recorded for the company team."
            : "Invitation-only access."}
        </p>
      </section>
      <footer className="login-bottom">
        <span>BUILT BY DOERS. FOR DOERS.</span>
        <span>© {new Date().getFullYear()} COMPANY</span>
      </footer>
    </main>
  );
}
