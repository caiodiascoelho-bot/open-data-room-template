import { z } from "zod";
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Invalid calendar date",
  );
export const email = z
  .string()
  .email()
  .max(254)
  .transform((v) => v.trim().toLowerCase());
export const password = z.string().min(12).max(128);
export const interviewInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z
      .string()
      .trim()
      .pipe(z.union([z.literal(""), email]))
      .default(""),
    company: z.string().max(120).default(""),
    date: dateString,
    segment: z.string().max(100).default(""),
    insights: z.string().trim().min(1).max(12000),
    problem: z.string().max(5000).default(""),
    next_step: z.string().max(3000).default(""),
    stage: z.enum(["inbox", "signal", "action"]).default("inbox"),
    priority: z.enum(["green", "yellow", "red"]).default("yellow"),
    published: z.boolean().default(false),
    public_summary: z.string().max(5000).default(""),
  })
  .refine(
    (v) => !v.published || v.public_summary.trim().length > 0,
    "Add a sanitized investor summary before publishing",
  );
export const eventInput = z.object({
  title: z.string().trim().min(1).max(150),
  date: dateString,
  description: z.string().max(3000).default(""),
  kind: z.enum(["launch", "milestone", "research", "fundraising"]).default("milestone"),
  published: z.boolean().default(false),
});
export const thesisInput = z.object({
  kind: z.enum(["problem", "icp", "idea", "pivot", "traction"]),
  title: z.string().trim().min(1).max(150),
  body: z.string().trim().min(1).max(12000),
  status: z.enum(["hypothesis", "testing", "validated", "retired"]).default("hypothesis"),
  published: z.boolean().default(false),
});
export const metricInput = z.object({
  eventId: z.string().min(8).max(150),
  date: dateString,
  free: z.number().int().min(0).max(1e9),
  paid: z.number().int().min(0).max(1e9),
  revenueCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  mrrCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  source: z.literal("company-platform"),
  timezone: z.literal("America/New_York"),
  asOf: z.string().datetime(),
});
export function weekStart(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}
export function percentageChange(current: number, previous: number) {
  return previous === 0 ? null : ((current - previous) / previous) * 100;
}
export function calendarCells(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) =>
    new Date(Date.UTC(year, month, 1 - offset + i)).toISOString().slice(0, 10),
  );
}
export type Interview = Omit<z.infer<typeof interviewInput>, "email" | "company"> & {
  id: string;
  number: number;
  updated_at: string;
  email?: string;
  company?: string;
};
export const outreachContactInput = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).default(""),
  practice: z.string().trim().max(160).default(""),
  specialty: z.string().trim().max(120).default(""),
  relationship: z.string().trim().max(500).default(""),
  status: z.enum(["referred", "contacted", "scheduled", "converted", "paused"]).default("referred"),
  next_step: z.string().trim().max(1000).default(""),
  notes: z.string().trim().max(5000).default(""),
});
export type OutreachContact = z.infer<typeof outreachContactInput> & {
  id: string;
  updated_at: string;
};
export type Milestone = z.infer<typeof eventInput> & { id: string };
export type Metric = {
  date: string;
  free: number;
  paid: number;
  revenue_cents: number;
  mrr_cents: number;
  source: string;
  timezone: string;
  as_of: string;
  received_at: string;
};
export type Doc = {
  id: string;
  title: string;
  category: string;
  version: number;
  notes: string;
  size: number;
  published: number;
  created_at: string;
};
export type Thesis = z.infer<typeof thesisInput> & { id: string; created_at: string };
export type Member = { id: string; name: string; email: string; title: string; status: string };
export type Message = {
  id: string;
  name: string;
  email: string;
  page: string;
  body: string;
  created_at: string;
  status: string;
};
export type Share = {
  id: string;
  label: string;
  expires_at: string | null;
  revoked: number;
  created_at: string;
};
export type Activity = {
  id: string;
  action: string;
  entity_id: string;
  title: string;
  created_at: string;
};
export type RoomData = {
  testerSummary?: {
    registered: number;
    activated: number;
    returning: number;
    lastSync: string | null;
  } | null;
  activities: Activity[];
  interviews: Interview[];
  outreachContacts?: OutreachContact[];
  events: Milestone[];
  metrics: Metric[];
  documents: Doc[];
  theses: Thesis[];
  members: Member[];
  messages: Message[];
  shares: Share[];
  updatedAt: string;
};

// Internal operations: these contracts never enter the investor room payload.
export const taskStatus = z.enum(["todo", "in_progress", "paused", "resolved"]);
export const taskPriority = z.enum(["high", "medium", "low"]);
export const taskInput = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(10000).default(""),
    status: taskStatus.default("todo"),
    priority: taskPriority.default("medium"),
  })
  .strict();
export const taskUpdate = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(10000).optional(),
    status: taskStatus.optional(),
    priority: taskPriority.optional(),
    version: z.number().int().positive(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== "version"), "No changes supplied");
export const taskNoteInput = z
  .object({
    version: z.number().int().positive(),
    body: z.string().trim().min(1).max(5000),
  })
  .strict();
export const taskStepInput = z
  .object({
    version: z.number().int().positive(),
    label: z.string().trim().min(1).max(300),
  })
  .strict();
export const taskStepUpdate = z
  .object({
    version: z.number().int().positive(),
    completed: z.boolean().optional(),
    remove: z.literal(true).optional(),
  })
  .strict()
  .refine((v) => (v.completed !== undefined) !== (v.remove === true), "Choose one action");
export type TaskStatus = z.infer<typeof taskStatus>;
export type TaskPriority = z.infer<typeof taskPriority>;
export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  step_count: number;
  completed_count: number;
  note_count: number;
};
export type TaskStep = { id: string; label: string; completed: number };
export type TaskListItem = Task & { steps: TaskStep[] };
export type TaskDetail = {
  task: Task;
  steps: TaskStep[];
  notes: { id: string; body: string; author: string; created_at: string }[];
};
