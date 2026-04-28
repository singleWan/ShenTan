import Database from 'better-sqlite3';
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';

// 从 apps/web 向上查找 monorepo 根目录
function findMonorepoRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== '/') {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = dirname(dir);
  }
  return startDir;
}

const MONOREPO_ROOT = findMonorepoRoot(resolve(process.cwd()));

// Schema 定义（与 core 包保持一致）
export const characters = sqliteTable('characters', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  type: text().notNull(),
  source: text(),
  description: text(),
  aliases: text(),
  status: text().notNull().default('pending'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const events = sqliteTable('events', {
  id: integer().primaryKey({ autoIncrement: true }),
  characterId: integer('character_id').notNull(),
  parentEventId: integer('parent_event_id'),
  title: text().notNull(),
  description: text(),
  dateText: text('date_text'),
  dateSortable: text('date_sortable'),
  category: text().notNull().default('other'),
  content: text(),
  platform: text(),
  authorHandle: text('author_handle'),
  sourceUrl: text('source_url'),
  sourceTitle: text('source_title'),
  importance: integer().notNull().default(3),
  metadata: text(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('events_character_idx').on(table.characterId),
  index('events_date_idx').on(table.dateSortable),
  index('events_importance_idx').on(table.importance),
  index('events_category_idx').on(table.category),
]);

export const reactions = sqliteTable('reactions', {
  id: integer().primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull(),
  reactor: text().notNull(),
  reactorType: text('reactor_type').notNull(),
  reactionText: text('reaction_text'),
  sentiment: text(),
  sourceUrl: text('source_url'),
  sourceTitle: text('source_title'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('reactions_event_idx').on(table.eventId),
]);

export const collectionTasks = sqliteTable('collection_tasks', {
  id: text().primaryKey(),
  characterId: integer('character_id'),
  characterName: text('character_name').notNull(),
  characterType: text('character_type').notNull(),
  source: text(),
  status: text().notNull().default('pending'),
  maxRounds: integer('max_rounds').default(5),
  aliases: text(),
  logPath: text('log_path'),
  pid: integer(),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  result: text(),
  error: text(),
  progress: text(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('collection_tasks_status_idx').on(table.status),
  index('collection_tasks_character_idx').on(table.characterId),
]);

export const backgroundTasks = sqliteTable('background_tasks', {
  id: text().primaryKey(),
  type: text().notNull(), // 'expand-events' | 'collect-reactions'
  status: text().notNull().default('pending'),
  characterId: integer('character_id'),
  characterName: text('character_name').notNull(),
  config: text(), // JSON: 任务类型特定配置
  result: text(), // JSON: 任务结果
  error: text(),
  progress: text(), // JSON: 进度数据
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index('background_tasks_type_idx').on(table.type),
  index('background_tasks_status_idx').on(table.status),
  index('background_tasks_character_idx').on(table.characterId),
]);

const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  source TEXT,
  description TEXT,
  aliases TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id),
  parent_event_id INTEGER REFERENCES events(id),
  title TEXT NOT NULL,
  description TEXT,
  date_text TEXT,
  date_sortable TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  content TEXT,
  platform TEXT,
  author_handle TEXT,
  source_url TEXT,
  source_title TEXT,
  importance INTEGER NOT NULL DEFAULT 3,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS events_character_idx ON events(character_id);
CREATE INDEX IF NOT EXISTS events_date_idx ON events(date_sortable);
CREATE INDEX IF NOT EXISTS events_importance_idx ON events(importance);
CREATE INDEX IF NOT EXISTS events_category_idx ON events(category);

CREATE TABLE IF NOT EXISTS reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  reactor TEXT NOT NULL,
  reactor_type TEXT NOT NULL,
  reaction_text TEXT,
  sentiment TEXT,
  source_url TEXT,
  source_title TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS reactions_event_idx ON reactions(event_id);

CREATE TABLE IF NOT EXISTS collection_tasks (
  id TEXT PRIMARY KEY,
  character_id INTEGER REFERENCES characters(id),
  character_name TEXT NOT NULL,
  character_type TEXT NOT NULL,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  max_rounds INTEGER DEFAULT 5,
  aliases TEXT,
  log_path TEXT,
  pid INTEGER,
  started_at TEXT,
  completed_at TEXT,
  result TEXT,
  error TEXT,
  progress TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS collection_tasks_status_idx ON collection_tasks(status);
CREATE INDEX IF NOT EXISTS collection_tasks_character_idx ON collection_tasks(character_id);

CREATE TABLE IF NOT EXISTS background_tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  character_id INTEGER REFERENCES characters(id),
  character_name TEXT NOT NULL,
  config TEXT,
  result TEXT,
  error TEXT,
  progress TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS background_tasks_type_idx ON background_tasks(type);
CREATE INDEX IF NOT EXISTS background_tasks_status_idx ON background_tasks(status);
CREATE INDEX IF NOT EXISTS background_tasks_character_idx ON background_tasks(character_id);
`;

const MIGRATE_ADD_ALIASES = `ALTER TABLE characters ADD COLUMN aliases TEXT;`;

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    const dbPath = process.env.DATABASE_PATH ?? './data/shentan.db';
    const resolvedPath = resolve(MONOREPO_ROOT, dbPath);
    const sqlite = new Database(resolvedPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.exec(CREATE_TABLES);
    // 兼容已有数据库：添加 aliases 列
    try {
      sqlite.exec(MIGRATE_ADD_ALIASES);
    } catch {
      // 列已存在，忽略错误
    }
    _db = drizzle(sqlite);
  }
  return _db;
}
