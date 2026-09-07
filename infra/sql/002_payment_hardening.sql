ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS asset TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS network TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS client_secret TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS deposit_address TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS payment_url TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS quoted_rate NUMERIC(30,12);
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS provider_fee_minor BIGINT;

ALTER TABLE payment_intents DROP CONSTRAINT IF EXISTS payment_intents_status_check;
ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_status_check CHECK (status IN ('CREATED','PENDING','PROCESSING','SUCCEEDED','FAILED','CANCELED','REQUIRES_ACTION'));

CREATE INDEX IF NOT EXISTS payment_intents_provider_status ON payment_intents(provider,status,created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_transactions_provider_status ON wallet_transactions(provider,status,created_at DESC);
