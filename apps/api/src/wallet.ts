import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { RazorpayUpiAdapter, createRazorpayPayout } from '@inrliquid/adapters';

export interface WalletContext {
  userId: string;
}

export async function ensureWallet(pool: Pool, userId: string) {
  const result = await pool.query(
    `INSERT INTO wallet_accounts (id, user_id) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
     RETURNING id, user_id, currency, available_paise, locked_paise, created_at, updated_at`,
    [randomUUID(), userId]
  );
  return result.rows[0];
}

export async function getWallet(pool: Pool, userId: string) {
  return (await pool.query(
    `SELECT id, user_id, currency, available_paise, locked_paise, created_at, updated_at
     FROM wallet_accounts WHERE user_id = $1`, [userId]
  )).rows[0] ?? await ensureWallet(pool, userId);
}

export async function createDeposit(pool: Pool, ctx: WalletContext, amountInr: number, idempotencyKey: string, upi: RazorpayUpiAdapter) {
  const amountPaise = Math.round(amountInr * 100);
  const existing = await pool.query(`SELECT * FROM wallet_transactions WHERE idempotency_key = $1`, [idempotencyKey]);
  if (existing.rows[0]) return existing.rows[0];

  const wallet = await ensureWallet(pool, ctx.userId);
  const payment = await upi.createPaymentIntent({ amountInr, purpose: 'TRADING_FUNDING', idempotencyKey });
  const tx = await pool.query(
    `INSERT INTO wallet_transactions
      (id, wallet_id, type, status, amount_paise, provider, provider_transaction_id, idempotency_key, metadata)
     VALUES ($1, $2, 'DEPOSIT', 'PENDING', $3, 'razorpay', $4, $5, $6)
     RETURNING *`,
    [randomUUID(), wallet.id, amountPaise, payment.providerPaymentId, idempotencyKey, JSON.stringify(payment)]
  );
  return { transaction: tx.rows[0], payment };
}

export async function createWithdrawal(
  pool: Pool,
  ctx: WalletContext,
  amountInr: number,
  fundAccountId: string,
  mode: 'UPI' | 'IMPS' | 'NEFT' | 'RTGS',
  idempotencyKey: string,
  razorpay: Parameters<typeof createRazorpayPayout>[0]
) {
  const amountPaise = Math.round(amountInr * 100);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT * FROM wallet_transactions WHERE idempotency_key = $1 FOR UPDATE`, [idempotencyKey]);
    if (existing.rows[0]) { await client.query('COMMIT'); return existing.rows[0]; }

    const wallet = await client.query(`SELECT * FROM wallet_accounts WHERE user_id = $1 FOR UPDATE`, [ctx.userId]);
    if (!wallet.rows[0]) throw new Error('WALLET_NOT_FOUND');
    if (Number(wallet.rows[0].available_paise) < amountPaise) throw new Error('INSUFFICIENT_AVAILABLE_BALANCE');

    const txId = randomUUID();
    await client.query(
      `UPDATE wallet_accounts SET available_paise = available_paise - $1, locked_paise = locked_paise + $1, updated_at = now() WHERE id = $2`,
      [amountPaise, wallet.rows[0].id]
    );
    await client.query(
      `INSERT INTO wallet_transactions
        (id, wallet_id, type, status, amount_paise, provider, idempotency_key, metadata)
       VALUES ($1, $2, 'WITHDRAWAL', 'PENDING', $3, 'razorpayx', $4, $5)`,
      [txId, wallet.rows[0].id, amountPaise, idempotencyKey, JSON.stringify({ fundAccountId, mode })]
    );
    await client.query('COMMIT');

    try {
      const payout = await createRazorpayPayout(razorpay, { amountInr, idempotencyKey, fundAccountId, mode });
      await pool.query(
        `UPDATE wallet_transactions SET provider_transaction_id = $1, metadata = metadata || $2 WHERE id = $3`,
        [String((payout as { id?: string }).id ?? ''), JSON.stringify(payout), txId]
      );
      return { transactionId: txId, payout };
    } catch (error) {
      await pool.query(
        `UPDATE wallet_accounts SET available_paise = available_paise + $1, locked_paise = locked_paise - $1, updated_at = now() WHERE id = $2`,
        [amountPaise, wallet.rows[0].id]
      );
      await pool.query(`UPDATE wallet_transactions SET status = 'FAILED' WHERE id = $1`, [txId]);
      throw error;
    }
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally { client.release(); }
}
