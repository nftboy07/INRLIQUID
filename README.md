# INRLIQUID

Indian-market trading infrastructure with a fast, exchange-style UX and real integration boundaries.

## Product direction

INRLIQUID is designed around three principles:

- **Real execution only**: no paper trading, fake fills, simulated balances, or demo settlement in production code.
- **UPI-native funding**: UPI is the preferred user payment rail where supported by the regulated payment/broker stack.
- **Regulated execution boundary**: the application does not pretend to be an exchange, clearing member, broker, depository, or payment provider. Those capabilities are integrated through explicit adapters.

## Repository layout

```text
apps/web             Next.js trading UI
apps/api             Fastify API
packages/domain      Shared domain types and validation
packages/adapters    Broker, market-data, UPI and identity interfaces
packages/ui          Shared UI primitives
infra/               Deployment and local infrastructure notes
docs/                Architecture and compliance decisions
.github/workflows/   CI
```

## Important

This repository contains **integration-ready application code**, not a claim of regulatory authorization. Live securities trading in India requires the appropriate regulated entities, exchange connectivity, custody/settlement arrangements, KYC/AML controls, and payment rails. Credentials and provider-specific implementations must be supplied only after those relationships are established.

## Development

Requirements: Node.js 22+, pnpm 10+.

```bash
pnpm install
pnpm dev
```

The local application exposes provider interfaces and can be developed against contract tests without fabricating trade execution results.

## Environment

Copy `.env.example` to `.env.local`. Never commit secrets, signing keys, broker credentials, UPI credentials, or customer data.
