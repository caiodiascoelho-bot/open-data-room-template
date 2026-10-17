import { describe, expect, it } from "vitest";
import {
  calendarCells,
  dateString,
  email,
  eventInput,
  interviewInput,
  metricInput,
  outreachContactInput,
  password,
  percentageChange,
  taskInput,
  taskNoteInput,
  taskStepInput,
  taskStepUpdate,
  taskUpdate,
  thesisInput,
  weekStart,
} from "../lib/contracts";

describe("real metric contracts", () => {
  const sample = {
    eventId: "snapshot-1",
    date: "2026-09-29",
    free: 0,
    paid: 0,
    revenueCents: 0,
    mrrCents: 0,
    source: "company-platform",
    timezone: "America/New_York",
    asOf: "2026-09-30T02:00:00Z",
  };
  it("keeps a measured zero and rejects fabricated source labels", () => {
    expect(metricInput.parse(sample).free).toBe(0);
    expect(metricInput.safeParse({ ...sample, source: "demo" }).success).toBe(false);
    expect(metricInput.safeParse({ ...sample, free: -1 }).success).toBe(false);
    expect(metricInput.safeParse({ ...sample, paid: 1.2 }).success).toBe(false);
    expect(metricInput.safeParse({ ...sample, date: "2026-02-30" }).success).toBe(false);
  });
  it("requires complete snapshots", () => {
    expect(metricInput.safeParse({ ...sample, paid: undefined }).success).toBe(false);
    expect(metricInput.safeParse({ ...sample, timezone: "UTC" }).success).toBe(false);
    expect(metricInput.safeParse({ ...sample, asOf: "tomorrow" }).success).toBe(false);
    expect(metricInput.safeParse({ ...sample, eventId: "" }).success).toBe(false);
  });
  it("does not report infinite growth from a zero base", () => {
    expect(percentageChange(4, 0)).toBeNull();
    expect(percentageChange(0, 0)).toBeNull();
    expect(percentageChange(6, 3)).toBe(100);
    expect(percentageChange(2, 4)).toBe(-50);
    expect(percentageChange(3, 3)).toBe(0);
  });
});
describe("calendar boundaries", () => {
  it("uses Monday across month and year boundaries", () => {
    expect(weekStart("2026-01-01")).toBe("2025-12-29");
    expect(weekStart("2026-09-28")).toBe("2026-09-28");
    expect(weekStart("2026-10-04")).toBe("2026-09-28");
  });
  it("renders six complete weeks including leap day", () => {
    const d = calendarCells(2028, 1);
    expect(d).toHaveLength(42);
    expect(d[0]).toBe("2028-01-31");
    expect(d).toContain("2028-02-29");
    expect(d.at(-1)).toBe("2028-03-12");
    expect(new Set(d).size).toBe(42);
  });
  it("validates actual calendar dates", () => {
    expect(dateString.safeParse("2024-02-29").success).toBe(true);
    for (const value of ["2025-02-29", "2026-13-01", "2026-1-1", "not-a-date"])
      expect(dateString.safeParse(value).success).toBe(false);
  });
});
describe("discovery publication", () => {
  const item = { name: "Customer", date: "2026-09-29", insights: "Observed friction" };
  it("requires a sanitized public summary", () => {
    expect(interviewInput.safeParse({ ...item, published: true }).success).toBe(false);
    expect(
      interviewInput.safeParse({ ...item, published: true, public_summary: "  " }).success,
    ).toBe(false);
    expect(
      interviewInput.parse({ ...item, published: true, public_summary: "An anonymized finding" })
        .published,
    ).toBe(true);
  });
  it("defaults new evidence to private", () => {
    expect(interviewInput.parse(item)).toMatchObject({
      published: false,
      stage: "inbox",
      priority: "yellow",
      company: "",
      next_step: "",
    });
    expect(interviewInput.safeParse({ ...item, name: " " }).success).toBe(false);
    expect(interviewInput.safeParse({ ...item, stage: "approved" }).success).toBe(false);
    expect(interviewInput.safeParse({ ...item, priority: "blue" }).success).toBe(false);
  });
  it("keeps outreach separate from evidence and validates its workflow", () => {
    expect(outreachContactInput.parse({ name: "Dr. Example" })).toMatchObject({
      status: "referred",
      notes: "",
      next_step: "",
    });
    expect(
      outreachContactInput.safeParse({ name: "Dr. Example", status: "validated" }).success,
    ).toBe(false);
    expect(outreachContactInput.safeParse({ name: " " }).success).toBe(false);
  });
  it("validates event and thesis input", () => {
    expect(eventInput.parse({ title: "Launch", date: "2026-09-29" }).published).toBe(false);
    expect(eventInput.safeParse({ title: "", date: "2026-09-29" }).success).toBe(false);
    expect(
      thesisInput.parse({
        kind: "problem",
        title: "Current hypothesis",
        body: "Needs customer evidence",
      }).status,
    ).toBe("hypothesis");
    expect(thesisInput.safeParse({ kind: "unknown", title: "A", body: "B" }).success).toBe(false);
  });
  it("normalizes identity and enforces password length", () => {
    expect(email.parse("OWNER@COMPANY.AI")).toBe("owner@company.ai");
    expect(password.safeParse("short").success).toBe(false);
    expect(password.safeParse("a".repeat(129)).success).toBe(false);
    expect(password.safeParse("a".repeat(12)).success).toBe(true);
  });
});

describe("private task contracts", () => {
  it("validates task text, stages and priorities without accepting publication or forged ownership", () => {
    expect(taskInput.parse({ title: "  Launch  " })).toEqual({
      title: "Launch",
      description: "",
      status: "todo",
      priority: "medium",
    });
    for (const extra of [
      { published: true },
      { created_by: "intruder" },
      { status: "done" },
      { priority: "urgent" },
      { title: " " },
    ])
      expect(taskInput.safeParse({ title: "Launch", ...extra }).success).toBe(false);
    expect(taskInput.safeParse({ title: "x".repeat(161) }).success).toBe(false);
    expect(taskUpdate.safeParse({ version: 1 }).success).toBe(false);
    expect(taskUpdate.safeParse({ version: 0, status: "resolved" }).success).toBe(false);
    expect(taskUpdate.parse({ version: 2, status: "paused" })).toEqual({
      version: 2,
      status: "paused",
    });
  });
  it("requires meaningful notes and checklist steps and explicit completion/removal", () => {
    expect(taskNoteInput.safeParse({ version: 1, body: " " }).success).toBe(false);
    expect(taskStepInput.safeParse({ version: 1, label: " " }).success).toBe(false);
    expect(taskNoteInput.safeParse({ version: 1, body: "Note", author_id: "forged" }).success).toBe(
      false,
    );
    expect(taskStepUpdate.parse({ version: 1, completed: false }).completed).toBe(false);
    expect(taskStepUpdate.parse({ version: 1, remove: true }).remove).toBe(true);
    expect(taskStepUpdate.safeParse({ version: 1 }).success).toBe(false);
    expect(taskStepUpdate.safeParse({ version: 1, remove: true, completed: true }).success).toBe(
      false,
    );
    expect(taskStepUpdate.safeParse({ version: 1, completed: "true" }).success).toBe(false);
  });
});
