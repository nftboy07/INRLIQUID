# Security policy

INRLIQUID handles software that may eventually interact with financial accounts and securities infrastructure. Security issues should be treated as high priority.

## Never commit

- API keys or access tokens
- Broker credentials
- UPI/payment secrets
- Private keys
- Database credentials
- Customer identity or financial data

## Design requirements

- Live execution must fail closed when a provider is unavailable.
- Every externally initiated money movement and order submission needs an idempotency strategy.
- Provider callbacks must be authenticated and replay-resistant.
- Ledger entries are append-only; corrections are compensating entries.
- Authorization must be checked server-side for every sensitive operation.
- Secrets must come from a production secret manager.

## Reporting

For a suspected vulnerability, do not publish exploit details in a public issue. Use the repository owner's private security-reporting mechanism once configured.
