CREATE TABLE `flashcards` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`kind` text NOT NULL,
	`japanese` text NOT NULL,
	`reading` text DEFAULT '' NOT NULL,
	`romaji` text DEFAULT '' NOT NULL,
	`english` text NOT NULL,
	`lesson_id` text,
	`vocab_id` text,
	`generation_id` text,
	`segment_id` text,
	`pile` integer DEFAULT 1 NOT NULL,
	`review_count` integer DEFAULT 0 NOT NULL,
	`reviewed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `flashcards_key_unique` ON `flashcards` (`key`);--> statement-breakpoint
CREATE INDEX `flashcards_pile_idx` ON `flashcards` (`pile`);