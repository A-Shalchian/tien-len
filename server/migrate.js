import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getMigrations } from 'better-auth/db/migration';
import { auth } from './auth.js';
import { transaction } from './db.js';

const schema = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql');

export async function migrate() {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  await transaction((db) => db.query(fs.readFileSync(schema, 'utf8')));
}
