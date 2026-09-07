import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { CryptoGatewayAdapter } from '@inrliquid/adapters';
import { createCryptoGatewayWalletPayment } from './payments.js';
import { authenticateRequest } from './auth.js';

function verify(raw:string,signature:string|undefined,secret:string|undefined){if(!signature||!secret)return false;const expected=createHmac('sha256',secret).update(raw,'utf8').digest('hex');const supplied=signature.replace(/^sha256=/,'');const a=Buffer.from(expected,'utf8'),b=Buffer.from(supplied,'utf8');return a.length===b.length&&timingSafeEqual(a,b);}

export async function registerCryptoRoutes(app:FastifyInstance,pool:Pool,gateway:CryptoGatewayAdapter|null){
  app.post('/v1/payments/crypto/intents',async(request,reply)=>{
    const parsed=z.object({amountUsd:z.number().positive().finite(),asset:z.string().trim().toUpperCase().min(2).max(20),network:z.string().trim().toUpperCase().min(2).max(30),idempotencyKey:z.string().min(16).max(128)}).safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_CRYPTO_PAYMENT',issues:parsed.error.issues});
    if(!gateway)return reply.code(503).send({error:'CRYPTO_UNAVAILABLE',message:'Crypto gateway is not configured'});
    let userId:string;try{userId=authenticateRequest(request);}catch(error){return reply.code(401).send({error:String(error)});}
    try{return reply.code(201).send(await createCryptoGatewayWalletPayment(pool,userId,parsed.data.amountUsd,0,parsed.data.asset,parsed.data.network,parsed.data.idempotencyKey,gateway));}
    catch(error){return reply.code(503).send({error:'CRYPTO_UNAVAILABLE',message:String(error)});}
  });
  app.post('/v1/webhooks/crypto',{config:{rawBody:true}},async(request,reply)=>{
    const raw=String((request as typeof request&{rawBody?:string}).rawBody??'');
    if(!verify(raw,request.headers['x-crypto-signature'] as string|undefined,process.env.CRYPTO_GATEWAY_WEBHOOK_SECRET))return reply.code(401).send({error:'INVALID_CRYPTO_WEBHOOK_SIGNATURE'});
    let body:unknown;try{body=JSON.parse(raw);}catch{return reply.code(400).send({error:'INVALID_CRYPTO_WEBHOOK_JSON'});}
    const event=z.object({eventId:z.string().min(1).optional(),paymentId:z.string().min(1),status:z.enum(['CONFIRMED','FAILED','EXPIRED']),txHash:z.string().min(1).optional(),confirmations:z.number().int().min(0).optional(),settledInr:z.number().positive().finite().optional(),settledRate:z.number().positive().finite().optional(),settledFeeUsd:z.number().nonnegative().finite().optional()}).superRefine((v,c)=>{if(v.status==='CONFIRMED'&&v.settledInr===undefined)c.addIssue({code:'custom',path:['settledInr'],message:'settledInr is required for confirmed payments'});}).safeParse(body);
    if(!event.success)return reply.code(400).send({error:'INVALID_CRYPTO_WEBHOOK',issues:event.error.issues});
    const eventId=event.data.eventId??`${event.data.paymentId}:${event.data.status}:${event.data.txHash??''}`;
    const inserted=await pool.query(`INSERT INTO payment_webhook_events(event_id,provider,event_type,payload) VALUES($1,'crypto',$2,$3) ON CONFLICT(event_id) DO NOTHING`,[eventId,event.data.status,body]);
    if(!inserted.rowCount)return reply.send({ok:true,duplicate:true});
    const client=await pool.connect();
    try{await client.query('BEGIN');const intent=await client.query(`SELECT * FROM payment_intents WHERE provider='crypto' AND provider_payment_id=$1 FOR UPDATE`,[event.data.paymentId]);if(intent.rows[0]){const row=intent.rows[0],tx=await client.query(`SELECT * FROM wallet_transactions WHERE provider='crypto' AND provider_transaction_id=$1 FOR UPDATE`,[event.data.paymentId]);if(event.data.status==='CONFIRMED'){const settledPaise=Math.round(event.data.settledInr!*100);if(settledPaise<=0)throw new Error('INVALID_CRYPTO_SETTLEMENT_AMOUNT');if(row.status!=='SUCCEEDED')await client.query(`UPDATE payment_intents SET status='SUCCEEDED',amount_paise=$1,completed_at=now(),metadata=metadata || $2::jsonb WHERE id=$3`,[settledPaise,JSON.stringify({txHash:event.data.txHash,confirmations:event.data.confirmations??0,settledInr:event.data.settledInr,settledRate:event.data.settledRate,settledFeeUsd:event.data.settledFeeUsd}),row.id]);if(tx.rows[0]?.status==='PENDING'){await client.query(`UPDATE wallet_transactions SET amount_paise=$1,status='COMPLETED',completed_at=now(),metadata=metadata || $2::jsonb WHERE id=$3`,[settledPaise,JSON.stringify({txHash:event.data.txHash,confirmations:event.data.confirmations??0,settledInr:event.data.settledInr,settledRate:event.data.settledRate,settledFeeUsd:event.data.settledFeeUsd}),tx.rows[0].id]);await client.query(`UPDATE wallet_accounts SET available_paise=available_paise+$1,updated_at=now() WHERE id=$2`,[settledPaise,row.wallet_id]);}}else if(['FAILED','EXPIRED'].includes(event.data.status)&&['PENDING','PROCESSING','CREATED'].includes(row.status)){await client.query(`UPDATE payment_intents SET status='FAILED',completed_at=now(),metadata=metadata || $1::jsonb WHERE id=$2`,[JSON.stringify({providerStatus:event.data.status,txHash:event.data.txHash,confirmations:event.data.confirmations??0}),row.id]);if(tx.rows[0]?.status==='PENDING')await client.query(`UPDATE wallet_transactions SET status='FAILED',completed_at=now() WHERE id=$1`,[tx.rows[0].id]);}}await client.query(`UPDATE payment_webhook_events SET processed_at=now() WHERE event_id=$1`,[eventId]);await client.query('COMMIT');return reply.send({ok:true});}catch(error){await client.query('ROLLBACK');throw error}finally{client.release();}
  });
}
