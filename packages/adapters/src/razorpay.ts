import type { CreatePaymentIntent, UpiAdapter, UpiCreateContext, UpiFlow, UpiPaymentIntent } from '@inrliquid/domain';
import { resolveUpiFlow } from '@inrliquid/domain';
import { preferredUpiUrl, suggestedAppForVpa, upiAppLinks } from './upi-apps.js';

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  apiBaseUrl?: string;
  payoutAccountNumber?: string;
  collectEnabled?: boolean;
}

interface RazorpayPaymentLinkResponse {
  id: string;
  short_url?: string;
  amount: number;
  status: string;
  created_at: number;
}

interface RazorpayOrderResponse {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: number;
}

interface RazorpayUpiPaymentResponse {
  id?: string;
  razorpay_payment_id?: string;
  status?: string;
  link?: string;
  next?: Array<{ action?: string; url?: string }>;
}

const auth = (config: RazorpayConfig) => `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64')}`;
const base = (config: RazorpayConfig) => config.apiBaseUrl ?? 'https://api.razorpay.com/v1';

export class RazorpayRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'RazorpayRequestError';
  }
  get retryable() {
    return this.status === 408 || this.status === 409 || this.status === 429 || this.status >= 500;
  }
}

async function razorpayRequest<T>(config: RazorpayConfig, path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${base(config)}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new RazorpayRequestError(response.status, `Razorpay request failed: ${response.status} ${await response.text()}`);
  return await response.json() as T;
}

function intentUrl(data: RazorpayUpiPaymentResponse): string | undefined {
  if (typeof data.link === 'string' && data.link.length > 0) return data.link;
  const next = data.next?.find((item) => typeof item.url === 'string' && item.url.length > 0);
  return next?.url;
}

function customerFrom(input: CreatePaymentIntent) {
  const email = input.customerEmail;
  const contact = input.customerContact;
  return { email, contact };
}

async function createOrder(config: RazorpayConfig, input: CreatePaymentIntent): Promise<RazorpayOrderResponse> {
  return razorpayRequest<RazorpayOrderResponse>(config, '/orders', {
    method: 'POST',
    headers: {
      Authorization: auth(config),
      'Content-Type': 'application/json',
      'X-Razorpay-Idempotency': input.idempotencyKey,
    },
    body: JSON.stringify({
      amount: Math.round(input.amountInr * 100),
      currency: 'INR',
      receipt: input.idempotencyKey.slice(0, 40),
      payment_capture: 1,
      notes: { idempotency_key: input.idempotencyKey, purpose: input.purpose },
    }),
  });
}

async function createUpiPayment(
  config: RazorpayConfig,
  input: CreatePaymentIntent,
  orderId: string,
  flow: Exclude<UpiFlow, 'link'>,
  context?: UpiCreateContext,
): Promise<RazorpayUpiPaymentResponse> {
  const customer = customerFrom(input);
  const upi = flow === 'collect'
    ? { flow: 'collect', vpa: input.vpa, expiry_time: 10 }
    : { flow: 'intent' };
  return razorpayRequest<RazorpayUpiPaymentResponse>(config, '/payments/create/upi', {
    method: 'POST',
    headers: {
      Authorization: auth(config),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: Math.round(input.amountInr * 100),
      currency: 'INR',
      order_id: orderId,
      email: customer.email ?? 'funding@pay.inrliquid.app',
      contact: customer.contact ?? '9999999999',
      method: 'upi',
      ip: context?.ip ?? '127.0.0.1',
      referer: context?.referer ?? 'https://inrliquid.app',
      user_agent: context?.userAgent ?? 'INRLIQUID/1.0',
      notes: { idempotency_key: input.idempotencyKey },
      upi,
    }),
  });
}

