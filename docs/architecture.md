# INRLIQUID architecture

## Execution boundary

The application owns the user experience, order intent, portfolio views, and provider-independent domain model. Live execution is delegated to a configured regulated broker/execution provider through `BrokerAdapter`.

## Market data

`MarketDataAdapter` is separate from order execution so the UI can consume a reliable real-time market-data source without coupling it to order-routing code.

## UPI

`UpiAdapter` isolates payment-initiation behavior. Provider credentials, webhook verification, reconciliation, and bank/PSP integrations must be added only through approved production providers.

## No simulated execution

There is deliberately no simulator, paper wallet, fake matching engine, or hardcoded execution implementation in the repository.

## Security principles

- Never store provider secrets in source control.
- Treat every inbound webhook as untrusted until authenticated and replay-protected.
- Use idempotency keys for payment and order commands.
- Store monetary values as integer paise or a decimal money type, never binary floating-point in the ledger.
- Separate identity, order state, cash ledger, holdings ledger, and provider reconciliation state.
- Keep an immutable audit trail for order and money state transitions.
