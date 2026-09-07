CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  client_order_id TEXT NOT NULL,
  exchange TEXT NOT NULL CHECK (exchange IN ('NSE','BSE')),
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  order_type TEXT NOT NULL CHECK (order_type IN ('MARKET','LIMIT')),
  quantity NUMERIC(30,8) NOT NULL CHECK (quantity > 0),
  limit_price_paise BIGINT,
  status TEXT NOT NULL CHECK (status IN ('PENDING','ACCEPTED','PARTIALLY_FILLED','FILLED','CANCELLED','REJECTED')),
  broker_order_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, client_order_id)
);

CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  reference_type TEXT NOT NULL,
  reference_id UUID NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  amount_paise BIGINT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('CREDIT','DEBIT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  purpose TEXT NOT NULL CHECK (purpose IN ('TRADING_FUNDING','SETTLEMENT')),
  status TEXT NOT NULL CHECK (status IN ('CREATED','PENDING','AUTHORIZED','SUCCEEDED','FAILED','EXPIRED')),
  provider_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX orders_user_created_idx ON orders(user_id, created_at DESC);
CREATE INDEX ledger_user_created_idx ON ledger_entries(user_id, created_at DESC);
