import type { Page } from 'playwright';
import type { ScrapedContent } from '../scraper.js';

// 微博内容提取器
// 优先使用 m.weibo.cn 移动版，DOM 更简洁
export async function extractWeibo(page: Page): Promise<ScrapedContent | null> {
  const url = page.url();

  // 移动版 m.weibo.cn
  if (url.includes('m.weibo.cn')) {
    return extractMobileWeibo(page);
  }

  // 桌面版 weibo.com
  return extractDesktopWeibo(page);
}

async function extractMobileWeibo(page: Page): Promise<ScrapedContent | null> {
  try {
    return await page.evaluate(() => {
      // m.weibo.cn/detail/ 页面结构
      const contentEl =
        document.querySelector('.weibo-text') ||
        document.querySelector('.content .weibo-detail') ||
        document.querySelector('.card-wrap .content') ||
        document.querySelector('.main-content');

      if (!contentEl) return null;

      const title = document.title || '微博';
      const content = (contentEl as HTMLElement).innerText?.trim() || '';

      // 提取用户名
      const userEl =
        document.querySelector('.m-text-box .m-text-cut a') ||
        document.querySelector('.weibo-top .m-text-cut');
      const username = userEl?.textContent?.trim() || '';

      const links: Array<{ text: string; href: string }> = [];
      contentEl.querySelectorAll('a[href]').forEach((a) => {
        const anchor = a as HTMLAnchorElement;
        const text = anchor.innerText?.trim();
        const href = anchor.href;
        if (text && href && !href.startsWith('javascript:')) {
          links.push({ text, href });
        }
      });

      return {
        title: username ? `@${username}的微博` : title,
        url: location.href,
        content: content || title,
        links,
      };
    });
  } catch {
    return null;
  }
}

async function extractDesktopWeibo(page: Page): Promise<ScrapedContent | null> {
  try {
    return await page.evaluate(() => {
      // weibo.com 桌面版帖子
      const contentEl =
        document.querySelector('.WB_text') ||
        document.querySelector('.weibo-text') ||
        document.querySelector('.txt') ||
        document.querySelector('[node-type="feed_list_content"]');

      if (!contentEl) return null;

      const title = document.title || '微博';
      const content = (contentEl as HTMLElement).innerText?.trim() || '';

      const userEl =
        document.querySelector('.W_fb .W_autocut') || document.querySelector('.name .W_autocut');
      const username = userEl?.getAttribute('title') || userEl?.textContent?.trim() || '';

      const links: Array<{ text: string; href: string }> = [];
      contentEl.querySelectorAll('a[href]').forEach((a) => {
        const anchor = a as HTMLAnchorElement;
        const text = anchor.innerText?.trim();
        const href = anchor.href;
        if (text && href && !href.startsWith('javascript:')) {
          links.push({ text, href });
        }
      });

      return {
        title: username ? `@${username}的微博` : title,
        url: location.href,
        content: content || title,
        links,
      };
    });
  } catch {
    return null;
  }
}
