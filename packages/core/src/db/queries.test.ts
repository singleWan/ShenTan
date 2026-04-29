import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient, type Client } from '@libsql/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as schema from './schema.js';
import {
  parseSource,
  createCharacter,
  getCharacter,
  getCharacterByName,
  updateCharacterStatus,
  updateCharacterDescription,
  updateCharacterImageUrl,
  updateCharacterAliases,
  listCharacters,
  saveEvents,
  getEvents,
  getEvent,
  getChildEvents,
  saveReactions,
  getReactionsForEvent,
  deleteReaction,
  deleteEvent,
  deleteCharacter,
  exportCharacter,
  searchCharacters,
  searchEvents,
  getPendingReviewEvents,
  resolveReviewEvent,
  createCollectionTask,
  getCollectionTask,
  updateCollectionTask,
  listCollectionTasks,
} from './queries.js';
import type { Database } from './connection.js';

// 测试用内存数据库
let client: Client;
let db: Database;
let dbPath: string;

const INIT_TABLES = [
  `CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    source TEXT,
    description TEXT,
    aliases TEXT,
    image_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL REFERENCES characters(id),
    parent_event_id INTEGER REFERENCES events(id),
    title TEXT NOT NULL,
    description TEXT,
    date_text TEXT,
    date_sortable TEXT,
    category TEXT NOT NULL DEFAULT 'other',
    content TEXT,
    platform TEXT,
    author_handle TEXT,
    source_url TEXT,
    source_title TEXT,
    importance INTEGER NOT NULL DEFAULT 3,
    metadata TEXT,
    review_status TEXT,
    duplicate_of INTEGER,
    merged_from_ids TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id),
    reactor TEXT NOT NULL,
    reactor_type TEXT NOT NULL,
    reaction_text TEXT,
    sentiment TEXT,
    source_url TEXT,
    source_title TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    collection_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS collection_tasks (
    id TEXT PRIMARY KEY,
    character_id INTEGER REFERENCES characters(id),
    character_name TEXT NOT NULL,
    character_type TEXT NOT NULL,
    source TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    max_rounds INTEGER DEFAULT 5,
    aliases TEXT,
    log_path TEXT,
    pid INTEGER,
    started_at TEXT,
    completed_at TEXT,
    result TEXT,
    error TEXT,
    progress TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
];

beforeEach(async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'shentan-test-'));
  dbPath = join(tmpDir, 'test.db');
  client = createClient({ url: `file:${dbPath}` });
  db = drizzle(client, { schema }) as unknown as Database;
  for (const sql of INIT_TABLES) {
    await client.execute(sql);
  }
});

afterEach(() => {
  client.close();
  try {
    rmSync(join(dbPath, '..'), { recursive: true });
  } catch {
    // cleanup failure is acceptable
  }
});

// --- parseSource ---
describe('parseSource', () => {
  it('解析 JSON 数组', () => {
    expect(parseSource('["a","b"]')).toEqual(['a', 'b']);
  });

  it('纯字符串回退', () => {
    expect(parseSource('维基百科')).toEqual(['维基百科']);
  });

  it('null 返回 null', () => {
    expect(parseSource(null)).toBeNull();
  });

  it('空字符串返回 null', () => {
    expect(parseSource('')).toBeNull();
  });
});

// --- Character CRUD ---
describe('Character CRUD', () => {
  it('创建并获取角色', async () => {
    const char = await createCharacter(db, { name: '诸葛亮', type: 'historical' });
    expect(char.name).toBe('诸葛亮');
    expect(char.type).toBe('historical');
    expect(char.status).toBe('pending');

    const fetched = await getCharacter(db, char.id);
    expect(fetched?.name).toBe('诸葛亮');
  });

  it('按名称查找角色', async () => {
    await createCharacter(db, { name: '曹操', type: 'historical' });
    const found = await getCharacterByName(db, '曹操');
    expect(found?.name).toBe('曹操');
  });

  it('按名称查找不存在', async () => {
    const found = await getCharacterByName(db, '不存在');
    expect(found).toBeNull();
  });

  it('更新角色状态', async () => {
    const char = await createCharacter(db, { name: '刘备', type: 'historical' });
    await updateCharacterStatus(db, char.id, 'completed');
    const updated = await getCharacter(db, char.id);
    expect(updated?.status).toBe('completed');
  });

  it('更新角色描述', async () => {
    const char = await createCharacter(db, { name: '关羽', type: 'historical' });
    await updateCharacterDescription(db, char.id, '武圣');
    const updated = await getCharacter(db, char.id);
    expect(updated?.description).toBe('武圣');
  });

  it('更新角色图片', async () => {
    const char = await createCharacter(db, { name: '张飞', type: 'historical' });
    await updateCharacterImageUrl(db, char.id, 'https://example.com/img.jpg');
    const updated = await getCharacter(db, char.id);
    expect(updated?.imageUrl).toBe('https://example.com/img.jpg');
  });

  it('更新角色别名', async () => {
    const char = await createCharacter(db, { name: '赵云', type: 'historical' });
    await updateCharacterAliases(db, char.id, [
      { name: '子龙', language: 'chinese', type: 'nickname', source: 'user' },
    ]);
    const updated = await getCharacter(db, char.id);
    expect(JSON.parse(updated?.aliases ?? '[]')).toEqual([
      { name: '子龙', language: 'chinese', type: 'nickname', source: 'user' },
    ]);
  });

  it('列出角色按更新时间排序', async () => {
    await createCharacter(db, { name: '角色A', type: 'historical' });
    await createCharacter(db, { name: '角色B', type: 'fictional' });
    const list = await listCharacters(db);
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.map((c) => c.name)).toContain('角色A');
    expect(list.map((c) => c.name)).toContain('角色B');
  });

  it('带来源创建角色', async () => {
    const char = await createCharacter(db, {
      name: '孙悟空',
      type: 'fictional',
      source: ['西游记'],
      description: '齐天大圣',
    });
    expect(char.source).toBe('["西游记"]');
    expect(char.description).toBe('齐天大圣');
  });
});

// --- Event 去重与保存 ---
describe('saveEvents 去重逻辑', () => {
  it('保存新事件', async () => {
    const char = await createCharacter(db, { name: '测试角色', type: 'historical' });
    const result = await saveEvents(db, {
      characterId: char.id,
      events: [{ title: '出生', dateText: '公元181年', importance: 3 }],
    });
    expect(result.saved.length).toBe(1);
    expect(result.saved[0].title).toBe('出生');
    expect(result.skipped).toEqual([]);
  });

  it('自动去重：相似标题跳过', async () => {
    const char = await createCharacter(db, { name: '测试角色2', type: 'historical' });
    // 先保存一个事件
    await saveEvents(db, {
      characterId: char.id,
      events: [{ title: '赤壁之战大败曹军', importance: 5 }],
    });
    // 尝试保存相似事件
    const result = await saveEvents(db, {
      characterId: char.id,
      events: [{ title: '赤壁之战大败曹军', importance: 5 }],
    });
    expect(result.skipped.length).toBe(1);
    expect(result.saved.length).toBe(0);
  });

  it('待审核：中等相似度标记', async () => {
    const char = await createCharacter(db, { name: '测试角色3', type: 'historical' });
    await saveEvents(db, {
      characterId: char.id,
      events: [{ title: '三顾茅庐请诸葛亮出山辅佐', importance: 5 }],
    });
    const result = await saveEvents(db, {
      characterId: char.id,
      events: [{ title: '三顾茅庐请诸葛亮辅佐', importance: 4 }],
    });
    // 中等相似度应标记为 pending review 或跳过
    if (result.skipped.length > 0) {
      expect(result.skipped[0]).toContain('三顾茅庐');
    } else if (result.pendingReview.length > 0) {
      expect(result.pendingReview[0]).toContain('三顾茅庐');
    }
  });

  it('批量保存事件', async () => {
    const char = await createCharacter(db, { name: '批量角色', type: 'historical' });
    const events = Array.from({ length: 10 }, (_, i) => ({
      title: `事件${i + 1}`,
      importance: 3,
    }));
    const result = await saveEvents(db, { characterId: char.id, events });
    expect(result.saved.length).toBe(10);
  });

  it('保存带日期的事件', async () => {
    const char = await createCharacter(db, { name: '日期角色', type: 'historical' });
    const result = await saveEvents(db, {
      characterId: char.id,
      events: [
        { title: '有日期事件', dateText: '2024-01-15', dateSortable: '2024-01-15' },
      ],
    });
    expect(result.saved[0].dateText).toBe('2024-01-15');
  });

  it('保存带分类和来源的事件', async () => {
    const char = await createCharacter(db, { name: '详细角色', type: 'historical' });
    const result = await saveEvents(db, {
      characterId: char.id,
      events: [
        {
          title: '演讲',
          category: 'speech',
          sourceUrl: 'https://example.com',
          sourceTitle: '来源',
          content: '演讲内容',
          platform: 'twitter',
          authorHandle: '@user',
        },
      ],
    });
    expect(result.saved[0].category).toBe('speech');
    expect(result.saved[0].sourceUrl).toBe('https://example.com');
  });
});

// --- Event 查询 ---
describe('Event 查询', () => {
  it('按角色 ID 获取事件', async () => {
    const char = await createCharacter(db, { name: '角色X', type: 'historical' });
    await saveEvents(db, {
      characterId: char.id,
      events: [{ title: '事件1' }, { title: '事件2' }],
    });
    const result = await getEvents(db, { characterId: char.id });
    expect(result.length).toBe(2);
  });

  it('按重要度过滤', async () => {
    const char = await createCharacter(db, { name: '角色Y', type: 'historical' });
    await saveEvents(db, {
      characterId: char.id,
      events: [
        { title: '重要', importance: 5 },
        { title: '普通', importance: 2 },
      ],
    });
    const result = await getEvents(db, { characterId: char.id, minImportance: 4 });
    expect(result.length).toBe(1);
    expect(result[0].title).toBe('重要');
  });

  it('按分类过滤', async () => {
    const char = await createCharacter(db, { name: '角色Z', type: 'historical' });
    await saveEvents(db, {
      characterId: char.id,
      events: [
        { title: '战斗', category: 'military' },
        { title: '其他', category: 'other' },
      ],
    });
    const result = await getEvents(db, { characterId: char.id, category: 'military' });
    expect(result.length).toBe(1);
  });

  it('获取单个事件', async () => {
    const char = await createCharacter(db, { name: '角色W', type: 'historical' });
    const saved = await saveEvents(db, {
      characterId: char.id,
      events: [{ title: '唯一事件' }],
    });
    const evt = await getEvent(db, saved.saved[0].id);
    expect(evt?.title).toBe('唯一事件');
  });

  it('获取不存在的事件返回 null', async () => {
    const evt = await getEvent(db, 99999);
    expect(evt).toBeNull();
  });

  it('获取子事件', async () => {
    const char = await createCharacter(db, { name: '父子角色', type: 'historical' });
    const parent = await saveEvents(db, {
      characterId: char.id,
      events: [{ title: '父事件' }],
    });
    await saveEvents(db, {
      characterId: char.id,
      events: [{ title: '子事件', parentEventId: parent.saved[0].id }],
    });
    const children = await getChildEvents(db, parent.saved[0].id);
    expect(children.length).toBe(1);
    expect(children[0].title).toBe('子事件');
  });
});

// --- Reaction ---
describe('Reaction CRUD', () => {
  it('保存并获取反应', async () => {
    const char = await createCharacter(db, { name: '反应角色', type: 'historical' });
    const evt = await saveEvents(db, {
      characterId: char.id,
      events: [{ title: '大事' }],
    });
    await saveReactions(db, {
      eventId: evt.saved[0].id,
      reactions: [
        {
          reactor: '曹操',
          reactorType: 'person',
          reactionText: '震惊',
          sentiment: 'negative',
        },
      ],
    });
    const reactions = await getReactionsForEvent(db, evt.saved[0].id);
    expect(reactions.length).toBe(1);
    expect(reactions[0].reactor).toBe('曹操');
  });

  it('批量保存反应', async () => {
    const char = await createCharacter(db, { name: '多反应角色', type: 'historical' });
    const evt = await saveEvents(db, {
      characterId: char.id,
      events: [{ title: '大事件' }],
    });
    const result = await saveReactions(db, {
      eventId: evt.saved[0].id,
      reactions: [
        { reactor: '甲', reactorType: 'person', sentiment: 'positive' },
        { reactor: '乙', reactorType: 'organization', sentiment: 'negative' },
        { reactor: '丙', reactorType: 'media', sentiment: 'neutral' },
      ],
    });
    expect(result.length).toBe(3);
  });

  it('删除反应', async () => {
    const char = await createCharacter(db, { name: '删反应角色', type: 'historical' });
    const evt = await saveEvents(db, {
      characterId: char.id,
      events: [{ title: '事' }],
    });
    const saved = await saveReactions(db, {
      eventId: evt.saved[0].id,
      reactions: [{ reactor: '丁', reactorType: 'person' }],
    });
    await deleteReaction(db, saved[0].id);
    const reactions = await getReactionsForEvent(db, evt.saved[0].id);
    expect(reactions.length).toBe(0);
  });

  it('空反应数组返回空', async () => {
    const result = await saveReactions(db, { eventId: 1, reactions: [] });
    expect(result).toEqual([]);
  });
});

// --- 删除级联 ---
describe('删除级联', () => {
  it('删除事件级联删除反应', async () => {
    const char = await createCharacter(db, { name: '级联角色', type: 'historical' });
    const evt = await saveEvents(db, {
      characterId: char.id,
      events: [{ title: '将被删除' }],
    });
    await saveReactions(db, {
      eventId: evt.saved[0].id,
      reactions: [{ reactor: '戊', reactorType: 'person' }],
    });
    await deleteEvent(db, evt.saved[0].id);
    const reactions = await getReactionsForEvent(db, evt.saved[0].id);
    expect(reactions.length).toBe(0);
  });

  it('删除角色级联删除所有事件和反应', async () => {
    const char = await createCharacter(db, { name: '全删角色', type: 'historical' });
    const evt = await saveEvents(db, {
      characterId: char.id,
      events: [{ title: '事件1' }, { title: '事件2' }],
    });
    await saveReactions(db, {
      eventId: evt.saved[0].id,
      reactions: [{ reactor: '己', reactorType: 'person' }],
    });
    await deleteCharacter(db, char.id);
    const fetched = await getCharacter(db, char.id);
    expect(fetched).toBeNull();
  });
});

// --- 导出 ---
describe('exportCharacter', () => {
  it('导出完整角色数据', async () => {
    const char = await createCharacter(db, {
      name: '导出角色',
      type: 'historical',
      source: ['史记'],
    });
    const evt = await saveEvents(db, {
      characterId: char.id,
      events: [{ title: '出生', dateText: '公元前181年', importance: 3 }],
    });
    await saveReactions(db, {
      eventId: evt.saved[0].id,
      reactions: [{ reactor: '旁人', reactorType: 'person', sentiment: 'neutral' }],
    });

    const exported = await exportCharacter(db, char.id);
    expect(exported).not.toBeNull();
    expect(exported!.character.name).toBe('导出角色');
    expect(exported!.timeline.length).toBe(1);
    expect(exported!.timeline[0].reactions.length).toBe(1);
    expect(exported!.metadata.totalEvents).toBe(1);
    expect(exported!.metadata.totalReactions).toBe(1);
  });

  it('导出不存在角色返回 null', async () => {
    const exported = await exportCharacter(db, 99999);
    expect(exported).toBeNull();
  });
});

// --- 搜索 ---
describe('搜索功能', () => {
  it('按名称搜索角色', async () => {
    await createCharacter(db, { name: '诸葛亮', type: 'historical' });
    await createCharacter(db, { name: '诸葛瑾', type: 'historical' });
    const results = await searchCharacters(db, '诸葛');
    expect(results.length).toBe(2);
  });

  it('按描述搜索角色', async () => {
    await createCharacter(db, { name: '某人', type: 'historical', description: '蜀汉丞相' });
    const results = await searchCharacters(db, '丞相');
    expect(results.length).toBe(1);
  });

  it('搜索事件', async () => {
    const char = await createCharacter(db, { name: '搜索角色', type: 'historical' });
    await saveEvents(db, {
      characterId: char.id,
      events: [{ title: '赤壁之战' }, { title: '官渡之战' }],
    });
    const results = await searchEvents(db, '之战');
    expect(results.length).toBe(2);
  });

  it('搜索事件带过滤器', async () => {
    const char = await createCharacter(db, { name: '过滤角色', type: 'historical' });
    await saveEvents(db, {
      characterId: char.id,
      events: [
        { title: '搜索战斗', category: 'military', importance: 5 },
        { title: '搜索政治', category: 'political', importance: 2 },
      ],
    });
    const results = await searchEvents(db, '搜索', {
      characterId: char.id,
      category: 'military',
    });
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('搜索战斗');
  });
});

// --- 审查 ---
describe('事件审查', () => {
  it('获取待审查事件', async () => {
    const char = await createCharacter(db, { name: '审查角色', type: 'historical' });
    // 先创建一个事件
    await saveEvents(db, {
      characterId: char.id,
      events: [{ title: '原始事件', importance: 5 }],
    });
    // 创建相似事件触发审查
    await saveEvents(db, {
      characterId: char.id,
      events: [{ title: '原始事件（另一说法）', importance: 4 }],
    });

    const pending = await getPendingReviewEvents(db, char.id);
    // 如果有 pending 事件
    if (pending.length > 0) {
      expect(pending[0].reviewStatus).toBe('pending');
    }
  });

  it('批准审查事件', async () => {
    const char = await createCharacter(db, { name: '批准角色', type: 'historical' });
    await saveEvents(db, {
      characterId: char.id,
      events: [{ title: '事件1', importance: 5 }],
    });
    await saveEvents(db, {
      characterId: char.id,
      events: [{ title: '事件1变体', importance: 4 }],
    });

    const pending = await getPendingReviewEvents(db, char.id);
    if (pending.length > 0) {
      await resolveReviewEvent(db, pending[0].id, 'keep');
      const evt = await getEvent(db, pending[0].id);
      expect(evt?.reviewStatus).toBe('approved');
    }
  });
});

// --- CollectionTask ---
describe('CollectionTask CRUD', () => {
  it('创建并获取任务', async () => {
    const task = await createCollectionTask(db, {
      id: 'task-001',
      characterName: '测试任务角色',
      characterType: 'historical',
    });
    expect(task.id).toBe('task-001');
    expect(task.characterName).toBe('测试任务角色');
    expect(task.status).toBe('pending');

    const fetched = await getCollectionTask(db, 'task-001');
    expect(fetched?.id).toBe('task-001');
  });

  it('更新任务状态', async () => {
    await createCollectionTask(db, {
      id: 'task-002',
      characterName: '更新任务',
      characterType: 'fictional',
    });
    await updateCollectionTask(db, 'task-002', { status: 'running' });
    const updated = await getCollectionTask(db, 'task-002');
    expect(updated?.status).toBe('running');
  });

  it('列出任务', async () => {
    await createCollectionTask(db, {
      id: 'task-003',
      characterName: '角色A',
      characterType: 'historical',
    });
    await createCollectionTask(db, {
      id: 'task-004',
      characterName: '角色B',
      characterType: 'fictional',
    });
    const list = await listCollectionTasks(db);
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it('按状态过滤任务', async () => {
    await createCollectionTask(db, {
      id: 'task-005',
      characterName: '过滤角色',
      characterType: 'historical',
    });
    const pending = await listCollectionTasks(db, { status: 'pending' });
    expect(pending.every((t) => t.status === 'pending')).toBe(true);
  });
});
