import { fork, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import type { CollectOptions, CollectTask, SSEData, ProgressData } from './types';
import { createTaskInDb, updateTaskInDb, getActiveTasksFromDb, getTaskFromDb } from './task-store';

const tasks = new Map<string, CollectTask>();
const processes = new Map<string, ChildProcess>();

// 从 apps/web 向上查找 monorepo 根目录
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

function getLogDir(): string {
  return resolve(MONOREPO_ROOT, 'data', 'logs');
}

function getMaxConcurrent(): number {
  return parseInt(process.env.MAX_CONCURRENT_TASKS ?? '3', 10);
}

function notifySubscribers(taskId: string, data: SSEData) {
  const task = tasks.get(taskId);
  if (!task) return;
  task.subscribers.forEach((cb) => {
    try { cb(data); } catch { /* subscriber disconnected */ }
  });
}

function getRunningCount(): number {
  let count = 0;
  for (const task of tasks.values()) {
    if (task.status === 'starting' || task.status === 'running') count++;
  }
  return count;
}

// 共享的 IPC 消息处理
function setupIpcHandlers(taskId: string, task: CollectTask, proc: ChildProcess) {
  proc.on('message', (msg: { type: string; payload?: unknown }) => {
    switch (msg.type) {
      case 'log': {
        const p = msg.payload as { message: string; timestamp: string };
        task.logs.push({ timestamp: p.timestamp, message: p.message });
        notifySubscribers(taskId, { type: 'log', ...p });
        break;
      }
      case 'status': {
        const p = msg.payload as { status: CollectTask['status'] };
        task.status = p.status;
        notifySubscribers(taskId, { type: 'status', status: p.status });
        updateTaskInDb(taskId, {
          status: p.status === 'running' ? 'running' : p.status,
          startedAt: new Date().toISOString(),
        }).catch(() => {});
        break;
      }
      case 'progress': {
        const p = msg.payload as ProgressData;
        task.progress = p;
        notifySubscribers(taskId, { type: 'progress', progress: p });
        updateTaskInDb(taskId, {
          progress: JSON.stringify(p),
        }).catch(() => {});
        break;
      }
      case 'complete': {
        const p = msg.payload as CollectTask['result'];
        task.status = 'completed';
        task.result = p;
        notifySubscribers(taskId, { type: 'complete', result: p });
        updateTaskInDb(taskId, {
          status: 'completed',
          characterId: p?.characterId,
          completedAt: new Date().toISOString(),
          result: JSON.stringify(p),
        }).catch(() => {});
        break;
      }
      case 'error': {
        const p = msg.payload as { message: string };
        task.status = 'failed';
        task.error = p.message;
        notifySubscribers(taskId, { type: 'error', message: p.message });
        updateTaskInDb(taskId, {
          status: 'failed',
          completedAt: new Date().toISOString(),
          error: p.message,
        }).catch(() => {});
        break;
      }
    }
  });

  proc.on('exit', (code) => {
    if (task.status === 'running' || task.status === 'starting') {
      task.status = 'failed';
      task.error = code === null ? '进程异常终止' : `进程退出码: ${code}`;
      notifySubscribers(taskId, { type: 'error', message: task.error });
      updateTaskInDb(taskId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        error: task.error,
      }).catch(() => {});
    }
    processes.delete(taskId);
  });
}

function forkAgentRunner(taskId: string, task: CollectTask): ChildProcess {
  const scriptPath = resolve(MONOREPO_ROOT, 'scripts/agent-runner.ts');
  const proc = fork(scriptPath, [], {
    execArgv: ['--import', 'tsx'],
    env: { ...process.env },
    cwd: MONOREPO_ROOT,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  });
  processes.set(taskId, proc);
  setupIpcHandlers(taskId, task, proc);
  return proc;
}

export function startCollection(options: CollectOptions): { taskId: string; error?: string } {
  const maxConcurrent = getMaxConcurrent();
  if (getRunningCount() >= maxConcurrent) {
    return { taskId: '', error: `并发任务已达上限 (${maxConcurrent})，请等待现有任务完成` };
  }

  const taskId = crypto.randomUUID();
  const task: CollectTask = {
    id: taskId,
    characterName: options.characterName,
    status: 'starting',
    startedAt: new Date().toISOString(),
    logs: [],
    subscribers: new Set(),
  };
  tasks.set(taskId, task);

  const proc = forkAgentRunner(taskId, task);

  createTaskInDb({
    id: taskId,
    characterName: options.characterName,
    characterType: options.characterType,
    source: options.source,
    maxRounds: options.maxRounds,
    aliases: options.aliases,
    pid: proc.pid ?? undefined,
  }).catch(() => {});

  proc.send({
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
    },
  });

  return { taskId };
}

export async function resumeCollection(taskId: string): Promise<{ taskId: string; error?: string }> {
  const maxConcurrent = getMaxConcurrent();
  if (getRunningCount() >= maxConcurrent) {
    return { taskId: '', error: `并发任务已达上限 (${maxConcurrent})，请等待现有任务完成` };
  }

  // 从 DB 读取原任务记录
  const dbTask = await getTaskFromDb(taskId);
  if (!dbTask) {
    return { taskId: '', error: '任务记录不存在' };
  }

  // 用相同 ID 创建内存任务
  const task: CollectTask = {
    id: taskId,
    characterName: dbTask.characterName,
    status: 'starting',
    startedAt: new Date().toISOString(),
    logs: [],
    subscribers: new Set(),
  };
  tasks.set(taskId, task);

  // 重新 fork 子进程
  const proc = forkAgentRunner(taskId, task);

  // 更新 DB：重置状态，清空旧数据
  updateTaskInDb(taskId, {
    status: 'starting',
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
    result: null,
    progress: null,
    pid: proc.pid ?? undefined,
  }).catch(() => {});

  // 解析 source 配置
  const source = dbTask.source ? JSON.parse(dbTask.source) : undefined;

  proc.send({
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
  return tasks.get(taskId);
}

export function getAllTasks(): Array<{ id: string; characterName: string; status: string; error?: string }> {
  return Array.from(tasks.values()).map((t) => ({
    id: t.id,
    characterName: t.characterName,
    status: t.status,
    error: t.error,
  }));
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
  }

  updateTaskInDb(taskId, {
    status: 'cancelled',
    completedAt: new Date().toISOString(),
  }).catch(() => {});

  return true;
}

export function subscribe(taskId: string, callback: (data: SSEData) => void): () => void {
  const task = tasks.get(taskId);
  if (!task) return () => {};
  task.subscribers.add(callback);
  return () => task.subscribers.delete(callback);
}

// 重启恢复：将 DB 中活跃但不在内存中的任务标记为 interrupted（可继续）
export async function recoverTasks() {
  try {
    const active = await getActiveTasksFromDb();
    // 跳过最近 2 分钟内更新的任务（可能是刚恢复或 HMR 导致的误判）
    const RECENT_THRESHOLD = 2 * 60 * 1000;
    for (const task of active) {
      // 跳过仍在内存中运行的任务（当前进程启动的）
      if (tasks.has(task.id)) continue;
      // 跳过近期更新的任务，避免 HMR/模块重载误伤
      if (task.updatedAt && Date.now() - new Date(task.updatedAt).getTime() < RECENT_THRESHOLD) continue;

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
