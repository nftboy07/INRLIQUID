ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS asset TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS network TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS client_secret TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS deposit_address TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS payment_url TEXT;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS amount_minor BIGINT;
ALTER TABLE payment_intents DROP CONSTRAINT IF EXISTS payment_intents_status_check;
ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_status_check CHECK (status IN ('CREATED','PENDING','PROCESSING','SUCCEEDED','COMPLETED','FAILED','CANCELED','EXPIRED','REQUIRES_ACTION'));
ALTER TABLE payment_intents DROP CONSTRAINT IF EXISTS payment_intents_provider_check;
ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_provider_check CHECK (provider IN ('razorpay','razorpayx','stripe','crypto'));

CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_provider_payment_unique
  ON payment_intents(provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS crypto_deposits (
  id UUID PRIMARY KEY,
  payment_intent_id UUID NOT NULL REFERENCES payment_intents(id),
  user_id UUID NOT NULL,
  asset TEXT NOT NULL,
  network TEXT NOT NULL,
  deposit_address TEXT NOT NULL,
  tx_hash TEXT,
  amount_atomic NUMERIC(78,0),
  confirmations INTEGER NOT NULL DEFAULT 0 CHECK (confirmations >= 0),
  required_confirmations INTEGER NOT NULL DEFAULT 12 CHECK (required_confirmations > 0),
  status TEXT NOT NULL CHECK (status IN ('AWAITING_PAYMENT','DETECTED','CONFIRMED','UNDERPAID','OVERPAID','EXPIRED','REVERSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS crypto_deposits_tx_unique ON crypto_deposits(network, tx_hash) WHERE tx_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS crypto_deposits_address_idx ON crypto_deposits(deposit_address, network, status);
