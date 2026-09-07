# Production checklist

INRLIQUID must not accept live customer orders until every applicable item is completed and independently verified.

## Regulated market access

- [ ] Establish the legal entity and obtain legal advice specific to the intended securities model.
- [ ] Contract with the appropriate SEBI-registered broker/exchange participants.
- [ ] Establish clearing, settlement and depository/custody arrangements.
- [ ] Confirm permitted order types, products, markets and client-money flows.
- [ ] Complete applicable exchange/broker technology certification.

## Identity and compliance

- [ ] Implement the identity/onboarding flow required by the regulated partner and applicable law.
- [ ] Implement AML, sanctions screening, risk controls and audit trails as required.
- [ ] Never infer that a successful UPI payment is equivalent to securities KYC or account opening.

## UPI

- [ ] Contract with an authorized UPI/payment provider for the exact intended securities flow.
- [ ] Verify payment status server-to-server; never trust a client callback as proof of payment.
- [ ] Enforce idempotency and immutable payment/provider references.
- [ ] Reconcile provider, bank, ledger and broker records.

## Trading

- [ ] Connect only to the contracted live broker/exchange API.
- [ ] Validate symbol, exchange, side, quantity, price and product before submission.
- [ ] Persist the client order ID before an external submission.
- [ ] Handle retries without duplicate orders.
- [ ] Consume broker order updates and reconcile fills.
- [ ] Fail closed when the provider is unavailable.

## Security

- [ ] Secrets stored in a production secret manager.
- [ ] MFA/strong authentication for privileged operations.
- [ ] Rate limits and abuse detection.
- [ ] Structured audit logging with sensitive-data redaction.
- [ ] Database backups, restore drills and disaster recovery.
- [ ] Independent security review before production launch.

## Launch gate

A provider being technically reachable is not sufficient. Production enablement requires the applicable regulatory, contractual, operational and security checks above to be signed off.
