ALTER TABLE withdrawal_beneficiaries
  ADD COLUMN IF NOT EXISTS provider_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING','ACTIVE','DISABLED','FAILED')),
  ADD COLUMN IF NOT EXISTS label TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_beneficiary_provider_unique
  ON withdrawal_beneficiaries(user_id, provider_fund_account_id);

CREATE INDEX IF NOT EXISTS withdrawal_beneficiaries_user_created
  ON withdrawal_beneficiaries(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS wallet_transactions_provider_reference
  ON wallet_transactions(provider, ((metadata->>'idempotencyKey')))
  WHERE metadata ? 'idempotencyKey';

CREATE INDEX IF NOT EXISTS payment_webhook_events_unprocessed
  ON payment_webhook_events(received_at)
  WHERE processed_at IS NULL;
