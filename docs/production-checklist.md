# Production checklist

INRLIQUID is **code-quality ready but launch-gated**. The API now fails closed when live providers are missing, and `/ready` exposes the remaining provider/auth readiness checks. Do not accept real customer money or orders until every applicable item below is independently verified.

## Code-quality gate

- [x] Typecheck passes in GitHub Actions.
- [x] Tests pass in GitHub Actions.
- [x] Production build passes in GitHub Actions.
- [x] Production bearer/cookie authentication is implemented; dev header is disabled by default.
- [x] Webhook signatures are verified before ledger changes.
- [x] Webhook event IDs are deduplicated.
- [x] Wallet balance changes use database transactions and row locks.
- [x] Crypto settlement requires a provider-supplied INR quote and final settled INR amount.
- [x] Fixed crypto-to-INR settlement rates are not accepted by the production crypto flow.
- [x] Crypto provider payments are canceled when database persistence fails or an idempotency race is detected.
- [x] INR withdrawals keep funds locked until provider confirmation; ambiguous provider failures are not auto-refunded.
- [x] Upstox V3 adapter supports live quote/order/cancel/modify primitives for supported equity order types.
- [x] Unsupported take-profit/TWAP/scale semantics fail closed instead of being silently mapped to an unsafe order type.
- [x] CI runs Node 22, pnpm install, typecheck, test and build.

## Regulated market access

- [ ] Establish the legal entity and obtain legal advice specific to the intended securities model.
- [ ] Contract with the appropriate SEBI-registered broker/exchange participants.
- [ ] Establish clearing, settlement and depository/custody arrangements.
- [ ] Confirm permitted order types, products, markets and client-money flows.
- [ ] Complete applicable exchange/broker technology certification.

## Identity and compliance

- [ ] Implement the identity/onboarding flow required by the regulated partner and applicable law.
- [ ] Implement AML, sanctions screening, risk controls and audit trails as required.
- [ ] Establish the applicable VDA/FIU-IND operating model for crypto conversion and settlement.
- [ ] Never infer that a successful crypto or UPI payment is equivalent to securities KYC or account opening.

## Crypto conversion

- [ ] Contract with an approved institutional crypto/VDA conversion or settlement provider.
- [ ] Configure `CRYPTO_GATEWAY_API_BASE_URL`, `CRYPTO_GATEWAY_API_KEY` and `CRYPTO_GATEWAY_WEBHOOK_SECRET` in a secret manager.
- [ ] Verify the provider returns an executable INR quote before the deposit address is shown.
- [ ] Verify final webhook settlement amount, rate, fee and blockchain transaction reference before INR credit.
- [ ] Reconcile crypto provider, blockchain, INR settlement and wallet ledger records.
- [ ] Test expired, underpaid, overpaid, duplicate and reorg/confirmation scenarios.

## UPI and INR withdrawals

- [ ] Contract with an authorized payment provider for the exact intended securities flow.
- [ ] Verify payment status server-to-server; never trust a client callback as proof of payment.
- [ ] Enforce idempotency and immutable payment/provider references.
- [ ] Verify beneficiary ownership and payout controls.
- [ ] Reconcile provider, bank, ledger and broker records.

## Trading

- [ ] Contract the live broker account and obtain the required API/app approval.
- [ ] Configure `UPSTOX_ACCESS_TOKEN` and a complete, verified instrument map, or replace the adapter with the contracted broker adapter.
- [ ] Validate symbol, exchange, side, quantity, price and product before submission.
- [ ] Persist the client order ID before an external submission.
- [ ] Handle retries without duplicate orders.
- [ ] Consume broker order updates and reconcile fills/positions.
- [ ] Implement the required per-user broker-account/OAuth model if INRLIQUID serves multiple independent customers.
- [ ] Fail closed when the provider is unavailable.

## Security and operations

- [ ] Secrets stored in a production secret manager; never commit provider keys.
- [ ] MFA/strong authentication for privileged operations.
- [ ] Rate limits and abuse detection.
- [ ] Structured audit logging with sensitive-data redaction.
- [ ] Database backups, restore drills and disaster recovery.
- [ ] Monitoring/alerting for payment, ledger and broker reconciliation failures.
- [ ] Independent security review before production launch.

## Launch gate

A provider being technically reachable is not sufficient. Production enablement requires the applicable regulatory, contractual, operational and security checks above to be signed off. The `/ready` endpoint is intentionally **not green** until database, production authentication, crypto conversion, fiat payments/withdrawals and broker/market-data configuration are all present.
