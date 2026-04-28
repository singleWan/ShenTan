import type { CharacterAlias } from '@shentan/core';
import { formatAliasesForPrompt } from '../alias-resolver.js';

/**
 * 生成别名搜索提示段，注入到 Agent 用户提示词中
 * 仅当 aliases 有值时生成内容，否则返回空字符串
 */
export function buildAliasSection(
  characterName: string,
  aliases: CharacterAlias[] | undefined,
  contextHint = '搜索时请使用以上所有别名分别搜索，不同别名可能找到不同维度的信息。',
): string {
  if (!aliases || aliases.length === 0) return '';
  return `\n## 角色搜索别名\n\n角色 "${characterName}" 在不同平台/语言下的搜索关键字：\n${formatAliasesForPrompt(aliases)}\n\n${contextHint}\n`;
}
