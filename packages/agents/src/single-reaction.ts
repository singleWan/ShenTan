import type { LanguageModel } from 'ai';
import type { Database, CharacterAlias } from '@shentan/core';
import { SINGLE_REACTION_SYSTEM_PROMPT } from './prompts/single-reaction.js';
import { runAgentLoop, type AgentRunResult } from './agent-runner.js';
import { formatAliasesForPrompt } from './alias-resolver.js';
import { getDateContext } from './date-context.js';

export interface EventContext {
  id: number;
  title: string;
  description?: string | null;
  dateText?: string | null;
  category?: string | null;
  importance?: number | null;
}

export async function runSingleReactionCollector(
  model: LanguageModel,
  db: Database,
  eventContext: EventContext,
  characterName: string,
  maxIterations: number,
  maxOutputTokens: number,
  onLog?: (msg: string) => void,
  aliases?: CharacterAlias[],
  signal?: AbortSignal,
): Promise<AgentRunResult> {
  const log = (msg: string) => onLog?.(msg);
  log(
    `[SingleReaction] 开始收集事件 "${eventContext.title}" (ID: ${eventContext.id}) 的各方反应...`,
  );

  const aliasSection =
    aliases && aliases.length > 0
      ? `\n## 角色搜索别名\n\n角色 "${characterName}" 在不同平台/语言下的搜索关键字：\n${formatAliasesForPrompt(aliases)}\n\n搜索反应时请使用以上所有别名。\n`
      : '';

  // 构建事件详情
  const eventDetailLines = [
    `**事件标题**: ${eventContext.title}`,
    `**事件ID**: ${eventContext.id}`,
  ];
  if (eventContext.dateText) eventDetailLines.push(`**日期**: ${eventContext.dateText}`);
  if (eventContext.category) eventDetailLines.push(`**分类**: ${eventContext.category}`);
  if (eventContext.importance) eventDetailLines.push(`**重要度**: ${eventContext.importance}/5`);
  if (eventContext.description) eventDetailLines.push(`**描述**: ${eventContext.description}`);
  const eventDetailSection = eventDetailLines.join('\n');

  const userPrompt = `请为以下事件收集各方反应。

## 目标事件
${eventDetailSection}

## 角色
"${characterName}"
${getDateContext()}
${aliasSection}

步骤：
1. 仔细阅读事件详情，提取 2-3 个核心关键词
2. 用 get_reactions 检查该事件是否已有反应记录（避免重复）
3. 围绕核心关键词搜索针对该事件的反应
4. 严格筛选：只保存明确针对该事件本身的反应，排除泛泛评价
5. 识别反应方并分类（person/organization/country/media/group）
6. 评估每条反应的态度倾向
7. 将反应保存到数据库

注意：你收集的每条反应都必须能明确关联到上述事件的具体内容。`;

  return runAgentLoop({
    model,
    db,
    systemPrompt: SINGLE_REACTION_SYSTEM_PROMPT,
    userPrompt,
    maxIterations,
    maxOutputTokens,
    agentName: 'SingleReactionCollector',
    onLog,
    signal,
  });
}
