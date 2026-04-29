import type { LanguageModel } from 'ai';
import type { ProviderOptions } from './config/types.js';
import type { Database, CharacterAlias } from '@shentan/core';
import { EVENT_EXPLORER_SYSTEM_PROMPT } from './prompts/event-explorer.js';
import { runAgentLoop, type AgentRunResult } from './agent-runner.js';
import { getDateContext } from './date-context.js';
import { buildSourceSection } from './source-context.js';
import { buildAliasSection } from './utils/context-builder.js';

export interface PreviousRoundSummary {
  roundNumber: number;
  newEventsCount: number;
  searchDirections: string[];
  gapsIdentified: string[];
}

export async function runEventExplorer(
  model: LanguageModel,
  db: Database,
  characterId: number,
  characterName: string,
  characterType: string,
  round: number,
  maxIterations: number,
  maxOutputTokens: number,
  onLog?: (msg: string) => void,
  aliases?: CharacterAlias[],
  source?: string[],
  signal?: AbortSignal,
  providerOptions?: ProviderOptions,
  previousSummaries?: PreviousRoundSummary[],
): Promise<AgentRunResult> {
  const log = (msg: string) => onLog?.(msg);
  log(`[EventExplorer] 第 ${round} 轮事件拓展 "${characterName}"...`);

  const aliasSection = buildAliasSection(characterName, aliases);
  const sourceSection = buildSourceSection(source, '请优先从该作品中搜索和拓展事件。');

  let contextSection = '';
  if (previousSummaries && previousSummaries.length > 0) {
    const summaryLines = previousSummaries.map((s) => {
      const parts = [`第 ${s.roundNumber} 轮: 新增 ${s.newEventsCount} 个事件`];
      if (s.searchDirections.length > 0) parts.push(`已探索方向: ${s.searchDirections.join('、')}`);
      if (s.gapsIdentified.length > 0) parts.push(`发现空白: ${s.gapsIdentified.join('、')}`);
      return parts.join('；');
    });
    contextSection = `\n前轮探索总结：\n${summaryLines.join('\n')}\n请避免重复搜索上述已探索方向，聚焦于发现的空白领域和新视角。\n`;
  }

  const userPrompt = `请对角色 "${characterName}" (ID: ${characterId}) 的事件进行第 ${round} 轮拓展。
角色类型: ${characterType === 'fictional' ? '虚构角色（不要使用 social 搜索模式）' : '历史人物（可使用 social 模式搜索社交媒体）'}
${getDateContext(characterType)}
${sourceSection}${aliasSection}${contextSection}
步骤：
1. 用 get_events 获取已有事件列表
2. 分析哪些重要事件需要深入挖掘
3. 搜索这些事件的详细信息和相关背景
4. 发现事件之间的新事件
5. 将新发现的事件保存到数据库

注意：不要重复保存已有事件。`;

  return runAgentLoop({
    model,
    db,
    systemPrompt: EVENT_EXPLORER_SYSTEM_PROMPT,
    userPrompt,
    maxIterations,
    maxOutputTokens,
    agentName: 'EventExplorer',
    providerOptions,
    onLog,
    signal,
  });
}
