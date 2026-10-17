CREATE TABLE `outreach_contacts` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `phone` text DEFAULT '' NOT NULL,
  `practice` text DEFAULT '' NOT NULL,
  `specialty` text DEFAULT '' NOT NULL,
  `relationship` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'referred' NOT NULL,
  `next_step` text DEFAULT '' NOT NULL,
  `notes` text DEFAULT '' NOT NULL,
  `updated_at` text NOT NULL,
  `created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `outreach_status_idx` ON `outreach_contacts` (`status`);
