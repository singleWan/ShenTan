import { getDb, characters, events, reactions } from './db';
import { eq, desc, sql, inArray } from 'drizzle-orm';

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
  return db.select().from(events)
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
  return db.select().from(reactions)
    .where(eq(reactions.eventId, eventId))
    .all();
}

export async function getReactionsForEvents(eventIds: number[]) {
  if (eventIds.length === 0) return new Map<number, Awaited<ReturnType<typeof getEventReactions>>>();
  const db = getDb();
  const rows = db.select().from(reactions)
    .where(inArray(reactions.eventId, eventIds))
    .all();
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
  await db.delete(reactions).where(
    sql`${reactions.eventId} IN (${allIds.map(i => `${i}`).join(',')})`
  );
  // 批量删除所有子孙事件
  await db.delete(events).where(
    sql`${events.id} IN (${allIds.map(i => `${i}`).join(',')})`
  );
}

function collectChildEventIds(db: ReturnType<typeof getDb>, rootId: number): number[] {
  const ids = [rootId];
  const stack = [rootId];
  while (stack.length > 0) {
    const parentId = stack.pop()!;
    const children = db.select({ id: events.id }).from(events)
      .where(eq(events.parentEventId, parentId)).all();
    for (const child of children) {
      ids.push(child.id);
      stack.push(child.id);
    }
  }
  return ids;
}

export async function deleteCharacter(id: number) {
  const db = getDb();
  await db.delete(reactions).where(
    sql`${reactions.eventId} IN (SELECT ${events.id} FROM ${events} WHERE ${events.characterId} = ${id})`
  );
  await db.delete(events).where(eq(events.characterId, id));
  await db.delete(characters).where(eq(characters.id, id));
}
