import { createLogger } from '@shentan/core/logger';
import type {
  ShentanConfig,
  ProviderConfig,
  AgentConfig,
  SearXNGConfig,
  QualityConfig,
  RetryConfig,
  ThrottleConfig,
  ProviderOptions,
} from './types.js';

function getEnv(key: string): string | undefined {
  return process.env[key];
}

function getEnvInt(key: string): number | undefined {
  const val = getEnv(key);
  if (!val) return undefined;
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? undefined : n;
}

function getEnvBool(key: string): boolean | undefined {
  const val = getEnv(key);
  if (val === undefined) return undefined;
  return val === 'true' || val === '1';
}

/** 扫描 PROVIDER_*_TYPE 环境变量发现所有 Provider 名称 */
function discoverProviderNames(): string[] {
  const names = new Set<string>();
  for (const key of Object.keys(process.env)) {
    const match = key.match(/^PROVIDER_(.+)_TYPE$/);
    if (match) {
      names.add(match[1].toLowerCase());
    }
  }
  return Array.from(names);
}

/** 获取 Provider 的 API Key，支持两种命名: PROVIDER_<NAME>_API_KEY 和 <NAME>_API_KEY */
function getProviderApiKey(name: string): string | undefined {
  return (
    getEnv(`PROVIDER_${name.toUpperCase()}_API_KEY`) ?? getEnv(`${name.toUpperCase()}_API_KEY`)
  );
}

function buildProviders(): Record<string, ProviderConfig> {
  const providers: Record<string, ProviderConfig> = {};
  const names = discoverProviderNames();

  for (const name of names) {
    const prefix = `PROVIDER_${name.toUpperCase()}_`;
    const type = getEnv(`${prefix}TYPE`);
    const model = getEnv(`${prefix}MODEL`);

    if (!type || !model) continue;

    const providerOptionsRaw = getEnv(`${prefix}PROVIDER_OPTIONS`);
    let providerOptions: ProviderOptions | undefined;
    if (providerOptionsRaw) {
      try {
        providerOptions = JSON.parse(providerOptionsRaw);
      } catch {
        createLogger({ category: 'config' }).warn(
          `无法解析 ${prefix}PROVIDER_OPTIONS: ${providerOptionsRaw}`,
        );
      }
    }

    providers[name] = {
      type: type as ProviderConfig['type'],
      model,
      apiKey: getProviderApiKey(name),
      baseURL: getEnv(`${prefix}BASE_URL`),
      project: getEnv(`${prefix}PROJECT`),
      location: getEnv(`${prefix}LOCATION`),
      maxTokens: getEnvInt(`${prefix}MAX_TOKENS`),
      providerOptions,
    };
  }

  return providers;
}

function buildFallbackProvider(): Record<string, ProviderConfig> {
  return {
    anthropic: {
      type: 'anthropic',
      model: getEnv('CLAUDE_MODEL') || 'claude-sonnet-4-5-20250929',
      apiKey: getEnv('ANTHROPIC_API_KEY'),
    },
  };
}

function buildSearXNGConfig(): SearXNGConfig | undefined {
  const baseUrl = getEnv('SEARXNG_BASE_URL');
  const enabled = getEnvBool('SEARXNG_ENABLED');
  const cacheTTL = getEnvInt('SEARXNG_CACHE_TTL');

  if (!baseUrl && enabled === undefined && cacheTTL === undefined) {
    return undefined;
  }

  return {
    baseUrl: baseUrl ?? 'http://localhost:8080',
    enabled: enabled ?? true,
    cacheTTL: cacheTTL ?? 1800,
  };
}

