export type ProviderType = 'anthropic' | 'openai' | 'openai-compatible';

/** JSON 兼容的递归类型，与 AI SDK 的 ProviderOptions 对齐 */
type JSONValue = string | number | boolean | null | JSONValue[] | JSONObject;
type JSONObject = { [key: string]: JSONValue | undefined };

/** AI SDK providerOptions 类型，等价于 @ai-sdk/provider 的 SharedV3ProviderOptions */
export type ProviderOptions = Record<string, JSONObject>;

export interface ProviderConfig {
  type: ProviderType;
  model: string;
  apiKey?: string;
  baseURL?: string;
  maxTokens?: number;
  providerOptions?: ProviderOptions;
}

export interface AgentConfig {
  provider?: string;
  maxIterations?: number;
  maxTokens?: number;
}

export interface SearXNGConfig {
  baseUrl: string;
  enabled: boolean;
  cacheTTL?: number;
}

export interface QualityConfig {
  maxExploreRounds: number;
  minExploreRounds: number;
  convergenceThreshold: number;
  consecutiveDryRounds: number;
}

export const DEFAULT_QUALITY_CONFIG: QualityConfig = {
  maxExploreRounds: 5,
  minExploreRounds: 2,
  convergenceThreshold: 2,
  consecutiveDryRounds: 2,
};

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

export interface ThrottleConfig {
  minInterval: number;
}

export interface ShentanConfig {
  default: string;
  providers: Record<string, ProviderConfig>;
  maxTokens?: number;
  searxng?: SearXNGConfig;
  quality?: Partial<QualityConfig>;
  agents?: Record<string, AgentConfig>;
  retry?: RetryConfig;
  throttle?: ThrottleConfig;
}
