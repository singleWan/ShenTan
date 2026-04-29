import Database from 'better-sqlite3';
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

// 从 @shentan/core/schema 导入统一的 Schema 定义（单一数据源，不加载 libsql 驱动）
export {
  characters,
  events,
  reactions,
  collectionTasks,
  backgroundTasks,
  crawlCache,
  characterRelations,
  tags,
  characterTags,
  auditLog,
} from '@shentan/core/schema';

// 建表 SQL（与 core/src/db/init.ts 保持同步）
const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  source TEXT,
  description TEXT,
  aliases TEXT,
  image_url TEXT,
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  status TEXT NOT NULL DEFAULT 'active',
  collection_id TEXT,
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

CREATE TABLE IF NOT EXISTS crawl_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  content_hash TEXT NOT NULL,
  content TEXT NOT NULL,
  title TEXT,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS crawl_cache_url_idx ON crawl_cache(url);
CREATE INDEX IF NOT EXISTS crawl_cache_expires_idx ON crawl_cache(expires_at);

CREATE TABLE IF NOT EXISTS character_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_character_id INTEGER NOT NULL REFERENCES characters(id),
  to_character_id INTEGER NOT NULL REFERENCES characters(id),
  relation_type TEXT NOT NULL,
  description TEXT,
  source_url TEXT,
  confidence TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS character_relations_from_idx ON character_relations(from_character_id);
CREATE INDEX IF NOT EXISTS character_relations_to_idx ON character_relations(to_character_id);
`;

// 兼容已有数据库的增量迁移（忽略已存在的列）
const MIGRATIONS: Array<{ sql: string; postUpdate?: string }> = [
  { sql: `ALTER TABLE characters ADD COLUMN aliases TEXT;` },
  { sql: `ALTER TABLE characters ADD COLUMN image_url TEXT;` },
  {
    sql: `ALTER TABLE events ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00Z';`,
    postUpdate: `UPDATE events SET updated_at = created_at;`,
  },
  { sql: `ALTER TABLE reactions ADD COLUMN status TEXT NOT NULL DEFAULT 'active';` },
  { sql: `ALTER TABLE reactions ADD COLUMN collection_id TEXT;` },
  { sql: `ALTER TABLE events ADD COLUMN review_status TEXT;` },
  { sql: `ALTER TABLE events ADD COLUMN duplicate_of INTEGER;` },
  { sql: `ALTER TABLE events ADD COLUMN merged_from_ids TEXT;` },
  {
    sql: `CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  },
  {
    sql: `CREATE TABLE IF NOT EXISTS character_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL REFERENCES characters(id),
      tag_id INTEGER NOT NULL REFERENCES tags(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  },
  { sql: `CREATE INDEX IF NOT EXISTS character_tags_character_idx ON character_tags(character_id)` },
  { sql: `CREATE INDEX IF NOT EXISTS character_tags_tag_idx ON character_tags(tag_id)` },
  {
    sql: `CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  },
  { sql: `CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log(action)` },
  { sql: `ALTER TABLE characters ADD COLUMN is_placeholder INTEGER NOT NULL DEFAULT 0;` },
];

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    const dbPath = process.env.DATABASE_PATH ?? './data/shentan.db';
    const resolvedPath = resolve(MONOREPO_ROOT, dbPath);
    const sqlite = new Database(resolvedPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.exec(CREATE_TABLES);
    for (const migration of MIGRATIONS) {
      try {
        sqlite.exec(migration.sql);
        if (migration.postUpdate) sqlite.exec(migration.postUpdate);
      } catch {
        // 列已存在，忽略错误
      }
    }
    _db = drizzle(sqlite);
  }
  return _db;
}
