import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  role: text("role"),
  banned: integer("banned", { mode: "boolean" }),
  banReason: text("banReason"),
  banExpires: integer("banExpires", { mode: "timestamp_ms" }),
});
export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonatedBy"),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);
export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);
export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);
export const rateLimit = sqliteTable("rateLimit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("lastRequest").notNull(),
});
export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  email: text("email").unique().notNull(),
  name: text("name").notNull(),
  title: text("title").notNull().default("Administrator"),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
});
export const productSsoGrants = sqliteTable("product_sso_grants", {
  codeHash: text("code_hash").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => session.id, { onDelete: "cascade" }),
  challenge: text("challenge").notNull(),
  codeExpires: integer("code_expires").notNull(),
  tokenHash: text("token_hash").unique(),
  tokenExpires: integer("token_expires"),
});
export const interviews = sqliteTable(
  "interviews",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().default(""),
    company: text("company").notNull().default(""),
    date: text("date").notNull(),
    segment: text("segment").notNull().default(""),
    insights: text("insights").notNull(),
    problem: text("problem").notNull().default(""),
    nextStep: text("next_step").notNull().default(""),
    stage: text("stage").notNull().default("inbox"),
    priority: text("priority").notNull().default("yellow"),
    published: integer("published").notNull().default(0),
    publicSummary: text("public_summary").notNull().default(""),
    updatedAt: text("updated_at").notNull(),
    createdBy: text("created_by").notNull(),
  },
  (t) => [index("interview_date_idx").on(t.date)],
);
export const outreachContacts = sqliteTable(
  "outreach_contacts",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    phone: text("phone").notNull().default(""),
    practice: text("practice").notNull().default(""),
    specialty: text("specialty").notNull().default(""),
    relationship: text("relationship").notNull().default(""),
    status: text("status").notNull().default("referred"),
    nextStep: text("next_step").notNull().default(""),
    notes: text("notes").notNull().default(""),
    updatedAt: text("updated_at").notNull(),
    createdBy: text("created_by").notNull(),
  },
  (t) => [index("outreach_status_idx").on(t.status)],
);
// Separate sequence preserves interview labels even if records are ever removed.
export const interviewNumbers = sqliteTable("interview_numbers", {
  number: integer("number").primaryKey({ autoIncrement: true }),
  interviewId: text("interview_id")
    .notNull()
    .unique()
    .references(() => interviews.id, { onDelete: "restrict" }),
});
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    date: text("date").notNull(),
    description: text("description").notNull().default(""),
    kind: text("kind").notNull().default("milestone"),
    published: integer("published").notNull().default(0),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("events_date_idx").on(t.date)],
);
export const metrics = sqliteTable("metrics", {
  date: text("date").primaryKey(),
  free: integer("free").notNull(),
  paid: integer("paid").notNull(),
  revenueCents: integer("revenue_cents").notNull(),
  mrrCents: integer("mrr_cents").notNull(),
  source: text("source").notNull(),
  timezone: text("timezone").notNull(),
  asOf: text("as_of").notNull(),
  receivedAt: text("received_at").notNull(),
});
export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  version: integer("version").notNull(),
  notes: text("notes").notNull().default(""),
  objectKey: text("object_key").notNull().unique(),
  size: integer("size").notNull(),
  sha256: text("sha256").notNull(),
  published: integer("published").notNull().default(0),
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by").notNull(),
});
export const theses = sqliteTable("theses", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("hypothesis"),
  published: integer("published").notNull().default(0),
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by").notNull(),
});
export const shares = sqliteTable("shares", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  codeLookup: text("code_lookup").unique(),
  label: text("label").notNull(),
  expiresAt: text("expires_at").notNull(),
  neverExpires: integer("never_expires").notNull().default(0),
  revoked: integer("revoked").notNull().default(0),
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by").notNull(),
});
export const viewers = sqliteTable("viewers", {
  id: text("id").primaryKey(),
  sessionHash: text("session_hash").notNull().unique(),
  shareId: text("share_id")
    .notNull()
    .references(() => shares.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  authorId: text("author_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  page: text("page").notNull(),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
  status: text("status").notNull().default("unread"),
});
export const audit = sqliteTable("audit", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  entityId: text("entity_id").notNull(),
  createdAt: text("created_at").notNull(),
});
export const integrationEvents = sqliteTable("integration_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: text("received_at").notNull(),
});
export const guards = sqliteTable("guards", {
  key: text("key").primaryKey(),
  value: integer("value").notNull(),
  expires: integer("expires").notNull(),
});

