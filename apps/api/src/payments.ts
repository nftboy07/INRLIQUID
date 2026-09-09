import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  amountsMatchPaise,
  createStripeCryptoPaymentIntent,
  createStripePaymentIntent,
  CryptoGatewayAdapter,
  stripeSettlementAction,
  type StripeConfig,
  type StripePaymentIntent,
} from '@inrliquid/adapters';

async function walletFor(client: PoolClient, userId: string) {
  return (await client.query(
    `INSERT INTO wallet_accounts(id,user_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET updated_at=now() RETURNING id`,
    [randomUUID(), userId],
  )).rows[0];
}

function stripeResponse(row: Record<string, unknown>, payment?: StripePaymentIntent) {
  const metadata = typeof row.metadata === 'object' && row.metadata ? row.metadata as Record<string, unknown> : {};
  return {
    paymentIntentId: row.id,
    transactionId: metadata.walletTransactionId ?? metadata.wallet_transaction_id,
    payment: payment ?? {
      providerPaymentId: row.provider_payment_id,
      clientSecret: row.client_secret,
      amountInr: Number(row.amount_paise) / 100,
      currency: 'INR',
      method: String(row.payment_method).toLowerCase(),
      status: row.status,
      createdAt: row.created_at,
    },
  };
}

export async function createStripeWalletPayment(
  pool: Pool,
  userId: string,
  amountInr: number,
  method: 'card' | 'upi',
  idempotencyKey: string,
  config: StripeConfig,
) {
  const amountPaise = Math.round(amountInr * 100);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT * FROM payment_intents WHERE idempotency_key=$1 FOR UPDATE`, [idempotencyKey]);
    if (existing.rows[0]) {
      await client.query('COMMIT');
      return stripeResponse(existing.rows[0]);
    }
    const wallet = await walletFor(client, userId);
    const intentId = randomUUID();
    const txId = randomUUID();
    const providerMethod = method === 'card' ? 'CARD' : 'UPI';
    await client.query(
      `INSERT INTO payment_intents(id,user_id,wallet_id,provider,payment_method,amount_paise,status,idempotency_key,metadata)
       VALUES($1,$2,$3,'stripe',$4,$5,'PENDING',$6,$7)`,
      [intentId, userId, wallet.id, providerMethod, amountPaise, idempotencyKey, JSON.stringify({ idempotencyKey, walletTransactionId: txId, method: providerMethod })],
    );
    await client.query(
      `INSERT INTO wallet_transactions(id,wallet_id,type,status,amount_paise,provider,idempotency_key,metadata)
       VALUES($1,$2,'DEPOSIT','PENDING',$3,'stripe',$4,$5::jsonb)`,
      [txId, wallet.id, amountPaise, `stripe:${idempotencyKey}`, JSON.stringify({ paymentIntentId: intentId, method: providerMethod })],
    );
    await client.query('COMMIT');
    try {
      const payment = await createStripePaymentIntent(config, {
        amountInr,
        idempotencyKey,
        method,
        metadata: { wallet_transaction_id: txId, payment_intent_id: intentId, user_id: userId },
      });
      await pool.query(
        `UPDATE payment_intents SET provider_payment_id=$1,client_secret=$2,metadata=metadata || $3::jsonb WHERE id=$4`,
        [payment.providerPaymentId, payment.clientSecret ?? null, JSON.stringify(payment), intentId],
      );
      await pool.query(
        `UPDATE wallet_transactions SET provider_transaction_id=$1,metadata=metadata || $2::jsonb WHERE id=$3`,
        [payment.providerPaymentId, JSON.stringify(payment), txId],
      );
      return { paymentIntentId: intentId, transactionId: txId, payment };
    } catch (error) {
      await pool.query(
        `UPDATE payment_intents SET status='FAILED',completed_at=now(),metadata=metadata || $1::jsonb WHERE id=$2`,
        [JSON.stringify({ providerError: String(error) }), intentId],
      );
      await pool.query(
        `UPDATE wallet_transactions SET status='FAILED',completed_at=now() WHERE id=$1 AND status='PENDING'`,
        [txId],
      );
      throw error;
    }
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* already committed or failed */ }
    throw error;
  } finally {
    client.release();
  }
}

export async function createStripeCryptoWalletPayment(
  pool: Pool,
  userId: string,
  amountUsd: number,
  targetInr: number,
  asset: string,
  network: string,
  idempotencyKey: string,
  config: StripeConfig,
) {
  const amountPaise = Math.round(targetInr * 100);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT * FROM payment_intents WHERE idempotency_key=$1 FOR UPDATE`, [idempotencyKey]);
    if (existing.rows[0]) {
      await client.query('COMMIT');
      return existing.rows[0];
    }
    const wallet = await walletFor(client, userId);
    const intentId = randomUUID();
    const txId = randomUUID();
    await client.query(
      `INSERT INTO payment_intents(id,user_id,wallet_id,provider,payment_method,asset,network,amount_paise,settlement_amount_minor,settlement_currency,status,idempotency_key,metadata)
       VALUES($1,$2,$3,'stripe','CRYPTO',$4,$5,$6,$7,'INR','PENDING',$8,$9)`,
      [intentId, userId, wallet.id, asset, network, amountPaise, amountPaise, idempotencyKey, JSON.stringify({ asset, network, amountUsd, targetInr, walletTransactionId: txId })],
    );
    await client.query(
      `INSERT INTO wallet_transactions(id,wallet_id,type,status,amount_paise,provider,idempotency_key,metadata)
       VALUES($1,$2,'DEPOSIT','PENDING',$3,'stripe',$4,$5::jsonb)`,
      [txId, wallet.id, amountPaise, `stripe:${idempotencyKey}`, JSON.stringify({ paymentIntentId: intentId, method: 'CRYPTO', asset, network, amountUsd })],
    );
    await client.query('COMMIT');
    try {
      const payment = await createStripeCryptoPaymentIntent(config, { amountUsd, idempotencyKey, asset, network });
      await pool.query(
        `UPDATE payment_intents SET provider_payment_id=$1,client_secret=$2,metadata=metadata || $3::jsonb WHERE id=$4`,
        [payment.providerPaymentId, payment.clientSecret ?? null, JSON.stringify(payment), intentId],
      );
      await pool.query(
        `UPDATE wallet_transactions SET provider_transaction_id=$1,metadata=metadata || $2::jsonb WHERE id=$3`,
        [payment.providerPaymentId, JSON.stringify(payment), txId],
      );
      return { paymentIntentId: intentId, transactionId: txId, payment, targetInr };
    } catch (error) {
      await pool.query(
        `UPDATE payment_intents SET status='FAILED',completed_at=now(),metadata=metadata || $1::jsonb WHERE id=$2`,
        [JSON.stringify({ providerError: String(error) }), intentId],
      );
      await pool.query(`UPDATE wallet_transactions SET status='FAILED',completed_at=now() WHERE id=$1`, [txId]);
      throw error;
    }
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  } finally {
    client.release();
  }
}

