import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCardOrUpiPaymentSchema,
  createPaymentIntentSchema,
  createWalletDepositSchema,
  resolveUpiFlow,
  vpaSchema,
} from './index.ts';

test('accepts common Paytm PhonePe and GPay VPAs', () => {
  for (const vpa of ['user@paytm', 'name.surname@ybl', 'trader@oksbi', 'trader@okhdfcbank', 'trader@okicici']) {
    const parsed = vpaSchema.safeParse(vpa);
    assert.equal(parsed.success, true, vpa);
  }
});

test('rejects malformed VPAs', () => {
  for (const vpa of ['not-an-id', '@ybl', 'user@', 'user paytm', 'a@b']) {
    assert.equal(vpaSchema.safeParse(vpa).success, false, vpa);
  }
});

test('collect flow requires a VPA', () => {
  const result = createWalletDepositSchema.safeParse({
    amountInr: 500,
    idempotencyKey: '0123456789abcdef',
    flow: 'collect',
  });
  assert.equal(result.success, false);
});

test('defaults to collect when a VPA is supplied', () => {
  assert.equal(resolveUpiFlow({ vpa: 'user@ybl' }), 'collect');
  assert.equal(resolveUpiFlow({}), 'intent');
  assert.equal(resolveUpiFlow({ flow: 'link' }), 'link');
});

test('accepts a VPA collect deposit', () => {
  const result = createWalletDepositSchema.safeParse({
    amountInr: 1000,
    idempotencyKey: '0123456789abcdef',
    vpa: 'trader@oksbi',
    app: 'gpay',
    customerContact: '9876543210',
  });
  assert.equal(result.success, true);
});

test('rejects withdrawal through the UPI intent schema', () => {
  const result = createPaymentIntentSchema.safeParse({
    amountInr: 100,
    purpose: 'WITHDRAWAL',
    idempotencyKey: '0123456789abcdef',
    flow: 'intent',
  });
  assert.equal(result.success, false);
});

test('stripe card schema accepts STRIPE_CARD', () => {
  const result = createCardOrUpiPaymentSchema.safeParse({
    amountInr: 2500,
    method: 'STRIPE_CARD',
    idempotencyKey: '0123456789abcdef',
  });
  assert.equal(result.success, true);
});
