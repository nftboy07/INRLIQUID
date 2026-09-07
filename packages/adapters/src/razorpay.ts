import type { CreatePaymentIntent, UpiAdapter, UpiPaymentIntent } from '@inrliquid/domain';

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  apiBaseUrl?: string;
  payoutAccountNumber?: string;
}

interface RazorpayPaymentLinkResponse { id: string; short_url?: string; amount: number; status: string; created_at: number; }

const auth = (config: RazorpayConfig) => `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64')}`;
const base = (config: RazorpayConfig) => config.apiBaseUrl ?? 'https://api.razorpay.com/v1';

export class RazorpayRequestError extends Error {
  constructor(public readonly status: number, message: string) { super(message); this.name = 'RazorpayRequestError'; }
  get retryable() { return this.status === 408 || this.status === 409 || this.status === 429 || this.status >= 500; }
}

async function razorpayRequest<T>(config: RazorpayConfig, path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${base(config)}${path}`, init);
  if (!response.ok) throw new RazorpayRequestError(response.status, `Razorpay request failed: ${response.status} ${await response.text()}`);
  return await response.json() as T;
}

export class RazorpayUpiAdapter implements UpiAdapter {
  constructor(private readonly config: RazorpayConfig) {}

  async createPaymentIntent(input: CreatePaymentIntent): Promise<UpiPaymentIntent> {
    if (input.purpose === 'WITHDRAWAL') throw new Error('WITHDRAWAL must use RazorpayX payout flow');
    const data = await razorpayRequest<RazorpayPaymentLinkResponse>(this.config, '/payment_links', {
      method: 'POST',
      headers: { Authorization: auth(this.config), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Math.round(input.amountInr * 100), currency: 'INR', reference_id: input.idempotencyKey.slice(0, 40),
        description: `INRLIQUID ${input.purpose}`, accept_partial: false, expire_by: Math.floor(Date.now() / 1000) + 1800
      })
    });
    return { providerPaymentId: data.id, amountInr: data.amount / 100, status: data.status === 'paid' ? 'CREATED' : 'PENDING', upiUrl: data.short_url, createdAt: new Date(data.created_at * 1000).toISOString() };
  }

  async cancelPaymentIntent(providerPaymentId: string): Promise<void> {
    await razorpayRequest(this.config, `/payment_links/${encodeURIComponent(providerPaymentId)}/cancel`, { method: 'POST', headers: { Authorization: auth(this.config) } });
  }
}

export interface WithdrawalRequest { amountInr: number; idempotencyKey: string; fundAccountId: string; mode?: 'UPI' | 'IMPS' | 'NEFT' | 'RTGS'; purpose?: string; }
export interface RazorpayContactRequest { name: string; email: string; phone: string; referenceId: string; }
export interface RazorpayBankBeneficiaryRequest { contactId: string; name: string; ifsc: string; accountNumber: string; }
export interface RazorpayVpaBeneficiaryRequest { contactId: string; vpa: string; }

export async function createRazorpayPayout(config: RazorpayConfig, input: WithdrawalRequest) {
  if (!config.payoutAccountNumber) throw new Error('RAZORPAYX_PAYOUT_ACCOUNT_NUMBER is required');
  return razorpayRequest<Record<string, unknown>>(config, '/payouts', {
    method: 'POST',
    headers: { Authorization: auth(config), 'Content-Type': 'application/json', 'X-Payout-Idempotency': input.idempotencyKey },
    body: JSON.stringify({ account_number: config.payoutAccountNumber, fund_account_id: input.fundAccountId, amount: Math.round(input.amountInr * 100), currency: 'INR', mode: input.mode ?? 'UPI', purpose: input.purpose ?? 'payout', reference_id: input.idempotencyKey.slice(0, 40) })
  });
}

export async function createRazorpayContact(config: RazorpayConfig, input: RazorpayContactRequest) {
  return razorpayRequest<Record<string, unknown>>(config, '/contacts', { method: 'POST', headers: { Authorization: auth(config), 'Content-Type': 'application/json' }, body: JSON.stringify({ name: input.name, email: input.email, contact: input.phone, type: 'customer', reference_id: input.referenceId.slice(0, 40) }) });
}

export async function createRazorpayBankFundAccount(config: RazorpayConfig, input: RazorpayBankBeneficiaryRequest) {
  return razorpayRequest<Record<string, unknown>>(config, '/fund_accounts', { method: 'POST', headers: { Authorization: auth(config), 'Content-Type': 'application/json' }, body: JSON.stringify({ contact_id: input.contactId, account_type: 'bank_account', bank_account: { name: input.name, ifsc: input.ifsc, account_number: input.accountNumber } }) });
}

export async function createRazorpayVpaFundAccount(config: RazorpayConfig, input: RazorpayVpaBeneficiaryRequest) {
  return razorpayRequest<Record<string, unknown>>(config, '/fund_accounts', { method: 'POST', headers: { Authorization: auth(config), 'Content-Type': 'application/json' }, body: JSON.stringify({ contact_id: input.contactId, account_type: 'vpa', vpa: { address: input.vpa } }) });
}

export async function fetchRazorpayPayout(config: RazorpayConfig, payoutId: string) {
  return razorpayRequest<Record<string, unknown>>(config, `/payouts/${encodeURIComponent(payoutId)}`, { method: 'GET', headers: { Authorization: auth(config) } });
}
