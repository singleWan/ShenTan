import { fork, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import type { ExpandTaskOptions, ReactionTaskOptions, Task, TaskSSEData } from './types.js';
import { createBgTask, updateBgTask, getActiveBgTasksFromDb, getBgTask } from '../task-manager/store';

const tasks = new Map<string, Task>();
const processes = new Map<string, ChildProcess>();

function findMonorepoRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== '/') {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = dirname(dir);
  }
  return startDir;
}

const MONOREPO_ROOT = findMonorepoRoot(resolve(process.cwd()));

function getDbPath(): string {
  const raw = process.env.DATABASE_PATH ?? './data/shentan.db';
  if (raw.startsWith('file:')) return raw;
  return `file:${resolve(MONOREPO_ROOT, raw)}`;
}

function notifySubscribers(taskId: string, data: TaskSSEData) {
  const task = tasks.get(taskId);
  if (!task) return;
  task.subscribers.forEach((cb) => {
    try { cb(data); } catch { /* disconnected */ }
  });
}

function startProcess(taskId: string, task: Task, payload: Record<string, unknown>) {
  const scriptPath = resolve(MONOREPO_ROOT, 'scripts/task-runner.ts');
  const proc = fork(scriptPath, [], {
    execArgv: ['--import', 'tsx'],
    env: { ...process.env },
    cwd: MONOREPO_ROOT,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  });
  processes.set(taskId, proc);

  proc.on('message', (msg: { type: string; payload?: unknown }) => {
    switch (msg.type) {
      case 'log': {
        const p = msg.payload as { message: string; timestamp: string };
        task.logs.push({ timestamp: p.timestamp, message: p.message });
        notifySubscribers(taskId, { type: 'log', ...p });
        break;
      }
      case 'status': {
        const p = msg.payload as { status: Task['status'] };
        task.status = p.status;
        notifySubscribers(taskId, { type: 'status', status: p.status });
        updateBgTask(taskId, {
          status: p.status === 'running' ? 'running' : p.status,
          startedAt: new Date().toISOString(),
        });
        break;
      }
      case 'complete': {
        const p = msg.payload as Task['result'];
        task.status = 'completed';
        task.result = p;
        notifySubscribers(taskId, { type: 'complete', result: p });
        updateBgTask(taskId, {
          status: 'completed',
          completedAt: new Date().toISOString(),
          result: JSON.stringify(p),
        });
        break;
      }
      case 'error': {
        const p = msg.payload as { message: string };
        task.status = 'failed';
        task.error = p.message;
        notifySubscribers(taskId, { type: 'error', message: p.message });
        updateBgTask(taskId, {
          status: 'failed',
          completedAt: new Date().toISOString(),
          error: p.message,
        });
        break;
      }
    }
  });

  proc.on('exit', (code) => {
    if (task.status === 'running' || task.status === 'starting') {
      task.status = 'failed';
      task.error = code === null ? '进程异常终止' : `进程退出码: ${code}`;
      notifySubscribers(taskId, { type: 'error', message: task.error });
      updateBgTask(taskId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        error: task.error,
      });
    }
    processes.delete(taskId);
  });

  proc.send(payload);
}

export function startExpandTask(options: ExpandTaskOptions): string {
  const taskId = crypto.randomUUID();
  const task: Task = {
    id: taskId,
    type: 'expand-events',
    status: 'starting',
    startedAt: new Date().toISOString(),
    logs: [],
    subscribers: new Set(),
  };
  tasks.set(taskId, task);

  // 持久化到数据库
  createBgTask({
    id: taskId,
    type: 'expand-events',
    characterId: options.characterId,
    characterName: options.characterName,
    config: JSON.stringify({ mode: options.mode }),
  });

  startProcess(taskId, task, {
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
  const task: Task = {
    id: taskId,
    type: 'collect-reactions',
    status: 'starting',
    startedAt: new Date().toISOString(),
    logs: [],
    subscribers: new Set(),
  };
  tasks.set(taskId, task);

  // 持久化到数据库
  createBgTask({
    id: taskId,
    type: 'collect-reactions',
    characterId: options.characterId,
    characterName: options.characterName,
    config: JSON.stringify({ eventContext: options.eventContext }),
  });

  startProcess(taskId, task, {
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
  return tasks.get(taskId);
}

export function cancelTask(taskId: string): boolean {
  const proc = processes.get(taskId);
  const task = tasks.get(taskId);
  if (!proc && !task) return false;

  if (proc) {
    proc.send({ type: 'cancel' });
    setTimeout(() => proc.kill('SIGTERM'), 3000);
  }

  if (task && (task.status === 'running' || task.status === 'starting')) {
    task.status = 'cancelled';
    notifySubscribers(taskId, { type: 'cancelled' });
    updateBgTask(taskId, {
      status: 'cancelled',
      completedAt: new Date().toISOString(),
    });
  }

  return true;
}

export function subscribe(taskId: string, callback: (data: TaskSSEData) => void): () => void {
  const task = tasks.get(taskId);
  if (!task) return () => {};
  task.subscribers.add(callback);
  return () => task.subscribers.delete(callback);
}

function getRunningBgCount(): number {
  let count = 0;
  for (const task of tasks.values()) {
    if (task.status === 'starting' || task.status === 'running') count++;
  }
  return count;
}

function getMaxConcurrent(): number {
  return parseInt(process.env.MAX_CONCURRENT_TASKS ?? '3', 10);
}

// 恢复中断的后台任务
export function resumeBgTask(taskId: string): { taskId: string; error?: string } {
  const maxConcurrent = getMaxConcurrent();
  if (getRunningBgCount() >= maxConcurrent) {
    return { taskId: '', error: `并发任务已达上限 (${maxConcurrent})，请等待现有任务完成` };
  }

  const dbTask = getBgTask(taskId);
  if (!dbTask) {
    return { taskId: '', error: '任务记录不存在' };
  }

  const config = dbTask.config ? JSON.parse(dbTask.config) : {};
  const task: Task = {
    id: taskId,
    type: dbTask.type as Task['type'],
    status: 'starting',
    startedAt: new Date().toISOString(),
    logs: [],
    subscribers: new Set(),
  };
  tasks.set(taskId, task);

  // 更新 DB：重置状态
  updateBgTask(taskId, {
    status: 'starting',
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
    result: null,
    progress: null,
  });

  // 根据类型发送不同 payload
  if (dbTask.type === 'expand-events') {
    startProcess(taskId, task, {
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
    startProcess(taskId, task, {
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

// 重启恢复：将 DB 中活跃但不在内存中的后台任务标记为 interrupted（可继续）
export async function recoverBgTasks() {
  try {
    const active = await getActiveBgTasksFromDb();
    // 跳过最近 2 分钟内更新的任务（可能是刚恢复或 HMR 导致的误判）
    const RECENT_THRESHOLD = 2 * 60 * 1000;
    for (const task of active) {
      if (tasks.has(task.id)) continue;
      // 跳过近期更新的任务，避免 HMR/模块重载误伤
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
