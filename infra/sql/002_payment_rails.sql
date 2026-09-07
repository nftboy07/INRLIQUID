CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  wallet_id UUID NOT NULL REFERENCES wallet_accounts(id),
  provider TEXT NOT NULL CHECK (provider IN ('razorpay','razorpayx','stripe','crypto')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('UPI','CARD','CRYPTO')),
  provider_payment_id TEXT,
  asset TEXT,
  network TEXT,
  amount_paise BIGINT,
  amount_minor BIGINT,
  settlement_amount_minor BIGINT,
  settlement_currency CHAR(3),
  status TEXT NOT NULL CHECK (status IN ('CREATED','PENDING','PROCESSING','SUCCEEDED','COMPLETED','FAILED','CANCELED','EXPIRED','REQUIRES_ACTION')),
  idempotency_key TEXT NOT NULL UNIQUE,
  client_secret TEXT,
  deposit_address TEXT,
  payment_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

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

CREATE UNIQUE INDEX IF NOT EXISTS crypto_deposits_tx_unique
  ON crypto_deposits(network, tx_hash)
  WHERE tx_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS crypto_deposits_address_idx
  ON crypto_deposits(deposit_address, network, status);
