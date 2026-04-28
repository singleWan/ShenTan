import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
}

export type LogOutput = 'console' | 'file' | 'callback';

export interface StructuredLoggerOptions {
  /** 最低日志级别，默认 info */
  minLevel?: LogLevel;
  /** 输出目标，默认 console */
  output?: LogOutput;
  /** file 输出时的日志文件路径 */
  filePath?: string;
  /** callback 输出时的回调函数 */
  callback?: (entry: LogEntry) => void;
  /** 默认分类 */
  category?: string;
}

/**
 * 结构化日志器。
 * 支持 console / file / callback 三种输出目标，可按级别和分类过滤。
 */
export class StructuredLogger {
  private minLevel: LogLevel;
  private output: LogOutput;
  private filePath?: string;
  private callback?: (entry: LogEntry) => void;
  private category: string;

  constructor(options: StructuredLoggerOptions = {}) {
    this.minLevel = options.minLevel ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
    this.output = options.output ?? 'console';
    this.filePath = options.filePath;
    this.callback = options.callback;
    this.category = options.category ?? 'app';
  }

  /** 创建子 logger（自动携带分类前缀） */
  child(category: string): StructuredLogger {
    return new StructuredLogger({
      minLevel: this.minLevel,
      output: this.output,
      filePath: this.filePath,
      callback: this.callback,
      category: this.category ? `${this.category}:${category}` : category,
    });
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.minLevel]) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category: this.category,
      message,
      data,
    };

    this.emit(entry);
  }

  private emit(entry: LogEntry): void {
    switch (this.output) {
      case 'console':
        this.emitConsole(entry);
        break;
      case 'file':
        this.emitFile(entry);
        break;
      case 'callback':
        this.callback?.(entry);
        break;
    }
  }

  private emitConsole(entry: LogEntry): void {
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.category}]`;
    const msg = `${prefix} ${entry.message}`;

    switch (entry.level) {
      case 'debug':
        console.debug(msg, entry.data ?? '');
        break;
      case 'info':
        console.info(msg, entry.data ?? '');
        break;
      case 'warn':
        console.warn(msg, entry.data ?? '');
        break;
      case 'error':
        console.error(msg, entry.data ?? '');
        break;
    }
  }

  private emitFile(entry: LogEntry): void {
    if (!this.filePath) return;
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const line = JSON.stringify(entry) + '\n';
    appendFileSync(this.filePath, line);
  }
}

/** 创建默认 logger 实例 */
export function createLogger(options?: StructuredLoggerOptions): StructuredLogger {
  return new StructuredLogger(options);
}
