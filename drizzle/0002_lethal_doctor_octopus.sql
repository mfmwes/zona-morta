PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_campaign_players` (
	`owner_id` text NOT NULL,
	`email` text NOT NULL,
	`user_id` text,
	`survivor_id` text,
	`created_at` text NOT NULL,
	`revoked_at` text,
	PRIMARY KEY(`owner_id`, `email`)
);
--> statement-breakpoint
INSERT INTO `__new_campaign_players`("owner_id", "email", "user_id", "survivor_id", "created_at") SELECT "owner_id", "email", "user_id", "survivor_id", "created_at" FROM `campaign_players`;--> statement-breakpoint
DROP TABLE `campaign_players`;--> statement-breakpoint
ALTER TABLE `__new_campaign_players` RENAME TO `campaign_players`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_campaign_players_character` ON `campaign_players` (`owner_id`,`survivor_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_campaign_players_user` ON `campaign_players` (`owner_id`,`user_id`);
