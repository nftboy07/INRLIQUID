# INRLIQUID Payment Rails

INRLIQUID uses one wallet ledger behind multiple provider rails. The frontend never credits the wallet directly.

## Rails

- Razorpay UPI collect (VPA): `POST /v1/wallet/deposits` with `flow=collect` and `vpa` (for example `name@paytm`, `name@ybl`, `name@oksbi`). Creates a provider collect request against that UPI ID. Paytm, PhonePe, and Google Pay are UPI apps addressed by VPA, not separate APIs.
- Razorpay UPI intent: same deposit endpoint with `flow=intent` (and optional `app=paytm|phonepe|gpay`). Returns a UPI URL plus app deep links. On S2S intent failure the adapter falls back to a Razorpay payment link rather than a fake fill.
- Razorpay checkout link / QR: `flow=link`.
- RazorpayX withdrawals: beneficiary creation, fund accounts, payout creation and payout webhooks.
- Stripe Card: `POST /v1/payments/stripe/intents` with `method=STRIPE_CARD`. The web hub confirms the PaymentIntent through Stripe Elements. Wallet credit still waits for `payment_intent.succeeded`.
- Stripe UPI: same Stripe endpoint with `method=STRIPE_UPI`; disabled by default (`STRIPE_UPI_ENABLED=false`) until the Stripe account confirms UPI eligibility.
- Stripe Crypto/stablecoins: `createStripeCryptoWalletPayment` remains available for an eligible Stripe account. The generic crypto gateway is `POST /v1/payments/crypto/intents`.

`GET /v1/payments/providers` reports which rails are actually configured. Missing Razorpay or Stripe credentials fail closed with `503`.

## UPI collect vs intent

NPCI is deprecating general-purpose UPI collect for many MCCs. Securities flows (MCC 6012 / 6211) remain an exemption, which is why collect-by-VPA stays in this product. Set `UPI_COLLECT_ENABLED=false` to hide collect if a merchant account is not eligible. Intent and checkout-link flows remain available.

Validate a VPA with `POST /v1/payments/upi/validate`. `POST /v1/payments/upi/intents` goes through the same wallet ledger as deposits; it does not create an orphan provider payment.

## Ledger rule

A payment provider response creates a pending internal payment record (`payment_intents` + `wallet_transactions`). Only a verified provider webhook can transition the payment to `SUCCEEDED/COMPLETED` and credit `wallet_accounts.available_paise`.

## Security rules

- Never put secret provider keys in the web application. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is the only Stripe value the browser may see.
- Stripe/Razorpay webhook signatures are checked against the raw HTTP body.
- Webhook event IDs are deduplicated in `payment_webhook_events` in the same database transaction as settlement. A settlement failure rolls back the event row so the provider can retry.
- Wallet rows and transactions are locked in database transactions during settlement.
- Stripe credits only when `amount_received` matches the pending paise amount and currency is `inr`.
- Idempotency keys are mandatory. Stripe PaymentIntents are created with the Stripe `Idempotency-Key` header.
- Development `x-user-id` authentication must be disabled before live money movement (`ALLOW_DEV_USER_HEADER=false`).
- Crypto-to-INR conversion must use a trusted real-time quote/risk service before production; `CRYPTO_USD_INR_RATE` is development infrastructure only.

## Stripe client

`apps/web/app/payment-hub.tsx` uses Stripe.js/Elements so raw card details are not collected by the INRLIQUID server. Configure:

```bash
STRIPE_SECRET_KEY=sk_live_or_test
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CARD_ENABLED=true
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_or_test
```

Webhook URL: `https://api.your-domain.example/v1/webhooks/stripe` for `payment_intent.succeeded`, `payment_intent.payment_failed`, and `payment_intent.canceled`.

## Razorpay client

```bash
RAZORPAY_KEY_ID=rzp_live_or_test
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
UPI_COLLECT_ENABLED=true
WEB_ORIGIN=https://your-domain.example
```

Webhook URL: `https://api.your-domain.example/v1/webhooks/razorpay` for `payment.captured`, `payment.failed`, `payment_link.paid`, `order.paid`, and RazorpayX payout events.

## Provider onboarding still required

Code cannot create merchant accounts, complete KYC, obtain provider approval, issue live API credentials, or make an unregulated money-movement structure lawful. Those are provider/regulatory prerequisites.
