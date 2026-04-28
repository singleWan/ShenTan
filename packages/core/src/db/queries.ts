import { eq, and, gte, desc, sql } from 'drizzle-orm';
import type { Database } from './connection.js';
import { characters, events, reactions, searchTasks, collectionTasks } from './schema.js';
import type {
  CharacterType,
  EventCategory,
  Sentiment,
  ReactorType,
  AgentType,
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

function isDuplicateEvent(
  newEvt: { title: string; description?: string; dateSortable?: string },
  existing: { title: string; description: string | null; dateSortable: string | null },
): boolean {
  const titleSim = jaccardSimilarity(normalizeText(newEvt.title), normalizeText(existing.title));
  if (titleSim < 0.5) return false;
  const dateClose = isDateClose(newEvt.dateSortable ?? null, existing.dateSortable, 30);
  if (dateClose) return true;
  if (titleSim >= 0.8) return true;
  return false;
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
  }> = [];
  const skipped: string[] = [];

  for (const evt of input.events) {
    const dup = existingEvents.find(ex => isDuplicateEvent(evt, ex));
    if (dup) {
      skipped.push(evt.title);
      continue;
    }

    const normalized = normalizeDate(evt.dateText, evt.dateSortable, characterType);

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
    });
  }

  // ── 第二阶段：对无法解析的日期进行插值排序 ──
  const existingDates = existingEvents.map(e => e.dateSortable).filter((d): d is string => !!d);
  interpolateDateSortables(toSave, existingDates, characterType);

  // ── 第三阶段：批量入库 ──
  const results = [];
  for (const evt of toSave) {
    const result = await db.insert(events).values({
      characterId: input.characterId,
      ...evt,
      metadata: null,
    }).returning();
    results.push(result[0]!);
  }
  return { saved: results, skipped };
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
  const results = [];
  for (const r of input.reactions) {
    const result = await db.insert(reactions).values({
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
  await db.delete(searchTasks).where(eq(searchTasks.characterId, id));
  await db.delete(characters).where(eq(characters.id, id));
}

// SearchTask 查询
export async function createSearchTask(db: Database, input: {
  characterId: number;
  agentType: AgentType;
  query: string;
}) {
  const result = await db.insert(searchTasks).values({
    characterId: input.characterId,
    agentType: input.agentType,
    status: 'pending',
    query: input.query,
  }).returning();
  return result[0]!;
}

export async function updateSearchTask(db: Database, id: number, input: {
  status?: string;
  resultSummary?: string;
  startedAt?: string;
  completedAt?: string;
}) {
  await db.update(searchTasks).set(input).where(eq(searchTasks.id, id));
}

// 导出完整角色数据
export async function exportCharacter(db: Database, characterId: number): Promise<CharacterExport | null> {
  const character = await getCharacter(db, characterId);
  if (!character) return null;

  const allEvents = await db.select().from(events)
    .where(eq(events.characterId, characterId))
    .orderBy(sql`COALESCE(${events.dateSortable}, 'zzzz')`, events.createdAt);

  const timeline = await Promise.all(allEvents.map(async (evt) => {
    const eventReactions = await getReactionsForEvent(db, evt.id);
    const children = allEvents.filter(e => e.parentEventId === evt.id).map(e => e.id);

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
      children,
      reactions: eventReactions.map(r => ({
        reactor: r.reactor,
        reactorType: r.reactorType as ReactorType,
        reactionText: r.reactionText,
        sentiment: r.sentiment as Sentiment,
      })),
    };
  }));

  const totalReactions = timeline.reduce((sum, t) => sum + t.reactions.length, 0);

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
