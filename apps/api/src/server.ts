import Fastify from 'fastify';
import { z } from 'zod';
import { createOrderRequestSchema, createPaymentIntentSchema, createTpSlRequestSchema, type BrokerAdapter, type MarketDataAdapter, type UpiAdapter } from '@inrliquid/domain';

const app = Fastify({ logger: true });

const unavailable = (name: string) => new Error(`${name} provider is not configured for live operation`);
const broker: BrokerAdapter = {
  async placeOrder() { throw unavailable('Broker'); },
  async placeTpSl() { throw unavailable('Broker'); },
  async cancelOrder() { throw unavailable('Broker'); },
  async modifyOrder() { throw unavailable('Broker'); }
};
const marketData: MarketDataAdapter = {
  async quote() { throw unavailable('Market-data'); },
  async orderBook() { throw unavailable('Market-data'); }
};
const upi: UpiAdapter = {
  async createPaymentIntent() { throw unavailable('UPI'); },
  async cancelPaymentIntent() { throw unavailable('UPI'); }
};

app.get('/health', async () => ({ status: 'ok', service: 'inrliquid-api' }));
app.get('/v1/market/:exchange/:symbol/quote', async (request, reply) => {
  const params = z.object({ exchange: z.enum(['NSE', 'BSE']), symbol: z.string().min(1).max(30) }).parse(request.params);
  try { return await marketData.quote(params.symbol.toUpperCase(), params.exchange); }
  catch (error) { return reply.code(503).send({ error: 'MARKET_DATA_UNAVAILABLE', message: String(error) }); }
});
app.get('/v1/market/:exchange/:symbol/orderbook', async (request, reply) => {
  const params = z.object({ exchange: z.enum(['NSE', 'BSE']), symbol: z.string().min(1).max(30) }).parse(request.params);
  try { return await marketData.orderBook(params.symbol.toUpperCase(), params.exchange); }
  catch (error) { return reply.code(503).send({ error: 'ORDERBOOK_UNAVAILABLE', message: String(error) }); }
});
app.post('/v1/orders', async (request, reply) => {
  const parsed = createOrderRequestSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'INVALID_ORDER', issues: parsed.error.issues });
  try { return reply.code(201).send(await broker.placeOrder(parsed.data)); }
  catch (error) { return reply.code(503).send({ error: 'EXECUTION_UNAVAILABLE', message: String(error) }); }
});
app.post('/v1/orders/tpsl', async (request, reply) => {
  const parsed = createTpSlRequestSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'INVALID_TPSL', issues: parsed.error.issues });
  try { return reply.code(201).send(await broker.placeTpSl(parsed.data)); }
  catch (error) { return reply.code(503).send({ error: 'EXECUTION_UNAVAILABLE', message: String(error) }); }
});
app.patch('/v1/orders/:orderId', async (request, reply) => {
  const orderId = z.string().min(1).parse((request.params as { orderId: string }).orderId);
  const parsed = createOrderRequestSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'INVALID_ORDER', issues: parsed.error.issues });
  try { return reply.send(await broker.modifyOrder(orderId, parsed.data)); }
  catch (error) { return reply.code(503).send({ error: 'EXECUTION_UNAVAILABLE', message: String(error) }); }
});
app.delete('/v1/orders/:orderId', async (request, reply) => {
  const orderId = z.string().min(1).parse((request.params as { orderId: string }).orderId);
  try { await broker.cancelOrder(orderId); return reply.code(204).send(); }
  catch (error) { return reply.code(503).send({ error: 'EXECUTION_UNAVAILABLE', message: String(error) }); }
});
app.post('/v1/payments/upi/intents', async (request, reply) => {
  const parsed = createPaymentIntentSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'INVALID_PAYMENT', issues: parsed.error.issues });
  try { return reply.code(201).send(await upi.createPaymentIntent(parsed.data)); }
  catch (error) { return reply.code(503).send({ error: 'UPI_UNAVAILABLE', message: String(error) }); }
});
app.delete('/v1/payments/upi/intents/:paymentId', async (request, reply) => {
  const paymentId = z.string().min(1).parse((request.params as { paymentId: string }).paymentId);
  try { await upi.cancelPaymentIntent(paymentId); return reply.code(204).send(); }
  catch (error) { return reply.code(503).send({ error: 'UPI_UNAVAILABLE', message: String(error) }); }
});

await app.listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' });
