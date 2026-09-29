CREATE TABLE IF NOT EXISTS `campaigns` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `name` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `archived_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_campaigns_owner` ON `campaigns` (`owner_id`,`archived_at`);
--> statement-breakpoint
INSERT OR IGNORE INTO `campaigns` (`id`, `owner_id`, `name`, `created_at`, `updated_at`, `archived_at`)
SELECT
  cs.`owner_id`,
  cs.`owner_id`,
  'Campanha principal',
  COALESCE(u.`created_at`, cs.`updated_at`),
  cs.`updated_at`,
  NULL
FROM `campaign_states` cs
LEFT JOIN `users` u ON u.`id` = cs.`owner_id`;
