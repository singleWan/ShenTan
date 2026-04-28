import { createPage } from './browser.js';
import type { SearchEngine, SearchResult, SearchOptions } from './search-engine.js';
import { withRetry } from '@shentan/core';

export type { SearchResult } from './search-engine.js';

const TIME_RANGE_MAP: Record<string, string> = {
  day: 'd',
  week: 'w',
  month: 'm',
  year: 'y',
};

const SEARCH_RETRY_CONFIG = { maxRetries: 2, baseDelay: 3000, maxDelay: 20000 };

export class DuckDuckGoSearchEngine implements SearchEngine {
  readonly name = 'DuckDuckGo';

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    try {
      return await withRetry(async () => {
        const maxResults = options?.maxResults ?? 10;
        const { page, context } = await createPage();
        try {
          const params = new URLSearchParams({ q: query });
          if (options?.timeRange && TIME_RANGE_MAP[options.timeRange]) {
            params.set('df', TIME_RANGE_MAP[options.timeRange]);
          }

          await page.goto(`https://html.duckduckgo.com/html/?${params.toString()}`, {
            timeout: 15000,
            waitUntil: 'domcontentloaded',
          });
          await page.waitForTimeout(1000);

          const results = await page.evaluate(() => {
            const items: Array<{ title: string; url: string; snippet: string }> = [];
            document.querySelectorAll('.result').forEach((el) => {
              const titleEl = el.querySelector('.result__title a, .result__a');
              const snippetEl = el.querySelector('.result__snippet');
              if (titleEl) {
                const title = titleEl.textContent?.trim() || '';
                let url = titleEl.getAttribute('href') || '';
                if (url.startsWith('//duckduckgo.com/l/')) {
                  try {
                    const params = new URL(url.startsWith('//') ? `https:${url}` : url);
                    url = params.searchParams.get('uddg') || url;
                  } catch {}
                }
                const snippet = snippetEl?.textContent?.trim() || '';
                if (title && url) {
                  items.push({ title, url, snippet });
                }
              }
            });
            return items;
          });

          return results.slice(0, maxResults);
        } finally {
          await context.close();
        }
      }, SEARCH_RETRY_CONFIG);
    } catch {
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const { page, context } = await createPage();
      try {
        await page.goto('https://html.duckduckgo.com/', { timeout: 10000 });
        return true;
      } finally {
        await context.close();
      }
    } catch {
      return false;
    }
  }
}

// 向后兼容的函数导出
const ddgEngine = new DuckDuckGoSearchEngine();

export async function webSearch(query: string, maxResultsOrOptions?: number | SearchOptions): Promise<SearchResult[]> {
  const options = typeof maxResultsOrOptions === 'number'
    ? { maxResults: maxResultsOrOptions }
    : maxResultsOrOptions ?? {};
  return ddgEngine.search(query, options);
}

export async function searchAndSummarize(query: string, maxPages = 3): Promise<{
  results: SearchResult[];
  pages: Array<{ title: string; url: string; content: string }>;
}> {
  const results = await webSearch(query);
  const topResults = results.slice(0, maxPages);

  const pages: Array<{ title: string; url: string; content: string }> = [];
  for (const result of topResults) {
    try {
      const { scrapePage } = await import('./scraper.js');
      const scraped = await scrapePage(result.url);
      pages.push({
        title: scraped.title,
        url: scraped.url,
        content: scraped.content.substring(0, 10000),
      });
    } catch {
      // 跳过失败页面
    }
  }

  return { results, pages };
}
