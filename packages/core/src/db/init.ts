import { getDb } from './connection.js';

const CREATE_CHARACTERS = `
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
`;

const ALTER_CHARACTERS_ADD_ALIASES = `
ALTER TABLE characters ADD COLUMN aliases TEXT;
`;

const CREATE_EVENTS = `
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
`;

const CREATE_REACTIONS = `
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
`;

const CREATE_SEARCH_TASKS = `
CREATE TABLE IF NOT EXISTS search_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id),
  agent_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  query TEXT NOT NULL,
  result_summary TEXT,
  started_at TEXT,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS search_tasks_character_idx ON search_tasks(character_id);
CREATE INDEX IF NOT EXISTS search_tasks_status_idx ON search_tasks(status);
`;

const CREATE_COLLECTION_TASKS = `
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
`;

export async function initDatabase(dbPath?: string) {
  const db = getDb(dbPath);
  await db.run(CREATE_CHARACTERS);
  await db.run(CREATE_EVENTS);
  await db.run(CREATE_REACTIONS);
  await db.run(CREATE_SEARCH_TASKS);
  await db.run(CREATE_COLLECTION_TASKS);

  // 兼容已有数据库：添加 aliases 列
  try {
    await db.run(ALTER_CHARACTERS_ADD_ALIASES);
  } catch {
    // 列已存在，忽略错误
  }

  return db;
}
