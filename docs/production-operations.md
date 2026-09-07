# INRLIQUID production operations

## Runtime topology

- Put the API behind a managed TLS reverse proxy/load balancer.
- Do not expose PostgreSQL to the public internet.
- Expose only the web application and HTTPS API externally.
- Keep broker/payment/crypto credentials server-side only.
- Run the API as a non-root container user.

## Database

The API startup runs the versioned SQL migrations before starting Fastify. Migration execution uses a PostgreSQL advisory lock and records a checksum in `schema_migrations` so two replicas cannot apply the same migration concurrently and modified historical migrations are rejected.

For production PostgreSQL:

- enable automated backups and point-in-time recovery;
- test restoration regularly;
- use encryption at rest and in transit;
- restrict database credentials to the API and migration job;
- monitor connection pool saturation and transaction latency.

## Trading safety

The local order row is created before broker submission. Client order IDs are unique per user, ambiguous broker errors are represented as `UNKNOWN`, and provider order updates are deduplicated into `order_events`.

Upstox order updates can arrive through its webhook or portfolio WebSocket. The webhook handler must remain publicly reachable and should not be protected by application authentication; provider/account/order correlation is performed from the payload and local broker-account mapping. See the Upstox developer documentation for the provider's current webhook requirements.

Never treat an accepted order as a filled order. Only provider execution updates may move an order to a filled state.

## Payments and withdrawals

RazorpayX payout requests must use stable idempotency keys for retries. Webhooks are at-least-once and can arrive out of order, so wallet state transitions are terminal-state aware and deduplicated. Keep webhook endpoints fast and return 2xx only after the event has been safely recorded/processed.

## Secrets

Use a managed secret store in production. Required secret classes include:

- application authentication secret;
- database credentials;
- broker OAuth client secret and token-encryption key;
- payment provider secrets and webhook secrets;
- crypto gateway credentials and webhook secret.

Rotate secrets without exposing them in source control, client bundles, logs, error messages, or analytics payloads.

## Network and abuse controls

The application should sit behind a WAF/reverse proxy with:

- TLS termination;
- request-size limits;
- per-IP and per-user rate limits;
- bot/abuse controls;
- restricted administrative endpoints;
- access logging with request IDs.

Trading, withdrawal, beneficiary creation, OAuth, and webhook endpoints deserve stricter limits than read-only market-data endpoints.

## Observability

Collect structured logs and metrics for:

- request latency/error rate;
- order submission latency and ambiguous submissions;
- provider rejects and authentication failures;
- order-event lag and reconciliation failures;
- wallet ledger transitions;
- payment/payout webhook failures and replay counts;
- database pool usage;
- migration version;
- CPU, memory and restart counts.

Alert on stuck `PENDING`/`UNKNOWN` orders, unexplained wallet ledger discrepancies, repeated provider authentication failures, webhook processing failures, and database connectivity loss.

## Launch gate

Passing CI and migrations is not evidence of regulatory approval, broker approval, payment-provider approval, KYC/AML completion, or permission to offer live financial services. Those external launch gates must be evidenced separately before customer funds or live orders are enabled.
