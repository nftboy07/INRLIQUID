import type { CreatePaymentIntent, UpiAdapter, UpiPaymentIntent } from '@inrliquid/domain';

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  apiBaseUrl?: string;
  payoutAccountNumber?: string;
}

interface RazorpayPaymentLinkResponse {
  id: string;
  short_url?: string;
  amount: number;
  status: string;
  created_at: number;
}

const auth = (config: RazorpayConfig) => `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64')}`;

export class RazorpayUpiAdapter implements UpiAdapter {
  private readonly baseUrl: string;
  constructor(private readonly config: RazorpayConfig) {
    this.baseUrl = config.apiBaseUrl ?? 'https://api.razorpay.com/v1';
  }

  async createPaymentIntent(input: CreatePaymentIntent): Promise<UpiPaymentIntent> {
    if (input.purpose === 'WITHDRAWAL') throw new Error('WITHDRAWAL must use RazorpayX payout flow, not a payment link');
    const response = await fetch(`${this.baseUrl}/payment_links`, {
      method: 'POST',
      headers: { Authorization: auth(this.config), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Math.round(input.amountInr * 100),
        currency: 'INR',
        reference_id: input.idempotencyKey.slice(0, 40),
        description: `INRLIQUID ${input.purpose}`,
        accept_partial: false,
        expire_by: Math.floor(Date.now() / 1000) + 1800
      })
    });
    if (!response.ok) throw new Error(`Razorpay payment link failed: ${response.status} ${await response.text()}`);
    const data = await response.json() as RazorpayPaymentLinkResponse;
    return {
      providerPaymentId: data.id,
      amountInr: data.amount / 100,
      status: data.status === 'paid' ? 'CREATED' : 'PENDING',
      upiUrl: data.short_url,
      createdAt: new Date(data.created_at * 1000).toISOString()
    };
  }

  async cancelPaymentIntent(providerPaymentId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/payment_links/${encodeURIComponent(providerPaymentId)}/cancel`, {
      method: 'POST', headers: { Authorization: auth(this.config) }
    });
    if (!response.ok) throw new Error(`Razorpay payment-link cancellation failed: ${response.status} ${await response.text()}`);
  }
}

export interface WithdrawalRequest {
  amountInr: number;
  idempotencyKey: string;
  fundAccountId: string;
  mode?: 'UPI' | 'IMPS' | 'NEFT' | 'RTGS';
  purpose?: string;
}

export async function createRazorpayPayout(config: RazorpayConfig, input: WithdrawalRequest) {
  if (!config.payoutAccountNumber) throw new Error('RAZORPAYX_PAYOUT_ACCOUNT_NUMBER is required');
  const response = await fetch(`${config.apiBaseUrl ?? 'https://api.razorpay.com/v1'}/payouts`, {
    method: 'POST',
    headers: {
      Authorization: auth(config),
      'Content-Type': 'application/json',
      'X-Payout-Idempotency': input.idempotencyKey
    },
    body: JSON.stringify({
      account_number: config.payoutAccountNumber,
      fund_account_id: input.fundAccountId,
      amount: Math.round(input.amountInr * 100),
      currency: 'INR',
      mode: input.mode ?? 'UPI',
      purpose: input.purpose ?? 'payout'
    })
  });
  if (!response.ok) throw new Error(`RazorpayX payout failed: ${response.status} ${await response.text()}`);
  return await response.json() as Record<string, unknown>;
}
