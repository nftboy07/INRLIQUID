# Hyperliquid-style parity specification

INRLIQUID targets the *trading interaction model*, not a copy of Hyperliquid's underlying crypto protocol.

## Order types

| INRLIQUID | Purpose |
|---|---|
| MARKET | Immediate market execution |
| LIMIT | Execute at limit or better |
| STOP_MARKET | Trigger market order |
| STOP_LIMIT | Trigger limit order |
| TAKE_MARKET | Trigger market take-profit |
| TAKE_LIMIT | Trigger limit take-profit |
| SCALE | Multiple limit orders across a configured range |
| TWAP | Time-sliced execution request |

## Order controls

- GTC, IOC and ALO/post-only time-in-force
- Reduce-only
- Client order IDs
- Idempotency keys
- Amend and cancel
- Parent/child order relationships
- OCO groups
- Position-linked TP/SL
- Fixed-size TP/SL
- Market or limit TP/SL
- Live order book and trade/order state streams

Hyperliquid's documentation describes market, limit, stop, take, scale and TWAP orders, plus GTC/ALO/IOC and reduce-only controls. citehttps://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types

## TP/SL semantics

TP/SL should be modeled as conditional, reduce-only child orders. A parent-linked TP and SL share an OCO group: when one child is confirmed filled, the sibling is canceled. Position-linked TP/SL may default to the complete current position, while fixed-size TP/SL stays fixed after placement.

Hyperliquid uses mark price for its TP/SL trigger mechanism and supports market and limit TP/SL. INRLIQUID must use the trigger/reference price permitted by the actual Indian market-data and execution provider contract rather than pretending that a crypto mark-price oracle exists. citehttps://hyperliquid.gitbook.io/hyperliquid-docs/trading/take-profit-and-stop-loss-orders-tp-sl

## Cash-equity differences

Do not import these perpetual-specific features into Indian cash-equity mode unless a separately authorized product supports them:

- crypto-style leverage
- perpetual funding
- liquidation engine
- unrestricted short positions
- crypto margin tiers
- crypto oracle/liquidation pricing

The frontend can retain the familiar interaction language while the execution adapter enforces the real instrument's rules.
