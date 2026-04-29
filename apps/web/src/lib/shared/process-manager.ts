import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { MONOREPO_ROOT, getDbPath, getMaxConcurrent } from './utils.js';

/** ProcessManager 管理的任务必须实现此接口 */
export interface ManagedTask {
  id: string;
  status: string;
  logs: Array<{ timestamp: string; message: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscribers: Set<(data: any) => void>;
  error?: string;
}

/** 通用 IPC 消息类型 */
interface IpcMessage {
  type: string;
  payload?: unknown;
}

/**
 * 通用子进程管理器，消除 collect/runner.ts 和 task/runner.ts 的重复代码。
 * 子类/调用方只需提供：创建任务、IPC 处理、DB 更新的具体逻辑。
 */
export class ProcessManager<TTask extends ManagedTask> {
  readonly tasks = new Map<string, TTask>();
  private processes = new Map<string, ChildProcess>();

  private handlers: {
    onLog: (taskId: string, task: TTask, data: { message: string; timestamp: string }) => void;
    onStatus: (taskId: string, task: TTask, status: string) => void;
    onComplete: (taskId: string, task: TTask, result: unknown) => void;
    onError: (taskId: string, task: TTask, message: string) => void;
    onProgress?: (taskId: string, task: TTask, progress: unknown) => void;
  };

  constructor(handlers: {
    onLog: (taskId: string, task: TTask, data: { message: string; timestamp: string }) => void;
    onStatus: (taskId: string, task: TTask, status: string) => void;
    onComplete: (taskId: string, task: TTask, result: unknown) => void;
    onError: (taskId: string, task: TTask, message: string) => void;
    onProgress?: (taskId: string, task: TTask, progress: unknown) => void;
  }) {
    this.handlers = handlers;
  }

  /** 通知所有订阅者 */
  notifySubscribers(taskId: string, data: unknown): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.subscribers.forEach((cb) => {
      try {
        cb(data);
      } catch {
        /* subscriber disconnected */
      }
    });
  }

  /** fork 子进程并设置 IPC 处理 */
  forkProcess(taskId: string, task: TTask, scriptPath: string): ChildProcess {
    const absolutePath = resolve(MONOREPO_ROOT, scriptPath);
    const proc = fork(absolutePath, [], {
      execArgv: ['--import', 'tsx'],
      env: { ...process.env },
      cwd: MONOREPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });
    this.processes.set(taskId, proc);
    this.setupIpc(taskId, task, proc);
    return proc;
  }

  /** 向子进程发送 IPC 消息 */
  sendMessage(taskId: string, message: IpcMessage): boolean {
    const proc = this.processes.get(taskId);
    if (!proc) return false;
    proc.send(message);
    return true;
  }

  /** 订阅任务更新 */
  subscribe(taskId: string, callback: (data: unknown) => void): () => void {
    const task = this.tasks.get(taskId);
    if (!task) return () => {};
    task.subscribers.add(callback);
    return () => task.subscribers.delete(callback);
  }

  /** 取消任务 */
  cancelTask(taskId: string): boolean {
    const proc = this.processes.get(taskId);
    const task = this.tasks.get(taskId);
    if (!proc && !task) return false;

    if (proc) {
      proc.send({ type: 'cancel' });
      setTimeout(() => proc.kill('SIGTERM'), 3000);
    }

    if (task && (task.status === 'running' || task.status === 'starting')) {
      task.status = 'cancelled';
      this.notifySubscribers(taskId, { type: 'cancelled' });
    }

    return true;
  }

  /** 获取正在运行的任务数 */
  getRunningCount(): number {
    let count = 0;
    for (const task of this.tasks.values()) {
      if (task.status === 'starting' || task.status === 'running') count++;
    }
    return count;
  }

  /** 检查并发限制 */
  checkConcurrency(): string | null {
    const max = getMaxConcurrent();
    if (this.getRunningCount() >= max) {
      return `并发任务已达上限 (${max})，请等待现有任务完成`;
    }
    return null;
  }

  /** 设置 IPC 消息处理 */
  private setupIpc(taskId: string, task: TTask, proc: ChildProcess): void {
    proc.on('message', (msg: IpcMessage) => {
      switch (msg.type) {
        case 'log': {
          const p = msg.payload as { message: string; timestamp: string };
          task.logs.push({ timestamp: p.timestamp, message: p.message });
          this.handlers.onLog(taskId, task, p);
          break;
        }
        case 'status': {
          const p = msg.payload as { status: string };
          task.status = p.status;
          this.handlers.onStatus(taskId, task, p.status);
          break;
        }
        case 'progress': {
          if (this.handlers.onProgress) {
            this.handlers.onProgress(taskId, task, msg.payload);
          }
          break;
        }
        case 'complete': {
          task.status = 'completed';
          this.handlers.onComplete(taskId, task, msg.payload);
          break;
        }
        case 'error': {
          const p = msg.payload as { message: string };
          task.status = 'failed';
          task.error = p.message;
          this.handlers.onError(taskId, task, p.message);
          break;
        }
      }
    });

    proc.on('exit', (code) => {
      if (task.status === 'running' || task.status === 'starting') {
        const errorMsg = code === null ? '进程异常终止' : `进程退出码: ${code}`;
        task.status = 'failed';
        task.error = errorMsg;
        this.handlers.onError(taskId, task, errorMsg);
      }
      this.processes.delete(taskId);
    });
  }
}
