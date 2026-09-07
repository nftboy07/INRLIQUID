CREATE TABLE IF NOT EXISTS wallet_accounts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  available_paise BIGINT NOT NULL DEFAULT 0 CHECK (available_paise >= 0),
  locked_paise BIGINT NOT NULL DEFAULT 0 CHECK (locked_paise >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY,
  wallet_id UUID NOT NULL REFERENCES wallet_accounts(id),
  type TEXT NOT NULL CHECK (type IN ('DEPOSIT','WITHDRAWAL','TRADE_DEBIT','TRADE_CREDIT','FEE','REVERSAL')),
  status TEXT NOT NULL CHECK (status IN ('PENDING','COMPLETED','FAILED','REVERSED')),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  provider TEXT,
  provider_transaction_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS wallet_provider_tx_unique ON wallet_transactions(provider, provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS wallet_transactions_wallet_created ON wallet_transactions(wallet_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  wallet_id UUID NOT NULL REFERENCES wallet_accounts(id),
  provider TEXT NOT NULL,
  provider_payment_id TEXT,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('UPI','CARD','CRYPTO')),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  settlement_amount_minor BIGINT,
  settlement_currency CHAR(3),
  status TEXT NOT NULL CHECK (status IN ('CREATED','PENDING','PROCESSING','SUCCEEDED','FAILED','CANCELED','REQUIRES_ACTION')),
  idempotency_key TEXT NOT NULL UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_provider_unique ON payment_intents(provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_intents_user_created ON payment_intents(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS withdrawal_beneficiaries (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  provider_fund_account_id TEXT NOT NULL,
  provider_contact_id TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('UPI','IMPS','NEFT','RTGS')),
  masked_destination TEXT NOT NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider_fund_account_id)
);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS payment_webhook_events_provider_type ON payment_webhook_events(provider, event_type, received_at DESC);
