import { tool } from 'ai';
import { z } from 'zod';
import { webSearch as doSearch, searchSocialMedia as doSearchSocialMedia, getDefaultSearchManager, type SearchResult } from '@shentan/crawler';
import { scrapePage as doScrape } from '@shentan/crawler';
import type { Database } from '@shentan/core';
import * as queries from '@shentan/core/queries';

const EVENT_CATEGORIES = ['life', 'career', 'political', 'conflict', 'achievement', 'scandal', 'speech', 'policy', 'statement', 'rumor', 'other'] as const;

function formatResults(results: SearchResult[], maxResults: number): string {
  return results
    .slice(0, maxResults)
    .map((r, i) => {
      const dateTag = r.publishedDate ? ` (${r.publishedDate})` : '';
      const engineTag = r.engine ? ` [${r.engine}]` : '';
      return `${i + 1}. [${r.title}](${r.url})${dateTag}${engineTag}\n   ${r.snippet}`;
    })
    .join('\n\n') || '未找到搜索结果';
}

export function createTools(db: Database) {
  const webSearch = tool({
    description: '搜索互联网获取信息。支持多种搜索模式和丰富的过滤选项。返回搜索结果列表（标题、URL、摘要、发布日期）。deep 模式支持关联性早停：提供 relevantKeywords 后会逐页评估关联度，关联太弱时自动停止翻页。',
    inputSchema: z.object({
      query: z.string().describe('搜索关键词'),
      maxResults: z.number().optional().describe('最大结果数，默认15').default(15),
      categories: z.array(z.string()).optional().describe('搜索分类，如 ["social media"] 用于搜索社交媒体内容'),
      engines: z.array(z.string()).optional().describe('指定搜索引擎，如 ["google", "bing", "baidu"]'),
      timeRange: z.enum(['day', 'week', 'month', 'year']).optional().describe('时间范围过滤：day=最近一天，week=最近一周，month=最近一月，year=最近一年。用于搜索最新信息时设置。'),
      searchMode: z.enum(['general', 'deep', 'broad', 'news', 'social']).optional().describe(
        '搜索模式：general=标准搜索(默认), deep=多页深度搜索(翻5页，支持关联性早停), broad=多分类并行(general+news+social media同时搜索), news=仅新闻分类, social=仅社交媒体'
      ).default('general'),
      language: z.string().optional().describe('搜索语言，如 zh-CN, en, ja 等'),
      relevantKeywords: z.array(z.string()).optional().describe('关联性关键词列表，用于 deep 模式的逐页关联性评估。从搜索目标中提取的2-4个核心关键词。搜索引擎会检查每页结果是否包含这些关键词，如果连续2页关联度低于15%则自动停止翻页，避免在无关方向上浪费搜索深度。'),
    }),
    execute: async ({ query, maxResults, categories, engines, timeRange, searchMode, language, relevantKeywords }) => {
      const searchOptions = { maxResults, categories, engines, timeRange, language, relevantKeywords };

      // social 模式：社交媒体搜索
      if (searchMode === 'social' || categories?.includes('social media')) {
        try {
          const results = await doSearchSocialMedia(query);
          if (results.length > 0) return formatResults(results, maxResults ?? 15);
        } catch {
          // 降级到普通搜索
        }
      }

      try {
        const manager = getDefaultSearchManager();

        switch (searchMode) {
          case 'deep':
            // 多页深度搜索，最多5页，带关联性早停
            return formatResults(await manager.searchWithPages(query, {
              ...searchOptions,
              pageCount: 5,
              relevantKeywords,
            }), maxResults ?? 25);

          case 'broad':
            // 多分类并行搜索
            return formatResults(await manager.searchMultiCategory(query, searchOptions), maxResults ?? 30);

          case 'news':
            return formatResults(await manager.search(query, { ...searchOptions, categories: ['news'] }), maxResults ?? 15);

          case 'social':
            // social 模式已在上方处理，这里走通用路径作为兜底
            return formatResults(await manager.search(query, { ...searchOptions, categories: ['social media'] }), maxResults ?? 15);

          default:
            // general 模式：主搜索 + 回退
            return formatResults(await manager.search(query, searchOptions), maxResults ?? 15);
        }
      } catch {
        // 降级到 DuckDuckGo
      }

      const results = await doSearch(query, { maxResults, timeRange });
      return formatResults(results, maxResults ?? 15);
    },
  });

  const scrapePage = tool({
    description: '爬取指定URL的网页内容。返回页面标题、正文文本和页面图片URL（如果有）。用于获取搜索结果中的详细内容。',
    inputSchema: z.object({
      url: z.string().describe('要爬取的网页URL'),
    }),
    execute: async ({ url }) => {
      try {
        const result = await doScrape(url);
        const imageTag = result.imageUrl ? `\n页面图片: ${result.imageUrl}` : '';
        return `标题: ${result.title}\nURL: ${result.url}${imageTag}\n\n${result.content.substring(0, 15000)}`;
      } catch (e) {
        return `爬取失败: ${(e as Error).message}`;
      }
    },
  });

  const saveEvents = tool({
    description: '保存收集到的事件到数据库。支持所有事件类型，包括生平事件、发言、政策、声明等。每个事件包含标题、描述、日期、分类、重要度等信息。发言/政策类事件应额外填写 content（完整文本）、platform（来源平台）、authorHandle（发言账号）。',
    inputSchema: z.object({
      characterId: z.number().describe('角色ID'),
      events: z.array(z.object({
        parentEventId: z.number().optional().describe('父事件ID（用于分支结构）'),
        title: z.string().describe('事件标题'),
        description: z.string().optional().describe('事件详细描述'),
        dateText: z.string().optional().describe('原始日期文本（如"1946年6月14日"或"第一章"）'),
        dateSortable: z.string().optional().describe('可排序日期。历史人物用 YYYY-MM-DD（如 1946-06-14）；虚构角色用 FIC- 前缀（章节用 FIC-CH0025、阶段用 FIC-PH001、叙事序号用 FIC-SEQ0003）'),
        category: z.enum(EVENT_CATEGORIES).optional().describe('事件分类'),
        content: z.string().optional().describe('发言/政策/声明的完整文本内容（仅 speech/policy/statement 类事件需要）'),
        platform: z.string().optional().describe('来源平台（如 twitter/weibo/facebook/instagram/youtube/zhihu/news/official/other）'),
        authorHandle: z.string().optional().describe('发言者在该平台的账号/ID'),
        sourceUrl: z.string().optional().describe('来源URL'),
        sourceTitle: z.string().optional().describe('来源标题'),
        importance: z.number().min(1).max(5).optional().describe('重要度1-5，5最重要'),
      })).describe('要保存的事件列表'),
    }),
    execute: async ({ characterId, events }) => {
      const { saved, skipped } = await queries.saveEvents(db, { characterId, events });
      let msg = `成功保存 ${saved.length} 个事件。事件ID: ${saved.map(e => e.id).join(', ')}`;
      if (skipped.length > 0) {
        msg += `\n跳过 ${skipped.length} 个重复事件: ${skipped.join(', ')}`;
      }
      return msg;
    },
  });

  const saveReactions = tool({
    description: '保存对特定事件的各方反应。每个反应包含反应方、反应内容、态度等信息。',
    inputSchema: z.object({
      eventId: z.number().describe('关联的事件ID'),
      reactions: z.array(z.object({
        reactor: z.string().describe('反应方名称（人名、组织名、国家名等）'),
        reactorType: z.enum(['person', 'organization', 'country', 'media', 'group']).describe('反应方类型'),
        reactionText: z.string().optional().describe('反应的具体内容或言论'),
        sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']).optional().describe('态度倾向'),
        sourceUrl: z.string().optional().describe('来源URL'),
        sourceTitle: z.string().optional().describe('来源标题'),
      })).describe('要保存的反应列表'),
    }),
    execute: async ({ eventId, reactions }) => {
      const saved = await queries.saveReactions(db, { eventId, reactions });
      return `成功保存 ${saved.length} 条反应。`;
    },
  });

  const getEvents = tool({
    description: '获取角色已有的事件列表。用于查看已收集的事件，决定下一步拓展方向。支持按分类和重要度过滤。',
    inputSchema: z.object({
      characterId: z.number().describe('角色ID'),
      minImportance: z.number().optional().describe('最小重要度过滤'),
      category: z.string().optional().describe('按分类过滤（life/career/political/conflict/achievement/scandal/speech/policy/statement/rumor/other）'),
    }),
    execute: async ({ characterId, minImportance, category }) => {
      const events = await queries.getEvents(db, { characterId, minImportance, category });
      if (events.length === 0) return '暂无事件记录';
      const formatted = events
        .map(e => {
          const extra = e.content ? ` [${e.category}${e.platform ? '/' + e.platform : ''}]` : ` [${e.category}]`;
          const desc = e.description ? ` | ${e.description.length > 100 ? e.description.substring(0, 100) + '...' : e.description}` : '';
          return `[ID:${e.id}] ${e.dateText ?? '未知日期'} - ${e.title} (重要度:${e.importance})${extra}${desc}`;
        })
        .join('\n');
      return `共 ${events.length} 个事件:\n${formatted}`;
    },
  });

  const getReactions = tool({
    description: '获取特定事件的已有反应列表。',
    inputSchema: z.object({
      eventId: z.number().describe('事件ID'),
    }),
    execute: async ({ eventId }) => {
      const reactions = await queries.getReactionsForEvent(db, eventId);
      if (reactions.length === 0) return '暂无反应记录';
      const formatted = reactions
        .map(r => `- [${r.reactorType}] ${r.reactor}: ${r.reactionText ?? '(无内容)'} (${r.sentiment ?? '未知态度'})`)
        .join('\n');
      return `共 ${reactions.length} 条反应:\n${formatted}`;
    },
  });

  const updateCharacter = tool({
    description: '更新角色信息（描述、状态、图片URL）。imageUrl 应该是从权威来源（如维基百科、官方页面）爬取到的角色海报或肖像图片的 URL。优先选择高质量、正面、清晰的图片。',
    inputSchema: z.object({
      characterId: z.number().describe('角色ID'),
      description: z.string().optional().describe('角色描述'),
      status: z.enum(['pending', 'collecting', 'completed', 'failed']).optional().describe('状态'),
      imageUrl: z.string().optional().describe('角色图片URL（海报、肖像等），从爬取页面的 og:image 或其他来源获取'),
    }),
    execute: async ({ characterId, description, status, imageUrl }) => {
      if (description) await queries.updateCharacterDescription(db, characterId, description);
      if (status) await queries.updateCharacterStatus(db, characterId, status);
      if (imageUrl) await queries.updateCharacterImageUrl(db, characterId, imageUrl);
      return '角色信息已更新';
    },
  });

  return {
    webSearch,
    scrapePage,
    saveEvents,
    saveReactions,
    getEvents,
    getReactions,
    updateCharacter,
    all: {
      web_search: webSearch,
      scrape_page: scrapePage,
      save_events: saveEvents,
      save_reactions: saveReactions,
      get_events: getEvents,
      get_reactions: getReactions,
      update_character: updateCharacter,
    },
  };
}

export type AgentTools = ReturnType<typeof createTools>;
