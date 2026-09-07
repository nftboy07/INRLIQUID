import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderRequestSchema, createTpSlRequestSchema } from '@inrliquid/domain';

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
