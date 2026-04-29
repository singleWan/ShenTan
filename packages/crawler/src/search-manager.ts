import type { SearchEngine, SearchResult, SearchOptions } from './search-engine.js';
import { DuckDuckGoSearchEngine } from './search.js';
import { SearXNGSearchEngine } from './searxng.js';

interface CacheEntry {
  results: SearchResult[];
  timestamp: number;
}

const PLATFORM_SITE_MAP: Record<string, string[]> = {
  twitter: ['twitter.com', 'x.com'],
  weibo: ['weibo.com', 'm.weibo.cn'],
  facebook: ['facebook.com'],
  instagram: ['instagram.com'],
  youtube: ['youtube.com', 'youtu.be'],
  zhihu: ['zhihu.com'],
  reddit: ['reddit.com', 'old.reddit.com'],
  bilibili: ['bilibili.com'],
};

// 多分类搜索的默认分类组合
const BROAD_CATEGORIES = ['general', 'news', 'social media'];

export class SearchEngineManager {
  private primary: SearchEngine;
  private fallback: SearchEngine | null;
  private cache: Map<string, CacheEntry> = new Map();
  private cacheTTL: number;
  private maxCacheSize = 200;

  constructor(primary: SearchEngine, fallback?: SearchEngine, cacheTTL = 1800_000) {
    this.primary = primary;
    this.fallback = fallback ?? null;
    this.cacheTTL = cacheTTL;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const cacheKey = this.cacheKey(query, options);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const results = await this.executeWithFallback(query, options);
    this.putCache(cacheKey, results);
    return results;
  }

  /**
   * 多页搜索：利用 SearXNG pagenumber 参数获取更多结果
   */
  async searchWithPages(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const cacheKey = `pages:${this.cacheKey(query, options)}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    if (this.primary instanceof SearXNGSearchEngine) {
      try {
        const results = await this.primary.searchWithPages(query, {
          ...options,
          pageCount: options?.pageCount ?? 5,
          relevantKeywords: options?.relevantKeywords,
        });
        this.putCache(cacheKey, results);
        return results;
      } catch {
        // fallback
      }
    }

    // 非 SearXNG 引擎：多次搜索模拟分页
    const results = await this.executeWithFallback(query, options);
    this.putCache(cacheKey, results);
    return results;
  }

  /**
   * 多分类并行搜索：同时搜索 general + news + social media
   */
  async searchMultiCategory(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const cacheKey = `multi:${this.cacheKey(query, options)}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    if (this.primary instanceof SearXNGSearchEngine) {
      try {
        const categories = options?.categories ?? BROAD_CATEGORIES;
        const results = await this.primary.searchCategories(query, categories, options);
        this.putCache(cacheKey, results);
        return results;
      } catch {
        // fallback to parallel manual search
      }
    }

    // 非 SearXNG：并行搜索每个分类
    const tasks: Promise<SearchResult[]>[] = [];
    for (const category of BROAD_CATEGORIES) {
      if (category === 'social media') {
        tasks.push(this.searchSocialMedia(query));
      } else {
        tasks.push(this.search(query, { ...options, categories: [category] }));
      }
    }

    const settled = await Promise.allSettled(tasks);
    const allResults: SearchResult[] = [];
    for (const result of settled) {
      if (result.status === 'fulfilled') allResults.push(...result.value);
    }

    const deduped = this.deduplicate(allResults);
    this.putCache(cacheKey, deduped);
    return deduped;
  }

  async searchSocialMedia(query: string, platform?: string): Promise<SearchResult[]> {
    const cacheKey = `social:${query}|${platform ?? 'all'}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const searchTasks: Promise<SearchResult[]>[] = [];

    // SearXNG social media category
    searchTasks.push(this.search(query, { categories: ['social media'], maxResults: 10 }));

    // Platform-specific site: searches via general search
    if (platform && PLATFORM_SITE_MAP[platform]) {
      const sites = PLATFORM_SITE_MAP[platform];
      for (const site of sites) {
        searchTasks.push(this.search(`${query} site:${site}`, { maxResults: 10 }));
      }
    } else if (!platform) {
      const topPlatforms = ['twitter.com', 'weibo.com', 'facebook.com', 'reddit.com', 'zhihu.com'];
      for (const site of topPlatforms) {
        searchTasks.push(this.search(`${query} site:${site}`, { maxResults: 5 }));
      }
    }

    // 并行执行所有搜索
    const settled = await Promise.allSettled(searchTasks);
    const allResults: SearchResult[] = [];
    for (const result of settled) {
      if (result.status === 'fulfilled') allResults.push(...result.value);
    }

    const deduped = this.deduplicate(allResults);
    this.putCache(cacheKey, deduped);
    return deduped;
  }

  clearCache(): void {
    this.cache.clear();
  }

  private deduplicate(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    return results.filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });
  }

  private async executeWithFallback(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    if (await this.primary.isAvailable()) {
      try {
        return await this.primary.search(query, options);
      } catch {
        // Fall through to fallback
      }
    }

    if (this.fallback && (await this.fallback.isAvailable())) {
      return this.fallback.search(query, options);
    }

    // Last resort: try primary without availability check
    try {
      return await this.primary.search(query, options);
    } catch {
      if (this.fallback) {
        return this.fallback.search(query, options);
      }
      return [];
    }
  }

  private cacheKey(query: string, options?: SearchOptions): string {
    const opts = options ?? {};
    return `${query}|${opts.categories?.join(',') ?? ''}|${opts.engines?.join(',') ?? ''}|${opts.language ?? ''}|${opts.timeRange ?? ''}|${opts.maxResults ?? 10}|${opts.pagenumber ?? 1}|${opts.pageCount ?? 1}`;
  }

  private getFromCache(key: string): SearchResult[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }
    return entry.results;
  }

  private putCache(key: string, results: SearchResult[]): void {
    if (this.cache.size >= this.maxCacheSize) {
      const oldest = [...this.cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      if (oldest) this.cache.delete(oldest[0]);
    }
    this.cache.set(key, { results, timestamp: Date.now() });
  }
}

// 默认管理器单例（SearXNG 主 + DuckDuckGo 备选）
let defaultManager: SearchEngineManager | null = null;

export function getDefaultSearchManager(searxngUrl = 'http://localhost:8080'): SearchEngineManager {
  if (!defaultManager) {
    const searxng = new SearXNGSearchEngine(searxngUrl);
    const ddg = new DuckDuckGoSearchEngine();
    defaultManager = new SearchEngineManager(searxng, ddg);
  }
  return defaultManager;
}

export async function searchSocialMedia(query: string, platform?: string): Promise<SearchResult[]> {
  return getDefaultSearchManager().searchSocialMedia(query, platform);
}
