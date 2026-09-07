import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { createStripeCryptoPaymentIntent, createStripePaymentIntent, type StripeConfig } from '@inrliquid/adapters';

export async function createStripeWalletPayment(pool: Pool, userId: string, amountInr: number, method: 'card'|'upi', idempotencyKey: string, config: StripeConfig) {
  const amountPaise = Math.round(amountInr * 100); const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT * FROM payment_intents WHERE idempotency_key=$1 FOR UPDATE`, [idempotencyKey]);
    if (existing.rows[0]) { await client.query('COMMIT'); return existing.rows[0]; }
    const wallet = await client.query(`INSERT INTO wallet_accounts(id,user_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET updated_at=now() RETURNING id`, [randomUUID(), userId]);
    const intentId = randomUUID(), txId = randomUUID(), providerMethod = method === 'card' ? 'CARD' : 'UPI';
    await client.query(`INSERT INTO payment_intents(id,user_id,wallet_id,provider,payment_method,amount_paise,status,idempotency_key,metadata) VALUES($1,$2,$3,'stripe',$4,$5,'PENDING',$6,$7)`, [intentId,userId,wallet.rows[0].id,providerMethod,amountPaise,idempotencyKey,JSON.stringify({idempotencyKey})]);
    await client.query(`INSERT INTO wallet_transactions(id,wallet_id,type,status,amount_paise,provider,idempotency_key,metadata) VALUES($1,$2,'DEPOSIT','PENDING',$3,'stripe',$4,$5)`, [txId,wallet.rows[0].id,amountPaise,`stripe:${idempotencyKey}`,JSON.stringify({paymentIntentId:intentId,method:providerMethod})]);
    await client.query('COMMIT');
    try {
      const payment = await createStripePaymentIntent(config,{amountInr,idempotencyKey,method,metadata:{wallet_transaction_id:txId,payment_intent_id:intentId}});
      await pool.query(`UPDATE payment_intents SET provider_payment_id=$1,metadata=metadata || $2 WHERE id=$3`,[payment.providerPaymentId,JSON.stringify(payment),intentId]);
      await pool.query(`UPDATE wallet_transactions SET provider_transaction_id=$1,metadata=metadata || $2 WHERE id=$3`,[payment.providerPaymentId,JSON.stringify(payment),txId]);
      return { paymentIntentId:intentId, transactionId:txId, payment };
    } catch(error) { await pool.query(`UPDATE payment_intents SET status='FAILED',completed_at=now(),metadata=metadata || $1 WHERE id=$2`,[JSON.stringify({providerError:String(error)}),intentId]); await pool.query(`UPDATE wallet_transactions SET status='FAILED',completed_at=now(),metadata=metadata || $1 WHERE id=$2`,[JSON.stringify({providerError:String(error)}),txId]); throw error; }
  } catch(error) { try { await client.query('ROLLBACK'); } catch {} throw error; } finally { client.release(); }
}

export async function createStripeCryptoWalletPayment(pool: Pool, userId: string, amountUsd: number, targetInr: number, asset: string, network: string, idempotencyKey: string, config: StripeConfig) {
  const amountPaise = Math.round(targetInr * 100); const client = await pool.connect();
  try {
    await client.query('BEGIN'); const existing = await client.query(`SELECT * FROM payment_intents WHERE idempotency_key=$1 FOR UPDATE`,[idempotencyKey]);
    if(existing.rows[0]){await client.query('COMMIT');return existing.rows[0];}
    const wallet = await client.query(`INSERT INTO wallet_accounts(id,user_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET updated_at=now() RETURNING id`,[randomUUID(),userId]);
    const intentId=randomUUID(),txId=randomUUID();
    await client.query(`INSERT INTO payment_intents(id,user_id,wallet_id,provider,payment_method,amount_paise,settlement_amount_minor,settlement_currency,status,idempotency_key,metadata) VALUES($1,$2,$3,'stripe','CRYPTO',$4,$5,'USD','PENDING',$6,$7)`,[intentId,userId,wallet.rows[0].id,amountPaise,Math.round(amountUsd*100),idempotencyKey,JSON.stringify({asset,network,amountUsd,targetInr})]);
    await client.query(`INSERT INTO wallet_transactions(id,wallet_id,type,status,amount_paise,provider,idempotency_key,metadata) VALUES($1,$2,'DEPOSIT','PENDING',$3,'stripe',$4,$5)`,[txId,wallet.rows[0].id,amountPaise,`stripe:${idempotencyKey}`,JSON.stringify({paymentIntentId:intentId,method:'CRYPTO',asset,network,amountUsd})]);
    await client.query('COMMIT');
    try { const payment=await createStripeCryptoPaymentIntent(config,{amountUsd,idempotencyKey,asset,network}); await pool.query(`UPDATE payment_intents SET provider_payment_id=$1,metadata=metadata || $2 WHERE id=$3`,[payment.providerPaymentId,JSON.stringify(payment),intentId]); await pool.query(`UPDATE wallet_transactions SET provider_transaction_id=$1,metadata=metadata || $2 WHERE id=$3`,[payment.providerPaymentId,JSON.stringify(payment),txId]); return {paymentIntentId:intentId,transactionId:txId,payment,targetInr}; }
    catch(error){await pool.query(`UPDATE payment_intents SET status='FAILED',completed_at=now(),metadata=metadata || $1 WHERE id=$2`,[JSON.stringify({providerError:String(error)}),intentId]);await pool.query(`UPDATE wallet_transactions SET status='FAILED',completed_at=now(),metadata=metadata || $1 WHERE id=$2`,[JSON.stringify({providerError:String(error)}),txId]);throw error;}
  } catch(error){try{await client.query('ROLLBACK')}catch{}throw error}finally{client.release()}
}

export async function settleStripeWebhook(pool: Pool, event: Record<string, any>) {
  const object=event.data?.object; const providerId=String(object?.id??''); if(!providerId)return;
  const client=await pool.connect(); try { await client.query('BEGIN'); const intent=await client.query(`SELECT * FROM payment_intents WHERE provider='stripe' AND provider_payment_id=$1 FOR UPDATE`,[providerId]); if(!intent.rows[0]){await client.query('ROLLBACK');return;}
    const row=intent.rows[0]; const tx=await client.query(`SELECT * FROM wallet_transactions WHERE provider='stripe' AND provider_transaction_id=$1 FOR UPDATE`,[providerId]);
    if(event.type==='payment_intent.succeeded' && row.status!=='SUCCEEDED'){await client.query(`UPDATE payment_intents SET status='SUCCEEDED',completed_at=now() WHERE id=$1`,[row.id]);if(tx.rows[0]?.status==='PENDING'){await client.query(`UPDATE wallet_transactions SET status='COMPLETED',completed_at=now() WHERE id=$1`,[tx.rows[0].id]);await client.query(`UPDATE wallet_accounts SET available_paise=available_paise+$1,updated_at=now() WHERE id=$2`,[row.amount_paise,row.wallet_id]);}}
    if(['payment_intent.payment_failed','payment_intent.canceled'].includes(event.type) && ['PENDING','PROCESSING','CREATED'].includes(row.status)){await client.query(`UPDATE payment_intents SET status=$1,completed_at=now() WHERE id=$2`,[event.type.endsWith('canceled')?'CANCELED':'FAILED',row.id]);if(tx.rows[0]?.status==='PENDING')await client.query(`UPDATE wallet_transactions SET status='FAILED',completed_at=now() WHERE id=$1`,[tx.rows[0].id]);}
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
