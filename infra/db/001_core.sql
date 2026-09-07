CREATE TABLE users (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE instruments (
  id BIGSERIAL PRIMARY KEY,
  exchange TEXT NOT NULL CHECK (exchange IN ('NSE','BSE')),
  symbol TEXT NOT NULL,
  isin TEXT,
  UNIQUE (exchange, symbol)
);

CREATE TABLE orders (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  provider_order_id TEXT,
  client_order_id TEXT,
  exchange TEXT NOT NULL CHECK (exchange IN ('NSE','BSE')),
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  order_type TEXT NOT NULL CHECK (order_type IN ('MARKET','LIMIT','STOP_MARKET','STOP_LIMIT','TAKE_MARKET','TAKE_LIMIT','SCALE','TWAP')),
  quantity BIGINT NOT NULL CHECK (quantity > 0),
  limit_price_paise BIGINT,
  trigger_price_paise BIGINT,
  reduce_only BOOLEAN NOT NULL DEFAULT false,
  time_in_force TEXT NOT NULL DEFAULT 'GTC',
  status TEXT NOT NULL DEFAULT 'PENDING',
  parent_order_id UUID REFERENCES orders(id),
  oco_group_id UUID,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_events (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  event_type TEXT NOT NULL,
  provider_event_id TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(order_id, provider_event_id)
);

CREATE TABLE cash_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  amount_paise BIGINT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('CREDIT','DEBIT')),
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE holdings_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  quantity BIGINT NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payment_intents (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  provider_payment_id TEXT,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  purpose TEXT NOT NULL CHECK (purpose IN ('TRADING_FUNDING','WITHDRAWAL','SETTLEMENT','FEES')),
  status TEXT NOT NULL DEFAULT 'CREATED',
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX orders_user_status_idx ON orders(user_id, status);
CREATE INDEX order_events_order_idx ON order_events(order_id, created_at);
CREATE INDEX cash_ledger_user_idx ON cash_ledger(user_id, created_at);
CREATE INDEX holdings_user_symbol_idx ON holdings_ledger(user_id, exchange, symbol, created_at);
