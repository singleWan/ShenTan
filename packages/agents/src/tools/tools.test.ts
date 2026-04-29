import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// 从工具定义中提取 Schema 进行独立测试
const EVENT_CATEGORIES = [
  'life',
  'career',
  'political',
  'conflict',
  'achievement',
  'scandal',
  'speech',
  'policy',
  'statement',
  'rumor',
  'other',
] as const;

// webSearch Schema
const webSearchSchema = z.object({
  query: z.string(),
  maxResults: z.number().optional().default(15),
  categories: z.array(z.string()).optional(),
  engines: z.array(z.string()).optional(),
  timeRange: z.enum(['day', 'week', 'month', 'year']).optional(),
  searchMode: z
    .enum(['general', 'deep', 'broad', 'news', 'social'])
    .optional()
    .default('general'),
  language: z.string().optional(),
  relevantKeywords: z.array(z.string()).optional(),
});

// scrapePage Schema
const scrapePageSchema = z.object({
  url: z.string(),
});

// saveEvents Schema
const saveEventsSchema = z.object({
  characterId: z.number(),
  events: z.array(
    z.object({
      parentEventId: z.number().optional(),
      title: z.string(),
      description: z.string().optional(),
      dateText: z.string().optional(),
      dateSortable: z.string().optional(),
      category: z.enum(EVENT_CATEGORIES).optional(),
      content: z.string().optional(),
      platform: z.string().optional(),
      authorHandle: z.string().optional(),
      sourceUrl: z.string().optional(),
      sourceTitle: z.string().optional(),
      importance: z.number().min(1).max(5).optional(),
    }),
  ),
});

// saveReactions Schema
const saveReactionsSchema = z.object({
  eventId: z.number(),
  reactions: z.array(
    z.object({
      reactor: z.string(),
      reactorType: z.enum(['person', 'organization', 'country', 'media', 'group']),
      reactionText: z.string().optional(),
      sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']).optional(),
      sourceUrl: z.string().optional(),
      sourceTitle: z.string().optional(),
    }),
  ),
});

// getEvents Schema
const getEventsSchema = z.object({
  characterId: z.number(),
  minImportance: z.number().optional(),
  category: z.string().optional(),
});

// updateCharacter Schema
const updateCharacterSchema = z.object({
  characterId: z.number(),
  description: z.string().optional(),
  status: z.enum(['pending', 'collecting', 'completed', 'failed']).optional(),
  imageUrl: z.string().optional(),
});

// saveRelation Schema
const saveRelationSchema = z.object({
  characterId: z.number(),
  relations: z.array(
    z.object({
      targetName: z.string(),
      relationType: z.enum(['ally', 'enemy', 'family', 'colleague', 'rival', 'mentor', 'friend', 'other']),
      description: z.string().optional(),
      sourceUrl: z.string().optional(),
      confidence: z.string().optional(),
    }),
  ),
});

