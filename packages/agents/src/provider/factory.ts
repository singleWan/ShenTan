import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createVertex } from '@ai-sdk/google-vertex';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '../config/types.js';

export function createModel(config: ProviderConfig): LanguageModel {
  switch (config.type) {
    case 'anthropic': {
      const provider = createAnthropic({
        apiKey: config.apiKey,
      });
      return provider(config.model);
    }
    case 'openai': {
      const provider = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      });
      return provider(config.model);
    }
    case 'openai-compatible': {
      if (!config.baseURL) {
        throw new Error('openai-compatible provider 必须配置 baseURL');
      }
      const provider = createOpenAICompatible({
        name: 'custom',
        baseURL: config.baseURL,
        headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : undefined,
      });
      return provider.chatModel(config.model);
    }
    case 'google': {
      const provider = createGoogleGenerativeAI({
        apiKey: config.apiKey,
      });
      return provider(config.model);
    }
    case 'google-vertex': {
      if (!config.project || !config.location) {
        throw new Error('google-vertex provider 必须配置 project 和 location');
      }
      const provider = createVertex({
        project: config.project,
        location: config.location,
        ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      });
      return provider(config.model);
    }
    default:
      throw new Error(`不支持的 provider 类型: ${config.type satisfies never}`);
  }
}
