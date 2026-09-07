# INRLIQUID

Indian-market trading infrastructure with a fast, exchange-style UX and real integration boundaries.

## Trading surface

INRLIQUID now models a Hyperliquid-style trading terminal for Indian cash equities: market and limit orders, GTC/IOC/ALO time-in-force, post-only, reduce-only, stop-market, stop-limit, take-market, take-limit, TP/SL, parent-linked OCO semantics, scale orders, TWAP configuration, amend/cancel, live order books, positions, open orders, and a UPI payment hub.

Hyperliquid documents these order concepts and TP/SL behavior in its trading documentation. INRLIQUID uses the UX/order-model ideas but does **not** copy Hyperliquid's crypto-perpetual margin, liquidation, funding, or short-selling mechanics into Indian cash equities. citehttps://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types

## Real execution only

There is no paper trading, fake fill, simulated balance, or demo settlement path. Until a real regulated execution provider is configured, order endpoints fail closed with `503 EXECUTION_UNAVAILABLE`.

## UPI payment hub

The payment layer supports funding, settlement, withdrawal and fee intents through a provider adapter. Provider webhooks must be authenticated, idempotent and reconciled before any cash ledger entry is posted.

## Repository layout

```text
apps/web             Next.js trading terminal
apps/api             Fastify API and order/payment routes
packages/domain      Shared order, TP/SL, book, position and payment contracts
packages/adapters    Live provider contracts
packages/ui          Shared UI primitives
infra/               PostgreSQL + Redis local infrastructure
infra/db             Cash, holdings, orders and payment ledger schema
docs/                Architecture, parity and launch decisions
.github/workflows/   CI
```

## Important regulatory boundary

This repository is software infrastructure, not a claim of authorization to operate a stock exchange, broker, clearing member, depository, payment system, or custodian. The actual production operating model must use the appropriate regulated entities and approved integrations. UPI-only UX does not by itself remove statutory onboarding, AML, securities, custody, or broker obligations.

## Development

Requirements: Node.js 22+, pnpm 10+.

```bash
pnpm install
pnpm dev
```

For local infrastructure:

```bash
docker compose -f infra/docker-compose.yml up -d
```

Never commit secrets, provider credentials, signing keys, customer data, or production connection strings.
