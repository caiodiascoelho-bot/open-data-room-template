CREATE TABLE `investor_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`viewer_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`share_label` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`label` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `investor_activity_time_idx` ON `investor_activity` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `investor_activity_viewer_idx` ON `investor_activity` (`viewer_id`,`action`,`target`,`created_at`);