import type { SearchEngine, SearchResult, SearchOptions } from './search-engine.js';

interface SearXNGResult {
  url: string;
  title: string;
  content: string;
  engine?: string;
  engines?: string[];
  publishedDate?: string;
  category?: string;
}

interface SearXNGResponse {
  results: SearXNGResult[];
  number_of_results?: number;
  unresponsive_engines?: [string, string][];
}

export class SearXNGSearchEngine implements SearchEngine {
  readonly name = 'SearXNG';
  private baseUrl: string;
  private lastRequestTime = 0;
  private minInterval: number;

  constructor(baseUrl: string, minInterval = 2000) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.minInterval = minInterval;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    return this.singlePageSearch(query, options);
  }

  /**
   * 多页搜索：自动翻页聚合结果，支持关联性早停
   * 逐页对结果进行关键词匹配评分，如果当前页关联度低于阈值则停止翻页
   */
  async searchWithPages(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const pageCount = options?.pageCount ?? 2;
    const maxResults = options?.maxResults ?? 20;
    const keywords = options?.relevantKeywords ?? [];
    const allResults: SearchResult[] = [];
    const seenUrls = new Set<string>();
    let consecutiveWeakPages = 0;
    const MAX_WEAK_PAGES = 2;

    for (let page = 1; page <= pageCount; page++) {
      const pageResults = await this.singlePageSearch(query, {
        ...options,
        pagenumber: page,
        maxResults: 15,
      });

      // 无结果直接停止
      if (pageResults.length === 0) break;

      // 逐页关联性评估
      if (keywords.length > 0) {
        const relevanceScore = this.scorePageRelevance(pageResults, keywords);
        if (relevanceScore < 0.15) {
          consecutiveWeakPages++;
          if (consecutiveWeakPages >= MAX_WEAK_PAGES) break;
        } else {
          consecutiveWeakPages = 0;
        }
      }

      for (const r of pageResults) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allResults.push(r);
        }
      }

      if (allResults.length >= maxResults) break;
    }

    return allResults.slice(0, maxResults);
  }

  /**
   * 评估一页结果的关联性得分 (0~1)
   * 基于关键词在 title 和 snippet 中的匹配率
   */
  private scorePageRelevance(results: SearchResult[], keywords: string[]): number {
    if (keywords.length === 0 || results.length === 0) return 1;

    let matchedResults = 0;
    const lowerKeywords = keywords.map((k) => k.toLowerCase());

    for (const r of results) {
      const text = `${r.title} ${r.snippet}`.toLowerCase();
      const hasMatch = lowerKeywords.some((kw) => text.includes(kw));
      if (hasMatch) matchedResults++;
    }

    return matchedResults / results.length;
  }

  /**
   * 多分类并行搜索
   */
  async searchCategories(
    query: string,
    categories: string[],
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    const tasks = categories.map((cat) =>
      this.singlePageSearch(query, { ...options, categories: [cat], maxResults: 10 }),
    );

    const settled = await Promise.allSettled(tasks);
    const allResults: SearchResult[] = [];
    const seenUrls = new Set<string>();

    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      for (const r of result.value) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allResults.push(r);
        }
      }
    }

    const maxResults = options?.maxResults ?? 30;
    return allResults.slice(0, maxResults);
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/healthz`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      try {
        const response = await fetch(`${this.baseUrl}/?format=json&q=test`, {
          signal: AbortSignal.timeout(5000),
        });
        return response.ok;
      } catch {
        return false;
      }
    }
  }

  private async singlePageSearch(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    await this.throttle();

    const params = new URLSearchParams({
      q: query,
      format: 'json',
    });

    if (options?.categories?.length) {
      params.set('categories', options.categories.join(','));
    }
    if (options?.engines?.length) {
      params.set('engines', options.engines.join(','));
    }
    if (options?.language) {
      params.set('language', options.language);
    }
    if (options?.timeRange) {
      params.set('time_range', options.timeRange);
    }
    if (options?.pagenumber && options.pagenumber > 1) {
      params.set('pagenumber', String(options.pagenumber));
    }

    const maxResults = options?.maxResults ?? 10;

    try {
      const response = await fetch(`${this.baseUrl}/search?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(`SearXNG returned ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as SearXNGResponse;
      return (data.results ?? []).slice(0, maxResults).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content ?? '',
        engine: r.engines?.join(',') ?? r.engine,
        publishedDate: r.publishedDate,
      }));
    } catch (error) {
      const msg = (error as Error).message;
      if (msg.includes('fetch') || msg.includes('ECONNREFUSED')) {
        throw new Error(`SearXNG unavailable at ${this.baseUrl}: ${msg}`, { cause: error });
      }
      throw error;
    }
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minInterval) {
      await new Promise((resolve) => setTimeout(resolve, this.minInterval - elapsed));
    }
    this.lastRequestTime = Date.now();
  }
}
