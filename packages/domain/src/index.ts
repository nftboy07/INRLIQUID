import { z } from 'zod';

export const createOrderRequestSchema = z.object({
  symbol: z.string().trim().toUpperCase().min(1).max(30),
  exchange: z.enum(['NSE', 'BSE']).default('NSE'),
  side: z.enum(['BUY', 'SELL']),
  orderType: z.enum(['MARKET', 'LIMIT']),
  quantity: z.number().int().positive(),
  limitPriceInr: z.number().positive().optional(),
  idempotencyKey: z.string().trim().min(16).max(128)
}).superRefine((value, ctx) => {
  if (value.orderType === 'LIMIT' && value.limitPriceInr === undefined) {
    ctx.addIssue({ code: 'custom', path: ['limitPriceInr'], message: 'Limit price is required for LIMIT orders' });
  }
  if (value.orderType === 'MARKET' && value.limitPriceInr !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['limitPriceInr'], message: 'Market orders must not include a limit price' });
  }
});

export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;

export interface Quote {
  symbol: string;
  exchange: 'NSE' | 'BSE';
  lastPriceInr: number;
  bestBidInr?: number;
  bestAskInr?: number;
  asOf: string;
}

export interface OrderReceipt {
  providerOrderId: string;
  status: 'ACCEPTED' | 'REJECTED' | 'PENDING';
  acceptedAt: string;
}

export interface BrokerAdapter {
  placeOrder(order: CreateOrderRequest): Promise<OrderReceipt>;
  cancelOrder(orderId: string): Promise<void>;
}

export interface MarketDataAdapter {
  quote(symbol: string, exchange: 'NSE' | 'BSE'): Promise<Quote>;
}

export interface UpiPaymentIntent {
  providerPaymentId: string;
  amountInr: number;
  status: 'CREATED' | 'PENDING';
  upiUrl?: string;
  createdAt: string;
}

export interface UpiAdapter {
  createPaymentIntent(input: { amountInr: number; purpose: 'TRADING_FUNDING' | 'SETTLEMENT'; idempotencyKey: string }): Promise<UpiPaymentIntent>;
}
