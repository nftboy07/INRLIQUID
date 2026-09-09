import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { CreatePaymentIntent, UpiAdapter, UpiCreateContext, UpiPaymentIntent } from '@inrliquid/domain';
import { resolveUpiFlow } from '@inrliquid/domain';
import {
  RazorpayRequestError,
  createRazorpayBankFundAccount,
  createRazorpayContact,
  createRazorpayPayout,
  createRazorpayVpaFundAccount,
  type RazorpayBankBeneficiaryRequest,
  type RazorpayContactRequest,
  type RazorpayVpaBeneficiaryRequest,
  type RazorpayConfig,
} from '@inrliquid/adapters';

export interface WalletContext { userId: string }

function depositResponse(transaction: Record<string, unknown>, payment?: UpiPaymentIntent) {
  return {
    transaction,
    payment: payment ?? (typeof transaction.metadata === 'object' ? transaction.metadata : undefined),
  };
}

export async function ensureWallet(pool: Pool, userId: string) {
  const result = await pool.query(
    `INSERT INTO wallet_accounts(id,user_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET updated_at=now() RETURNING id,user_id,currency,available_paise,locked_paise,created_at,updated_at`,
    [randomUUID(), userId],
  );
  return result.rows[0];
}

export async function getWallet(pool: Pool, userId: string) {
  return (await pool.query(
    `SELECT id,user_id,currency,available_paise,locked_paise,created_at,updated_at FROM wallet_accounts WHERE user_id=$1`,
    [userId],
  )).rows[0] ?? await ensureWallet(pool, userId);
}

export async function listWalletTransactions(pool: Pool, userId: string, limit = 100) {
  const wallet = await ensureWallet(pool, userId);
  return (await pool.query(
    `SELECT id,type,status,amount_paise,provider,provider_transaction_id,metadata,created_at,completed_at FROM wallet_transactions WHERE wallet_id=$1 ORDER BY created_at DESC LIMIT $2`,
    [wallet.id, Math.min(Math.max(limit, 1), 200)],
  )).rows;
}

