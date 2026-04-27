import { createPage, closeBrowser } from './browser.js';
import { detectPlatform, getScrapableUrl } from './platform.js';
import { extractByPlatform } from './extractors/index.js';

export interface ScrapedContent {
  title: string;
  url: string;
  content: string;
  links: Array<{ text: string; href: string }>;
}

// 从页面提取正文内容（通用逻辑）
async function extractContent(page: import('playwright').Page): Promise<ScrapedContent> {
  return page.evaluate(() => {
    const removeSelectors = [
      'nav', 'header', 'footer', 'aside',
      '.sidebar', '.ad', '.advertisement', '.nav',
      '.menu', '.footer', '.header',
      '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
      'script', 'style', 'noscript',
    ];
    for (const sel of removeSelectors) {
      document.querySelectorAll(sel).forEach(el => el.remove());
    }

    const mainSelectors = [
      'article', 'main', '.article-content', '.post-content',
      '.entry-content', '.content', '#content', '.wiki-content',
      '.mw-parser-output', '#mw-content-text',
    ];
    let mainEl: HTMLElement | null = null;
    for (const sel of mainSelectors) {
      mainEl = document.querySelector(sel);
      if (mainEl) break;
    }
    if (!mainEl) mainEl = document.body;

    const title = document.title || '';
    const content = mainEl.innerText?.trim() || '';

    const links: Array<{ text: string; href: string }> = [];
    mainEl.querySelectorAll('a[href]').forEach((a) => {
      const anchor = a as HTMLAnchorElement;
      const text = anchor.innerText?.trim();
      const href = anchor.href;
      if (text && href && !href.startsWith('javascript:') && text.length < 100) {
        links.push({ text, href });
      }
    });

    return { title, url: location.href, content, links };
  });
}

// 爬取单个页面，集成平台专用提取器
export async function scrapePage(url: string, timeout = 30000): Promise<ScrapedContent> {
  const platform = detectPlatform(url);
  const scrapableUrl = platform ? getScrapableUrl(url) : url;

  const { page, context } = await createPage();
  try {
    // 社交媒体页面可能需要更长等待时间
    const waitStrategy = platform ? 'networkidle' : 'domcontentloaded';
    await page.goto(scrapableUrl, { timeout, waitUntil: waitStrategy });

    if (platform) {
      // 社交媒体页面等待动态内容加载
      await page.waitForTimeout(2000);
    } else {
      await page.waitForTimeout(1000);
    }

    // 降级链：平台专用提取 → 通用提取
    let result: ScrapedContent | null = null;

    if (platform) {
      result = await extractByPlatform(page, platform);
    }

    if (!result) {
      result = await extractContent(page);
    }

    result.url = url; // 始终返回原始 URL

    if (result.content.length > 50000) {
      result.content = result.content.substring(0, 50000) + '\n... (内容已截断)';
    }
    return result;
  } finally {
    await context.close();
  }
}

// 批量爬取页面
export async function scrapePages(urls: string[], concurrency = 2): Promise<ScrapedContent[]> {
  const results: ScrapedContent[] = [];
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(url => scrapePage(url))
    );
    for (const r of batchResults) {
      if (r.status === 'fulfilled') results.push(r.value);
    }
  }
  return results;
}

export { closeBrowser };
