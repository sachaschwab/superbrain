CREATE TABLE `generation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`generation_id` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`current_phase` text DEFAULT 'queued' NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`message` text,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`generation_id`) REFERENCES `generations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `generation_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`generation_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`kind` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`characters` integer,
	`estimated_cost_usd` real,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`generation_id`) REFERENCES `generations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `generations` (
	`id` text PRIMARY KEY NOT NULL,
	`lesson_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`mode` text DEFAULT 'full' NOT NULL,
	`source_generation_id` text,
	`script_json` text,
	`validation_json` text,
	`config_snapshot` text NOT NULL,
	`llm_provider` text,
	`llm_model` text,
	`tts_provider` text,
	`tts_model` text,
	`audio_path` text,
	`transcript_path` text,
	`duration_seconds` real,
	`estimated_cost_usd` real,
	`error_message` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `generations_lesson_idx` ON `generations` (`lesson_id`);--> statement-breakpoint
CREATE TABLE `grammar_patterns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`explanation` text NOT NULL,
	`first_lesson_id` text NOT NULL,
	FOREIGN KEY (`first_lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`curriculum_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lessons_number_unique` ON `lessons` (`number`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vocabulary_items` (
	`id` text PRIMARY KEY NOT NULL,
	`japanese` text NOT NULL,
	`reading` text NOT NULL,
	`english` text NOT NULL,
	`first_lesson_id` text NOT NULL,
	FOREIGN KEY (`first_lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE no action
);
