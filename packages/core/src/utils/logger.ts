import { mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

export interface LogWriter {
  write: (message: string) => void;
  logPath: string;
}

export function createLogWriter(logDir: string, taskId: string): LogWriter {
  const dir = resolve(logDir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const logPath = resolve(dir, `${taskId}.log`);

  const write = (message: string) => {
    const ts = new Date().toISOString();
    appendFileSync(logPath, `[${ts}] ${message}\n`, 'utf-8');
  };

  return { write, logPath };
}
