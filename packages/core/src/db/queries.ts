import { eq, and, gte, desc, sql, like, or } from 'drizzle-orm';
import type { Database } from './connection.js';
import { characters, events, reactions, collectionTasks } from './schema.js';
import type {
  CharacterType,
  EventCategory,
  Sentiment,
  ReactorType,
  CharacterExport,
  CharacterAlias,
  CollectionTaskStatus,
  CollectionTaskProgress,
} from '../types/index.js';
import { normalizeDate, interpolateDateSortables } from '../utils/date-normalizer.js';

// Character 查询
// 解析 source 字段，兼容旧数据（纯字符串）和新数据（JSON 数组）
export function parseSource(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* 旧数据：纯字符串 */ }
  return [raw];
}

export async function createCharacter(db: Database, input: {
  name: string;
  type: CharacterType;
  source?: string[];
  description?: string;
}) {
  const result = await db.insert(characters).values({
    name: input.name,
    type: input.type,
    source: input.source ? JSON.stringify(input.source) : null,
    description: input.description ?? null,
    status: 'pending',
  }).returning();
  return result[0]!;
}

export async function getCharacter(db: Database, id: number) {
  const result = await db.select().from(characters).where(eq(characters.id, id));
  return result[0] ?? null;
}

export async function getCharacterByName(db: Database, name: string) {
  const result = await db.select().from(characters).where(eq(characters.name, name));
  return result[0] ?? null;
}

export async function updateCharacterStatus(db: Database, id: number, status: string) {
  await db.update(characters).set({ status, updatedAt: new Date().toISOString() }).where(eq(characters.id, id));
}

export async function updateCharacterDescription(db: Database, id: number, description: string) {
  await db.update(characters).set({ description, updatedAt: new Date().toISOString() }).where(eq(characters.id, id));
}

export async function updateCharacterImageUrl(db: Database, id: number, imageUrl: string) {
  await db.update(characters).set({ imageUrl, updatedAt: new Date().toISOString() }).where(eq(characters.id, id));
}

export async function updateCharacterAliases(db: Database, id: number, aliases: CharacterAlias[]) {
  await db.update(characters).set({
    aliases: JSON.stringify(aliases),
    updatedAt: new Date().toISOString(),
  }).where(eq(characters.id, id));
}

export async function listCharacters(db: Database) {
  return db.select().from(characters).orderBy(desc(characters.updatedAt));
}

