CREATE TABLE `product_tester_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`visit_id` text NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`occurred_at` text NOT NULL,
	`received_at` text NOT NULL,
	`fingerprint` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `product_testers`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`visit_id`) REFERENCES `product_tester_visits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_events_owner_idx` ON `product_tester_events` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `product_tester_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`page` text NOT NULL,
	`active_ms` integer DEFAULT 0 NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`last_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `product_testers`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_pages_owner_idx` ON `product_tester_pages` (`user_id`);--> statement-breakpoint
CREATE TABLE `product_tester_visits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`started_at` text NOT NULL,
	`last_at` text NOT NULL,
	`heartbeat_at` integer DEFAULT 0 NOT NULL,
	`page` text DEFAULT '' NOT NULL,
	`tab` text DEFAULT '' NOT NULL,
	`sequence` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `product_testers`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_visits_owner_idx` ON `product_tester_visits` (`user_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `product_testers` (
	`user_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`organization` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`stage` text DEFAULT 'New' NOT NULL,
	`excluded` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`consent_at` text NOT NULL,
	`created_at` text NOT NULL,
	`last_heartbeat` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
