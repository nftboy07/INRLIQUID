CREATE TABLE IF NOT EXISTS upstox_oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS upstox_oauth_states_expiry ON upstox_oauth_states(expires_at);

ALTER TABLE broker_accounts ADD COLUMN IF NOT EXISTS refresh_token_encrypted TEXT;
