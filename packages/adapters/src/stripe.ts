import { createHmac, timingSafeEqual } from 'node:crypto';

export interface StripeConfig {
  secretKey: string;
  apiBaseUrl?: string;
  apiVersion?: string;
}
export type StripeMethod = 'card' | 'upi' | 'crypto';
export interface StripePaymentIntent {
  providerPaymentId: string;
  clientSecret?: string;
  amountInr?: number;
  amountUsd?: number;
  currency: string;
  method: StripeMethod;
  status: string;
  createdAt: string;
}

export const STRIPE_API_VERSION = '2025-08-27.basil';

const base = (config: StripeConfig) => config.apiBaseUrl ?? 'https://api.stripe.com/v1';
const auth = (config: StripeConfig) => `Basic ${Buffer.from(`${config.secretKey}:`).toString('base64')}`;

async function stripeRequest<T>(config: StripeConfig, path: string, body: URLSearchParams, idempotencyKey?: string): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: auth(config),
    'Content-Type': 'application/x-www-form-urlencoded',
    'Stripe-Version': config.apiVersion ?? STRIPE_API_VERSION,
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const response = await fetch(`${base(config)}${path}`, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Stripe request failed: ${response.status} ${await response.text()}`);
  return await response.json() as T;
}

export async function createStripePaymentIntent(
  config: StripeConfig,
  input: { amountInr: number; idempotencyKey: string; method: 'card' | 'upi'; metadata?: Record<string, string> },
) {
  const params = new URLSearchParams();
  params.set('amount', String(Math.round(input.amountInr * 100)));
  params.set('currency', 'inr');
  params.set('payment_method_types[]', input.method);
  params.set('capture_method', 'automatic');
  params.set('confirmation_method', 'automatic');
  params.set('description', 'INRLIQUID trading wallet funding');
  params.set('metadata[idempotency_key]', input.idempotencyKey);
  if (input.method === 'card') params.set('payment_method_options[card][request_three_d_secure]', 'automatic');
  for (const [key, value] of Object.entries(input.metadata ?? {})) params.set(`metadata[${key}]`, value);
  const data = await stripeRequest<{ id: string; client_secret?: string; amount: number; currency: string; status: string; created: number }>(
    config,
    '/payment_intents',
    params,
    input.idempotencyKey,
  );
  if (!data.client_secret) throw new Error('STRIPE_CLIENT_SECRET_MISSING');
  return {
    providerPaymentId: data.id,
    clientSecret: data.client_secret,
    amountInr: data.amount / 100,
    currency: data.currency.toUpperCase(),
    method: input.method,
    status: data.status,
    createdAt: new Date(data.created * 1000).toISOString(),
  } satisfies StripePaymentIntent;
}

export async function createStripeCryptoPaymentIntent(
  config: StripeConfig,
  input: { amountUsd: number; idempotencyKey: string; asset: string; network: string },
) {
  const params = new URLSearchParams();
  params.set('amount', String(Math.round(input.amountUsd * 100)));
  params.set('currency', 'usd');
  params.set('payment_method_types[]', 'crypto');
  params.set('description', `INRLIQUID crypto wallet funding ${input.asset} on ${input.network}`);
  params.set('metadata[idempotency_key]', input.idempotencyKey);
  params.set('metadata[asset]', input.asset);
  params.set('metadata[network]', input.network);
  const data = await stripeRequest<{ id: string; client_secret?: string; amount: number; currency: string; status: string; created: number }>(
    config,
    '/payment_intents',
    params,
    input.idempotencyKey,
  );
  return {
    providerPaymentId: data.id,
    clientSecret: data.client_secret,
    amountUsd: data.amount / 100,
    currency: data.currency.toUpperCase(),
    method: 'crypto' as const,
    status: data.status,
    createdAt: new Date(data.created * 1000).toISOString(),
  } satisfies StripePaymentIntent;
}

export async function cancelStripePaymentIntent(config: StripeConfig, paymentIntentId: string) {
  const response = await fetch(`${base(config)}/payment_intents/${encodeURIComponent(paymentIntentId)}/cancel`, {
    method: 'POST',
    headers: {
      Authorization: auth(config),
      'Stripe-Version': config.apiVersion ?? STRIPE_API_VERSION,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Stripe cancellation failed: ${response.status} ${await response.text()}`);
}

export function verifyStripeWebhook(raw: string, signature: string | undefined, secret: string | undefined) {
  if (!signature || !secret) return false;
  const timestamp = signature.split(',').find((part) => part.startsWith('t='))?.slice(2);
  const signatures = signature.split(',').filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${raw}`, 'utf8').digest('hex');
  return signatures.some((candidate) => candidate.length === expected.length && timingSafeEqual(Buffer.from(candidate), Buffer.from(expected)));
}

export function stripeSettlementAction(eventType: string, currentStatus: string): 'credit' | 'fail' | 'cancel' | 'ignore' {
  if (eventType === 'payment_intent.succeeded' && currentStatus !== 'SUCCEEDED' && currentStatus !== 'COMPLETED') return 'credit';
  if (eventType === 'payment_intent.canceled' && ['PENDING', 'PROCESSING', 'CREATED', 'REQUIRES_ACTION'].includes(currentStatus)) return 'cancel';
  if (eventType === 'payment_intent.payment_failed' && ['PENDING', 'PROCESSING', 'CREATED', 'REQUIRES_ACTION'].includes(currentStatus)) return 'fail';
  return 'ignore';
}

export function amountsMatchPaise(expected: number, received: number): boolean {
  return Number.isFinite(expected) && Number.isFinite(received) && expected > 0 && expected === received;
}
