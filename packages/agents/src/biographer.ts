import type { LanguageModel } from 'ai';
import type { ProviderOptions } from './config/types.js';
import type { Database, CharacterAlias } from '@shentan/core';
import { BIOGRAPHER_SYSTEM_PROMPT } from './prompts/biographer.js';
import { runAgentLoop, type AgentRunResult } from './agent-runner.js';
import { getDateContext } from './date-context.js';
import { buildSourceSection } from './source-context.js';
import { buildAliasSection } from './utils/context-builder.js';

export type { AgentRunResult };

export async function runBiographer(
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
  log(`[Biographer] 开始收集 "${characterName}" 的生平事迹...`);

  const aliasSection = buildAliasSection(characterName, aliases);
  const sourceSection = buildSourceSection(
    source,
    '请优先从该作品中搜索和提取角色的生平事件与相关信息。',
  );

  const userPrompt = `请收集角色 "${characterName}" 的生平事迹。
角色类型: ${characterType === 'fictional' ? '小说/虚构角色' : '历史人物'}
${getDateContext()}
${sourceSection}${aliasSection}
请按以下步骤执行：
1. 先搜索基本生平信息
2. 爬取权威来源获取详细内容
3. 提取关键人生事件
4. 将事件保存到数据库（characterId: ${characterId}）
5. 完成后更新角色描述

请开始搜索。`;

  return runAgentLoop({
    model,
    db,
    systemPrompt: BIOGRAPHER_SYSTEM_PROMPT,
    userPrompt,
    maxIterations,
    maxOutputTokens,
    agentName: 'Biographer',
    providerOptions,
    onLog,
    signal,
  });
}
