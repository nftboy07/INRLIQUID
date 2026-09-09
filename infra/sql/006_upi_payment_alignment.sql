ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS wallet_id UUID;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS provider_payment_id TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS settlement_amount_minor BIGINT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS settlement_currency CHAR(3);
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS client_secret TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS deposit_address TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS payment_url TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS asset TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS network TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS vpa TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS upi_flow TEXT;

UPDATE payment_intents SET provider = COALESCE(provider, 'razorpay') WHERE provider IS NULL;
UPDATE payment_intents SET payment_method = COALESCE(payment_method, 'UPI') WHERE payment_method IS NULL;

ALTER TABLE payment_intents DROP CONSTRAINT IF EXISTS payment_intents_provider_check;
ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_provider_check CHECK (provider IN ('razorpay','razorpayx','stripe','crypto'));

ALTER TABLE payment_intents DROP CONSTRAINT IF EXISTS payment_intents_method_check;
ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_method_check CHECK (payment_method IN ('UPI','CARD','CRYPTO'));

ALTER TABLE payment_intents DROP CONSTRAINT IF EXISTS payment_intents_upi_flow_check;
ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_upi_flow_check CHECK (upi_flow IS NULL OR upi_flow IN ('collect','intent','link'));

CREATE INDEX IF NOT EXISTS payment_intents_vpa_created ON payment_intents(vpa, created_at DESC) WHERE vpa IS NOT NULL;
