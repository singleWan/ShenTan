import { fork, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import type { ExpandTaskOptions, ReactionTaskOptions, Task, TaskSSEData } from './types.js';
import { createBgTask, updateBgTask } from '../task-manager/store';

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
