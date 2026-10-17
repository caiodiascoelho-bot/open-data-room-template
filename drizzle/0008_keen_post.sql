ALTER TABLE `product_tester_visits` ADD `heartbeat_claim` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `product_testers` ADD `heartbeat_claim` text DEFAULT '' NOT NULL;