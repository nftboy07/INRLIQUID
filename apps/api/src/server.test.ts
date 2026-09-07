import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderRequestSchema } from '@inrliquid/domain';

test('rejects zero-quantity orders', () => {
  const result = createOrderRequestSchema.safeParse({
    symbol: 'RELIANCE', exchange: 'NSE', side: 'BUY', orderType: 'LIMIT', quantity: 0,
    limitPriceInr: 1500, idempotencyKey: '0123456789abcdef'
  });
  assert.equal(result.success, false);
});

test('accepts a limit buy request', () => {
  const result = createOrderRequestSchema.safeParse({
    symbol: 'RELIANCE', exchange: 'NSE', side: 'BUY', orderType: 'LIMIT', quantity: 1,
    limitPriceInr: 1500, idempotencyKey: '0123456789abcdef'
  });
  assert.equal(result.success, true);
});

test('rejects market orders carrying a limit price', () => {
  const result = createOrderRequestSchema.safeParse({
    symbol: 'RELIANCE', exchange: 'NSE', side: 'BUY', orderType: 'MARKET', quantity: 1,
    limitPriceInr: 1500, idempotencyKey: '0123456789abcdef'
  });
  assert.equal(result.success, false);
});