// --- webSearch Schema ---
describe('webSearch Schema', () => {
  it('最小输入有效', () => {
    const result = webSearchSchema.safeParse({ query: '诸葛亮' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe('诸葛亮');
      expect(result.data.searchMode).toBe('general');
      expect(result.data.maxResults).toBe(15);
    }
  });

  it('完整输入有效', () => {
    const result = webSearchSchema.safeParse({
      query: '赤壁之战',
      maxResults: 20,
      categories: ['news'],
      engines: ['google'],
      timeRange: 'month',
      searchMode: 'deep',
      language: 'zh-CN',
      relevantKeywords: ['赤壁', '曹操'],
    });
    expect(result.success).toBe(true);
  });

  it('缺少 query 无效', () => {
    const result = webSearchSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('无效搜索模式被拒绝', () => {
    const result = webSearchSchema.safeParse({ query: 'test', searchMode: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('无效时间范围被拒绝', () => {
    const result = webSearchSchema.safeParse({ query: 'test', timeRange: 'decade' });
    expect(result.success).toBe(false);
  });
});

// --- scrapePage Schema ---
describe('scrapePage Schema', () => {
  it('有效 URL', () => {
    const result = scrapePageSchema.safeParse({ url: 'https://zh.wikipedia.org/wiki/诸葛亮' });
    expect(result.success).toBe(true);
  });

  it('缺少 url 无效', () => {
    const result = scrapePageSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// --- saveEvents Schema ---
describe('saveEvents Schema', () => {
  it('单事件有效', () => {
    const result = saveEventsSchema.safeParse({
      characterId: 1,
      events: [{ title: '出生', description: '出生于琅琊' }],
    });
    expect(result.success).toBe(true);
  });

  it('完整事件字段有效', () => {
    const result = saveEventsSchema.safeParse({
      characterId: 1,
      events: [
        {
          title: '出师表',
          description: '向后主上书',
          dateText: '建兴五年',
          dateSortable: '227-01-01',
          category: 'speech',
          content: '先帝创业未半而中道崩殂...',
          platform: 'official',
          authorHandle: '诸葛亮',
          sourceUrl: 'https://example.com',
          sourceTitle: '三国志',
          importance: 5,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('无效分类被拒绝', () => {
    const result = saveEventsSchema.safeParse({
      characterId: 1,
      events: [{ title: '测试', category: 'invalid' }],
    });
    expect(result.success).toBe(false);
  });

  it('importance 超出范围被拒绝', () => {
    const result = saveEventsSchema.safeParse({
      characterId: 1,
      events: [{ title: '测试', importance: 6 }],
    });
    expect(result.success).toBe(false);

    const result2 = saveEventsSchema.safeParse({
      characterId: 1,
      events: [{ title: '测试', importance: 0 }],
    });
    expect(result2.success).toBe(false);
  });

  it('空事件列表有效', () => {
    const result = saveEventsSchema.safeParse({
      characterId: 1,
      events: [],
    });
    expect(result.success).toBe(true);
  });

  it('缺少 characterId 无效', () => {
    const result = saveEventsSchema.safeParse({
      events: [{ title: '测试' }],
    });
    expect(result.success).toBe(false);
  });

  it('缺少 title 无效', () => {
    const result = saveEventsSchema.safeParse({
      characterId: 1,
      events: [{ description: '无标题' }],
    });
    expect(result.success).toBe(false);
  });
});

// --- saveReactions Schema ---
describe('saveReactions Schema', () => {
  it('单反应有效', () => {
    const result = saveReactionsSchema.safeParse({
      eventId: 1,
      reactions: [
        {
          reactor: '曹操',
          reactorType: 'person',
          reactionText: '震惊',
          sentiment: 'negative',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('所有反应方类型有效', () => {
    const types = ['person', 'organization', 'country', 'media', 'group'];
    for (const type of types) {
      const result = saveReactionsSchema.safeParse({
        eventId: 1,
        reactions: [{ reactor: '测试', reactorType: type }],
      });
      expect(result.success).toBe(true);
    }
  });

  it('所有情感类型有效', () => {
    const sentiments = ['positive', 'negative', 'neutral', 'mixed'];
    for (const sentiment of sentiments) {
      const result = saveReactionsSchema.safeParse({
        eventId: 1,
        reactions: [{ reactor: '测试', reactorType: 'person', sentiment }],
      });
      expect(result.success).toBe(true);
    }
  });

  it('无效反应方类型被拒绝', () => {
    const result = saveReactionsSchema.safeParse({
      eventId: 1,
      reactions: [{ reactor: '测试', reactorType: 'alien' }],
    });
    expect(result.success).toBe(false);
  });

  it('无效情感类型被拒绝', () => {
    const result = saveReactionsSchema.safeParse({
      eventId: 1,
      reactions: [{ reactor: '测试', reactorType: 'person', sentiment: 'angry' }],
    });
    expect(result.success).toBe(false);
  });
});

// --- getEvents Schema ---
describe('getEvents Schema', () => {
  it('仅 characterId 有效', () => {
    const result = getEventsSchema.safeParse({ characterId: 1 });
    expect(result.success).toBe(true);
  });

  it('带过滤参数有效', () => {
    const result = getEventsSchema.safeParse({
      characterId: 1,
      minImportance: 4,
      category: 'political',
    });
    expect(result.success).toBe(true);
  });

  it('缺少 characterId 无效', () => {
    const result = getEventsSchema.safeParse({ minImportance: 3 });
    expect(result.success).toBe(false);
  });
});

// --- updateCharacter Schema ---
describe('updateCharacter Schema', () => {
  it('仅 characterId 有效', () => {
    const result = updateCharacterSchema.safeParse({ characterId: 1 });
    expect(result.success).toBe(true);
  });

  it('所有字段有效', () => {
    const result = updateCharacterSchema.safeParse({
      characterId: 1,
      description: '蜀汉丞相',
      status: 'completed',
      imageUrl: 'https://example.com/img.jpg',
    });
    expect(result.success).toBe(true);
  });

  it('无效状态被拒绝', () => {
    const result = updateCharacterSchema.safeParse({
      characterId: 1,
      status: 'unknown',
    });
    expect(result.success).toBe(false);
  });
});

// --- saveRelation Schema ---
describe('saveRelation Schema', () => {
  it('单关系有效', () => {
    const result = saveRelationSchema.safeParse({
      characterId: 1,
      relations: [
        {
          targetName: '刘备',
          relationType: 'friend',
          description: '桃园结义',
          confidence: 'high',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('所有关系类型有效', () => {
    const types = ['ally', 'enemy', 'family', 'colleague', 'rival', 'mentor', 'friend', 'other'];
    for (const type of types) {
      const result = saveRelationSchema.safeParse({
        characterId: 1,
        relations: [{ targetName: '测试', relationType: type }],
      });
      expect(result.success).toBe(true);
    }
  });

  it('无效关系类型被拒绝', () => {
    const result = saveRelationSchema.safeParse({
      characterId: 1,
      relations: [{ targetName: '测试', relationType: 'frenemy' }],
    });
    expect(result.success).toBe(false);
  });

  it('缺少 targetName 无效', () => {
    const result = saveRelationSchema.safeParse({
      characterId: 1,
      relations: [{ relationType: 'friend' }],
    });
    expect(result.success).toBe(false);
  });
});
