import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../../../infra/sql');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  connectionTimeoutMillis: 5000,
});

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED_FOR_MIGRATIONS');
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', ['inrliquid:migrations']);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    const files = (await readdir(migrationsDir))
      .filter((name) => /^\d+_.*\.sql$/.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    for (const file of files) {
      const sql = await readFile(join(migrationsDir, file), 'utf8');
      const version = file.replace(/\.sql$/, '');
      const existing = await client.query('SELECT checksum FROM schema_migrations WHERE version=$1', [version]);
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum(sql)) {
          throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${version}`);
        }
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)', [version, checksum(sql)]);
        await client.query('COMMIT');
        console.log(`Applied migration ${version}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['inrliquid:migrations']).catch(() => undefined);
    client.release();
    await pool.end();
  }
}

function checksum(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

migrate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
