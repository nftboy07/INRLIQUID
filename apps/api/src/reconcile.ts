import { Pool } from 'pg';
import { reconcileUserOrders } from './trading.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 4,
  connectionTimeoutMillis: 5000,
});

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
  const raw = process.env.UPSTOX_INSTRUMENT_MAP_JSON;
  if (!raw) throw new Error('UPSTOX_INSTRUMENT_MAP_NOT_CONFIGURED');
  JSON.parse(raw);

  const accounts = await pool.query(`SELECT DISTINCT user_id FROM broker_accounts WHERE provider='upstox' AND status='ACTIVE' AND access_token_encrypted IS NOT NULL`);
  let checked = 0; let reconciled = 0; let fills = 0;
  for (const row of accounts.rows) {
    try {
      const result = await reconcileUserOrders(pool, row.user_id, 100);
      checked += result.checked;
      reconciled += result.reconciled;
      fills += result.fills;
    } catch (error) {
      console.error(JSON.stringify({ event: 'reconciliation_failed', userId: row.user_id, error: String(error) }));
    }
  }
  console.log(JSON.stringify({ event: 'reconciliation_complete', accounts: accounts.rows.length, checked, reconciled, fills }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
