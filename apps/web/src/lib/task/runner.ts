import type { ExpandTaskOptions, ReactionTaskOptions, Task, TaskSSEData } from './types.js';
import { createBgTask, updateBgTask, getActiveBgTasksFromDb, getBgTask } from '../task-manager/store';
import { ProcessManager } from '../shared/process-manager';
import { getDbPath } from '../shared/utils';

const pm = new ProcessManager<Task>({
  onLog(taskId, _task, data) {
    pm.notifySubscribers(taskId, { type: 'log', ...data });
  },
  onStatus(taskId, _task, status) {
    pm.notifySubscribers(taskId, { type: 'status', status });
    updateBgTask(taskId, {
      status: status === 'running' ? 'running' : status,
      startedAt: new Date().toISOString(),
    });
  },
  onComplete(taskId, _task, result) {
    const r = result as Task['result'];
    pm.notifySubscribers(taskId, { type: 'complete', result: r });
    updateBgTask(taskId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      result: JSON.stringify(r),
    });
  },
  onError(taskId, _task, message) {
    pm.notifySubscribers(taskId, { type: 'error', message });
    updateBgTask(taskId, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      error: message,
    });
  },
});

function createTask(taskId: string, type: Task['type'], characterName: string): Task {
  return {
    id: taskId,
    type,
    status: 'starting',
    startedAt: new Date().toISOString(),
    logs: [],
    subscribers: new Set(),
  };
}

export function startExpandTask(options: ExpandTaskOptions): string {
  const taskId = crypto.randomUUID();
  const task = createTask(taskId, 'expand-events', options.characterName);
  pm.tasks.set(taskId, task);

  createBgTask({
    id: taskId,
    type: 'expand-events',
    characterId: options.characterId,
    characterName: options.characterName,
    config: JSON.stringify({ mode: options.mode }),
  });

  pm.forkProcess(taskId, task, 'scripts/task-runner.ts');
  pm.sendMessage(taskId, {
    type: 'start-expand',
    payload: {
      type: 'expand',
      characterId: options.characterId,
      characterName: options.characterName,
      characterAliases: options.characterAliases ?? '',
      mode: options.mode,
      afterEvent: options.afterEvent,
      beforeEvent: options.beforeEvent,
      centerEvent: options.centerEvent,
      dbPath: getDbPath(),
    },
  });

  return taskId;
}

export function startReactionTask(options: ReactionTaskOptions): string {
  const taskId = crypto.randomUUID();
  const task = createTask(taskId, 'collect-reactions', options.characterName);
  pm.tasks.set(taskId, task);

  createBgTask({
    id: taskId,
    type: 'collect-reactions',
    characterId: options.characterId,
    characterName: options.characterName,
    config: JSON.stringify({ eventContext: options.eventContext }),
  });

  pm.forkProcess(taskId, task, 'scripts/task-runner.ts');
  pm.sendMessage(taskId, {
    type: 'start-reaction',
    payload: {
      type: 'reaction',
      characterId: options.characterId,
      characterName: options.characterName,
      characterAliases: options.characterAliases ?? '',
      eventContext: options.eventContext,
      dbPath: getDbPath(),
    },
  });

  return taskId;
}

export function getTask(taskId: string): Task | undefined {
  return pm.tasks.get(taskId);
}

export function cancelTask(taskId: string): boolean {
  const cancelled = pm.cancelTask(taskId);
  if (cancelled) {
    updateBgTask(taskId, {
      status: 'cancelled',
      completedAt: new Date().toISOString(),
    });
  }
  return cancelled;
}

export function subscribe(taskId: string, callback: (data: TaskSSEData) => void): () => void {
  return pm.subscribe(taskId, callback as (data: unknown) => void);
}

export function resumeBgTask(taskId: string): { taskId: string; error?: string } {
  const err = pm.checkConcurrency();
  if (err) return { taskId: '', error: err };

  const dbTask = getBgTask(taskId);
  if (!dbTask) return { taskId: '', error: '任务记录不存在' };

  const config = dbTask.config ? JSON.parse(dbTask.config) : {};
  const task = createTask(taskId, dbTask.type as Task['type'], dbTask.characterName);
  pm.tasks.set(taskId, task);

  updateBgTask(taskId, {
    status: 'starting',
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
    result: null,
    progress: null,
  });

  pm.forkProcess(taskId, task, 'scripts/task-runner.ts');

  if (dbTask.type === 'expand-events') {
    pm.sendMessage(taskId, {
      type: 'start-expand',
      payload: {
        type: 'expand',
        characterId: dbTask.characterId,
        characterName: dbTask.characterName,
        characterAliases: config.characterAliases ?? '',
        mode: config.mode ?? 'around',
        afterEvent: config.afterEvent,
        beforeEvent: config.beforeEvent,
        centerEvent: config.centerEvent,
        dbPath: getDbPath(),
      },
    });
  } else if (dbTask.type === 'collect-reactions') {
    pm.sendMessage(taskId, {
      type: 'start-reaction',
      payload: {
        type: 'reaction',
        characterId: dbTask.characterId,
        characterName: dbTask.characterName,
        characterAliases: config.characterAliases ?? '',
        eventContext: config.eventContext,
        dbPath: getDbPath(),
      },
    });
  } else {
    return { taskId: '', error: `未知任务类型: ${dbTask.type}` };
  }

  return { taskId };
}

export async function recoverBgTasks() {
  try {
    const active = await getActiveBgTasksFromDb();
    const RECENT_THRESHOLD = 2 * 60 * 1000;
    for (const task of active) {
      if (pm.tasks.has(task.id)) continue;
      if (task.updatedAt && Date.now() - new Date(task.updatedAt).getTime() < RECENT_THRESHOLD) continue;

      updateBgTask(task.id, {
        status: 'interrupted',
        completedAt: new Date().toISOString(),
        error: '服务器重启，任务中断。可点击继续恢复执行。',
      });
    }
  } catch {
    // 数据库可能未初始化（首次启动），忽略
  }
}
