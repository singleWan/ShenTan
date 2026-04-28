import { getDb, collectionTasks } from '../db';
import { eq, desc } from 'drizzle-orm';

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
  db.insert(collectionTasks).values({
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
  }).run();
}

export async function updateTaskInDb(taskId: string, updates: {
  characterId?: number;
  status?: string;
  logPath?: string;
  pid?: number;
  startedAt?: string;
  completedAt?: string;
  result?: string;
  error?: string;
  progress?: string;
}) {
  const db = getDb();
  db.update(collectionTasks).set({
    ...updates,
    updatedAt: new Date().toISOString(),
  }).where(eq(collectionTasks.id, taskId)).run();
}

export async function getRunningTasksFromDb() {
  const db = getDb();
  return db.select().from(collectionTasks)
    .where(eq(collectionTasks.status, 'running'))
    .orderBy(desc(collectionTasks.createdAt))
    .all();
}
