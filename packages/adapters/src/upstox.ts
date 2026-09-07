import type { BrokerAdapter, CreateOrderRequest, CreateTpSlRequest, MarketDataAdapter, OrderBook, OrderReceipt, Quote } from '@inrliquid/domain';

export interface UpstoxConfig {
  accessToken: string;
  orderBaseUrl?: string;
  marketBaseUrl?: string;
  instrumentMap: Record<string, string>;
}

type UpstoxResponse<T> = { status: string; data: T; metadata?: Record<string, unknown> };

const orderBase = (c: UpstoxConfig) => c.orderBaseUrl ?? 'https://api-hft.upstox.com/v3';
const marketBase = (c: UpstoxConfig) => c.marketBaseUrl ?? 'https://api.upstox.com/v3';
function key(symbol: string, exchange: 'NSE' | 'BSE') { return `${exchange}:${symbol.toUpperCase()}`; }

export interface UpstoxOrderHistory {
  order_id?: string;
  status?: string;
  status_message?: string;
  quantity?: number;
  filled_quantity?: number;
  average_price?: number;
  price?: number;
  trigger_price?: number;
  transaction_type?: string;
  order_type?: string;
  order_timestamp?: string;
  exchange?: string;
  trading_symbol?: string;
  tag?: string;
  [key: string]: unknown;
}

export interface UpstoxTrade {
  trade_id?: string;
  order_id?: string;
  order_ref_id?: string;
  exchange?: string;
  trading_symbol?: string;
  quantity?: number;
  average_price?: number;
  traded_price?: number;
  traded_quantity?: number;
  order_timestamp?: string;
  exchange_timestamp?: string;
  fee?: number;
  [key: string]: unknown;
}

export class UpstoxAdapter implements BrokerAdapter, MarketDataAdapter {
  constructor(private readonly config: UpstoxConfig) {}

