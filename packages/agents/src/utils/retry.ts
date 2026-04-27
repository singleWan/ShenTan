export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 2000,
  maxDelay: 30000,
};

export interface ThrottleConfig {
  minInterval: number;
}

export const DEFAULT_THROTTLE_CONFIG: ThrottleConfig = {
  minInterval: 1000,
};

// 403 访问受限（OpenAI-compatible 代理可能用此表示临时限速）、429 限速、服务端错误、过载
const RETRYABLE_STATUS_CODES = new Set([403, 429, 500, 502, 503, 504]);
const RETRYABLE_KEYWORDS = ['rate limit', 'rate_limit', 'too many requests', 'timeout', 'overloaded', 'capacity', 'throttl'];

/** 判断错误是否可重试 */
export function isRetryableError(error: unknown): boolean {
  const err = error as Record<string, unknown>;
  if (!err) return false;

  // Vercel AI SDK 的 APICallError 含 statusCode
  if (typeof err.statusCode === 'number' && RETRYABLE_STATUS_CODES.has(err.statusCode)) {
    return true;
  }

  // 兼容：检查 status 属性
  if (typeof err.status === 'number' && RETRYABLE_STATUS_CODES.has(err.status)) {
    return true;
  }

  // 兜底：检查错误消息关键词
  const msg = String(err.message ?? '').toLowerCase();
  if (RETRYABLE_KEYWORDS.some(kw => msg.includes(kw))) {
    return true;
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 指数退避 + 随机抖动计算延迟 */
function calculateDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const exponential = baseDelay * Math.pow(2, attempt);
  const jitter = exponential * 0.2 * Math.random(); // 0~20% 抖动
  return Math.min(exponential + jitter, maxDelay);
}

/** 带指数退避的重试包装器 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  onRetry?: (attempt: number, error: Error, delay: number) => void,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt >= config.maxRetries || !isRetryableError(error)) {
        throw error;
      }

      const delay = calculateDelay(attempt, config.baseDelay, config.maxDelay);
      onRetry?.(attempt + 1, lastError, delay);
      await sleep(delay);
    }
  }

  throw lastError;
}

/** 请求节流器 — 确保两次调用之间至少间隔 minInterval */
export class RequestThrottle {
  private lastCallTime = 0;
  private readonly minInterval: number;

  constructor(minInterval: number) {
    this.minInterval = minInterval;
  }

  async wait(): Promise<void> {
    if (this.minInterval <= 0) return;

    const now = Date.now();
    const elapsed = now - this.lastCallTime;
    if (elapsed < this.minInterval) {
      await sleep(this.minInterval - elapsed);
    }
    this.lastCallTime = Date.now();
  }
}
