import { createHmac } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  amountsMatchPaise,
  preferredUpiUrl,
  razorpayEntityId,
  razorpayEventId,
  stripeSettlementAction,
  suggestedAppForVpa,
  upiAppLinks,
  verifyStripeWebhook,
} from '@inrliquid/adapters';

test('maps Paytm PhonePe and GPay handles', () => {
  assert.equal(suggestedAppForVpa('user@paytm'), 'paytm');
  assert.equal(suggestedAppForVpa('user@ybl'), 'phonepe');
  assert.equal(suggestedAppForVpa('user@oksbi'), 'gpay');
});

test('builds app deep links from a generic UPI intent URL', () => {
  const links = upiAppLinks('upi://pay?pa=merchant@razorpay&am=100.00&cu=INR');
  assert.equal(links?.gpay?.startsWith('gpay://upi/pay?'), true);
  assert.equal(links?.phonepe?.startsWith('phonepe://pay?'), true);
  assert.equal(links?.paytm?.startsWith('paytmmp://pay?'), true);
  assert.equal(preferredUpiUrl(links, 'gpay'), links?.gpay);
});

test('verifies Stripe webhook signatures against the raw body', () => {
  const secret = 'whsec_test';
  const raw = '{"id":"evt_1","type":"payment_intent.succeeded"}';
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', secret).update(`${timestamp}.${raw}`, 'utf8').digest('hex');
  assert.equal(verifyStripeWebhook(raw, `t=${timestamp},v1=${digest}`, secret), true);
  assert.equal(verifyStripeWebhook(raw, `t=${timestamp},v1=${'0'.repeat(digest.length)}`, secret), false);
  assert.equal(verifyStripeWebhook(raw, `t=${timestamp},v1=${digest}`, undefined), false);
});

test('stripe settlement only credits matching INR amounts', () => {
  assert.equal(stripeSettlementAction('payment_intent.succeeded', 'PENDING'), 'credit');
  assert.equal(stripeSettlementAction('payment_intent.succeeded', 'SUCCEEDED'), 'ignore');
  assert.equal(stripeSettlementAction('payment_intent.payment_failed', 'PENDING'), 'fail');
  assert.equal(amountsMatchPaise(100000, 100000), true);
  assert.equal(amountsMatchPaise(100000, 99999), false);
});

test('derives a stable Razorpay event id from payment.captured payloads', () => {
  const payload = {
    event: 'payment.captured',
    created_at: 1700000000,
    payload: { payment: { entity: { id: 'pay_123', order_id: 'order_123', amount: 100000 } } },
  };
  assert.equal(razorpayEntityId(payload, 'payment.captured'), 'pay_123');
  assert.equal(razorpayEventId(payload), 'razorpay:payment.captured:pay_123:1700000000');
});
