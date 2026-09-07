ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_provider_event_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS orders_open_by_user ON orders(user_id, status) WHERE status IN ('PENDING','OPEN','PARTIALLY_FILLED');
CREATE INDEX IF NOT EXISTS orders_provider_order ON orders(provider_order_id) WHERE provider_order_id IS NOT NULL;
