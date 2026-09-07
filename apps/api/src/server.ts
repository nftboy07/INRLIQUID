import Fastify from 'fastify';
import { z } from 'zod';
import { createOrderRequestSchema, type BrokerAdapter, type MarketDataAdapter, type UpiAdapter } from '@inrliquid/domain';

const app = Fastify({ logger: true });

const broker: BrokerAdapter = {
  async placeOrder(order) {
    throw new Error(`Broker provider not configured for live execution: ${order.symbol}`);
  },
  async cancelOrder(orderId) {
    throw new Error(`Broker provider not configured for cancellation: ${orderId}`);
  }
};

const marketData: MarketDataAdapter = {
  async quote(symbol, exchange) {
    throw new Error(`Market-data provider not configured: ${exchange}:${symbol}`);
  }
};

const upi: UpiAdapter = {
  async createPaymentIntent(input) {
    throw new Error(`UPI provider not configured for live payments: ${input.amountInr}`);
  }
};

app.get('/health', async () => ({ status: 'ok', service: 'inrliquid-api' }));

app.get('/v1/market/:exchange/:symbol/quote', async (request, reply) => {
  const params = z.object({ exchange: z.enum(['NSE', 'BSE']), symbol: z.string().min(1).max(30) }).parse(request.params);
  try {
    return await marketData.quote(params.symbol.toUpperCase(), params.exchange);
  } catch (error) {
    return reply.code(503).send({ error: 'MARKET_DATA_UNAVAILABLE', message: String(error) });
  }
});

app.post('/v1/orders', async (request, reply) => {
  const parsed = createOrderRequestSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'INVALID_ORDER', issues: parsed.error.issues });
  try {
    const result = await broker.placeOrder(parsed.data);
    return reply.code(201).send(result);
  } catch (error) {
    return reply.code(503).send({ error: 'EXECUTION_UNAVAILABLE', message: String(error) });
  }
});

app.post('/v1/payments/upi/intents', async (request, reply) => {
  const body = z.object({ amountInr: z.number().positive(), purpose: z.enum(['TRADING_FUNDING', 'SETTLEMENT']), idempotencyKey: z.string().min(16).max(128) }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: 'INVALID_PAYMENT', issues: body.error.issues });
  try {
    return reply.code(201).send(await upi.createPaymentIntent(body.data));
  } catch (error) {
    return reply.code(503).send({ error: 'UPI_UNAVAILABLE', message: String(error) });
  }
});

await app.listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' });