  private instrument(symbol: string, exchange: 'NSE' | 'BSE') {
    const value = this.config.instrumentMap[key(symbol, exchange)];
    if (!value) throw new Error(`UPSTOX_INSTRUMENT_NOT_CONFIGURED:${exchange}:${symbol.toUpperCase()}`);
    return value;
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.accessToken}`, ...(init.headers ?? {}) }
    });
    const text = await response.text();
    let body: unknown;
    try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
    if (!response.ok) throw new Error(`UPSTOX_HTTP_${response.status}:${typeof body === 'string' ? body : JSON.stringify(body)}`);
    return body as T;
  }

  private orderPayload(order: CreateOrderRequest) {
    if (order.reduceOnly) throw new Error('UPSTOX_REDUCE_ONLY_UNSUPPORTED_FOR_EQUITIES');
    if (order.postOnly || order.timeInForce === 'ALO') throw new Error('UPSTOX_POST_ONLY_UNSUPPORTED');
    if (['TAKE_MARKET', 'TAKE_LIMIT', 'SCALE', 'TWAP'].includes(order.orderType)) throw new Error(`UPSTOX_ORDER_TYPE_UNSUPPORTED:${order.orderType}`);
    const orderType = order.orderType === 'STOP_MARKET' ? 'SL-M' : order.orderType === 'STOP_LIMIT' ? 'SL' : order.orderType;
    return { quantity: order.quantity, product: 'D', validity: order.timeInForce === 'IOC' ? 'IOC' : 'DAY', price: order.limitPriceInr ?? 0, tag: order.clientOrderId ?? order.idempotencyKey.slice(0, 20), instrument_token: this.instrument(order.symbol, order.exchange), order_type: orderType, transaction_type: order.side, disclosed_quantity: 0, trigger_price: order.triggerPriceInr ?? 0, is_amo: false, slice: true, market_protection: -1 };
  }

  async placeOrder(order: CreateOrderRequest): Promise<OrderReceipt> {
    const result = await this.request<UpstoxResponse<{ order_id: string }>>(`${orderBase(this.config)}/order/place`, { method: 'POST', body: JSON.stringify(this.orderPayload(order)) });
    return { providerOrderId: result.data.order_id, status: 'ACCEPTED', acceptedAt: new Date().toISOString() };
  }

  async placeTpSl(order: CreateTpSlRequest): Promise<OrderReceipt> {
    if (order.kind === 'TP') throw new Error('UPSTOX_TAKE_PROFIT_REQUIRES_TRIGGER_ENGINE');
    const payload = { quantity: order.quantity, product: 'D', validity: 'DAY', price: order.market ? 0 : order.limitPriceInr ?? 0, tag: order.idempotencyKey.slice(0, 20), instrument_token: this.instrument(order.symbol, order.exchange), order_type: order.market ? 'SL-M' : 'SL', transaction_type: order.side, disclosed_quantity: 0, trigger_price: order.triggerPriceInr, is_amo: false, slice: true, market_protection: -1 };
    const result = await this.request<UpstoxResponse<{ order_id: string }>>(`${orderBase(this.config)}/order/place`, { method: 'POST', body: JSON.stringify(payload) });
    return { providerOrderId: result.data.order_id, status: 'ACCEPTED', acceptedAt: new Date().toISOString() };
  }

  async cancelOrder(orderId: string): Promise<void> { await this.request(`${orderBase(this.config)}/order/cancel?order_id=${encodeURIComponent(orderId)}`, { method: 'DELETE' }); }

  async modifyOrder(orderId: string, order: CreateOrderRequest): Promise<OrderReceipt> {
    const payload = this.orderPayload(order);
    const result = await this.request<UpstoxResponse<{ order_id: string }>>(`${orderBase(this.config)}/order/modify`, { method: 'PUT', body: JSON.stringify({ ...payload, order_id: orderId }) });
    return { providerOrderId: result.data.order_id, status: 'ACCEPTED', acceptedAt: new Date().toISOString() };
  }

  async getOrderHistory(orderId: string): Promise<UpstoxOrderHistory[]> {
    const result = await this.request<UpstoxResponse<UpstoxOrderHistory[]>>(`${marketBase(this.config).replace(/\/v3$/, '/v2')}/order/history?order_id=${encodeURIComponent(orderId)}`);
    return Array.isArray(result.data) ? result.data : [];
  }

  async getOrderTrades(orderId: string): Promise<UpstoxTrade[]> {
    const result = await this.request<UpstoxResponse<UpstoxTrade[]>>(`${marketBase(this.config).replace(/\/v3$/, '/v2')}/order/trades?order_id=${encodeURIComponent(orderId)}`);
    return Array.isArray(result.data) ? result.data : [];
  }

  async quote(symbol: string, exchange: 'NSE' | 'BSE'): Promise<Quote> {
    const instrument = this.instrument(symbol, exchange);
    const result = await this.request<UpstoxResponse<Record<string, any>>>(`${marketBase(this.config)}/market-quote/quotes?instrument_key=${encodeURIComponent(instrument)}`);
    const row = Object.values(result.data)[0];
    if (!row) throw new Error('UPSTOX_QUOTE_NOT_FOUND');
    return { symbol: symbol.toUpperCase(), exchange, lastPriceInr: Number(row.last_price), bestBidInr: Number(row.depth?.buy?.[0]?.price) || undefined, bestAskInr: Number(row.depth?.sell?.[0]?.price) || undefined, asOf: String(row.timestamp ?? new Date().toISOString()) };
  }

  async orderBook(symbol: string, exchange: 'NSE' | 'BSE'): Promise<OrderBook> {
    const instrument = this.instrument(symbol, exchange);
    const result = await this.request<UpstoxResponse<Record<string, any>>>(`${marketBase(this.config)}/market-quote/quotes?instrument_key=${encodeURIComponent(instrument)}`);
    const row = Object.values(result.data)[0];
    if (!row) throw new Error('UPSTOX_ORDERBOOK_NOT_FOUND');
    return { symbol: symbol.toUpperCase(), exchange, bids: (row.depth?.buy ?? []).filter((x: any) => Number(x.price) > 0).map((x: any) => ({ priceInr: Number(x.price), quantity: Number(x.quantity), orders: Number(x.orders) })), asks: (row.depth?.sell ?? []).filter((x: any) => Number(x.price) > 0).map((x: any) => ({ priceInr: Number(x.price), quantity: Number(x.quantity), orders: Number(x.orders) })), asOf: String(row.timestamp ?? new Date().toISOString()) };
  }
}