export async function createDeposit(
  pool: Pool,
  ctx: WalletContext,
  input: Omit<CreatePaymentIntent, 'purpose'> & { purpose?: CreatePaymentIntent['purpose'] },
  upi: UpiAdapter,
  context?: UpiCreateContext,
) {
  const amountPaise = Math.round(input.amountInr * 100);
  const purpose = input.purpose ?? 'TRADING_FUNDING';
  const flow = resolveUpiFlow(input);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT * FROM wallet_transactions WHERE idempotency_key=$1 FOR UPDATE`, [input.idempotencyKey]);
    if (existing.rows[0]) {
      await client.query('COMMIT');
      return depositResponse(existing.rows[0]);
    }
    const wallet = await client.query(
      `INSERT INTO wallet_accounts(id,user_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET updated_at=now() RETURNING id`,
      [randomUUID(), ctx.userId],
    );
    const txId = randomUUID();
    const intentId = randomUUID();
    await client.query(
      `INSERT INTO payment_intents(id,user_id,wallet_id,provider,payment_method,amount_paise,status,idempotency_key,vpa,upi_flow,metadata)
       VALUES($1,$2,$3,'razorpay','UPI',$4,'PENDING',$5,$6,$7,$8)`,
      [intentId, ctx.userId, wallet.rows[0].id, amountPaise, input.idempotencyKey, input.vpa ?? null, flow, JSON.stringify({ idempotencyKey: input.idempotencyKey, walletTransactionId: txId, app: input.app ?? null })],
    );
    await client.query(
      `INSERT INTO wallet_transactions(id,wallet_id,type,status,amount_paise,provider,idempotency_key,metadata)
       VALUES($1,$2,'DEPOSIT','PENDING',$3,'razorpay',$4,$5::jsonb)`,
      [txId, wallet.rows[0].id, amountPaise, input.idempotencyKey, JSON.stringify({ idempotencyKey: input.idempotencyKey, paymentIntentId: intentId, flow, vpa: input.vpa ?? null, app: input.app ?? null })],
    );
    await client.query('COMMIT');
    try {
      const payment = await upi.createPaymentIntent({ ...input, purpose }, context);
      await pool.query(
        `UPDATE payment_intents SET provider_payment_id=$1,payment_url=$2,metadata=metadata || $3::jsonb WHERE id=$4`,
        [payment.providerPaymentId, payment.upiUrl ?? payment.qrUrl ?? null, JSON.stringify(payment), intentId],
      );
      await pool.query(
        `UPDATE wallet_transactions SET provider_transaction_id=$1,metadata=metadata || $2::jsonb WHERE id=$3`,
        [payment.providerPaymentId, JSON.stringify({ ...payment, orderId: payment.providerPaymentId }), txId],
      );
      return {
        paymentIntentId: intentId,
        transaction: (await pool.query(`SELECT * FROM wallet_transactions WHERE id=$1`, [txId])).rows[0],
        payment,
      };
    } catch (error) {
      await pool.query(
        `UPDATE wallet_transactions SET status='FAILED',completed_at=now(),metadata=metadata || $1::jsonb WHERE id=$2 AND status='PENDING'`,
        [JSON.stringify({ providerError: String(error) }), txId],
      );
      await pool.query(
        `UPDATE payment_intents SET status='FAILED',completed_at=now(),metadata=metadata || $1::jsonb WHERE id=$2 AND status='PENDING'`,
        [JSON.stringify({ providerError: String(error) }), intentId],
      );
      throw error;
    }
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  } finally {
    client.release();
  }
}

export async function createWithdrawal(
  pool: Pool,
  ctx: WalletContext,
  amountInr: number,
  fundAccountId: string,
  mode: 'UPI' | 'IMPS' | 'NEFT' | 'RTGS',
  idempotencyKey: string,
  razorpay: RazorpayConfig,
) {
  const amountPaise = Math.round(amountInr * 100);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT * FROM wallet_transactions WHERE idempotency_key=$1 FOR UPDATE`, [idempotencyKey]);
    if (existing.rows[0]) {
      await client.query('COMMIT');
      return existing.rows[0];
    }
    const wallet = await client.query(`SELECT * FROM wallet_accounts WHERE user_id=$1 FOR UPDATE`, [ctx.userId]);
    if (!wallet.rows[0]) throw new Error('WALLET_NOT_FOUND');
    if (Number(wallet.rows[0].available_paise) < amountPaise) throw new Error('INSUFFICIENT_AVAILABLE_BALANCE');
    const txId = randomUUID();
    await client.query(
      `UPDATE wallet_accounts SET available_paise=available_paise-$1,locked_paise=locked_paise+$1,updated_at=now() WHERE id=$2`,
      [amountPaise, wallet.rows[0].id],
    );
    await client.query(
      `INSERT INTO wallet_transactions(id,wallet_id,type,status,amount_paise,provider,idempotency_key,metadata)
       VALUES($1,$2,'WITHDRAWAL','PENDING',$3,'razorpayx',$4,$5::jsonb)`,
      [txId, wallet.rows[0].id, amountPaise, idempotencyKey, JSON.stringify({ idempotencyKey, fundAccountId, mode })],
    );
    await client.query('COMMIT');
    try {
      const payout = await createRazorpayPayout(razorpay, { amountInr, idempotencyKey, fundAccountId, mode });
      await pool.query(
        `UPDATE wallet_transactions SET provider_transaction_id=$1,metadata=metadata || $2::jsonb WHERE id=$3`,
        [String(payout.id ?? ''), JSON.stringify(payout), txId],
      );
      return { transactionId: txId, payout };
    } catch (error) {
      if (error instanceof RazorpayRequestError && error.retryable) throw error;
      await pool.query(
        `UPDATE wallet_accounts SET available_paise=available_paise+$1,locked_paise=locked_paise-$1,updated_at=now() WHERE id=$2`,
        [amountPaise, wallet.rows[0].id],
      );
      await pool.query(
        `UPDATE wallet_transactions SET status='FAILED',completed_at=now(),metadata=metadata || $1::jsonb WHERE id=$2`,
        [JSON.stringify({ providerError: String(error) }), txId],
      );
      throw error;
    }
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  } finally {
    client.release();
  }
}

export async function createBeneficiaryContact(config: RazorpayConfig, input: RazorpayContactRequest) {
  return createRazorpayContact(config, input);
}
export async function createBeneficiaryBank(config: RazorpayConfig, input: RazorpayBankBeneficiaryRequest) {
  return createRazorpayBankFundAccount(config, input);
}
export async function createBeneficiaryVpa(config: RazorpayConfig, input: RazorpayVpaBeneficiaryRequest) {
  return createRazorpayVpaFundAccount(config, input);
}
export async function saveBeneficiary(
  pool: Pool,
  userId: string,
  providerFundAccountId: string,
  providerContactId: string,
  mode: 'UPI' | 'IMPS' | 'NEFT' | 'RTGS',
  maskedDestination: string,
  label?: string,
) {
  return (await pool.query(
    `INSERT INTO withdrawal_beneficiaries(id,user_id,provider_fund_account_id,provider_contact_id,mode,masked_destination,label,status)
     VALUES($1,$2,$3,$4,$5,$6,$7,'ACTIVE')
     ON CONFLICT(user_id,provider_fund_account_id) DO UPDATE SET provider_contact_id=EXCLUDED.provider_contact_id,mode=EXCLUDED.mode,masked_destination=EXCLUDED.masked_destination,label=EXCLUDED.label,status='ACTIVE'
     RETURNING *`,
    [randomUUID(), userId, providerFundAccountId, providerContactId, mode, maskedDestination, label ?? null],
  )).rows[0];
}
export async function listBeneficiaries(pool: Pool, userId: string) {
  return (await pool.query(
    `SELECT id,provider_fund_account_id AS "fundAccountId",provider_contact_id AS "contactId",mode,masked_destination AS "maskedDestination",label,status,created_at AS "createdAt" FROM withdrawal_beneficiaries WHERE user_id=$1 AND status='ACTIVE' ORDER BY created_at DESC`,
    [userId],
  )).rows;
}