export async function createCryptoGatewayWalletPayment(
  pool: Pool,
  userId: string,
  amountUsd: number,
  _targetInr: number,
  asset: string,
  network: string,
  idempotencyKey: string,
  gateway: CryptoGatewayAdapter,
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT * FROM payment_intents WHERE idempotency_key=$1 FOR UPDATE`, [idempotencyKey]);
    if (existing.rows[0]) {
      await client.query('COMMIT');
      return existing.rows[0];
    }
    const wallet = await walletFor(client, userId);
    const intentId = randomUUID();
    const txId = randomUUID();
    await client.query('COMMIT');
    let payment;
    try {
      payment = await gateway.createPayment({ amountUsd, asset, network, idempotencyKey, reference: intentId, settlementCurrency: 'INR' });
      if (payment.quotedInr === undefined || !Number.isFinite(payment.quotedInr) || payment.quotedInr <= 0) throw new Error('CRYPTO_GATEWAY_MISSING_INR_QUOTE');
    } catch (error) {
      throw error;
    }
    const amountPaise = Math.round(payment.quotedInr * 100);
    if (amountPaise <= 0) {
      await gateway.cancelPayment(payment.providerPaymentId).catch(() => undefined);
      throw new Error('CRYPTO_GATEWAY_INVALID_INR_QUOTE');
    }
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const race = await db.query(`SELECT * FROM payment_intents WHERE idempotency_key=$1 FOR UPDATE`, [idempotencyKey]);
      if (race.rows[0]) {
        await db.query('COMMIT');
        await gateway.cancelPayment(payment.providerPaymentId).catch(() => undefined);
        return race.rows[0];
      }
      await db.query(
        `INSERT INTO payment_intents(id,user_id,wallet_id,provider,payment_method,asset,network,amount_paise,settlement_amount_minor,settlement_currency,status,idempotency_key,metadata,deposit_address,payment_url,quoted_rate,provider_fee_minor)
         VALUES($1,$2,$3,'crypto','CRYPTO',$4,$5,$6,$7,'INR','PENDING',$8,$9,$10,$11,$12,$13)`,
        [intentId, userId, wallet.id, asset, network, amountPaise, amountPaise, idempotencyKey, JSON.stringify({ amountUsd, sourceCurrency: 'USD', quotedInr: payment.quotedInr, asset, network }), payment.depositAddress, payment.paymentUrl ?? null, payment.quotedRate ?? (payment.quotedInr / amountUsd), payment.providerFeeUsd === undefined ? null : Math.round(payment.providerFeeUsd * 100)],
      );
      await db.query(
        `INSERT INTO wallet_transactions(id,wallet_id,type,status,amount_paise,provider,idempotency_key,metadata)
         VALUES($1,$2,'DEPOSIT','PENDING',$3,'crypto',$4,$5::jsonb)`,
        [txId, wallet.id, amountPaise, `crypto:${idempotencyKey}`, JSON.stringify({ paymentIntentId: intentId, asset, network, amountUsd, quotedInr: payment.quotedInr })],
      );
      await db.query(`UPDATE payment_intents SET provider_payment_id=$1,metadata=metadata || $2::jsonb WHERE id=$3`, [payment.providerPaymentId, JSON.stringify(payment), intentId]);
      await db.query(`UPDATE wallet_transactions SET provider_transaction_id=$1,metadata=metadata || $2::jsonb WHERE id=$3`, [payment.providerPaymentId, JSON.stringify(payment), txId]);
      await db.query('COMMIT');
      return { paymentIntentId: intentId, transactionId: txId, payment, targetInr: payment.quotedInr };
    } catch (error) {
      try { await db.query('ROLLBACK'); } catch { /* ignore */ }
      await gateway.cancelPayment(payment.providerPaymentId).catch(() => undefined);
      throw error;
    } finally {
      db.release();
    }
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  } finally {
    client.release();
  }
}

export async function ingestProviderWebhook(
  pool: Pool,
  args: {
    eventId: string;
    provider: string;
    eventType: string;
    payload: unknown;
    settle: (client: PoolClient) => Promise<void>;
  },
): Promise<{ ok: true; duplicate: boolean }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO payment_webhook_events(event_id,provider,event_type,payload) VALUES($1,$2,$3,$4) ON CONFLICT(event_id) DO NOTHING`,
      [args.eventId, args.provider, args.eventType, args.payload],
    );
    if (!inserted.rowCount) {
      await client.query('COMMIT');
      return { ok: true, duplicate: true };
    }
    await args.settle(client);
    await client.query(`UPDATE payment_webhook_events SET processed_at=now() WHERE event_id=$1`, [args.eventId]);
    await client.query('COMMIT');
    return { ok: true, duplicate: false };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function creditDeposit(client: PoolClient, walletId: string, amountPaise: number, txId: string, intentId?: string) {
  await client.query(`SELECT id FROM wallet_accounts WHERE id=$1 FOR UPDATE`, [walletId]);
  if (intentId) await client.query(`UPDATE payment_intents SET status='SUCCEEDED',completed_at=now() WHERE id=$1`, [intentId]);
  await client.query(`UPDATE wallet_transactions SET status='COMPLETED',completed_at=now() WHERE id=$1`, [txId]);
  await client.query(`UPDATE wallet_accounts SET available_paise=available_paise+$1,updated_at=now() WHERE id=$2`, [amountPaise, walletId]);
}

