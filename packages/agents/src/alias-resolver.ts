import { generateObject } from 'ai';
import { z } from 'zod';
import type { LanguageModel } from 'ai';
import type { CharacterAlias } from '@shentan/core';
import { withRetry, DEFAULT_RETRY_CONFIG, isRetryableError } from './utils/retry.js';

const ALIAS_RESOLVER_PROMPT = `你是一个角色名称别名解析专家。你的任务是分析给定的角色名称，生成该角色在不同语言、平台和语境下的所有可能称呼方式。

## 输出要求

返回 JSON 数组，每个元素包含以下字段：
- name: 别名/称呼
- language: 语言分类（chinese / english / original / other）
- type: 类型（formal=正式名 / nickname=昵称绰号 / abbreviation=简称 / handle=社交媒体账号 / maiden=曾用名旧名 / title=头衔尊称）
- usageContext: 使用场景说明（可选）

## 分析要点

1. **中文译名**：如果是外国人物，找出其中文官方译名（如 Donald Trump → 特朗普）
2. **中文昵称**：在中文互联网/社交媒体中的常用昵称或绰号（如 Donald Trump → 川普、川建国）
3. **英文名称**：英文名的各种变体（全名、简称、中间名缩写等）
4. **日文/其他语言译名**：如果角色在日语等其他语言中有知名译名
5. **社交媒体账号**：如果角色有知名社交媒体账号
6. **头衔/尊称**：常用的头衔或尊称（如总统、先生、阁下）
7. **虚构角色特殊处理**：小说/游戏/影视角色的不同译名、不同版本中的名称

## 注意事项

- 不要编造不存在的别名，只返回确实被广泛使用的称呼
- 每个别名必须是实际可用于搜索的名称
- 中文昵称对中文社交媒体搜索（微博、知乎）特别重要
- 英文简称对英文平台搜索（Twitter、BBC）特别重要`;

const aliasSchema = z.object({
  aliases: z.array(z.object({
    name: z.string(),
    language: z.enum(['chinese', 'english', 'original', 'other']),
    type: z.enum(['formal', 'nickname', 'abbreviation', 'handle', 'maiden', 'title']),
    usageContext: z.string().optional(),
  })),
});

export async function resolveAliases(
  model: LanguageModel,
  characterName: string,
  characterType: string,
  source?: string[],
): Promise<CharacterAlias[]> {
  const sourceHint = source && source.length > 0
    ? `该角色来源于${source.map(s => `「${s}」`).join('和')}，请重点分析该作品中使用的名称。`
    : '';
  const userPrompt = characterType === 'fictional'
    ? `请分析虚构角色 "${characterName}" 的所有已知别名和称呼方式。包括不同语言版本的译名、作品中的别名、粉丝圈常用的昵称等。${sourceHint}`
    : `请分析 "${characterName}" 的所有已知别名和称呼方式。包括中文译名、中文昵称/绰号、英文名称变体、社交媒体账号、常用头衔等。`;

  const result = await withRetry(
    () => generateObject({
      model,
      schema: aliasSchema,
      system: ALIAS_RESOLVER_PROMPT,
      prompt: userPrompt,
    }),
    { ...DEFAULT_RETRY_CONFIG, maxRetries: 2 },
    (attempt, err, delay) => {
      console.warn(`[alias-resolver] 第 ${attempt} 次重试（${delay}ms 后）: ${err.message}`);
    },
  );

  return result.object.aliases.map(a => ({ ...a, source: 'ai' as const }));
}

/**
 * 合并用户输入别名与 AI 解析别名
 * 用户输入优先：同名覆盖 AI 结果
 */
export function mergeAliases(
  userAliases: CharacterAlias[],
  aiAliases: CharacterAlias[],
): CharacterAlias[] {
  const userNames = new Set(userAliases.map(a => a.name.toLowerCase()));
  const filteredAi = aiAliases.filter(a => !userNames.has(a.name.toLowerCase()));
  return [...userAliases, ...filteredAi];
}

export function formatAliasesForPrompt(aliases: CharacterAlias[]): string {
  if (aliases.length === 0) return '';

  const byLanguage: Record<string, CharacterAlias[]> = {};
  for (const alias of aliases) {
    const key = alias.language;
    (byLanguage[key] ??= []).push(alias);
  }

  const languageLabels: Record<string, string> = {
    chinese: '中文',
    english: '英文',
    original: '原名',
    other: '其他',
  };

  const lines: string[] = [];
  for (const [lang, group] of Object.entries(byLanguage)) {
    const label = languageLabels[lang] ?? lang;
    const formal = group.filter(a => a.type === 'formal').map(a => a.name);
    const nicknames = group.filter(a => a.type === 'nickname').map(a => a.name);
    const others = group.filter(a => a.type !== 'formal' && a.type !== 'nickname').map(a => `${a.name}${a.usageContext ? `(${a.usageContext})` : ''}`);

    const parts: string[] = [];
    if (formal.length > 0) parts.push(`正式名：${formal.join('、')}`);
    if (nicknames.length > 0) parts.push(`昵称/绰号：${nicknames.join('、')}`);
    if (others.length > 0) parts.push(others.join('、'));

    if (parts.length > 0) {
      lines.push(`- ${label}：${parts.join('；')}`);
    }
  }

  return lines.join('\n');
}

/**
 * 将用户输入的逗号分隔别名字符串解析为 CharacterAlias[]
 */
export function parseUserAliases(input: string): CharacterAlias[] {
  return input
    .split(/[,，]/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(name => ({
      name,
      // 含中文字符 → chinese，否则 → english
      language: /[一-鿿]/.test(name) ? 'chinese' as const : 'english' as const,
      type: 'formal' as const,
      source: 'user' as const,
    }));
}
