import { createHmac } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardOrUpiPaymentSchema, createOrderRequestSchema, createTpSlRequestSchema, createWalletDepositSchema } from '@inrliquid/domain';
import { amountsMatchPaise, stripeSettlementAction, verifyStripeWebhook } from '@inrliquid/adapters';

test('rejects zero-quantity orders', () => {
  const result = createOrderRequestSchema.safeParse({ symbol:'RELIANCE', exchange:'NSE', side:'BUY', orderType:'LIMIT', quantity:0, limitPriceInr:1500, idempotencyKey:'0123456789abcdef' });
  assert.equal(result.success, false);
});

test('accepts a limit buy with GTC', () => {
  const result = createOrderRequestSchema.safeParse({ symbol:'RELIANCE', side:'BUY', orderType:'LIMIT', quantity:1, limitPriceInr:1500, timeInForce:'GTC', idempotencyKey:'0123456789abcdef' });
  assert.equal(result.success, true);
});

test('accepts stop-market with trigger price', () => {
  const result = createOrderRequestSchema.safeParse({ symbol:'RELIANCE', side:'SELL', orderType:'STOP_MARKET', quantity:1, triggerPriceInr:1400, reduceOnly:true, idempotencyKey:'0123456789abcdef' });
  assert.equal(result.success, true);
});

test('rejects market orders carrying a limit price', () => {
  const result = createOrderRequestSchema.safeParse({ symbol:'RELIANCE', side:'BUY', orderType:'MARKET', quantity:1, limitPriceInr:1500, idempotencyKey:'0123456789abcdef' });
  assert.equal(result.success, false);
});

test('accepts market TP/SL as reduce-only', () => {
  const result = createTpSlRequestSchema.safeParse({ symbol:'RELIANCE', side:'SELL', quantity:1, triggerPriceInr:1600, kind:'TP', market:true, reduceOnly:true, idempotencyKey:'0123456789abcdef' });
  assert.equal(result.success, true);
});

test('requires a limit price for limit TP/SL', () => {
  const result = createTpSlRequestSchema.safeParse({ symbol:'RELIANCE', side:'SELL', quantity:1, triggerPriceInr:1600, kind:'SL', market:false, reduceOnly:true, idempotencyKey:'0123456789abcdef' });
  assert.equal(result.success, false);
});

test('UPI collect deposits require a VPA', () => {
  const missing = createWalletDepositSchema.safeParse({ amountInr: 500, idempotencyKey: '0123456789abcdef', flow: 'collect' });
  assert.equal(missing.success, false);
  const ok = createWalletDepositSchema.safeParse({ amountInr: 500, idempotencyKey: '0123456789abcdef', flow: 'collect', vpa: 'trader@ybl' });
  assert.equal(ok.success, true);
});

test('Stripe card intents require method STRIPE_CARD', () => {
  const result = createCardOrUpiPaymentSchema.safeParse({ amountInr: 1000, method: 'STRIPE_CARD', idempotencyKey: '0123456789abcdef' });
  assert.equal(result.success, true);
});

test('Stripe webhook verification fails closed without a secret', () => {
  assert.equal(verifyStripeWebhook('{}', 't=1,v1=abc', undefined), false);
});

test('Stripe webhook verification accepts a matching HMAC', () => {
  const secret = 'whsec_test';
  const raw = '{"id":"evt_1"}';
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', secret).update(`${timestamp}.${raw}`, 'utf8').digest('hex');
  assert.equal(verifyStripeWebhook(raw, `t=${timestamp},v1=${digest}`, secret), true);
});

test('settlement helpers fail closed on amount mismatch', () => {
  assert.equal(stripeSettlementAction('payment_intent.succeeded', 'PENDING'), 'credit');
  assert.equal(amountsMatchPaise(50000, 49999), false);
});
