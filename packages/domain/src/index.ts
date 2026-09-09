import { z } from 'zod';

export const exchangeSchema = z.enum(['NSE', 'BSE']);
export const sideSchema = z.enum(['BUY', 'SELL']);
export const orderTypeSchema = z.enum(['MARKET', 'LIMIT', 'STOP_MARKET', 'STOP_LIMIT', 'TAKE_MARKET', 'TAKE_LIMIT', 'SCALE', 'TWAP']);
export const timeInForceSchema = z.enum(['GTC', 'IOC', 'ALO']);
export const triggerKindSchema = z.enum(['TP', 'SL']);
export const paymentMethodSchema = z.enum(['RAZORPAY_UPI', 'STRIPE_CARD', 'STRIPE_UPI', 'STRIPE_CRYPTO']);
export const upiAppSchema = z.enum(['paytm', 'phonepe', 'gpay', 'other']);
export const upiFlowSchema = z.enum(['collect', 'intent', 'link']);

/** NPCI VPA: local-part @ handle, e.g. name@paytm, name@ybl, name@oksbi */
export const vpaSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9.-]{1,63}$/, 'Enter a valid UPI ID (VPA)');

const baseOrderSchema = z.object({
  symbol: z.string().trim().toUpperCase().min(1).max(30),
  exchange: exchangeSchema.default('NSE'),
  side: sideSchema,
  quantity: z.number().int().positive(),
  reduceOnly: z.boolean().default(false),
  timeInForce: timeInForceSchema.default('GTC'),
  clientOrderId: z.string().trim().min(8).max(128).optional(),
  idempotencyKey: z.string().trim().min(16).max(128),
  limitPriceInr: z.number().positive().optional(),
  triggerPriceInr: z.number().positive().optional(),
  triggerKind: triggerKindSchema.optional(),
  parentOrderId: z.string().trim().min(1).max(128).optional(),
  ocoGroupId: z.string().trim().min(1).max(128).optional(),
  postOnly: z.boolean().default(false),
});

export const createOrderRequestSchema = baseOrderSchema.extend({
  orderType: orderTypeSchema.default('MARKET'),
  scale: z.object({ levels: z.number().int().min(2).max(100), endPriceInr: z.number().positive() }).optional(),
  twap: z.object({ durationMinutes: z.number().int().min(1).max(1440), randomize: z.boolean().default(false) }).optional(),
}).superRefine((value, ctx) => {
  const needsLimit = ['LIMIT', 'STOP_LIMIT', 'TAKE_LIMIT'].includes(value.orderType);
  const needsTrigger = ['STOP_MARKET', 'STOP_LIMIT', 'TAKE_MARKET', 'TAKE_LIMIT'].includes(value.orderType);
  if (needsLimit && value.limitPriceInr === undefined) ctx.addIssue({ code: 'custom', path: ['limitPriceInr'], message: 'Limit price is required' });
  if (!needsLimit && value.limitPriceInr !== undefined) ctx.addIssue({ code: 'custom', path: ['limitPriceInr'], message: 'Limit price is not valid for this order type' });
  if (needsTrigger && value.triggerPriceInr === undefined) ctx.addIssue({ code: 'custom', path: ['triggerPriceInr'], message: 'Trigger price is required' });
  if (!needsTrigger && value.triggerPriceInr !== undefined) ctx.addIssue({ code: 'custom', path: ['triggerPriceInr'], message: 'Trigger price is not valid for this order type' });
  if (value.orderType === 'SCALE' && value.scale === undefined) ctx.addIssue({ code: 'custom', path: ['scale'], message: 'Scale configuration is required' });
  if (value.orderType !== 'SCALE' && value.scale !== undefined) ctx.addIssue({ code: 'custom', path: ['scale'], message: 'Scale configuration is only valid for SCALE orders' });
  if (value.orderType === 'TWAP' && value.twap === undefined) ctx.addIssue({ code: 'custom', path: ['twap'], message: 'TWAP configuration is required' });
  if (value.orderType !== 'TWAP' && value.twap !== undefined) ctx.addIssue({ code: 'custom', path: ['twap'], message: 'TWAP configuration is only valid for TWAP orders' });
  if (value.postOnly && value.timeInForce !== 'ALO') ctx.addIssue({ code: 'custom', path: ['timeInForce'], message: 'Post-only orders require ALO time in force' });
  if (value.orderType === 'MARKET' && value.timeInForce === 'ALO') ctx.addIssue({ code: 'custom', path: ['timeInForce'], message: 'Market orders cannot be post-only' });
});

export const createTpSlRequestSchema = z.object({
  symbol: z.string().trim().toUpperCase().min(1).max(30),
  exchange: exchangeSchema.default('NSE'),
  side: sideSchema,
  quantity: z.number().int().positive(),
  triggerPriceInr: z.number().positive(),
  limitPriceInr: z.number().positive().optional(),
  kind: triggerKindSchema,
  market: z.boolean().default(true),
  reduceOnly: z.literal(true).default(true),
  parentOrderId: z.string().trim().min(1).max(128).optional(),
  ocoGroupId: z.string().trim().min(1).max(128).optional(),
  idempotencyKey: z.string().trim().min(16).max(128),
}).superRefine((value, ctx) => {
  if (!value.market && value.limitPriceInr === undefined) ctx.addIssue({ code: 'custom', path: ['limitPriceInr'], message: 'Limit price is required for limit TP/SL' });
  if (value.market && value.limitPriceInr !== undefined) ctx.addIssue({ code: 'custom', path: ['limitPriceInr'], message: 'Market TP/SL cannot include a limit price' });
});

