import type { CollectOptions, CollectTask, SSEData, ProgressData } from './types';
import { createTaskInDb, updateTaskInDb, getActiveTasksFromDb, getTaskFromDb } from './task-store';
import { ProcessManager } from '../shared/process-manager';
import { getDbPath, getLogDir } from '../shared/utils';

const pm = new ProcessManager<CollectTask>({
  onLog(taskId, task, data) {
    pm.notifySubscribers(taskId, { type: 'log', ...data });
  },
  onStatus(taskId, _task, status) {
    pm.notifySubscribers(taskId, { type: 'status', status });
    updateTaskInDb(taskId, {
      status: status === 'running' ? 'running' : status,
      startedAt: new Date().toISOString(),
    }).catch(() => {});
  },
  onProgress(taskId, _task, progress) {
    pm.notifySubscribers(taskId, { type: 'progress', progress });
    updateTaskInDb(taskId, {
      progress: JSON.stringify(progress),
    }).catch(() => {});
  },
  onComplete(taskId, _task, result) {
    const r = result as CollectTask['result'];
    pm.notifySubscribers(taskId, { type: 'complete', result: r });
    updateTaskInDb(taskId, {
      status: 'completed',
      characterId: r?.characterId,
      completedAt: new Date().toISOString(),
      result: JSON.stringify(r),
    }).catch(() => {});
  },
  onError(taskId, _task, message) {
    pm.notifySubscribers(taskId, { type: 'error', message });
    updateTaskInDb(taskId, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      error: message,
    }).catch(() => {});
  },
});

function createCollectTask(taskId: string, characterName: string): CollectTask {
  return {
    id: taskId,
    characterName,
    status: 'starting',
    startedAt: new Date().toISOString(),
    logs: [],
    subscribers: new Set(),
  };
}

export function startCollection(options: CollectOptions): { taskId: string; error?: string } {
  const err = pm.checkConcurrency();
  if (err) return { taskId: '', error: err };

  const taskId = crypto.randomUUID();
  const task = createCollectTask(taskId, options.characterName);
  pm.tasks.set(taskId, task);

  const proc = pm.forkProcess(taskId, task, 'scripts/agent-runner.ts');

  createTaskInDb({
    id: taskId,
    characterName: options.characterName,
    characterType: options.characterType,
    source: options.source,
    maxRounds: options.maxRounds,
    aliases: options.aliases,
    pid: proc.pid ?? undefined,
  }).catch(() => {});

  pm.sendMessage(taskId, {
    type: 'start',
    payload: {
      characterName: options.characterName,
      characterType: options.characterType,
      source: options.source,
      maxRounds: options.maxRounds,
      aliases: options.aliases,
      dbPath: getDbPath(),
      logDir: getLogDir(),
      taskId,
      existingCharacterId: options.existingCharacterId,
    },
  });

  return { taskId };
}

export async function resumeCollection(
  taskId: string,
): Promise<{ taskId: string; error?: string }> {
  const err = pm.checkConcurrency();
  if (err) return { taskId: '', error: err };

  const dbTask = await getTaskFromDb(taskId);
  if (!dbTask) return { taskId: '', error: '任务记录不存在' };

  const task = createCollectTask(taskId, dbTask.characterName);
  pm.tasks.set(taskId, task);

  const proc = pm.forkProcess(taskId, task, 'scripts/agent-runner.ts');

  updateTaskInDb(taskId, {
    status: 'starting',
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
    result: null,
    progress: null,
    pid: proc.pid ?? undefined,
  }).catch(() => {});

  const source = dbTask.source ? JSON.parse(dbTask.source) : undefined;

  pm.sendMessage(taskId, {
    type: 'start',
    payload: {
      characterName: dbTask.characterName,
      characterType: dbTask.characterType,
      source,
      maxRounds: dbTask.maxRounds ?? 5,
      aliases: dbTask.aliases ?? undefined,
      existingCharacterId: dbTask.characterId ?? undefined,
      dbPath: getDbPath(),
      logDir: getLogDir(),
      taskId,
    },
  });

  return { taskId };
}

export function getTask(taskId: string): CollectTask | undefined {
  return pm.tasks.get(taskId);
}

export function getAllTasks(): Array<{
  id: string;
  characterName: string;
  status: string;
  error?: string;
}> {
  return Array.from(pm.tasks.values()).map((t) => ({
    id: t.id,
    characterName: t.characterName,
    status: t.status,
    error: t.error,
  }));
}

export function cancelTask(taskId: string): boolean {
  const cancelled = pm.cancelTask(taskId);
  if (cancelled) {
    updateTaskInDb(taskId, {
      status: 'cancelled',
      completedAt: new Date().toISOString(),
    }).catch(() => {});
  }
  return cancelled;
}

export function subscribe(taskId: string, callback: (data: SSEData) => void): () => void {
  return pm.subscribe(taskId, callback as (data: unknown) => void);
}

export async function recoverTasks() {
  try {
    const active = await getActiveTasksFromDb();
    const RECENT_THRESHOLD = 2 * 60 * 1000;
    for (const task of active) {
      if (pm.tasks.has(task.id)) continue;
      if (task.updatedAt && Date.now() - new Date(task.updatedAt).getTime() < RECENT_THRESHOLD)
        continue;

      await updateTaskInDb(task.id, {
        status: 'interrupted',
        completedAt: new Date().toISOString(),
        error: '服务器重启，任务中断。可点击继续恢复执行。',
      });
    }
  } catch {
    // 数据库可能未初始化（首次启动），忽略
  }
}