export async function settleStripeWebhook(pool: Pool, event: Record<string, any>, client?: PoolClient) {
  const object = event.data?.object;
  const providerId = String(object?.id ?? '');
  if (!providerId) return;
  const run = async (db: PoolClient) => {
    const intent = await db.query(`SELECT * FROM payment_intents WHERE provider='stripe' AND provider_payment_id=$1 FOR UPDATE`, [providerId]);
    if (!intent.rows[0]) return;
    const row = intent.rows[0];
    const tx = await db.query(`SELECT * FROM wallet_transactions WHERE provider='stripe' AND provider_transaction_id=$1 FOR UPDATE`, [providerId]);
    const action = stripeSettlementAction(String(event.type ?? ''), String(row.status));
    if (action === 'credit') {
      const received = Number(object?.amount_received ?? object?.amount ?? 0);
      if (!amountsMatchPaise(Number(row.amount_paise), received) || String(object?.currency ?? '').toLowerCase() !== 'inr') {
        await db.query(
          `UPDATE payment_intents SET status='FAILED',completed_at=now(),metadata=metadata || $1::jsonb WHERE id=$2`,
          [JSON.stringify({ providerError: 'STRIPE_AMOUNT_OR_CURRENCY_MISMATCH', received, currency: object?.currency }), row.id],
        );
        if (tx.rows[0]?.status === 'PENDING') await db.query(`UPDATE wallet_transactions SET status='FAILED',completed_at=now() WHERE id=$1`, [tx.rows[0].id]);
        return;
      }
      if (tx.rows[0]?.status === 'PENDING') await creditDeposit(db, row.wallet_id, Number(row.amount_paise), tx.rows[0].id, row.id);
      else await db.query(`UPDATE payment_intents SET status='SUCCEEDED',completed_at=now() WHERE id=$1`, [row.id]);
    }
    if (action === 'fail' || action === 'cancel') {
      await db.query(`UPDATE payment_intents SET status=$1,completed_at=now() WHERE id=$2`, [action === 'cancel' ? 'CANCELED' : 'FAILED', row.id]);
      if (tx.rows[0]?.status === 'PENDING') await db.query(`UPDATE wallet_transactions SET status='FAILED',completed_at=now() WHERE id=$1`, [tx.rows[0].id]);
    }
  };
  if (client) return run(client);
  const owned = await pool.connect();
  try {
    await owned.query('BEGIN');
    await run(owned);
    await owned.query('COMMIT');
  } catch (error) {
    await owned.query('ROLLBACK');
    throw error;
  } finally {
    owned.release();
  }
}

