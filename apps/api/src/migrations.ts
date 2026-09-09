import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';

export async function runMigrations(pool: Pool, directory = join(process.cwd(), 'infra', 'sql')) {
  const files = (await readdir(directory)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const file of files) {
    const sql = await readFile(join(directory, file), 'utf8');
    await pool.query(sql);
  }
}
