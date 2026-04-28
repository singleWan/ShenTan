import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const characters = sqliteTable('characters', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  type: text().notNull(),
  source: text(),
  description: text(),
  aliases: text(),
  status: text().notNull().default('pending'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const events = sqliteTable('events', {
  id: integer().primaryKey({ autoIncrement: true }),
  characterId: integer('character_id').notNull().references(() => characters.id),
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
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index('events_character_idx').on(table.characterId),
  index('events_date_idx').on(table.dateSortable),
  index('events_importance_idx').on(table.importance),
  index('events_category_idx').on(table.category),
]);

export const reactions = sqliteTable('reactions', {
  id: integer().primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull().references(() => events.id),
  reactor: text().notNull(),
  reactorType: text('reactor_type').notNull(),
  reactionText: text('reaction_text'),
  sentiment: text(),
  sourceUrl: text('source_url'),
  sourceTitle: text('source_title'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index('reactions_event_idx').on(table.eventId),
]);

export const searchTasks = sqliteTable('search_tasks', {
  id: integer().primaryKey({ autoIncrement: true }),
  characterId: integer('character_id').notNull().references(() => characters.id),
  agentType: text('agent_type').notNull(),
  status: text().notNull().default('pending'),
  query: text().notNull(),
  resultSummary: text('result_summary'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
}, (table) => [
  index('search_tasks_character_idx').on(table.characterId),
  index('search_tasks_status_idx').on(table.status),
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
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index('collection_tasks_status_idx').on(table.status),
  index('collection_tasks_character_idx').on(table.characterId),
]);
