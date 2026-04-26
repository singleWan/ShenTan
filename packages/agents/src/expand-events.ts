import type { LanguageModel } from 'ai';
import type { Database, CharacterAlias } from '@shentan/core';
import { EXPAND_EVENTS_SYSTEM_PROMPT } from './prompts/expand-events.js';
import { runAgentLoop, type AgentRunResult } from './agent-runner.js';
import { formatAliasesForPrompt } from './alias-resolver.js';
import { getDateContext } from './date-context.js';

export interface ExpandRangeContext {
  mode: 'range';
  afterEvent: { id: number; title: string; dateText?: string | null; dateSortable?: string | null; description?: string | null };
  beforeEvent: { id: number; title: string; dateText?: string | null; dateSortable?: string | null; description?: string | null };
}

export interface ExpandAroundContext {
  mode: 'around';
  centerEvent: { id: number; title: string; dateText?: string | null; dateSortable?: string | null; description?: string | null; category?: string | null; importance?: number | null };
}

export type ExpandContext = ExpandRangeContext | ExpandAroundContext;

export async function runExpandEvents(
  model: LanguageModel,
  db: Database,
  characterId: number,
  characterName: string,
  context: ExpandContext,
  maxIterations: number,
  maxOutputTokens: number,
  onLog?: (msg: string) => void,
  aliases?: CharacterAlias[],
): Promise<AgentRunResult> {
  const log = (msg: string) => onLog?.(msg);
  log(`[ExpandEvents] 开始拓展 "${characterName}" 的事件...`);

  const aliasSection = aliases && aliases.length > 0
    ? `\n## 角色搜索别名\n\n角色 "${characterName}" 在不同平台/语言下的搜索关键字：\n${formatAliasesForPrompt(aliases)}\n\n搜索时请使用以上所有别名分别搜索。\n`
    : '';

  let contextSection: string;
  if (context.mode === 'range') {
    const after = context.afterEvent;
    const before = context.beforeEvent;
    contextSection = `## 拓展模式：时间段拓展

在以下两个相邻事件之间搜索**直接关联**的缺失事件。

**前一个事件**（ID: ${after.id}）：
- 标题: ${after.title}
- 日期: ${after.dateText ?? '未知'}
${after.dateSortable ? `- 排序日期: ${after.dateSortable}` : ''}
${after.description ? `- 描述: ${after.description}` : ''}

**后一个事件**（ID: ${before.id}）：
- 标题: ${before.title}
- 日期: ${before.dateText ?? '未知'}
${before.dateSortable ? `- 排序日期: ${before.dateSortable}` : ''}
${before.description ? `- 描述: ${before.description}` : ''}

要求：只保存在这两个事件的因果链中起到直接连接作用的事件。`;
  } else {
    const center = context.centerEvent;
    contextSection = `## 拓展模式：围绕事件拓展

围绕以下事件搜索**直接关联**的前因后果和子事件。

**中心事件**（ID: ${center.id}）：
- 标题: ${center.title}
- 日期: ${center.dateText ?? '未知'}
${center.dateSortable ? `- 排序日期: ${center.dateSortable}` : ''}
${center.category ? `- 分类: ${center.category}` : ''}
${center.importance ? `- 重要度: ${center.importance}/5` : ''}
${center.description ? `- 描述: ${center.description}` : ''}

要求：只保存与该事件存在直接因果、包含、或连续关系的事件。`;
  }

  const userPrompt = `请对角色 "${characterName}" (ID: ${characterId}) 进行事件拓展。
${getDateContext()}

${contextSection}
${aliasSection}
步骤：
1. 用 get_events 获取已有事件列表
2. 从目标事件中提取核心关键词
3. 围绕核心关键词搜索直接关联的事件
4. 对每个候选事件进行关联性检查
5. 只保存通过关联性检查的事件

关联性标准：新事件必须与目标事件共享关键主体，且在因果链上直接相邻。
不要保存仅仅时间相近但主题无关的事件。
不要重复保存已有事件。`;

  return runAgentLoop({
    model,
    db,
    systemPrompt: EXPAND_EVENTS_SYSTEM_PROMPT,
    userPrompt,
    maxIterations,
    maxOutputTokens,
    agentName: 'ExpandEvents',
    onLog,
  });
}
