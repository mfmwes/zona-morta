CREATE TABLE IF NOT EXISTS user_characters (
  user_id text NOT NULL,
  survivor_id text NOT NULL,
  campaign_id text NOT NULL,
  body text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  PRIMARY KEY (user_id, survivor_id)
);

CREATE INDEX IF NOT EXISTS idx_user_characters_user
  ON user_characters (user_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_user_characters_campaign
  ON user_characters (campaign_id);
