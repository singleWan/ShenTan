import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const characters = sqliteTable('characters', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  type: text().notNull(),
  source: text(),
  description: text(),
  aliases: text(),
  imageUrl: text('image_url'),
  status: text().notNull().default('pending'),
  isPlaceholder: integer('is_placeholder').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const events = sqliteTable(
  'events',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    characterId: integer('character_id')
      .notNull()
      .references(() => characters.id),
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
    reviewStatus: text('review_status'),
    duplicateOf: integer('duplicate_of'),
    mergedFromIds: text('merged_from_ids'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index('events_character_idx').on(table.characterId),
    index('events_date_idx').on(table.dateSortable),
    index('events_importance_idx').on(table.importance),
    index('events_category_idx').on(table.category),
  ],
);

export const reactions = sqliteTable(
  'reactions',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id),
    reactor: text().notNull(),
    reactorType: text('reactor_type').notNull(),
    reactionText: text('reaction_text'),
    sentiment: text(),
    sourceUrl: text('source_url'),
    sourceTitle: text('source_title'),
    status: text().notNull().default('active'),
    collectionId: text('collection_id'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [index('reactions_event_idx').on(table.eventId)],
);

export const collectionTasks = sqliteTable(
  'collection_tasks',
  {
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
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index('collection_tasks_status_idx').on(table.status),
    index('collection_tasks_character_idx').on(table.characterId),
  ],
);

export const characterRelations = sqliteTable(
  'character_relations',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    fromCharacterId: integer('from_character_id')
      .notNull()
      .references(() => characters.id),
    toCharacterId: integer('to_character_id')
      .notNull()
      .references(() => characters.id),
    relationType: text('relation_type').notNull(),
    description: text(),
    sourceUrl: text('source_url'),
    confidence: text(),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index('character_relations_from_idx').on(table.fromCharacterId),
    index('character_relations_to_idx').on(table.toCharacterId),
  ],
);

export const crawlCache = sqliteTable(
  'crawl_cache',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    url: text().notNull().unique(),
    contentHash: text('content_hash').notNull(),
    content: text().notNull(),
    title: text(),
    fetchedAt: text('fetched_at').notNull(),
    expiresAt: text('expires_at').notNull(),
  },
  (table) => [
    index('crawl_cache_url_idx').on(table.url),
    index('crawl_cache_expires_idx').on(table.expiresAt),
  ],
);

export const backgroundTasks = sqliteTable(
  'background_tasks',
  {
    id: text().primaryKey(),
    type: text().notNull(),
    status: text().notNull().default('pending'),
    characterId: integer('character_id'),
    characterName: text('character_name').notNull(),
    config: text(),
    result: text(),
    error: text(),
    progress: text(),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index('background_tasks_type_idx').on(table.type),
    index('background_tasks_status_idx').on(table.status),
    index('background_tasks_character_idx').on(table.characterId),
  ],
);

export const tags = sqliteTable(
  'tags',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    name: text().notNull().unique(),
    color: text(),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
);

export const characterTags = sqliteTable(
  'character_tags',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    characterId: integer('character_id')
      .notNull()
      .references(() => characters.id),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index('character_tags_character_idx').on(table.characterId),
    index('character_tags_tag_idx').on(table.tagId),
  ],
);

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    action: text().notNull(),
    entityType: text('entity_type').notNull(),
    entityId: integer('entity_id'),
    details: text(),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [index('audit_log_action_idx').on(table.action)],
);
