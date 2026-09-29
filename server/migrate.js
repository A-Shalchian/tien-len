import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getMigrations } from 'better-auth/db/migration';
import { auth } from './auth.js';
import { pool } from './db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate() {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();

  await pool.query(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const { rows } = await pool.query('select name from schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (applied.has(file)) continue;
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      await client.query('insert into schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
      console.log(`Applied migration ${file}`);
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }
}
