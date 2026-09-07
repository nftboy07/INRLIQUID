# INRLIQUID live-launch runbook

## Technical work completed

- Production authentication gate is enabled; development user headers must remain disabled in production.
- Payment webhooks use raw-body signature verification and event deduplication.
- Wallet deposits and withdrawals use database transactions and row locking.
- Withdrawal funds remain locked while a provider request is ambiguous and are reconciled through payout webhooks.
- Crypto funding requires provider-backed INR settlement; the application does not use a fixed USD/INR conversion.
- Upstox V3 execution and market-data adapters fail closed for unsupported order styles.
- Trading persistence/reconciliation schema is installed by `infra/sql/003_trading_ledger.sql` for broker accounts, orders, order events and fills.

## External launch gates

These cannot be manufactured in code and must be completed by the operator/company:

1. Establish the legal entity and obtain professional Indian securities/regulatory advice for the intended business model.
2. Obtain the required SEBI/regulatory registrations and relationships for the exact services offered. A broker API account does not itself make the application a registered stock broker.
3. Establish clearing/settlement/depository arrangements required by the chosen operating model.
4. Complete KYC/AML, sanctions, grievance, record-retention and customer-protection processes.
5. If the product performs VDA services for customers, obtain the applicable FIU-IND/PMLA operating approval/registration and compliance program before live VDA flows.
6. Execute production agreements with the selected broker, payment provider, payout provider and crypto settlement provider.
7. Create production provider applications and credentials; store secrets only in the deployment secret manager.
8. Configure provider webhooks on a public HTTPS endpoint and verify signatures before accepting live money.
9. Complete provider sandbox/certification testing, including duplicate/out-of-order webhook delivery and payout reversal cases.
10. Configure production PostgreSQL backups, point-in-time recovery, monitoring, alerting, log retention and incident response.
11. Complete an independent security review covering authentication, authorization, secrets, webhook verification, SQL access, rate limiting, abuse controls and deployment configuration.
12. Complete a controlled internal-money test followed by a restricted pilot before opening the product to customers.

## Provider-specific notes

### Upstox

Use a customer-specific broker authorization/account model if INRLIQUID will serve multiple independent customers. Do not share one operator access token across customers. Reconcile order updates through Upstox order-update streaming/webhooks and persist every state transition.

### RazorpayX

Configure payout webhooks for pending/queued/initiated/processed/reversed states. Keep the internal transaction reference as the provider reference/idempotency value and deduplicate provider events.

### Crypto

Use a contracted provider that explicitly supports the intended Indian settlement model. Do not enable customer crypto funding merely because a generic API endpoint exists. Require provider-confirmed settlement and reconcile confirmations, transaction hashes, underpayments, overpayments and terminal failures.

## Final release decision

The application may be marked **software production-ready** after CI passes and all migration/security tests pass. It may be marked **live customer-ready** only after every external launch gate above has been evidenced and `/ready` returns HTTP 200 with real production credentials.