async function createPaymentLink(config: RazorpayConfig, input: CreatePaymentIntent): Promise<UpiPaymentIntent> {
  const data = await razorpayRequest<RazorpayPaymentLinkResponse>(config, '/payment_links', {
    method: 'POST',
    headers: { Authorization: auth(config), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: Math.round(input.amountInr * 100),
      currency: 'INR',
      reference_id: input.idempotencyKey.slice(0, 40),
      description: `INRLIQUID ${input.purpose}`,
      accept_partial: false,
      expire_by: Math.floor(Date.now() / 1000) + 1800,
      notes: { idempotency_key: input.idempotencyKey, vpa: input.vpa ?? '', app: input.app ?? '' },
    }),
  });
  return {
    providerPaymentId: data.id,
    amountInr: data.amount / 100,
    status: data.status === 'paid' ? 'CREATED' : 'PENDING',
    upiUrl: data.short_url,
    flow: 'link',
    vpa: input.vpa,
    createdAt: new Date(data.created_at * 1000).toISOString(),
  };
}

function toIntent(
  order: RazorpayOrderResponse,
  payment: RazorpayUpiPaymentResponse,
  input: CreatePaymentIntent,
  flow: Exclude<UpiFlow, 'link'>,
): UpiPaymentIntent {
  const upiUrl = intentUrl(payment);
  const appLinks = upiAppLinks(upiUrl);
  const app = input.app ?? suggestedAppForVpa(input.vpa);
  return {
    providerPaymentId: order.id,
    razorpayPaymentId: payment.razorpay_payment_id ?? payment.id,
    amountInr: order.amount / 100,
    status: 'PENDING',
    upiUrl: preferredUpiUrl(appLinks, app) ?? upiUrl ?? undefined,
    qrUrl: upiUrl && !upiUrl.startsWith('upi://') ? upiUrl : undefined,
    appLinks,
    vpa: input.vpa,
    flow,
    createdAt: new Date(order.created_at * 1000).toISOString(),
  };
}

export async function validateRazorpayVpa(config: RazorpayConfig, vpa: string): Promise<{ vpa: string; success: boolean }> {
  return razorpayRequest<{ vpa: string; success: boolean }>(config, '/payments/validate/vpa', {
    method: 'POST',
    headers: { Authorization: auth(config), 'Content-Type': 'application/json' },
    body: JSON.stringify({ vpa }),
  });
}

export class RazorpayUpiAdapter implements UpiAdapter {
  private readonly config: RazorpayConfig;
  constructor(config: RazorpayConfig) {
    this.config = config;
  }

  async createPaymentIntent(input: CreatePaymentIntent, context?: UpiCreateContext): Promise<UpiPaymentIntent> {
    if (input.purpose === 'WITHDRAWAL') throw new Error('WITHDRAWAL must use RazorpayX payout flow');
    const flow = resolveUpiFlow(input);
    if (flow === 'link') return createPaymentLink(this.config, input);
    if (flow === 'collect') {
      if (!input.vpa) throw new Error('UPI_VPA_REQUIRED');
      if (this.config.collectEnabled === false) throw new Error('UPI_COLLECT_DISABLED');
    }
    const order = await createOrder(this.config, input);
    try {
      const payment = await createUpiPayment(this.config, input, order.id, flow, context);
      return toIntent(order, payment, input, flow);
    } catch (error) {
      if (flow === 'intent') {
        const link = await createPaymentLink(this.config, input);
        return { ...link, flow: 'intent', appLinks: upiAppLinks(link.upiUrl) };
      }
      throw error;
    }
  }

  async cancelPaymentIntent(providerPaymentId: string): Promise<void> {
    if (providerPaymentId.startsWith('plink_')) {
      await razorpayRequest(this.config, `/payment_links/${encodeURIComponent(providerPaymentId)}/cancel`, {
        method: 'POST',
        headers: { Authorization: auth(this.config) },
      });
      return;
    }
    await razorpayRequest(this.config, `/orders/${encodeURIComponent(providerPaymentId)}`, {
      method: 'PATCH',
      headers: { Authorization: auth(this.config), 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: { canceled: 'true' } }),
    }).catch(() => undefined);
  }
}

