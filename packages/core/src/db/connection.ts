import { drizzle } from 'drizzle-orm/libsql';
import { createClient, type Client } from '@libsql/client';
import * as schema from './schema.js';

let client: Client | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

export function createDb(dbPath?: string) {
  const url = dbPath ?? process.env.DATABASE_PATH ?? 'file:./data/shentan.db';
  client = createClient({ url });
  _db = drizzle(client, { schema });
  return _db;
}

export function getDb(dbPath?: string) {
  if (!_db) return createDb(dbPath);
  return _db;
}

export function closeDb() {
  client?.close();
  client = null;
  _db = null;
}

export type Database = ReturnType<typeof createDb>;
