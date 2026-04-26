import { createPage, closeBrowser } from './browser.js';

export interface ScrapedContent {
  title: string;
  url: string;
  content: string;
  links: Array<{ text: string; href: string }>;
}

// 从页面提取正文内容
async function extractContent(page: import('playwright').Page): Promise<ScrapedContent> {
  return page.evaluate(() => {
    // 移除导航、侧栏、广告等无关元素
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

    // 尝试找到主要内容区域
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

    // 提取链接
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

// 爬取单个页面
export async function scrapePage(url: string, timeout = 30000): Promise<ScrapedContent> {
  const { page, context } = await createPage();
  try {
    await page.goto(url, { timeout, waitUntil: 'domcontentloaded' });
    // 等待主要内容加载
    await page.waitForTimeout(1000);
    const result = await extractContent(page);
    result.url = url;
    // 截断过长内容
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
