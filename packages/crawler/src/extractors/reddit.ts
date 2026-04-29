import type { Page } from 'playwright';
import type { ScrapedContent } from '../scraper.js';

// Reddit 内容提取器
// 使用 old.reddit.com 获取更简洁的 HTML
export async function extractReddit(page: Page): Promise<ScrapedContent | null> {
  const url = page.url();

  // 评论页
  if (url.includes('/comments/')) {
    return extractRedditComments(page);
  }

  // 子版块或首页
  return extractRedditListing(page);
}

async function extractRedditComments(page: Page): Promise<ScrapedContent | null> {
  try {
    return await page.evaluate(() => {
      // old.reddit.com 帖子标题
      const titleEl =
        document.querySelector('.thing.link a.title') ||
        document.querySelector('a.title') ||
        document.querySelector('[data-testid="post-title"]');
      const title = titleEl?.textContent?.trim() || document.title;

      // 帖子正文
      const selfTextEl =
        document.querySelector('.thing.link .expando .usertext-body') ||
        document.querySelector('.usertext-body .md');

      let content = '';

      // old.reddit.com 格式
      const commentEls = document.querySelectorAll('.comment .usertext-body .md');
      if (commentEls.length > 0) {
        const comments: string[] = [];
        commentEls.forEach((el, i) => {
          if (i >= 10) return;
          const authorEl = el.closest('.comment')?.querySelector('.author');
          const author = authorEl?.textContent?.trim() || 'unknown';
          const text = (el as HTMLElement).innerText?.trim() || '';
          if (text) {
            comments.push(`[${author}]: ${text.substring(0, 1000)}`);
          }
        });
        content = comments.join('\n\n');
      }

      // 如果有帖子正文，加在最前面
      if (selfTextEl) {
        const postContent = (selfTextEl as HTMLElement).innerText?.trim() || '';
        if (postContent) {
          content = `【帖子内容】\n${postContent}\n\n【评论】\n${content}`;
        }
      }

      if (!content) content = title;

      const links: Array<{ text: string; href: string }> = [];
      document.querySelectorAll('.usertext-body a[href]').forEach((a) => {
        const anchor = a as HTMLAnchorElement;
        const text = anchor.innerText?.trim();
        const href = anchor.href;
        if (text && href && text.length < 100) {
          links.push({ text, href });
        }
      });

      return { title, url: location.href, content: content.substring(0, 30000), links };
    });
  } catch {
    return null;
  }
}

async function extractRedditListing(page: Page): Promise<ScrapedContent | null> {
  try {
    return await page.evaluate(() => {
      const title = document.title;

      // old.reddit.com 帖子列表
      const postEls = document.querySelectorAll('.thing.link');
      const posts: string[] = [];

      postEls.forEach((el, i) => {
        if (i >= 15) return;
        const titleEl = el.querySelector('a.title');
        const scoreEl = el.querySelector('.score.unvoted');
        const postTitle = titleEl?.textContent?.trim() || '';
        const score = scoreEl?.textContent?.trim() || '0';
        if (postTitle) {
          posts.push(`[${score}分] ${postTitle}`);
        }
      });

      if (posts.length === 0) return null;

      return {
        title,
        url: location.href,
        content: posts.join('\n'),
        links: [],
      };
    });
  } catch {
    return null;
  }
}
