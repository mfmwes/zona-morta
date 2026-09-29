CREATE TABLE `campaign_states` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`body` text NOT NULL,
	`updated_at` text NOT NULL
);
