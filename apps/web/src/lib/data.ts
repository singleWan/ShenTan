import { getDb, characters, events, reactions, characterRelations } from './db';
import { eq, desc, sql, inArray, like, and, or, gte } from 'drizzle-orm';

export async function listCharacters() {
  const db = getDb();
  return db.select().from(characters).orderBy(desc(characters.updatedAt)).all();
}

export async function getCharacter(id: number) {
  const db = getDb();
  return db.select().from(characters).where(eq(characters.id, id)).get();
}

export async function getCharacterEvents(characterId: number) {
  const db = getDb();
  return db
    .select()
    .from(events)
    .where(eq(events.characterId, characterId))
    .orderBy(events.dateSortable)
    .all();
}

export async function getEvent(eventId: number) {
  const db = getDb();
  return db.select().from(events).where(eq(events.id, eventId)).get();
}

export async function getEventReactions(eventId: number) {
  const db = getDb();
  return db.select().from(reactions).where(eq(reactions.eventId, eventId)).all();
}

export async function getReactionsForEvents(eventIds: number[]) {
  if (eventIds.length === 0)
    return new Map<number, Awaited<ReturnType<typeof getEventReactions>>>();
  const db = getDb();
  const rows = db.select().from(reactions).where(inArray(reactions.eventId, eventIds)).all();
  const map = new Map<number, Awaited<ReturnType<typeof getEventReactions>>>();
  for (const r of rows) {
    const list = map.get(r.eventId) ?? [];
    list.push(r);
    map.set(r.eventId, list);
  }
  return map;
}

export async function deleteReaction(id: number) {
  const db = getDb();
  await db.delete(reactions).where(eq(reactions.id, id));
}

export async function deleteEvent(id: number) {
  const db = getDb();
  // 收集所有子孙事件 ID（含自身）
  const allIds = collectChildEventIds(db, id);
  // 批量删除所有关联反应
  await db
    .delete(reactions)
    .where(sql`${reactions.eventId} IN (${allIds.map((i) => `${i}`).join(',')})`);
  // 批量删除所有子孙事件
  await db.delete(events).where(sql`${events.id} IN (${allIds.map((i) => `${i}`).join(',')})`);
}

function collectChildEventIds(db: ReturnType<typeof getDb>, rootId: number): number[] {
  const ids = [rootId];
  const stack = [rootId];
  while (stack.length > 0) {
    const parentId = stack.pop()!;
    const children = db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.parentEventId, parentId))
      .all();
    for (const child of children) {
      ids.push(child.id);
      stack.push(child.id);
    }
  }
  return ids;
}

export async function deleteCharacter(id: number) {
  const db = getDb();
  await db
    .delete(reactions)
    .where(
      sql`${reactions.eventId} IN (SELECT ${events.id} FROM ${events} WHERE ${events.characterId} = ${id})`,
    );
  await db.delete(events).where(eq(events.characterId, id));
  await db.delete(characters).where(eq(characters.id, id));
}

// 搜索函数
export interface EventSearchFilters {
  characterId?: number;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
  importance?: number;
}

export async function searchCharacters(query: string) {
  if (!query.trim()) return [];
  const db = getDb();
  const pattern = `%${query}%`;
  return db
    .select()
    .from(characters)
    .where(or(like(characters.name, pattern), like(characters.description, pattern)))
    .orderBy(desc(characters.updatedAt))
    .limit(20)
    .all();
}

export async function searchEvents(query: string, filters?: EventSearchFilters) {
  if (!query.trim()) return [];
  const db = getDb();
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
  if (filters?.dateTo) conditions.push(sql`${events.dateSortable} <= ${filters.dateTo}`);

  return db
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(sql`COALESCE(${events.dateSortable}, 'zzzz')`, events.createdAt)
    .limit(50)
    .all();
}

export async function getPendingReviewEvents(characterId?: number) {
  const db = getDb();
  const conditions = [eq(events.reviewStatus, 'pending')];
  if (characterId) conditions.push(eq(events.characterId, characterId));
  return db
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(desc(events.createdAt))
    .all();
}

export async function resolveReviewEvent(
  eventId: number,
  action: 'keep' | 'merge',
  mergeTargetId?: number,
) {
  const db = getDb();
  if (action === 'keep') {
    db.update(events)
      .set({ reviewStatus: 'approved', updatedAt: new Date().toISOString() })
      .where(eq(events.id, eventId))
      .run();
  } else if (action === 'merge' && mergeTargetId) {
    const target = db.select().from(events).where(eq(events.id, mergeTargetId)).get();
    const source = db.select().from(events).where(eq(events.id, eventId)).get();
    if (target && source) {
      let mergedFrom: number[] = [];
      try {
        mergedFrom = target.mergedFromIds ? JSON.parse(target.mergedFromIds as string) : [];
      } catch {
        /* 损坏数据 */
      }
      mergedFrom.push(eventId);
      const updates: Record<string, unknown> = {
        mergedFromIds: JSON.stringify(mergedFrom),
        updatedAt: new Date().toISOString(),
      };
      if (!target.description && source.description) updates.description = source.description;
      if (!target.content && source.content) updates.content = source.content;
      if (!target.dateText && source.dateText) updates.dateText = source.dateText;
      db.update(events).set(updates).where(eq(events.id, mergeTargetId)).run();
      // 转移 reactions 到目标事件
      db.update(reactions)
        .set({ eventId: mergeTargetId })
        .where(eq(reactions.eventId, eventId))
        .run();
      db.delete(events).where(eq(events.id, eventId)).run();
    }
  }
}

// 关系查询
export async function getCharacterRelations(characterId: number) {
  const db = getDb();
  const allRels = db
    .select()
    .from(characterRelations)
    .where(
      or(
        eq(characterRelations.fromCharacterId, characterId),
        eq(characterRelations.toCharacterId, characterId),
      ),
    )
    .all();

  const unique = [...new Map(allRels.map((r) => [r.id, r])).values()];

  // 批量查询角色名称
  const charIds = [...new Set(unique.flatMap((r) => [r.fromCharacterId, r.toCharacterId]))];
  if (charIds.length === 0) return [];

  const chars = db
    .select({ id: characters.id, name: characters.name })
    .from(characters)
    .where(inArray(characters.id, charIds))
    .all();
  const charMap = new Map(chars.map((c) => [c.id, c.name]));

  return unique.map((r) => ({
    ...r,
    fromName: charMap.get(r.fromCharacterId) ?? '未知',
    toName: charMap.get(r.toCharacterId) ?? '未知',
  }));
}

export async function getRelationGraph() {
  const db = getDb();
  const allRels = db.select().from(characterRelations).all();

  // 只返回有关系的角色
  const charIds = [...new Set(allRels.flatMap((r) => [r.fromCharacterId, r.toCharacterId]))];
  if (charIds.length === 0) return { nodes: [], edges: [] };

  const nodes = db
    .select({ id: characters.id, name: characters.name, type: characters.type })
    .from(characters)
    .where(inArray(characters.id, charIds))
    .all();

  return {
    nodes,
    edges: allRels.map((r) => ({
      from: r.fromCharacterId,
      to: r.toCharacterId,
      type: r.relationType,
      description: r.description,
    })),
  };
}
