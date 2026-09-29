CREATE TABLE `campaign_players` (
	`owner_id` text NOT NULL,
	`email` text NOT NULL,
	`user_id` text,
	`survivor_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `email`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_campaign_players_character` ON `campaign_players` (`owner_id`,`survivor_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_campaign_players_user` ON `campaign_players` (`owner_id`,`user_id`);