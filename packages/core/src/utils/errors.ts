/**
 * 结构化错误类型体系。
 * 所有神探系统的自定义错误继承自 ShentanError，
 * 提供统一的错误码、上下文和序列化能力。
 */

export type ErrorCode =
  | 'CONFIG_ERROR'
  | 'DATABASE_ERROR'
  | 'SEARCH_ERROR'
  | 'SCRAPE_ERROR'
  | 'BROWSER_ERROR'
  | 'AGENT_ERROR'
  | 'TOOL_ERROR'
  | 'PROVIDER_ERROR'
  | 'VALIDATION_ERROR'
  | 'TIMEOUT_ERROR'
  | 'ABORTED_ERROR';

export class ShentanError extends Error {
  readonly code: ErrorCode;
  readonly context?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { cause?: Error; context?: Record<string, unknown> },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'ShentanError';
    this.code = code;
    this.context = options?.context;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
    };
  }

  /** 判断是否为可重试的错误 */
  get isRetryable(): boolean {
    return [
      'PROVIDER_ERROR',
      'TIMEOUT_ERROR',
      'SEARCH_ERROR',
      'SCRAPE_ERROR',
      'BROWSER_ERROR',
    ].includes(this.code);
  }
}

export class ConfigError extends ShentanError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super('CONFIG_ERROR', message, options);
    this.name = 'ConfigError';
  }
}

export class DatabaseError extends ShentanError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super('DATABASE_ERROR', message, options);
    this.name = 'DatabaseError';
  }
}

export class SearchError extends ShentanError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super('SEARCH_ERROR', message, options);
    this.name = 'SearchError';
  }
}

export class ScrapeError extends ShentanError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super('SCRAPE_ERROR', message, options);
    this.name = 'ScrapeError';
  }
}

export class BrowserError extends ShentanError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super('BROWSER_ERROR', message, options);
    this.name = 'BrowserError';
  }
}

export class AgentError extends ShentanError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super('AGENT_ERROR', message, options);
    this.name = 'AgentError';
  }
}

export class ToolError extends ShentanError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super('TOOL_ERROR', message, options);
    this.name = 'ToolError';
  }
}

export class ProviderError extends ShentanError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super('PROVIDER_ERROR', message, options);
    this.name = 'ProviderError';
  }
}

export class ValidationError extends ShentanError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super('VALIDATION_ERROR', message, options);
    this.name = 'ValidationError';
  }
}

export class TimeoutError extends ShentanError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super('TIMEOUT_ERROR', message, options);
    this.name = 'TimeoutError';
  }
}

export class AbortedError extends ShentanError {
  constructor(
    message: string = '任务已取消',
    options?: { cause?: Error; context?: Record<string, unknown> },
  ) {
    super('ABORTED_ERROR', message, options);
    this.name = 'AbortedError';
  }
}

/** 判断是否为 ShentanError 实例 */
export function isShentanError(error: unknown): error is ShentanError {
  return error instanceof ShentanError;
}

/** 将任意错误转换为 ShentanError */
export function toShentanError(
  error: unknown,
  defaultCode: ErrorCode = 'AGENT_ERROR',
): ShentanError {
  if (error instanceof ShentanError) return error;
  if (error instanceof Error) return new ShentanError(defaultCode, error.message, { cause: error });
  return new ShentanError(defaultCode, String(error));
}