export interface WithdrawalRequest { amountInr: number; idempotencyKey: string; fundAccountId: string; mode?: 'UPI' | 'IMPS' | 'NEFT' | 'RTGS'; purpose?: string }
export interface RazorpayContactRequest { name: string; email: string; phone: string; referenceId: string }
export interface RazorpayBankBeneficiaryRequest { contactId: string; name: string; ifsc: string; accountNumber: string }
export interface RazorpayVpaBeneficiaryRequest { contactId: string; vpa: string }

export async function createRazorpayPayout(config: RazorpayConfig, input: WithdrawalRequest) {
  if (!config.payoutAccountNumber) throw new Error('RAZORPAYX_PAYOUT_ACCOUNT_NUMBER is required');
  return razorpayRequest<Record<string, unknown>>(config, '/payouts', {
    method: 'POST',
    headers: {
      Authorization: auth(config),
      'Content-Type': 'application/json',
      'X-Payout-Idempotency': input.idempotencyKey,
    },
    body: JSON.stringify({
      account_number: config.payoutAccountNumber,
      fund_account_id: input.fundAccountId,
      amount: Math.round(input.amountInr * 100),
      currency: 'INR',
      mode: input.mode ?? 'UPI',
      purpose: input.purpose ?? 'payout',
      reference_id: input.idempotencyKey.slice(0, 40),
    }),
  });
}

export async function createRazorpayContact(config: RazorpayConfig, input: RazorpayContactRequest) {
  return razorpayRequest<Record<string, unknown>>(config, '/contacts', {
    method: 'POST',
    headers: { Authorization: auth(config), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      contact: input.phone,
      type: 'customer',
      reference_id: input.referenceId.slice(0, 40),
    }),
  });
}

export async function createRazorpayBankFundAccount(config: RazorpayConfig, input: RazorpayBankBeneficiaryRequest) {
  return razorpayRequest<Record<string, unknown>>(config, '/fund_accounts', {
    method: 'POST',
    headers: { Authorization: auth(config), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contact_id: input.contactId,
      account_type: 'bank_account',
      bank_account: { name: input.name, ifsc: input.ifsc, account_number: input.accountNumber },
    }),
  });
}

export async function createRazorpayVpaFundAccount(config: RazorpayConfig, input: RazorpayVpaBeneficiaryRequest) {
  return razorpayRequest<Record<string, unknown>>(config, '/fund_accounts', {
    method: 'POST',
    headers: { Authorization: auth(config), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contact_id: input.contactId,
      account_type: 'vpa',
      vpa: { address: input.vpa },
    }),
  });
}

export async function fetchRazorpayPayout(config: RazorpayConfig, payoutId: string) {
  return razorpayRequest<Record<string, unknown>>(config, `/payouts/${encodeURIComponent(payoutId)}`, {
    method: 'GET',
    headers: { Authorization: auth(config) },
  });
}

export function razorpayEntityId(payload: Record<string, unknown>, eventType: string): string {
  const nested = payload.payload as Record<string, Record<string, { id?: string }> | undefined> | undefined;
  if (eventType.startsWith('payment_link.')) return String(nested?.payment_link?.entity?.id ?? '');
  if (eventType.startsWith('payout.')) return String(nested?.payout?.entity?.id ?? '');
  if (eventType.startsWith('order.')) return String(nested?.order?.entity?.id ?? '');
  return String(nested?.payment?.entity?.id ?? '');
}

export function razorpayEventId(payload: Record<string, unknown>): string {
  const eventType = String(payload.event ?? 'unknown');
  const createdAt = String(payload.created_at ?? '');
  const entityId = razorpayEntityId(payload, eventType);
  return `razorpay:${eventType}:${entityId}:${createdAt}`;
}
