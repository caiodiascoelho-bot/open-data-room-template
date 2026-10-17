CREATE TABLE `product_sso_grants` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`challenge` text NOT NULL,
	`code_expires` integer NOT NULL,
	`token_hash` text,
	`token_expires` integer,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_sso_grants_token_hash_unique` ON `product_sso_grants` (`token_hash`);