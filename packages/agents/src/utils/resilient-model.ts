import { wrapLanguageModel } from 'ai';
import type { LanguageModel, LanguageModelMiddleware } from 'ai';
import { withRetry, RequestThrottle, DEFAULT_RETRY_CONFIG, DEFAULT_THROTTLE_CONFIG } from './retry.js';
import type { RetryConfig, ThrottleConfig } from './retry.js';

export interface ResilientModelOptions {
  retry?: Partial<RetryConfig>;
  throttle?: Partial<ThrottleConfig>;
}

export function createResilientModel(
  baseModel: LanguageModel,
  options: ResilientModelOptions = {},
  onLog?: (msg: string) => void,
): LanguageModel {
  const retryConfig: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...options.retry,
  };
  const throttleConfig: ThrottleConfig = {
    ...DEFAULT_THROTTLE_CONFIG,
    ...options.throttle,
  };

  const throttle = new RequestThrottle(throttleConfig.minInterval);

  const middleware: LanguageModelMiddleware = {
    specificationVersion: 'v3',
    wrapGenerate: async ({ doGenerate }) => {
      await throttle.wait();
      return withRetry(
        async () => doGenerate() as Promise<Awaited<ReturnType<typeof doGenerate>>>,
        retryConfig,
        (attempt, error, delay) => {
          const statusCode = (error as unknown as Record<string, unknown>)?.statusCode;
          const reason = statusCode === 429 ? '请求限速' : '服务端错误';
          onLog?.(`[API] ${reason}，第 ${attempt}/${retryConfig.maxRetries} 次重试（等待 ${Math.round(delay)}ms）: ${error.message}`);
        },
      );
    },
    wrapStream: async ({ doStream }) => {
      await throttle.wait();
      return withRetry(
        async () => doStream() as Promise<Awaited<ReturnType<typeof doStream>>>,
        retryConfig,
        (attempt, error, delay) => {
          onLog?.(`[API] 流式请求失败，第 ${attempt}/${retryConfig.maxRetries} 次重试（等待 ${Math.round(delay)}ms）: ${error.message}`);
        },
      );
    },
  };

  // createModel() 返回的是 LanguageModelV3 实例，符合 wrapLanguageModel 要求
  return wrapLanguageModel({ model: baseModel as Parameters<typeof wrapLanguageModel>[0]['model'], middleware });
}