export async function settleRazorpayPaymentCaptured(client: PoolClient, payload: Record<string, any>) {
  const payment = payload.payload?.payment?.entity ?? {};
  const paymentId = String(payment.id ?? '');
  const orderId = String(payment.order_id ?? '');
  const paymentLinkId = String(payment.payment_link_id ?? payload.payload?.payment_link?.entity?.id ?? '');
  const amount = Number(payment.amount ?? payload.payload?.payment_link?.entity?.amount ?? 0);
  const tx = await client.query(
    `SELECT * FROM wallet_transactions
     WHERE provider='razorpay'
       AND (
         provider_transaction_id=$1
         OR provider_transaction_id=$2
         OR provider_transaction_id=$3
         OR metadata->>'orderId'=$2
         OR metadata->>'providerPaymentId'=$1
       )
     FOR UPDATE`,
    [paymentId, orderId, paymentLinkId],
  );
  const row = tx.rows[0];
  if (!row || row.status !== 'PENDING') return;
  if (!amountsMatchPaise(Number(row.amount_paise), amount)) return;
  const intent = await client.query(
    `SELECT * FROM payment_intents WHERE provider='razorpay' AND (provider_payment_id=$1 OR provider_payment_id=$2 OR provider_payment_id=$3 OR idempotency_key=$4) FOR UPDATE`,
    [orderId, paymentId, paymentLinkId, row.idempotency_key],
  );
  await creditDeposit(client, row.wallet_id, Number(row.amount_paise), row.id, intent.rows[0]?.id);
  await client.query(
    `UPDATE wallet_transactions SET provider_transaction_id=COALESCE(NULLIF($1,''),provider_transaction_id),metadata=metadata || $2::jsonb WHERE id=$3`,
    [paymentId || orderId, JSON.stringify({ razorpayPaymentId: paymentId, razorpayOrderId: orderId, vpa: payment.vpa ?? payment.upi?.vpa }), row.id],
  );
}