export const createPaymentIntentSchema = z.object({
  amountInr: z.number().positive().finite().max(10_000_000),
  purpose: z.enum(['TRADING_FUNDING', 'WITHDRAWAL', 'SETTLEMENT', 'FEES']),
  idempotencyKey: z.string().trim().min(16).max(128),
  flow: upiFlowSchema.optional(),
  vpa: vpaSchema.optional(),
  app: upiAppSchema.optional(),
  customerEmail: z.string().trim().email().max(254).optional(),
  customerContact: z.string().regex(/^[6-9]\d{9}$/).optional(),
}).superRefine((value, ctx) => {
  const flow = value.flow ?? (value.vpa ? 'collect' : 'intent');
  if (flow === 'collect' && !value.vpa) {
    ctx.addIssue({ code: 'custom', path: ['vpa'], message: 'UPI ID (VPA) is required for collect requests' });
  }
  if (value.purpose === 'WITHDRAWAL') {
    ctx.addIssue({ code: 'custom', path: ['purpose'], message: 'WITHDRAWAL must use the RazorpayX payout flow' });
  }
});

export const createWalletDepositSchema = z.object({
  amountInr: z.number().positive().finite().max(10_000_000),
  idempotencyKey: z.string().trim().min(16).max(128),
  flow: upiFlowSchema.optional(),
  vpa: vpaSchema.optional(),
  app: upiAppSchema.optional(),
  customerEmail: z.string().trim().email().max(254).optional(),
  customerContact: z.string().regex(/^[6-9]\d{9}$/).optional(),
}).superRefine((value, ctx) => {
  const flow = value.flow ?? (value.vpa ? 'collect' : 'intent');
  if (flow === 'collect' && !value.vpa) {
    ctx.addIssue({ code: 'custom', path: ['vpa'], message: 'UPI ID (VPA) is required for collect requests' });
  }
});

export const createCardOrUpiPaymentSchema = z.object({
  amountInr: z.number().positive().finite().max(10_000_000),
  purpose: z.enum(['TRADING_FUNDING', 'WITHDRAWAL', 'SETTLEMENT', 'FEES']).default('TRADING_FUNDING'),
  idempotencyKey: z.string().trim().min(16).max(128),
  method: z.enum(['STRIPE_CARD', 'STRIPE_UPI']),
});

export const createCryptoPaymentSchema = z.object({
  amountUsd: z.number().positive().finite(),
  idempotencyKey: z.string().trim().min(16).max(128),
  asset: z.string().trim().toUpperCase().min(2).max(20).default('USDC'),
  network: z.string().trim().min(2).max(30).default('BASE'),
});

export function resolveUpiFlow(input: { flow?: z.infer<typeof upiFlowSchema>; vpa?: string }): z.infer<typeof upiFlowSchema> {
  return input.flow ?? (input.vpa ? 'collect' : 'intent');
}

export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;
export type CreateTpSlRequest = z.infer<typeof createTpSlRequestSchema>;
export type CreatePaymentIntent = z.infer<typeof createPaymentIntentSchema>;
export type CreateWalletDeposit = z.infer<typeof createWalletDepositSchema>;
export type CreateCardOrUpiPayment = z.infer<typeof createCardOrUpiPaymentSchema>;
export type CreateCryptoPayment = z.infer<typeof createCryptoPaymentSchema>;
export type OrderType = z.infer<typeof orderTypeSchema>;
export type TimeInForce = z.infer<typeof timeInForceSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type UpiApp = z.infer<typeof upiAppSchema>;
export type UpiFlow = z.infer<typeof upiFlowSchema>;

export interface Quote {
  symbol: string;
  exchange: 'NSE' | 'BSE';
  lastPriceInr: number;
  bestBidInr?: number;
  bestAskInr?: number;
  asOf: string;
}
export interface OrderBookLevel { priceInr: number; quantity: number; orders?: number }
export interface OrderBook { symbol: string; exchange: 'NSE' | 'BSE'; bids: OrderBookLevel[]; asks: OrderBookLevel[]; asOf: string }
export interface Position { symbol: string; exchange: 'NSE' | 'BSE'; quantity: number; averagePriceInr: number; markPriceInr: number; unrealizedPnlInr: number }
export interface OrderReceipt { providerOrderId: string; status: 'ACCEPTED' | 'REJECTED' | 'PENDING'; acceptedAt: string }
export interface BrokerAdapter {
  placeOrder(order: CreateOrderRequest): Promise<OrderReceipt>;
  placeTpSl(order: CreateTpSlRequest): Promise<OrderReceipt>;
  cancelOrder(orderId: string): Promise<void>;
  modifyOrder(orderId: string, order: CreateOrderRequest): Promise<OrderReceipt>;
}
export interface MarketDataAdapter {
  quote(symbol: string, exchange: 'NSE' | 'BSE'): Promise<Quote>;
  orderBook(symbol: string, exchange: 'NSE' | 'BSE'): Promise<OrderBook>;
}
export interface UpiAppLinks {
  generic: string;
  paytm?: string;
  phonepe?: string;
  gpay?: string;
}
export interface UpiPaymentIntent {
  providerPaymentId: string;
  razorpayPaymentId?: string;
  amountInr: number;
  status: 'CREATED' | 'PENDING';
  upiUrl?: string;
  qrUrl?: string;
  appLinks?: UpiAppLinks;
  vpa?: string;
  flow: UpiFlow;
  createdAt: string;
}
export interface UpiCreateContext {
  ip?: string;
  userAgent?: string;
  referer?: string;
}
export interface UpiAdapter {
  createPaymentIntent(input: CreatePaymentIntent, context?: UpiCreateContext): Promise<UpiPaymentIntent>;
  cancelPaymentIntent(providerPaymentId: string): Promise<void>;
}
