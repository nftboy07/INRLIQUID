CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_request_hash TEXT;
CREATE INDEX IF NOT EXISTS orders_user_status_created ON orders(user_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS broker_accounts_provider_user ON broker_accounts(provider,provider_account_id,user_id);
