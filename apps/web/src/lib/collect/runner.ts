import { fork, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import type { CollectOptions, CollectTask, SSEData } from './types.js';

const tasks = new Map<string, CollectTask>();
const processes = new Map<string, ChildProcess>();

// 从 apps/web 向上查找 monorepo 根目录（包含 pnpm-workspace.yaml 的目录）
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

function notifySubscribers(taskId: string, data: SSEData) {
  const task = tasks.get(taskId);
  if (!task) return;
  task.subscribers.forEach((cb) => {
    try { cb(data); } catch { /* subscriber disconnected */ }
  });
}

export function startCollection(options: CollectOptions): string {
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

  const scriptPath = resolve(MONOREPO_ROOT, 'scripts/agent-runner.ts');
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
        const p = msg.payload as { status: CollectTask['status'] };
        task.status = p.status;
        notifySubscribers(taskId, { type: 'status', status: p.status });
        break;
      }
      case 'complete': {
        const p = msg.payload as CollectTask['result'];
        task.status = 'completed';
        task.result = p;
        notifySubscribers(taskId, { type: 'complete', result: p });
        break;
      }
      case 'error': {
        const p = msg.payload as { message: string };
        task.status = 'failed';
        task.error = p.message;
        notifySubscribers(taskId, { type: 'error', message: p.message });
        break;
      }
    }
  });

  proc.on('exit', (code) => {
    if (task.status === 'running' || task.status === 'starting') {
      task.status = 'failed';
      task.error = code === null ? '进程异常终止' : `进程退出码: ${code}`;
      notifySubscribers(taskId, { type: 'error', message: task.error });
    }
    processes.delete(taskId);
  });

  // 无超时限制：动态轮次收集可能耗时较长，由 Agent 自行控制完成
  proc.on('exit', () => {});

  // 发送启动指令
  proc.send({
    type: 'start',
    payload: {
      characterName: options.characterName,
      characterType: options.characterType,
      source: options.source,
      maxRounds: options.maxRounds,
      aliases: options.aliases,
      dbPath: getDbPath(),
    },
  });

  return taskId;
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
  if (proc) {
    proc.send({ type: 'cancel' });
    setTimeout(() => proc.kill('SIGTERM'), 3000);
    return true;
  }
  return false;
}

export function subscribe(taskId: string, callback: (data: SSEData) => void): () => void {
  const task = tasks.get(taskId);
  if (!task) return () => {};
  task.subscribers.add(callback);
  return () => task.subscribers.delete(callback);
}
