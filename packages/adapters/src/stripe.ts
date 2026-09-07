import { createHmac, timingSafeEqual } from 'node:crypto';

export interface StripeConfig { secretKey: string; apiBaseUrl?: string; }
export type StripeMethod = 'card' | 'upi' | 'crypto';
export interface StripePaymentIntent { providerPaymentId: string; clientSecret?: string; amountInr?: number; amountUsd?: number; currency: string; method: StripeMethod; status: string; createdAt: string; }
const base = (config: StripeConfig) => config.apiBaseUrl ?? 'https://api.stripe.com/v1';
const auth = (config: StripeConfig) => `Basic ${Buffer.from(`${config.secretKey}:`).toString('base64')}`;
async function stripeRequest<T>(config: StripeConfig, path: string, body: URLSearchParams): Promise<T> {
  const response = await fetch(`${base(config)}${path}`, { method: 'POST', headers: { Authorization: auth(config), 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!response.ok) throw new Error(`Stripe request failed: ${response.status} ${await response.text()}`);
  return await response.json() as T;
}
export async function createStripePaymentIntent(config: StripeConfig, input: { amountInr: number; idempotencyKey: string; method: 'card' | 'upi'; metadata?: Record<string, string> }) {
  const params = new URLSearchParams(); params.set('amount', String(Math.round(input.amountInr * 100))); params.set('currency', 'inr'); params.set('payment_method_types[]', input.method); params.set('description', 'INRLIQUID trading wallet funding'); params.set('metadata[idempotency_key]', input.idempotencyKey);
  for (const [key, value] of Object.entries(input.metadata ?? {})) params.set(`metadata[${key}]`, value);
  const data = await stripeRequest<{ id: string; client_secret?: string; amount: number; currency: string; status: string; created: number }>(config, '/payment_intents', params);
  return { providerPaymentId: data.id, clientSecret: data.client_secret, amountInr: data.amount / 100, currency: data.currency.toUpperCase(), method: input.method, status: data.status, createdAt: new Date(data.created * 1000).toISOString() } satisfies StripePaymentIntent;
}
export async function createStripeCryptoPaymentIntent(config: StripeConfig, input: { amountUsd: number; idempotencyKey: string; asset: string; network: string }) {
  const params = new URLSearchParams(); params.set('amount', String(Math.round(input.amountUsd * 100))); params.set('currency', 'usd'); params.set('payment_method_types[]', 'crypto'); params.set('description', `INRLIQUID crypto wallet funding ${input.asset} on ${input.network}`); params.set('metadata[idempotency_key]', input.idempotencyKey); params.set('metadata[asset]', input.asset); params.set('metadata[network]', input.network);
  const data = await stripeRequest<{ id: string; client_secret?: string; amount: number; currency: string; status: string; created: number }>(config, '/payment_intents', params);
  return { providerPaymentId: data.id, clientSecret: data.client_secret, amountUsd: data.amount / 100, currency: data.currency.toUpperCase(), method: 'crypto' as const, status: data.status, createdAt: new Date(data.created * 1000).toISOString() } satisfies StripePaymentIntent;
}
export async function cancelStripePaymentIntent(config: StripeConfig, paymentIntentId: string) { const response = await fetch(`${base(config)}/payment_intents/${encodeURIComponent(paymentIntentId)}/cancel`, { method: 'POST', headers: { Authorization: auth(config) } }); if (!response.ok) throw new Error(`Stripe cancellation failed: ${response.status} ${await response.text()}`); }
export function verifyStripeWebhook(raw: string, signature: string | undefined, secret: string | undefined) {
  if (!signature || !secret) return false; const timestamp = signature.split(',').find(part => part.startsWith('t='))?.slice(2); const signatures = signature.split(',').filter(part => part.startsWith('v1=')).map(part => part.slice(3));
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false; const expected = createHmac('sha256', secret).update(`${timestamp}.${raw}`, 'utf8').digest('hex');
  return signatures.some(candidate => candidate.length === expected.length && timingSafeEqual(Buffer.from(candidate), Buffer.from(expected)));
}
