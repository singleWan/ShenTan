import { getDb, collectionTasks, backgroundTasks } from '../db';
import { eq, desc } from 'drizzle-orm';

// 统一任务视图类型
export type UnifiedTaskType = 'collection' | 'expand-events' | 'collect-reactions';

export interface UnifiedTask {
  id: string;
  type: UnifiedTaskType;
  characterName: string;
  characterId?: number | null;
  status: string;
  progress?: string | null;
  result?: string | null;
  error?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  // 额外配置（仅 collection 类型有）
  config?: string | null;
}

export interface TaskListFilters {
  type?: UnifiedTaskType;
  status?: string;
  limit?: number;
  offset?: number;
}

// --- background_tasks 表操作 ---

export function createBgTask(input: {
  id: string;
  type: string;
  characterId?: number;
  characterName: string;
  config?: string;
}) {
  const db = getDb();
  const now = new Date().toISOString();
  db.insert(backgroundTasks).values({
    id: input.id,
    type: input.type,
    characterId: input.characterId ?? null,
    characterName: input.characterName,
    config: input.config ?? null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  }).run();
}

export function updateBgTask(id: string, updates: {
  status?: string;
  result?: string;
  error?: string;
  progress?: string;
  startedAt?: string;
  completedAt?: string;
}) {
  const db = getDb();
  db.update(backgroundTasks).set({
    ...updates,
    updatedAt: new Date().toISOString(),
  }).where(eq(backgroundTasks.id, id)).run();
}

export function getBgTask(id: string) {
  const db = getDb();
  return db.select().from(backgroundTasks).where(eq(backgroundTasks.id, id)).get();
}

export function deleteBgTask(id: string) {
  const db = getDb();
  db.delete(backgroundTasks).where(eq(backgroundTasks.id, id)).run();
}

// --- 统一查询 ---

export function getAllTasks(filters?: TaskListFilters): UnifiedTask[] {
  const db = getDb();
  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  const typeFilter = filters?.type;
  const statusFilter = filters?.status;

  const results: UnifiedTask[] = [];

  // 收集任务
  if (!typeFilter || typeFilter === 'collection') {
    const rows = db.select().from(collectionTasks).orderBy(desc(collectionTasks.createdAt)).all();
    for (const row of rows) {
      if (statusFilter && row.status !== statusFilter) continue;
      results.push({
        id: row.id,
        type: 'collection',
        characterName: row.characterName,
        characterId: row.characterId,
        status: row.status,
        progress: row.progress,
        result: row.result,
        error: row.error,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        config: JSON.stringify({
          characterType: row.characterType,
          source: row.source ? JSON.parse(row.source) : undefined,
          maxRounds: row.maxRounds,
          aliases: row.aliases,
        }),
      });
    }
  }

  // 拓展/反应任务
  if (!typeFilter || typeFilter === 'expand-events' || typeFilter === 'collect-reactions') {
    const rows = db.select().from(backgroundTasks).orderBy(desc(backgroundTasks.createdAt)).all();
    for (const row of rows) {
      if (statusFilter && row.status !== statusFilter) continue;
      if (typeFilter && row.type !== typeFilter) continue;
      results.push({
        id: row.id,
        type: row.type as UnifiedTaskType,
        characterName: row.characterName,
        characterId: row.characterId,
        status: row.status,
        progress: row.progress,
        result: row.result,
        error: row.error,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        config: row.config,
      });
    }
  }

  // 按创建时间降序排列后分页
  results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return results.slice(offset, offset + limit);
}

export function getUnifiedTask(id: string): UnifiedTask | undefined {
  const db = getDb();

  // 先查 collectionTasks
  const collTask = db.select().from(collectionTasks).where(eq(collectionTasks.id, id)).get();
  if (collTask) {
    return {
      id: collTask.id,
      type: 'collection',
      characterName: collTask.characterName,
      characterId: collTask.characterId,
      status: collTask.status,
      progress: collTask.progress,
      result: collTask.result,
      error: collTask.error,
      startedAt: collTask.startedAt,
      completedAt: collTask.completedAt,
      createdAt: collTask.createdAt,
      updatedAt: collTask.updatedAt,
      config: JSON.stringify({
        characterType: collTask.characterType,
        source: collTask.source ? JSON.parse(collTask.source) : undefined,
        maxRounds: collTask.maxRounds,
        aliases: collTask.aliases,
      }),
    };
  }

  // 再查 backgroundTasks
  const bgTask = db.select().from(backgroundTasks).where(eq(backgroundTasks.id, id)).get();
  if (bgTask) {
    return {
      id: bgTask.id,
      type: bgTask.type as UnifiedTaskType,
      characterName: bgTask.characterName,
      characterId: bgTask.characterId,
      status: bgTask.status,
      progress: bgTask.progress,
      result: bgTask.result,
      error: bgTask.error,
      startedAt: bgTask.startedAt,
      completedAt: bgTask.completedAt,
      createdAt: bgTask.createdAt,
      updatedAt: bgTask.updatedAt,
      config: bgTask.config,
    };
  }

  return undefined;
}

export function deleteUnifiedTask(id: string): boolean {
  const db = getDb();

  // 先尝试从 collectionTasks 删除
  const collTask = db.select().from(collectionTasks).where(eq(collectionTasks.id, id)).get();
  if (collTask) {
    db.delete(collectionTasks).where(eq(collectionTasks.id, id)).run();
    return true;
  }

  // 再尝试从 backgroundTasks 删除
  const bgTask = db.select().from(backgroundTasks).where(eq(backgroundTasks.id, id)).get();
  if (bgTask) {
    db.delete(backgroundTasks).where(eq(backgroundTasks.id, id)).run();
    return true;
  }

  return false;
}

export function clearTasks(statuses: string[]): number {
  const db = getDb();
  let deleted = 0;

  // 清理 collectionTasks
  for (const status of statuses) {
    const result = db.delete(collectionTasks)
      .where(eq(collectionTasks.status, status))
      .run();
    deleted += result.changes;
  }

  // 清理 backgroundTasks
  for (const status of statuses) {
    const result = db.delete(backgroundTasks)
      .where(eq(backgroundTasks.status, status))
      .run();
    deleted += result.changes;
  }

  return deleted;
}