export async function settleRazorpayPaymentFailed(client: PoolClient, payload: Record<string, any>) {
  const payment = payload.payload?.payment?.entity ?? {};
  const paymentId = String(payment.id ?? '');
  const orderId = String(payment.order_id ?? '');
  const tx = await client.query(
    `SELECT * FROM wallet_transactions WHERE provider='razorpay' AND (provider_transaction_id=$1 OR provider_transaction_id=$2 OR metadata->>'orderId'=$2) FOR UPDATE`,
    [paymentId, orderId],
  );
  if (tx.rows[0]?.status !== 'PENDING') return;
  await client.query(`UPDATE wallet_transactions SET status='FAILED',completed_at=now() WHERE id=$1`, [tx.rows[0].id]);
  await client.query(
    `UPDATE payment_intents SET status='FAILED',completed_at=now() WHERE provider='razorpay' AND (provider_payment_id=$1 OR provider_payment_id=$2)`,
    [orderId, paymentId],
  );
}

export async function settleRazorpayPayout(client: PoolClient, eventType: string, payload: Record<string, any>) {
  const payout = payload.payload?.payout?.entity;
  const payoutId = String(payout?.id ?? '');
  const reference = String(payout?.reference_id ?? '');
  const tx = await client.query(
    `SELECT * FROM wallet_transactions WHERE provider='razorpayx' AND (provider_transaction_id=$1 OR metadata->>'idempotencyKey'=$2) FOR UPDATE`,
    [payoutId, reference],
  );
  if (!tx.rows[0]) return;
  const row = tx.rows[0];
  await client.query(`SELECT id FROM wallet_accounts WHERE id=$1 FOR UPDATE`, [row.wallet_id]);
  if (['payout.pending', 'payout.queued', 'payout.initiated'].includes(eventType)) {
    await client.query(
      `UPDATE wallet_transactions SET provider_transaction_id=COALESCE(NULLIF($1,''),provider_transaction_id),metadata=metadata||$2::jsonb WHERE id=$3`,
      [payoutId, JSON.stringify({ payoutStatus: eventType }), row.id],
    );
  } else if (eventType === 'payout.processed' && row.status === 'PENDING') {
    await client.query(
      `UPDATE wallet_transactions SET status='COMPLETED',provider_transaction_id=COALESCE(NULLIF($1,''),provider_transaction_id),completed_at=now() WHERE id=$2`,
      [payoutId, row.id],
    );
    await client.query(`UPDATE wallet_accounts SET locked_paise=locked_paise-$1,updated_at=now() WHERE id=$2`, [row.amount_paise, row.wallet_id]);
  } else if (eventType === 'payout.failed' && row.status === 'PENDING') {
    await client.query(
      `UPDATE wallet_transactions SET status='FAILED',provider_transaction_id=COALESCE(NULLIF($1,''),provider_transaction_id),completed_at=now() WHERE id=$2`,
      [payoutId, row.id],
    );
    await client.query(`UPDATE wallet_accounts SET locked_paise=locked_paise-$1,available_paise=available_paise+$1,updated_at=now() WHERE id=$2`, [row.amount_paise, row.wallet_id]);
  } else if (eventType === 'payout.reversed' && row.status === 'COMPLETED') {
    await client.query(`UPDATE wallet_transactions SET status='REVERSED',completed_at=now() WHERE id=$1`, [row.id]);
    await client.query(`UPDATE wallet_accounts SET available_paise=available_paise+$1,updated_at=now() WHERE id=$2`, [row.amount_paise, row.wallet_id]);
  }
}
