# Broker Order Reconciliation

INRLIQUID treats broker webhooks as the low-latency state path and broker REST reconciliation as the recovery path.

## Why both paths exist

Upstox sends order updates to the configured webhook endpoint, but a production trading system must also recover from webhook delivery failures, process restarts, transient provider errors, and ambiguous order submissions. Upstox exposes order history and an order-trades endpoint specifically for retrieving execution state and individual fills.

## Reconciliation command

Build the API and run:

```bash
pnpm --filter @inrliquid/api build
pnpm --filter @inrliquid/api reconcile
```

The worker:

1. finds active Upstox-linked customer accounts;
2. checks locally non-terminal orders (`UNKNOWN`, `PENDING`, `OPEN`, `PARTIALLY_FILLED`);
3. reads the provider order history;
4. advances the local order state from provider state;
5. records a deduplicated reconciliation event;
6. reads all provider trades for the order; and
7. inserts each provider trade into `trade_fills` using `(order_id, provider_trade_id)` idempotency.

Run this as a short-interval scheduled job in production. The command is deliberately not exposed as a public HTTP endpoint.

## Safety properties

- Customer broker tokens remain encrypted at rest.
- Reconciliation is scoped to the customer account selected by the local broker account row.
- Trade inserts are idempotent.
- Provider state is authoritative for recovery from ambiguous local state.
- Webhook processing remains the fast path; reconciliation is a repair path.
- A reconciliation failure for one customer is logged and does not prevent other customer accounts from being processed.

## Operational rule

Do not create a second broker order merely because the original order submission returned an ambiguous error. Reconcile the existing local `UNKNOWN` order against the provider before taking any retry action.
