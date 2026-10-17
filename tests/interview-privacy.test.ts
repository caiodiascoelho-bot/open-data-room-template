import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { type Interview, interviewInput } from "../lib/contracts";
import { investorInterview } from "../lib/server/interview-privacy";

describe("interview privacy", () => {
  const original: Interview = {
    ...interviewInput.parse({
      name: "Morgan Taylor",
      email: "researchg@example.test",
      company: "Najak Studio",
      date: "2026-10-05",
      insights: "Private raw notes",
      public_summary:
        "Morgan needs reminders. Taylor works at Najak Studio. Contact researchg@example.test or another@example.test.",
      segment: "Morgan — product teams",
      published: true,
    }),
    id: "synthetic-interview",
    number: 7,
    updated_at: "2026-10-05T12:00:00Z",
  };
  it("allows only anonymous investor fields and redacts copied identities", () => {
    const safe = investorInterview({ ...original, created_by: "secret-admin" } as Interview);
    expect(safe.name).toBe("Interview #7");
    expect(safe.insights).toBe(
      "[private] needs reminders. [private] works at [private]. Contact [private] or [private]",
    );
    expect(safe.segment).toBe("[private] — product teams");
    expect(safe).not.toHaveProperty("email");
    expect(safe).not.toHaveProperty("company");
    expect(safe).not.toHaveProperty("created_by");
    expect(JSON.stringify(safe)).not.toContain("Private raw notes");
    expect(original.name).toBe("Morgan Taylor");
  });
  it("keeps ordinary insights readable and escapes identity regex characters", () => {
    const safe = investorInterview({
      ...original,
      name: "Li Chen",
      company: "A+B (Product)",
      public_summary: "Records need a reliable billing flow. A+B (Product) agrees.",
      segment: "Users",
    });
    expect(safe.insights).toBe("Records need a reliable billing flow. [private] agrees.");
    expect(safe.segment).toBe("Users");
  });
  it("normalizes repeated spaces and does not redact its own placeholders twice", () => {
    const safe = investorInterview({
      ...original,
      name: "Private   Person",
      company: "Product   Co",
      public_summary: "Private Person at Product Co needs help.",
    });
    expect(safe.insights).toBe("[private] at [private] needs help.");
  });
  it("validates optional private emails without making old interviews invalid", () => {
    const data = { name: "Interviewee", date: "2026-10-05", insights: "Evidence" };
    expect(interviewInput.parse(data).email).toBe("");
    expect(interviewInput.parse({ ...data, email: "  PERSON@EXAMPLE.TEST  " }).email).toBe(
      "person@example.test",
    );
    expect(interviewInput.safeParse({ ...data, email: "invalid" }).success).toBe(false);
  });
  it("backfills permanent numbers without changing stored interviews", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec("PRAGMA foreign_keys=ON");
      for (const file of [
        "0000_nappy_snowbird",
        "0001_burly_mephistopheles",
        "0002_bent_gambit",
        "0003_always_investor_password",
        "0004_wise_havok",
      ])
        db.exec(readFileSync(`drizzle/${file}.sql`, "utf8"));
      const insert = db.prepare(
        "INSERT INTO interviews(id,name,date,insights,updated_at,created_by) VALUES(?,?,?,'Private notes','2026-10-05','admin')",
      );
      insert.run("first", "First person", "2026-10-05");
      insert.run("second", "Second person", "2026-01-01");
      const before = db.prepare("SELECT * FROM interviews ORDER BY rowid").all();
      db.exec(readFileSync("drizzle/0005_steep_justin_hammer.sql", "utf8"));
      expect(db.prepare("SELECT * FROM interviews ORDER BY rowid").all()).toEqual(
        before.map((r) => ({ ...r, email: "" })),
      );
      expect(db.prepare("SELECT * FROM interview_numbers ORDER BY number").all()).toEqual([
        { number: 1, interview_id: "first" },
        { number: 2, interview_id: "second" },
      ]);
      db.exec(
        "UPDATE interviews SET date='2025-01-01',published=1,stage='signal' WHERE id='first'",
      );
      expect(
        db.prepare("SELECT number FROM interview_numbers WHERE interview_id='first'").get()?.number,
      ).toBe(1);
      insert.run("third", "Third person", "2024-01-01");
      db.exec("INSERT INTO interview_numbers(interview_id) VALUES('third')");
      expect(
        db.prepare("SELECT number FROM interview_numbers WHERE interview_id='third'").get()?.number,
      ).toBe(3);
      expect(() =>
        db.exec("INSERT INTO interview_numbers(interview_id) VALUES('third')"),
      ).toThrow();
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });
});
