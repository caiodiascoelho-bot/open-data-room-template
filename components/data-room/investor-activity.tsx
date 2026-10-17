"use client";
import { Eye, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client/api";

type Entry = {
  id: string;
  name: string;
  email: string;
  share_label: string;
  action: string;
  target: string;
  label: string;
  created_at: string;
};
export default function InvestorActivity() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const load = useCallback(async (after?: string) => {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ items: Entry[]; next: string | null }>(
        `investor-activity${after ? `?before=${encodeURIComponent(after)}` : ""}`,
      );
      setEntries((previous) => (after ? [...previous, ...r.items] : r.items));
      setCursor(r.next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load activity.");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const visible = entries.filter((x) =>
    `${x.name} ${x.email} ${x.label} ${x.share_label}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Investor activity</h2>
          <p>Private to administrators · Pages and items accessed, with timestamps.</p>
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => load()}>
          <RefreshCw size={14} />
          Refresh
        </Button>
      </div>
      <div style={{ padding: "0 24px 20px" }}>
        <Input
          aria-label="Search loaded investor activity"
          placeholder="Search name, email or content…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {busy && !entries.length ? (
        <div
          className="skeleton-box"
          role="status"
          aria-label="Loading investor activity"
          style={{ height: 220, margin: 24 }}
        />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Investor</th>
                <th>Viewed</th>
                <th>Action</th>
                <th>Time · New York</th>
                <th>Access link</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => (
                <tr key={e.id}>
                  <td>
                    <strong>{e.name}</strong>
                    <br />
                    <span className="small muted">{e.email}</span>
                  </td>
                  <td>{e.label}</td>
                  <td>{e.action.replaceAll("_", " ")}</td>
                  <td>
                    {new Date(e.created_at).toLocaleString("en-US", {
                      timeZone: "America/New_York",
                    })}
                  </td>
                  <td>{e.share_label}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && (
            <div className="empty-state">
              <Eye />
              <h3>No investor activity yet.</h3>
              <p>Accesses will appear here when invited investors explore the room.</p>
            </div>
          )}
        </div>
      )}
      <div style={{ padding: 24 }}>
        {cursor && (
          <Button disabled={busy} variant="outline" onClick={() => load(cursor)}>
            {busy ? "Loading…" : "Load older activity"}
          </Button>
        )}
        <p className="small muted" style={{ marginTop: 12 }}>
          Records show content accessed, not proof that it was read. Repeated access to the same
          item within one minute is grouped. Names and emails are supplied by each visitor.
        </p>
      </div>
    </section>
  );
}
