import type { Page } from 'playwright';
import type { ScrapedContent } from '../scraper.js';

// Twitter/X 内容提取器
// 注意：Twitter/X 有登录墙，提取成功率有限
export async function extractTwitter(page: Page): Promise<ScrapedContent | null> {
  const url = page.url();

  // 检查是否有登录墙
  const hasLoginWall = await page.evaluate(() => {
    const wallSelectors = [
      '#layers',
      '[data-testid="loginDialog"]',
      '[data-testid="signupDialog"]',
      '.LoggedOutFallback',
    ];
    return wallSelectors.some((sel) => {
      const el = document.querySelector(sel);
      return el && (el as HTMLElement).offsetHeight > 100;
    });
  });

  if (hasLoginWall) {
    // 尝试从 meta 标签获取基本信息
    return extractTwitterMeta(page);
  }

  // 单条推文页
  if (url.match(/\/status\/\d+/)) {
    return extractTweet(page);
  }

  // 用户主页
  if (url.match(/twitter\.com\/\w+$/) || url.match(/x\.com\/\w+$/)) {
    return extractTwitterProfile(page);
  }

  return extractTwitterMeta(page);
}

async function extractTweet(page: Page): Promise<ScrapedContent | null> {
  try {
    return await page.evaluate(() => {
      // 推文文本内容
      const tweetEl =
        document.querySelector('[data-testid="tweetText"]') ||
        document.querySelector('.tweet-text') ||
        document.querySelector('[lang]');

      if (!tweetEl) return null;

      const content = (tweetEl as HTMLElement).innerText?.trim() || '';

      // 用户名
      const userEl =
        document.querySelector('[data-testid="User-Name"]') || document.querySelector('.username');
      const username = userEl?.textContent?.trim() || '';

      const title = username ? `${username}的推文` : document.title;

      const links: Array<{ text: string; href: string }> = [];
      tweetEl.querySelectorAll('a[href]').forEach((a) => {
        const anchor = a as HTMLAnchorElement;
        const text = anchor.innerText?.trim();
        const href = anchor.href;
        if (text && href) {
          links.push({ text, href });
        }
      });

      return { title, url: location.href, content, links };
    });
  } catch {
    return null;
  }
}

async function extractTwitterProfile(page: Page): Promise<ScrapedContent | null> {
  try {
    return await page.evaluate(() => {
      const bioEl =
        document.querySelector('[data-testid="UserDescription"]') || document.querySelector('.bio');
      const displayNameEl =
        document.querySelector('[data-testid="UserName"]') || document.querySelector('.fullname');
      const name = displayNameEl?.textContent?.trim() || '';
      const bio = bioEl ? (bioEl as HTMLElement).innerText?.trim() : '';

      if (!name && !bio) return null;

      // 获取最近的推文
      const tweetEls = document.querySelectorAll('[data-testid="tweetText"]');
      const tweets: string[] = [];
      tweetEls.forEach((el, i) => {
        if (i >= 5) return;
        const text = (el as HTMLElement).innerText?.trim();
        if (text) tweets.push(text);
      });

      const content = bio
        ? `【简介】${bio}${tweets.length > 0 ? `\n\n【最近推文】\n${tweets.join('\n\n')}` : ''}`
        : tweets.join('\n\n');

      return {
        title: name || document.title,
        url: location.href,
        content,
        links: [],
      };
    });
  } catch {
    return null;
  }
}

// 从 meta 标签提取信息（登录墙降级方案）
async function extractTwitterMeta(page: Page): Promise<ScrapedContent | null> {
  try {
    return await page.evaluate(() => {
      const ogTitle =
        document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
      const ogDesc =
        document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
      const ogImage =
        document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';

      if (!ogTitle && !ogDesc) return null;

      const content = ogDesc ? `${ogTitle}\n\n${ogDesc}` : ogTitle;

      return {
        title: ogTitle || document.title,
        url: location.href,
        content,
        links: [],
      };
    });
  } catch {
    return null;
  }
}
