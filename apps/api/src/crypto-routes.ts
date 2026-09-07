import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { CryptoGatewayAdapter } from '@inrliquid/adapters';
import { createCryptoGatewayWalletPayment } from './payments.js';

export async function registerCryptoRoutes(app: FastifyInstance, pool: Pool, gateway: CryptoGatewayAdapter | null) {
  app.post('/v1/payments/crypto/intents', async (request, reply) => {
    const parsed = z.object({ amountUsd:z.number().positive().finite(), amountInr:z.number().positive().finite(), asset:z.string().trim().toUpperCase().min(2).max(20), network:z.string().trim().toUpperCase().min(2).max(30), idempotencyKey:z.string().min(16).max(128) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error:'INVALID_CRYPTO_PAYMENT', issues:parsed.error.issues });
    if (!gateway) return reply.code(503).send({ error:'CRYPTO_UNAVAILABLE', message:'Crypto gateway is not configured' });
    if (process.env.ALLOW_DEV_USER_HEADER !== 'true') return reply.code(401).send({ error:'AUTH_PROVIDER_REQUIRED' });
    const header=request.headers['x-user-id'];
    if (typeof header !== 'string' || !z.string().uuid().safeParse(header).success) return reply.code(401).send({ error:'AUTH_REQUIRED' });
    try { return reply.code(201).send(await createCryptoGatewayWalletPayment(pool,header,parsed.data.amountUsd,parsed.data.amountInr,parsed.data.asset,parsed.data.network,parsed.data.idempotencyKey,gateway)); }
    catch(error) { return reply.code(503).send({ error:'CRYPTO_UNAVAILABLE', message:String(error) }); }
  });
}
