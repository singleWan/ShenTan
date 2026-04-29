import type { LanguageModel } from 'ai';
import type { ProviderOptions } from './config/types.js';
import type { Database, CharacterAlias } from '@shentan/core';
import { STATEMENT_COLLECTOR_SYSTEM_PROMPT } from './prompts/statement-collector.js';
import { runAgentLoop, type AgentRunResult } from './agent-runner.js';
import { getDateContext } from './date-context.js';
import { buildSourceSection } from './source-context.js';
import { buildAliasSection } from './utils/context-builder.js';

export async function runStatementCollector(
  model: LanguageModel,
  db: Database,
  characterId: number,
  characterName: string,
  characterType: string,
  maxIterations: number,
  maxOutputTokens: number,
  onLog?: (msg: string) => void,
  aliases?: CharacterAlias[],
  source?: string[],
  signal?: AbortSignal,
  providerOptions?: ProviderOptions,
): Promise<AgentRunResult> {
  const log = (msg: string) => onLog?.(msg);
  log(`[StatementCollector] 开始收集 "${characterName}" 的发言、政策与声明...`);

  const aliasSection = buildAliasSection(characterName, aliases);
  const sourceSection = buildSourceSection(
    source,
    '请优先从该作品中搜索角色的发言、声明和相关信息。',
  );

  const userPrompt = `请全面收集角色 "${characterName}" (ID: ${characterId}) 的公开发言、政策决策、公开声明以及坊间流传的重要信息。
角色类型: ${characterType === 'fictional' ? '虚构角色（无真实社交账号，不要搜索社交媒体）' : '历史人物（可搜索微博、X/Twitter、Facebook等社交媒体）'}
${getDateContext()}
${sourceSection}${aliasSection}
步骤：
1. 先用 get_events 获取已有事件作为上下文
2. 搜索角色的重要发言、演讲、著名言论
3. 搜索角色的政策决策、行政命令、法规发布
4. 搜索角色的公开声明、新闻发布会内容
5. 搜索社交媒体上的发言（使用 categories 参数）
6. 搜索坊间传闻和未证实但广为流传的消息
7. 用 save_events 保存所有发现（category 使用 speech/policy/statement/rumor）

请开始工作。`;

  return runAgentLoop({
    model,
    db,
    systemPrompt: STATEMENT_COLLECTOR_SYSTEM_PROMPT,
    userPrompt,
    maxIterations,
    maxOutputTokens,
    agentName: 'StatementCollector',
    providerOptions,
    onLog,
    signal,
  });
}
