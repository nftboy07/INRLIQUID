# INRLIQUID Payment Rails

INRLIQUID uses one wallet ledger behind multiple provider rails. The frontend never credits the wallet directly.

## Rails

- Razorpay UPI: `POST /v1/wallet/deposits` and Razorpay webhook `/v1/webhooks/razorpay`.
- RazorpayX withdrawals: beneficiary creation, fund accounts, payout creation and payout webhooks.
- Stripe Card: `POST /v1/payments/stripe/intents` with `method=STRIPE_CARD`.
- Stripe UPI: same Stripe endpoint with `method=STRIPE_UPI`; disabled by default until the Stripe account confirms UPI eligibility.
- Stripe Crypto/stablecoins: `POST /v1/payments/stripe/crypto-intents`; disabled by default and intended only for an eligible Stripe account. The server derives the INR credit from `CRYPTO_USD_INR_RATE` until a trusted FX/risk quote service replaces it.

## Ledger rule

A payment provider response creates a pending internal payment record. Only a verified provider webhook can transition the payment to `SUCCEEDED/COMPLETED` and credit `wallet_accounts.available_paise`.

## Security rules

- Never put secret provider keys in the web application.
- Stripe/Razorpay webhook signatures are checked against the raw HTTP body.
- Webhook event IDs are deduplicated in `payment_webhook_events`.
- Wallet rows and transactions are locked in database transactions during settlement.
- Idempotency keys are mandatory.
- Development `x-user-id` authentication must be disabled before live money movement.
- Crypto-to-INR conversion must use a trusted real-time quote/risk service before production; a static environment rate is development infrastructure only.

## Stripe client

`apps/web/payment-hub.tsx` uses Stripe.js/Elements so raw card details are not collected by the INRLIQUID server. The publishable key belongs in `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; the secret key remains server-side.

## Provider onboarding still required

Code cannot create merchant accounts, complete KYC, obtain provider approval, issue live API credentials, or make an unregulated money-movement structure lawful. Those are provider/regulatory prerequisites.
