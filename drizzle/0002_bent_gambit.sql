ALTER TABLE `shares` ADD `code_lookup` text;--> statement-breakpoint
CREATE UNIQUE INDEX `shares_code_lookup_unique` ON `shares` (`code_lookup`);