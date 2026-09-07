# Provider application checklist

## Securities / brokerage

- Choose the exact legal operating model: technology platform, authorized partner model, or regulated broker model.
- Obtain Indian securities counsel's written mapping of the intended services to the applicable registrations/relationships.
- Select a regulated broker/clearing/depository partner and execute the required commercial/API agreements.
- If multiple customers trade through the product, implement a customer-specific broker-account authorization model; do not use one operator access token for all customers.
- Complete provider sandbox/certification testing and obtain production API approval.

Upstox provides order-update WebSocket/postback mechanisms for order updates; these should be used for reconciliation rather than assuming a successful order submission means the order filled. citeturn0search7turn0search14

## Payments / banking

- Establish the company's production payment and payout account.
- Complete merchant/KYC onboarding with the payment provider.
- Configure HTTPS payment and payout webhooks.
- Configure webhook secrets and test duplicate/out-of-order events.
- Confirm production limits, settlement timing, refunds and dispute handling.

Razorpay recommends webhook-driven payout reconciliation, deduplication, and use of idempotency keys for payouts. citeturn0search3turn0search5

## VDA / crypto

- Decide whether INRLIQUID itself will perform VDA exchange/transfer/custody activities or whether a regulated/compliant provider will perform those functions.
- Obtain legal advice for the exact model and complete any applicable FIU-IND/PMLA registration and compliance obligations before customer VDA services.
- Contract a provider that can document the intended INR settlement flow, customer screening, transaction monitoring, confirmations, refunds and reconciliation.
- Never enable generic crypto funding merely by setting an API URL; production crypto requires an approved provider contract and operational controls.

FIU-IND guidance identifies exchange between VDA and fiat, VDA-to-VDA exchange, transfers, and custody/administration as covered activities when performed for others in business. citeturn0search48

## Identity / KYC

- Select an identity/KYC provider.
- Implement customer identity creation, verification, status, sanctions screening and audit trail.
- Issue application authentication tokens only after the identity service establishes the customer identity.
- Link each customer to exactly one internal user UUID and the appropriate provider accounts.
- Do not use `x-user-id` in production.

## Security / operations

- Use a managed secrets store.
- Restrict database access to the API/network layer.
- Enable PostgreSQL backups and point-in-time recovery.
- Add uptime, database, queue, webhook, payout and reconciliation alerts.
- Establish incident-response and key-rotation procedures.
- Perform an external penetration/security review before accepting customer money.
