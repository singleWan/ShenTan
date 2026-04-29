import { describe, it, expect } from 'vitest';
import { detectPlatform, getScrapableUrl, isSocialMediaUrl } from './platform.js';
import { SearXNGSearchEngine } from './searxng.js';

// --- 平台检测 ---
describe('detectPlatform', () => {
  it('检测 Twitter/X', () => {
    expect(detectPlatform('https://twitter.com/user/status/123')).toBe('twitter');
    expect(detectPlatform('https://x.com/user/status/456')).toBe('twitter');
  });

  it('检测微博', () => {
    expect(detectPlatform('https://weibo.com/123/abc')).toBe('weibo');
    expect(detectPlatform('https://m.weibo.cn/detail/abc')).toBe('weibo');
  });

  it('检测 Reddit', () => {
    expect(detectPlatform('https://www.reddit.com/r/test')).toBe('reddit');
    expect(detectPlatform('https://old.reddit.com/r/test')).toBe('reddit');
  });

  it('检测知乎', () => {
    expect(detectPlatform('https://www.zhihu.com/question/123')).toBe('zhihu');
  });

  it('检测 B站', () => {
    expect(detectPlatform('https://www.bilibili.com/video/BV123')).toBe('bilibili');
  });

  it('非社交媒体返回 null', () => {
    expect(detectPlatform('https://zh.wikipedia.org/wiki/Test')).toBeNull();
    expect(detectPlatform('https://example.com')).toBeNull();
  });

  it('无效 URL 返回 null', () => {
    expect(detectPlatform('not-a-url')).toBeNull();
  });
});

describe('getScrapableUrl', () => {
  it('Reddit 转换为 old.reddit.com', () => {
    expect(getScrapableUrl('https://www.reddit.com/r/test')).toBe(
      'https://old.reddit.com/r/test',
    );
  });

  it('已是 old.reddit.com 不变', () => {
    expect(getScrapableUrl('https://old.reddit.com/r/test')).toBe(
      'https://old.reddit.com/r/test',
    );
  });

  it('微博转换为移动版', () => {
    const result = getScrapableUrl('https://weibo.com/123/abc456');
    expect(result).toContain('m.weibo.cn');
  });

  it('无转换规则返回原 URL', () => {
    expect(getScrapableUrl('https://example.com/page')).toBe('https://example.com/page');
  });
});

describe('isSocialMediaUrl', () => {
  it('社交媒体 URL 返回 true', () => {
    expect(isSocialMediaUrl('https://twitter.com/user')).toBe(true);
    expect(isSocialMediaUrl('https://weibo.com/123')).toBe(true);
  });

  it('非社交媒体返回 false', () => {
    expect(isSocialMediaUrl('https://zh.wikipedia.org')).toBe(false);
  });
});

// --- SearXNG 响应解析 ---
describe('SearXNGSearchEngine', () => {
  it('构造时去除尾部斜杠', () => {
    const engine = new SearXNGSearchEngine('http://localhost:8080///');
    expect((engine as unknown as { baseUrl: string }).baseUrl).toBe('http://localhost:8080');
  });

  it('不可用服务返回 false', async () => {
    const engine = new SearXNGSearchEngine('http://localhost:1');
    const available = await engine.isAvailable();
    expect(available).toBe(false);
  });

  it('不可用服务搜索抛出错误', async () => {
    const engine = new SearXNGSearchEngine('http://localhost:1');
    await expect(engine.search('test')).rejects.toThrow();
  });
});
