CREATE TABLE IF NOT EXISTS broker_accounts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REAUTH_REQUIRED','DISABLED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_account_id),
  UNIQUE(user_id, provider)
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  broker_account_id UUID REFERENCES broker_accounts(id),
  client_order_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_order_id TEXT,
  exchange TEXT NOT NULL CHECK (exchange IN ('NSE','BSE')),
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  order_type TEXT NOT NULL,
  quantity NUMERIC(24,8) NOT NULL CHECK (quantity > 0),
  limit_price NUMERIC(24,8),
  trigger_price NUMERIC(24,8),
  time_in_force TEXT NOT NULL DEFAULT 'GTC',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','OPEN','PARTIALLY_FILLED','FILLED','CANCELED','REJECTED','EXPIRED','UNKNOWN')),
  filled_quantity NUMERIC(24,8) NOT NULL DEFAULT 0,
  average_fill_price NUMERIC(24,8),
  rejection_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, client_order_id),
  UNIQUE(provider, provider_order_id)
);
CREATE INDEX IF NOT EXISTS orders_user_created ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_provider_status ON orders(provider, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS order_events (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider_event_id TEXT,
  event_type TEXT NOT NULL,
  provider_status TEXT,
  filled_quantity NUMERIC(24,8),
  average_fill_price NUMERIC(24,8),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_event_id)
);
CREATE INDEX IF NOT EXISTS order_events_order_created ON order_events(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS trade_fills (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  provider_trade_id TEXT,
  quantity NUMERIC(24,8) NOT NULL CHECK (quantity > 0),
  price NUMERIC(24,8) NOT NULL CHECK (price > 0),
  fee_paise BIGINT NOT NULL DEFAULT 0 CHECK (fee_paise >= 0),
  executed_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(order_id, provider_trade_id)
);
CREATE INDEX IF NOT EXISTS trade_fills_order_executed ON trade_fills(order_id, executed_at DESC);
