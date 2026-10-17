"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginReturn } from "@/lib/client/login-return";
export default function TesterPortal() {
  const [mode, setMode] = useState<"register" | "login">("register"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [eligible, setEligible] = useState(false);
  const go = () =>
    location.assign(
      loginReturn(location.search) || "https://product.example.com/auth/start?mode=tester",
    );
  useEffect(() => {
    fetch("/api/testers/session", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ eligible: boolean }>)
      .then((x) => setEligible(x.eligible))
      .catch(() => {});
  }, []);
  return (
    <main className="tester-portal">
      <section className="tester-story">
        <img src="/brand/wordmark_white.svg" alt="company" />
        <span className="eyebrow">PRODUCT MVP · EARLY ACCESS</span>
        <h1>
          A working practice.
          <br />A better way to test.
        </h1>
        <p>
          Explore a fictional product office. Move appointments, coordinate your team and experience
          the user’s view.
        </p>
        <div>
          <span>01 / Your own sandbox</span>
          <span>02 / Real workflows, fictional records</span>
          <span>03 / Help shape what comes next</span>
        </div>
        <small>
          Do not enter real record or payment information. External messages, integrations and
          payments are simulated.
        </small>
      </section>
      <section className="tester-form-panel">
        <span className="eyebrow">JOIN THE RESEARCH</span>
        <h2>
          {eligible
            ? "Welcome back."
            : mode === "register"
              ? "Try Product Workspace."
              : "Continue your test."}
        </h2>
        <p>
          This account gives access to the product MVP only. The private Data Room stays restricted
          to the company team.
        </p>
        {eligible ? (
          <Button onClick={go}>Open my MVP workspace →</Button>
        ) : (
          <>
            <div className="tester-auth-tabs">
              <button
                type="button"
                aria-pressed={mode === "register"}
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
              >
                Create tester account
              </button>
              <button
                type="button"
                aria-pressed={mode === "login"}
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
              >
                Sign in
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                setSuccess("");
                setBusy(true);
                const f = new FormData(e.currentTarget);
                const data: Record<string, unknown> = {
                  email: f.get("email"),
                  password: f.get("password"),
                };
                if (mode === "register")
                  Object.assign(data, {
                    name: f.get("name"),
                    phone: f.get("phone"),
                    organization: f.get("organization"),
                    consent: f.get("consent") === "on",
                  });
                try {
                  const r = await fetch(`/api/testers/${mode}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data),
                  });
                  const b = (await r.json()) as {
                    error?: string | { message: string };
                    message?: string;
                  };
                  if (!r.ok)
                    throw Error(
                      (typeof b.error === "string" ? b.error : b.error?.message) ||
                        b.message ||
                        "Unable to continue.",
                    );
                  if (mode === "register") {
                    setMode("login");
                    setSuccess("Account created. Sign in with the password you just chose.");
                  } else go();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Unable to continue.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {mode === "register" && (
                <>
                  <label htmlFor="tester-name">
                    Full name
                    <Input
                      id="tester-name"
                      name="name"
                      autoComplete="name"
                      required
                      minLength={2}
                      maxLength={100}
                    />
                  </label>
                  <label htmlFor="tester-phone">
                    Phone number
                    <Input
                      id="tester-phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      required
                      minLength={7}
                      maxLength={30}
                    />
                  </label>
                  <label htmlFor="tester-organization">
                    Organization or organization
                    <Input
                      id="tester-organization"
                      name="organization"
                      autoComplete="organization"
                      required
                      minLength={2}
                      maxLength={120}
                    />
                  </label>
                </>
              )}
              <label htmlFor="tester-email">
                Email
                <Input
                  id="tester-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  maxLength={254}
                />
              </label>
              <label htmlFor="tester-password">
                Password {mode === "register" && <small>· at least 12 characters</small>}
                <Input
                  id="tester-password"
                  name="password"
                  type="password"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  required
                  minLength={mode === "register" ? 12 : 1}
                  maxLength={128}
                />
              </label>
              {mode === "register" && (
                <label className="tester-consent">
                  <input name="consent" type="checkbox" required />
                  <span>
                    I agree to share my contact details, organization, sign-in sessions, pages
                    visited, completed actions and estimated active time with the company founders
                    for MVP research and follow-up. Message content and record notes are not
                    collected in analytics.
                  </span>
                </label>
              )}
              {error && (
                <p className="error-box" role="alert">
                  {error}
                </p>
              )}
              {success && (
                <p className="success-box" role="status">
                  {success}
                </p>
              )}
              <Button type="submit" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : mode === "register"
                    ? "Create tester account"
                    : "Sign in & open MVP"}
              </Button>
            </form>
          </>
        )}
        <p className="tester-privacy">
          Access lasts while your tester account is active. Synthetic practice changes are kept for
          48 hours; research usage and contact records remain available to the founders during the
          MVP study. Contact <a href="mailto:owner@example.com">owner@example.com</a> to request
          deletion or help accessing your account. Contact details are self-reported, not verified.
          No automatic password-recovery email is currently available.
        </p>
      </section>
    </main>
  );
}