export const investorActivity = sqliteTable(
  "investor_activity",
  {
    id: text("id").primaryKey(),
    viewerId: text("viewer_id").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    shareLabel: text("share_label").notNull(),
    action: text("action").notNull(),
    target: text("target").notNull(),
    label: text("label").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("investor_activity_time_idx").on(t.createdAt, t.id),
    index("investor_activity_viewer_idx").on(t.viewerId, t.action, t.target, t.createdAt),
  ],
);

// Admin-only operations. Intentionally no published flag or viewer projection.
export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("todo"),
    priority: text("priority").notNull().default("medium"),
    version: integer("version").notNull().default(1),
    mutation_id: text("mutation_id").notNull(),
    created_by: text("created_by").notNull(),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (t) => [index("tasks_updated_idx").on(t.updated_at)],
);
export const taskNotes = sqliteTable(
  "task_notes",
  {
    id: text("id").primaryKey(),
    task_id: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    author_id: text("author_id").notNull(),
    created_at: text("created_at").notNull(),
  },
  (t) => [index("task_notes_task_idx").on(t.task_id)],
);
export const taskSteps = sqliteTable(
  "task_steps",
  {
    id: text("id").primaryKey(),
    task_id: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    completed: integer("completed").notNull().default(0),
    created_at: text("created_at").notNull(),
  },
  (t) => [index("task_steps_task_idx").on(t.task_id)],
);

export const productTesters = sqliteTable("product_testers", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  organization: text("organization").notNull(),
  status: text("status").notNull().default("active"),
  stage: text("stage").notNull().default("New"),
  excluded: integer("excluded").notNull().default(0),
  notes: text("notes").notNull().default(""),
  version: integer("version").notNull().default(1),
  consentAt: text("consent_at").notNull(),
  createdAt: text("created_at").notNull(),
  lastHeartbeat: integer("last_heartbeat").notNull().default(0),
  heartbeatClaim: text("heartbeat_claim").notNull().default(""),
});
export const productTesterVisits = sqliteTable(
  "product_tester_visits",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => productTesters.userId, { onDelete: "cascade" }),
    startedAt: text("started_at").notNull(),
    lastAt: text("last_at").notNull(),
    heartbeatAt: integer("heartbeat_at").notNull().default(0),
    page: text("page").notNull().default(""),
    tab: text("tab").notNull().default(""),
    sequence: integer("sequence").notNull().default(0),
    active: integer("active").notNull().default(0),
    heartbeatClaim: text("heartbeat_claim").notNull().default(""),
  },
  (t) => [index("product_visits_owner_idx").on(t.userId, t.startedAt)],
);
export const productTesterEvents = sqliteTable(
  "product_tester_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => productTesters.userId, { onDelete: "cascade" }),
    visitId: text("visit_id")
      .notNull()
      .references(() => productTesterVisits.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    value: text("value").notNull(),
    occurredAt: text("occurred_at").notNull(),
    receivedAt: text("received_at").notNull(),
    fingerprint: text("fingerprint").notNull(),
  },
  (t) => [index("product_events_owner_idx").on(t.userId, t.occurredAt)],
);
export const productTesterPages = sqliteTable(
  "product_tester_pages",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => productTesters.userId, { onDelete: "cascade" }),
    page: text("page").notNull(),
    activeMs: integer("active_ms").notNull().default(0),
    views: integer("views").notNull().default(0),
    lastAt: text("last_at").notNull(),
  },
  (t) => [index("product_pages_owner_idx").on(t.userId)],
);
