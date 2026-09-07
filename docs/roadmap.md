# Roadmap

## Product foundation — complete

- [x] Monorepo and TypeScript foundation
- [x] Real-integration adapter boundaries
- [x] Hyperliquid-style trading terminal layout
- [x] Market / limit / stop / take / scale / TWAP order model
- [x] GTC / IOC / ALO and post-only controls
- [x] Reduce-only and client order IDs
- [x] TP/SL and parent/OCO relationships
- [x] Amend and cancel API
- [x] Order book / positions / open-order UI surfaces
- [x] UPI payment hub surface and payment-intent API
- [x] PostgreSQL cash/holdings/order/payment ledger schema
- [x] Redis and local infrastructure
- [x] CI

## Production provider integration — pending external credentials/contracts

- [ ] Select regulated broker/execution partner
- [ ] Select market-data provider with required real-time entitlements
- [ ] Select UPI/PSP partner
- [ ] Implement authenticated provider clients
- [ ] Implement signed webhook verification and replay protection
- [ ] Provider reconciliation jobs
- [ ] Real-time WebSocket/event streams
- [ ] Production secrets and key management
- [ ] Operational alerting and incident tooling

## Launch readiness

- [ ] Independent security review
- [ ] Penetration testing
- [ ] Disaster recovery drills
- [ ] Production observability
- [ ] Regulatory/compliance sign-off for the actual operating model
- [ ] Domain, TLS, CDN/WAF and production deployment
