import { getDb, collectionTasks } from '../db';
import { eq, desc, or } from 'drizzle-orm';

export async function getTaskFromDb(taskId: string) {
  const db = getDb();
  return db.select().from(collectionTasks).where(eq(collectionTasks.id, taskId)).get();
}

export async function createTaskInDb(input: {
  id: string;
  characterName: string;
  characterType: string;
  source?: string[];
  maxRounds?: number;
  aliases?: string;
  logPath?: string;
  pid?: number;
  characterId?: number;
}) {
  const db = getDb();
  db.insert(collectionTasks)
    .values({
      id: input.id,
      characterId: input.characterId ?? undefined,
      characterName: input.characterName,
      characterType: input.characterType,
      source: input.source ? JSON.stringify(input.source) : null,
      maxRounds: input.maxRounds ?? 5,
      aliases: input.aliases ?? null,
      logPath: input.logPath ?? null,
      pid: input.pid ?? null,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .run();
}

export async function updateTaskInDb(
  taskId: string,
  updates: {
    characterId?: number | null;
    status?: string;
    logPath?: string | null;
    pid?: number | null;
    startedAt?: string | null;
    completedAt?: string | null;
    result?: string | null;
    error?: string | null;
    progress?: string | null;
  },
) {
  const db = getDb();
  // 过滤掉 undefined 的字段（undefined 表示不更新，null 表示清空）
  const filtered = Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined));
  db.update(collectionTasks)
    .set({
      ...filtered,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(collectionTasks.id, taskId))
    .run();
}

export async function getActiveTasksFromDb() {
  const db = getDb();
  return db
    .select()
    .from(collectionTasks)
    .where(
      or(
        eq(collectionTasks.status, 'running'),
        eq(collectionTasks.status, 'starting'),
        eq(collectionTasks.status, 'pending'),
      ),
    )
    .orderBy(desc(collectionTasks.createdAt))
    .all();
}
