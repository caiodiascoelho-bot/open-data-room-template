import { z } from "zod";
export const testerStages = [
  "New",
  "Testing",
  "Feedback received",
  "Follow-up",
  "Archived",
] as const;
export const mvpPages = [
  "Overview",
  "Schedule",
  "User view",
  "Records",
  "Treatment plans",
  "Follow-up",
  "Finance",
  "Inbox",
  "Tasks",
  "Reports",
  "Integrations",
  "Team & settings",
  "Support",
] as const;
export const mvpActions = [
  "role",
  "record",
  "intake",
  "insurance",
  "preference",
  "note",
  "plan",
  "planStage",
  "appointment",
  "moveAppointment",
  "appointmentStatus",
  "confirm",
  "complete",
  "payment",
  "claim",
  "task",
  "taskCheck",
  "message",
  "messageOwner",
  "invite",
  "userRole",
  "profile",
  "subscription",
  "automation",
  "integrationTest",
  "support",
  "practiceSettings",
  "demographics",
  "simulation",
  "reset",
] as const;
export const testerRegistration = z
  .object({
    name: z.string().trim().min(2).max(100),
    phone: z
      .string()
      .trim()
      .min(7)
      .max(30)
      .regex(/^[+()\d .-]+$/)
      .refine((x) => x.replace(/\D/g, "").length >= 7),
    email: z
      .string()
      .email()
      .max(254)
      .transform((x) => x.toLowerCase().trim()),
    organization: z.string().trim().min(2).max(120),
    password: z.string().min(12).max(128),
    consent: z.literal(true),
  })
  .strict();
export const testerLogin = z
  .object({ email: z.string().email().max(254), password: z.string().min(1).max(128) })
  .strict();
export const testerEdit = z
  .object({
    id: z.string().min(1).max(100),
    version: z.number().int().positive(),
    stage: z.enum(testerStages),
    notes: z.string().trim().max(5000),
    excluded: z.boolean(),
    status: z.enum(["active", "revoked"]),
  })
  .strict();
export const usageEvent = z
  .object({
    id: z.string().min(20).max(120),
    visitId: z.string().regex(/^[a-f0-9]{64}$/),
    kind: z.enum(["start", "action"]),
    value: z.string().max(50),
    occurredAt: z.string().datetime(),
  })
  .strict()
  .superRefine((x, c) => {
    if (x.kind === "action" && !mvpActions.includes(x.value as (typeof mvpActions)[number]))
      c.addIssue({ code: "custom", message: "Unknown action" });
    if (x.kind === "start" && x.value !== "workspace")
      c.addIssue({ code: "custom", message: "Invalid start event" });
  });
export const heartbeat = z
  .object({
    visitId: z.string().regex(/^[a-f0-9]{64}$/),
    page: z.enum(mvpPages),
    tab: z.string().uuid(),
    sequence: z.number().int().positive().max(1000000),
    active: z.boolean(),
  })
  .strict();
export type TesterSummary = {
  registered: number;
  activated: number;
  returning: number;
  lastSync: string | null;
};
export type TesterRow = {
  user_id: string;
  name: string;
  email: string;
  phone: string;
  organization: string;
  status: string;
  stage: (typeof testerStages)[number];
  notes: string;
  excluded: number;
  version: number;
  created_at: string;
  consent_at: string;
  visits: number;
  actions: number;
  active_ms: number;
  last_at: string | null;
  top_page: string | null;
};
export type TesterDetail = {
  tester: TesterRow;
  pages: { page: string; active_ms: number; views: number; last_at: string }[];
  visits: { id: string; started_at: string; last_at: string }[];
  events: { id: string; kind: string; value: string; occurred_at: string; received_at: string }[];
  limits: { visits: number; events: number };
};
