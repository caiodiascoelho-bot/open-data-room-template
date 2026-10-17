CREATE TABLE `interview_numbers` (
	`number` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`interview_id` text NOT NULL,
	FOREIGN KEY (`interview_id`) REFERENCES `interviews`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interview_numbers_interview_id_unique` ON `interview_numbers` (`interview_id`);--> statement-breakpoint
ALTER TABLE `interviews` ADD `email` text DEFAULT '' NOT NULL;
--> statement-breakpoint
-- Assign existing records once in original insertion order; later edits never renumber them.
INSERT INTO `interview_numbers` (`interview_id`) SELECT `id` FROM `interviews` ORDER BY rowid;