// 去重工具函数
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[\s　.,;:!?，。；：！？、\-—–()（）\[\]【】《》""''"']/g, '');
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(''));
  const setB = new Set(b.split(''));
  let intersection = 0;
  for (const ch of setA) {
    if (setB.has(ch)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  const maxLen = Math.max(a.length, b.length);
  return 1 - matrix[b.length][a.length] / maxLen;
}

function isDateClose(a: string | null, b: string | null, daysThreshold: number): boolean {
  if (!a || !b) return false;
  try {
    const da = new Date(a);
    const db2 = new Date(b);
    if (isNaN(da.getTime()) || isNaN(db2.getTime())) return false;
    return Math.abs(da.getTime() - db2.getTime()) <= daysThreshold * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

type DupConfidence = 'auto' | 'review' | 'none';

function checkDuplicate(
  newEvt: { title: string; description?: string; dateSortable?: string },
  existing: { title: string; description: string | null; dateSortable: string | null },
): { confidence: DupConfidence; score: number } {
  const normA = normalizeText(newEvt.title);
  const normB = normalizeText(existing.title);
  const jaccard = jaccardSimilarity(normA, normB);
  const levenshtein = levenshteinRatio(normA, normB);
  const score = jaccard * 0.6 + levenshtein * 0.4;
  const dateClose = isDateClose(newEvt.dateSortable ?? null, existing.dateSortable, 30);

  if (score >= 0.85 && dateClose) return { confidence: 'auto', score };
  if (score >= 0.9) return { confidence: 'auto', score };
  if (score >= 0.6 && dateClose) return { confidence: 'review', score };
  if (score >= 0.8) return { confidence: 'review', score };
  return { confidence: 'none', score };
}

// Event 查询
export async function saveEvents(db: Database, input: {
  characterId: number;
  events: Array<{
    parentEventId?: number;
    title: string;
    description?: string;
    dateText?: string;
    dateSortable?: string;
    category?: string;
    content?: string;
    platform?: string;
    authorHandle?: string;
    sourceUrl?: string;
    sourceTitle?: string;
    importance?: number;
  }>;
}) {
  // 查询角色类型（用于日期规范化策略选择）
  const character = await db.select({ type: characters.type })
    .from(characters).where(eq(characters.id, input.characterId)).limit(1);
  const characterType = character[0]?.type ?? 'historical';

  // 获取已有事件用于去重
  const existingEvents = await db.select({
    title: events.title,
    description: events.description,
    dateSortable: events.dateSortable,
  }).from(events).where(eq(events.characterId, input.characterId));

  // ── 第一阶段：去重 + 日期规范化 ──
  const toSave: Array<{
    parentEventId: number | null;
    title: string;
    description: string | null;
    dateText: string | null;
    dateSortable: string | null;
    category: string;
    content: string | null;
    platform: string | null;
    authorHandle: string | null;
    sourceUrl: string | null;
    sourceTitle: string | null;
    importance: number;
    reviewStatus: string | null;
  }> = [];
  const skipped: string[] = [];
  const pendingReview: string[] = [];

  for (const evt of input.events) {
    let bestDup: { confidence: DupConfidence; score: number } | null = null;
    for (const ex of existingEvents) {
      const dup = checkDuplicate(evt, ex);
      if (dup.confidence !== 'none') {
        if (!bestDup || dup.score > bestDup.score) bestDup = dup;
      }
    }

    if (bestDup?.confidence === 'auto') {
      skipped.push(evt.title);
      continue;
    }

    const normalized = normalizeDate(evt.dateText, evt.dateSortable, characterType);
    const reviewStatus = bestDup?.confidence === 'review' ? 'pending' : null;

    toSave.push({
      parentEventId: evt.parentEventId ?? null,
      title: evt.title,
      description: evt.description ?? null,
      dateText: evt.dateText ?? null,
      dateSortable: normalized.confidence !== 'unparseable' ? normalized.dateSortable : null,
      category: evt.category ?? 'other',
      content: evt.content ?? null,
      platform: evt.platform ?? null,
      authorHandle: evt.authorHandle ?? null,
      sourceUrl: evt.sourceUrl ?? null,
      sourceTitle: evt.sourceTitle ?? null,
      importance: evt.importance ?? 3,
      reviewStatus,
    });

    if (reviewStatus) pendingReview.push(evt.title);
  }

  // ── 第二阶段：对无法解析的日期进行插值排序 ──
  const existingDates = existingEvents.map(e => e.dateSortable).filter((d): d is string => !!d);
  interpolateDateSortables(toSave, existingDates, characterType);

  // ── 第三阶段：批量入库（事务内分批插入） ──
  if (toSave.length === 0) return { saved: [], skipped, pendingReview };

  const results = await db.transaction(async (tx) => {
    const inserted = [];
    const BATCH_SIZE = 50;
    for (let i = 0; i < toSave.length; i += BATCH_SIZE) {
      const batch = toSave.slice(i, i + BATCH_SIZE);
      for (const evt of batch) {
        const result = await tx.insert(events).values({
          characterId: input.characterId,
          parentEventId: evt.parentEventId,
          title: evt.title,
          description: evt.description,
          dateText: evt.dateText,
          dateSortable: evt.dateSortable,
          category: evt.category,
          content: evt.content,
          platform: evt.platform,
          authorHandle: evt.authorHandle,
          sourceUrl: evt.sourceUrl,
          sourceTitle: evt.sourceTitle,
          importance: evt.importance,
          metadata: null,
          reviewStatus: evt.reviewStatus,
        }).returning();
        inserted.push(result[0]!);
      }
    }
    return inserted;
  });
  return { saved: results, skipped, pendingReview };
}

export async function getEvents(db: Database, input: {
  characterId: number;
  minImportance?: number;
  category?: string;
}) {
  const conditions = [eq(events.characterId, input.characterId)];
  if (input.minImportance) conditions.push(gte(events.importance, input.minImportance));
  if (input.category) conditions.push(eq(events.category, input.category));

  return db.select().from(events)
    .where(and(...conditions))
    .orderBy(sql`COALESCE(${events.dateSortable}, 'zzzz')`, events.createdAt);
}

export async function getEvent(db: Database, id: number) {
  const result = await db.select().from(events).where(eq(events.id, id));
  return result[0] ?? null;
}

export async function getChildEvents(db: Database, parentEventId: number) {
  return db.select().from(events).where(eq(events.parentEventId, parentEventId));
}

// Reaction 查询
export async function saveReactions(db: Database, input: {
  eventId: number;
  reactions: Array<{
    reactor: string;
    reactorType: ReactorType;
    reactionText?: string;
    sentiment?: Sentiment;
    sourceUrl?: string;
    sourceTitle?: string;
  }>;
}) {
  if (input.reactions.length === 0) return [];

  return db.transaction(async (tx) => {
    const results = [];
    for (const r of input.reactions) {
      const result = await tx.insert(reactions).values({
        eventId: input.eventId,
        reactor: r.reactor,
        reactorType: r.reactorType,
        reactionText: r.reactionText ?? null,
        sentiment: r.sentiment ?? null,
        sourceUrl: r.sourceUrl ?? null,
        sourceTitle: r.sourceTitle ?? null,
      }).returning();
      results.push(result[0]!);
    }
    return results;
  });
}

export async function getReactionsForEvent(db: Database, eventId: number) {
  return db.select().from(reactions)
    .where(eq(reactions.eventId, eventId));
}

// 删除操作
export async function deleteReaction(db: Database, id: number) {
  await db.delete(reactions).where(eq(reactions.id, id));
}

export async function deleteEvent(db: Database, id: number) {
  // 删除该事件的所有反应
  await db.delete(reactions).where(eq(reactions.eventId, id));
  // 递归删除子事件及其反应
  const children = await db.select({ id: events.id }).from(events).where(eq(events.parentEventId, id));
  for (const child of children) {
    await deleteEvent(db, child.id);
  }
  // 删除事件本身
  await db.delete(events).where(eq(events.id, id));
}

export async function deleteCharacter(db: Database, id: number) {
  // 获取所有事件并逐个删除（含反应级联）
  const allEvents = await db.select({ id: events.id }).from(events).where(eq(events.characterId, id));
  for (const evt of allEvents) {
    await db.delete(reactions).where(eq(reactions.eventId, evt.id));
  }
  await db.delete(events).where(eq(events.characterId, id));
  await db.delete(characters).where(eq(characters.id, id));
}

// 导出完整角色数据
export async function exportCharacter(db: Database, characterId: number): Promise<CharacterExport | null> {
  const character = await getCharacter(db, characterId);
  if (!character) return null;

  const allEvents = await db.select().from(events)
    .where(eq(events.characterId, characterId))
    .orderBy(sql`COALESCE(${events.dateSortable}, 'zzzz')`, events.createdAt);

  // 预构建父→子索引，消除 O(n²) 查找
  const childrenMap = new Map<number, number[]>();
  for (const evt of allEvents) {
    if (evt.parentEventId != null) {
      const list = childrenMap.get(evt.parentEventId) ?? [];
      list.push(evt.id);
      childrenMap.set(evt.parentEventId, list);
    }
  }

  // 批量查询所有反应（单次查询替代 N 次查询）
  const allReactions = await db.select().from(reactions)
    .where(sql`${reactions.eventId} IN (${sql.join(allEvents.map(e => sql`${e.id}`), sql`, `)})`);

  // 按 eventId 分组
  const reactionsByEvent = new Map<number, typeof allReactions>();
  for (const r of allReactions) {
    const list = reactionsByEvent.get(r.eventId) ?? [];
    list.push(r);
    reactionsByEvent.set(r.eventId, list);
  }

  let totalReactions = 0;
  const timeline = allEvents.map((evt) => {
    const eventReactions = reactionsByEvent.get(evt.id) ?? [];
    totalReactions += eventReactions.length;

    return {
      id: evt.id,
      date: evt.dateText,
      title: evt.title,
      description: evt.description,
      category: evt.category as EventCategory,
      content: evt.content,
      platform: evt.platform,
      authorHandle: evt.authorHandle,
      importance: evt.importance,
      children: childrenMap.get(evt.id) ?? [],
      reactions: eventReactions.map(r => ({
        reactor: r.reactor,
        reactorType: r.reactorType as ReactorType,
        reactionText: r.reactionText,
        sentiment: r.sentiment as Sentiment,
      })),
    };
  });

  return {
    character: {
      name: character.name,
      type: character.type as CharacterType,
      source: parseSource(character.source),
      description: character.description,
      aliases: character.aliases,
    },
    timeline,
    metadata: {
      totalEvents: allEvents.length,
      totalReactions,
      collectedAt: new Date().toISOString(),
    },
  };
}

// CollectionTask 查询
export async function createCollectionTask(db: Database, input: {
  id: string;
  characterName: string;
  characterType: CharacterType;
  source?: string[];
  maxRounds?: number;
  aliases?: string;
  logPath?: string;
  pid?: number;
}) {
  const result = await db.insert(collectionTasks).values({
    id: input.id,
    characterName: input.characterName,
    characterType: input.characterType,
    source: input.source ? JSON.stringify(input.source) : null,
    maxRounds: input.maxRounds ?? 5,
    aliases: input.aliases ?? null,
    logPath: input.logPath ?? null,
    pid: input.pid ?? null,
    status: 'pending',
  }).returning();
  return result[0]!;
}

export async function getCollectionTask(db: Database, id: string) {
  const result = await db.select().from(collectionTasks).where(eq(collectionTasks.id, id));
  return result[0] ?? null;
}

export async function updateCollectionTask(db: Database, id: string, input: {
  characterId?: number;
  status?: CollectionTaskStatus;
  logPath?: string;
  pid?: number;
  startedAt?: string;
  completedAt?: string;
  result?: string;
  error?: string;
  progress?: CollectionTaskProgress;
}) {
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.characterId !== undefined) updates.characterId = input.characterId;
  if (input.status !== undefined) updates.status = input.status;
  if (input.logPath !== undefined) updates.logPath = input.logPath;
  if (input.pid !== undefined) updates.pid = input.pid;
  if (input.startedAt !== undefined) updates.startedAt = input.startedAt;
  if (input.completedAt !== undefined) updates.completedAt = input.completedAt;
  if (input.result !== undefined) updates.result = input.result;
  if (input.error !== undefined) updates.error = input.error;
  if (input.progress !== undefined) updates.progress = JSON.stringify(input.progress);

  await db.update(collectionTasks).set(updates).where(eq(collectionTasks.id, id));
}

export async function listCollectionTasks(db: Database, options?: {
  status?: CollectionTaskStatus;
  limit?: number;
}) {
  const conditions = [];
  if (options?.status) conditions.push(eq(collectionTasks.status, options.status));
  const query = db.select().from(collectionTasks)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(collectionTasks.createdAt));
  return options?.limit ? query.limit(options.limit) : query;
}

export async function getRunningCollectionTasks(db: Database) {
  return db.select().from(collectionTasks)
    .where(eq(collectionTasks.status, 'running'))
    .orderBy(desc(collectionTasks.createdAt));
}

// 搜索函数
export interface EventSearchFilters {
  characterId?: number;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
  importance?: number;
}

export async function searchCharacters(db: Database, query: string) {
  const pattern = `%${query}%`;
  return db.select().from(characters)
    .where(or(
      like(characters.name, pattern),
      like(characters.description, pattern),
    ))
    .orderBy(desc(characters.updatedAt))
    .limit(20);
}

export async function searchEvents(db: Database, query: string, filters?: EventSearchFilters) {
  const pattern = `%${query}%`;
  const conditions = [
    or(
      like(events.title, pattern),
      like(events.description, pattern),
      like(events.content, pattern),
    ),
  ];

  if (filters?.characterId) conditions.push(eq(events.characterId, filters.characterId));
  if (filters?.category) conditions.push(eq(events.category, filters.category));
  if (filters?.importance) conditions.push(gte(events.importance, filters.importance));
  if (filters?.dateFrom) conditions.push(gte(events.dateSortable, filters.dateFrom));
  if (filters?.dateTo) {
    conditions.push(sql`${events.dateSortable} <= ${filters.dateTo}`);
  }

  return db.select().from(events)
    .where(and(...conditions))
    .orderBy(sql`COALESCE(${events.dateSortable}, 'zzzz')`, events.createdAt)
    .limit(50);
}

// 审核查询
export async function getPendingReviewEvents(db: Database, characterId?: number) {
  const conditions = [eq(events.reviewStatus, 'pending')];
  if (characterId) conditions.push(eq(events.characterId, characterId));
  return db.select().from(events)
    .where(and(...conditions))
    .orderBy(desc(events.createdAt));
}

export async function resolveReviewEvent(db: Database, eventId: number, action: 'keep' | 'merge', mergeTargetId?: number) {
  if (action === 'keep') {
    await db.update(events).set({ reviewStatus: 'approved', updatedAt: new Date().toISOString() })
      .where(eq(events.id, eventId));
  } else if (action === 'merge' && mergeTargetId) {
    await db.transaction(async (tx) => {
      const target = await tx.select().from(events).where(eq(events.id, mergeTargetId)).limit(1);
      const source = await tx.select().from(events).where(eq(events.id, eventId)).limit(1);
      if (target[0] && source[0]) {
        let mergedFrom: number[] = [];
        try {
          mergedFrom = target[0].mergedFromIds ? JSON.parse(target[0].mergedFromIds) : [];
        } catch { /* 损坏数据，重新初始化 */ }
        mergedFrom.push(eventId);
        const updates: Record<string, unknown> = {
          mergedFromIds: JSON.stringify(mergedFrom),
          updatedAt: new Date().toISOString(),
        };
        if (!target[0].description && source[0].description) updates.description = source[0].description;
        if (!target[0].content && source[0].content) updates.content = source[0].content;
        if (!target[0].dateText && source[0].dateText) updates.dateText = source[0].dateText;
        await tx.update(events).set(updates).where(eq(events.id, mergeTargetId));
        // 转移源事件的 reactions 到目标事件
        await tx.update(reactions).set({ eventId: mergeTargetId })
          .where(eq(reactions.eventId, eventId));
        await tx.delete(events).where(eq(events.id, eventId));
      }
    });
  }
}
