# Provider integration contract

The application is provider-neutral. Provider implementations belong behind the interfaces in `packages/adapters`.

## Execution adapter

Required capabilities:

- submit an order with a unique client order ID
- cancel an order
- retrieve order state
- retrieve fills
- reconcile open orders and executions

The adapter must be idempotent and must never return a fabricated execution.

## Market-data adapter

Required capabilities:

- instrument lookup
- latest quote
- streaming quote/order-book updates where contractually permitted
- trading-status/market-session state

Market data must identify its source and timestamp.

## UPI adapter

Required capabilities depend on the approved provider and securities payment flow:

- create a payment/mandate intent
- obtain server-side payment status
- receive authenticated provider events
- reconcile payment references

A client-supplied success response is never sufficient evidence of payment.

## Identity adapter

The product should keep identity onboarding abstract so a regulated partner can supply the required account-opening/KYC workflow. UPI authentication must not be treated as a blanket substitute for legally required securities onboarding.

## Domain rule

No adapter may silently fall back to a simulator. If a live provider is not configured, the API must return an explicit unavailable error.