function buildQualityConfig(): Partial<QualityConfig> | undefined {
  const config: Partial<QualityConfig> = {};
  let hasValue = false;

  const pairs: Array<[keyof QualityConfig, string]> = [
    ['maxExploreRounds', 'QUALITY_MAX_EXPLORE_ROUNDS'],
    ['minExploreRounds', 'QUALITY_MIN_EXPLORE_ROUNDS'],
    ['convergenceThreshold', 'QUALITY_CONVERGENCE_THRESHOLD'],
    ['consecutiveDryRounds', 'QUALITY_CONSECUTIVE_DRY_ROUNDS'],
  ];

  for (const [field, envKey] of pairs) {
    const val = getEnvInt(envKey);
    if (val !== undefined) {
      config[field] = val;
      hasValue = true;
    }
  }

  return hasValue ? config : undefined;
}

function buildAgentConfigs(): Record<string, AgentConfig> | undefined {
  const agentNames = ['biographer', 'event-explorer', 'statement-collector', 'reaction-collector'];
  const configs: Record<string, AgentConfig> = {};
  let hasValue = false;

  for (const name of agentNames) {
    const prefix = `AGENT_${name.toUpperCase().replace(/-/g, '_')}_`;
    const config: AgentConfig = {};

    const provider = getEnv(`${prefix}PROVIDER`);
    const maxIter = getEnvInt(`${prefix}MAX_ITERATIONS`);
    const maxTok = getEnvInt(`${prefix}MAX_TOKENS`);

    if (provider) {
      config.provider = provider;
      hasValue = true;
    }
    if (maxIter !== undefined) {
      config.maxIterations = maxIter;
      hasValue = true;
    }
    if (maxTok !== undefined) {
      config.maxTokens = maxTok;
      hasValue = true;
    }

    if (Object.keys(config).length > 0) {
      configs[name] = config;
    }
  }

  return hasValue ? configs : undefined;
}

function buildRetryConfig(): RetryConfig | undefined {
  const maxRetries = getEnvInt('RETRY_MAX_RETRIES');
  const baseDelay = getEnvInt('RETRY_BASE_DELAY');
  const maxDelay = getEnvInt('RETRY_MAX_DELAY');

  if (maxRetries === undefined && baseDelay === undefined && maxDelay === undefined) {
    return undefined;
  }

  return {
    maxRetries: maxRetries ?? 3,
    baseDelay: baseDelay ?? 2000,
    maxDelay: maxDelay ?? 30000,
  };
}

function buildThrottleConfig(): ThrottleConfig | undefined {
  const minInterval = getEnvInt('API_MIN_INTERVAL');
  if (minInterval === undefined) return undefined;

  return { minInterval };
}

export function resolveConfig(): ShentanConfig {
  let providers = buildProviders();

  // 回退：未发现任何 Provider 时使用默认 Anthropic
  if (Object.keys(providers).length === 0) {
    providers = buildFallbackProvider();
  }

  const config: ShentanConfig = {
    default: getEnv('PROVIDER_DEFAULT') || Object.keys(providers)[0],
    providers,
    maxTokens: getEnvInt('MAX_TOKENS') ?? 8000,
    searxng: buildSearXNGConfig(),
    quality: buildQualityConfig(),
    agents: buildAgentConfigs(),
    retry: buildRetryConfig(),
    throttle: buildThrottleConfig(),
  };

  // 验证默认 Provider 存在
  if (!config.providers[config.default]) {
    throw new Error(
      `默认 provider "${config.default}" 未定义，可用: ${Object.keys(config.providers).join(', ')}`,
    );
  }

  return config;
}

export function getProviderConfig(config: ShentanConfig, providerName?: string): ProviderConfig {
  const name = providerName ?? config.default;
  const provider = config.providers[name];
  if (!provider) {
    throw new Error(`未找到 provider "${name}"，可用: ${Object.keys(config.providers).join(', ')}`);
  }
  return provider;
}

export function getAgentModelConfig(
  config: ShentanConfig,
  agentName: string,
): { providerName: string; maxIterations: number; maxTokens: number } {
  const agentCfg = config.agents?.[agentName];
  const providerName = agentCfg?.provider ?? config.default;
  const maxIterations = agentCfg?.maxIterations ?? 25;
  const maxTokens = agentCfg?.maxTokens ?? config.maxTokens ?? 8000;
  return { providerName, maxIterations, maxTokens };
}
