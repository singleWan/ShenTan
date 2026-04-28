import type { LanguageModel } from 'ai';
import type { Database, CharacterAlias } from '@shentan/core';
import { REACTION_COLLECTOR_SYSTEM_PROMPT } from './prompts/reaction-collector.js';
import { runAgentLoop, type AgentRunResult } from './agent-runner.js';
import { formatAliasesForPrompt } from './alias-resolver.js';
import { getDateContext } from './date-context.js';
import { buildSourceSection } from './source-context.js';

export interface EventInfo {
  id: number;
  title: string;
  description?: string | null;
  dateText?: string | null;
  category?: string | null;
  importance?: number | null;
  content?: string | null;
}

export interface PerEventOptions {
  model: LanguageModel;
  db: Database;
  characterId: number;
  characterName: string;
  characterType: string;
  event: EventInfo;
  maxIterations: number;
  maxOutputTokens: number;
  onLog?: (msg: string) => void;
  aliases?: CharacterAlias[];
  source?: string[];
}

export async function runReactionCollectorForEvent(opts: PerEventOptions): Promise<AgentRunResult> {
  const { model, db, characterId, characterName, characterType, event, maxIterations, maxOutputTokens, onLog, aliases, source } = opts;
  const log = (msg: string) => onLog?.(msg);
  log(`[ReactionCollector] 收集事件反应: "${event.title}" (ID: ${event.id}, 重要度: ${event.importance ?? '?'})`);

  const aliasSection = aliases && aliases.length > 0
    ? `\n## 角色搜索别名\n\n角色 "${characterName}" 在不同平台/语言下的搜索关键字：\n${formatAliasesForPrompt(aliases)}\n\n搜索反应时请使用以上别名扩展搜索范围。\n`
    : '';

  const sourceWorks = source && source.length > 0 ? source.map(s => `「${s}」`).join('、') : '';
  const sourceSection = buildSourceSection(source,
    sourceWorks ? `请优先搜索与${sourceWorks}相关的读者/观众反应。` : '');

  const eventDetail = [
    `事件ID: ${event.id}`,
    `标题: ${event.title}`,
    event.dateText ? `日期: ${event.dateText}` : null,
    event.category ? `分类: ${event.category}` : null,
    event.importance != null ? `重要度: ${event.importance}` : null,
    event.description ? `描述: ${event.description}` : null,
    event.content ? `详细内容: ${event.content.substring(0, 2000)}` : null,
  ].filter(Boolean).join('\n');

  const userPrompt = `请全面收集以下事件的各方反应。

角色: "${characterName}" (ID: ${characterId})
角色类型: ${characterType === 'fictional' ? '虚构角色（不要使用 social 搜索模式）' : '历史人物（可使用 social 模式搜索社交媒体）'}
${getDateContext()}
${sourceSection}${aliasSection}
事件信息：
${eventDetail}

步骤：
1. 先用 get_reactions 查看该事件已有反应，避免重复
2. 从事件信息中提取 2-4 个核心关键词
3. 按 5 种反应方类型（个人/组织/国家/媒体/群体）逐一搜索
4. 每收集到一批反应立即用 save_reactions 保存
5. 确保每种反应方类型至少搜索一次

请开始工作。`;

  return runAgentLoop({
    model,
    db,
    systemPrompt: REACTION_COLLECTOR_SYSTEM_PROMPT,
    userPrompt,
    maxIterations,
    maxOutputTokens,
    agentName: 'ReactionCollector',
    onLog,
  });
}
