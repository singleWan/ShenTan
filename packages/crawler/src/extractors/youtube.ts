import type { Page } from 'playwright';
import type { ScrapedContent } from '../scraper.js';

// YouTube 内容提取器
// 提取视频标题、描述、评论
export async function extractYouTube(page: Page): Promise<ScrapedContent | null> {
  const url = page.url();

  // 视频页
  if (url.includes('/watch') || url.includes('youtu.be/')) {
    return extractYouTubeVideo(page);
  }

  // 频道页
  if (url.includes('/channel/') || url.includes('/@') || url.includes('/c/')) {
    return extractYouTubeChannel(page);
  }

  return extractYouTubeGeneral(page);
}

async function extractYouTubeVideo(page: Page): Promise<ScrapedContent | null> {
  try {
    // 等待视频描述展开
    await page
      .waitForSelector('#title h1 yt-formatted-string, h1.ytd-watch-metadata', {
        timeout: 5000,
      })
      .catch(() => {});

    return await page.evaluate(() => {
      // 视频标题
      const titleEl =
        document.querySelector('#title h1 yt-formatted-string') ||
        document.querySelector('h1.ytd-watch-metadata') ||
        document.querySelector('h1');
      const title = titleEl?.textContent?.trim() || '';

      // 频道名
      const channelEl =
        document.querySelector('#upload-info ytd-channel-name a') ||
        document.querySelector('ytd-channel-name a');
      const channel = channelEl?.textContent?.trim() || '';

      // 视频描述
      const descEl =
        document.querySelector('#description-inner') ||
        document.querySelector('#description .content');
      const desc = descEl ? (descEl as HTMLElement).innerText?.trim() : '';

      // 评论
      const commentEls = document.querySelectorAll('ytd-comment-thread-renderer #content-text');
      const comments: string[] = [];
      commentEls.forEach((el, i) => {
        if (i >= 10) return;
        const authorEl = el.closest('ytd-comment-renderer')?.querySelector('#author-text');
        const author = authorEl?.textContent?.trim() || '';
        const text = (el as HTMLElement).innerText?.trim() || '';
        if (text) {
          comments.push(`[${author}]: ${text.substring(0, 500)}`);
        }
      });

      let content = '';
      if (desc) content += `【描述】\n${desc}\n\n`;
      if (comments.length > 0) content += `【评论】\n${comments.join('\n\n')}`;
      if (!content) content = title;

      return {
        title: channel ? `${title} - ${channel}` : title,
        url: location.href,
        content: content.substring(0, 30000),
        links: [],
      };
    });
  } catch {
    return null;
  }
}

async function extractYouTubeChannel(page: Page): Promise<ScrapedContent | null> {
  try {
    return await page.evaluate(() => {
      const channelNameEl =
        document.querySelector('#channel-name yt-formatted-string') ||
        document.querySelector('ytd-channel-name');
      const name = channelNameEl?.textContent?.trim() || '';

      const descEl = document.querySelector('#description');
      const desc = descEl ? (descEl as HTMLElement).innerText?.trim() : '';

      if (!name && !desc) return null;

      return {
        title: name || document.title,
        url: location.href,
        content: desc || name,
        links: [],
      };
    });
  } catch {
    return null;
  }
}

async function extractYouTubeGeneral(page: Page): Promise<ScrapedContent | null> {
  try {
    return await page.evaluate(() => {
      const title = document.title;

      const descEl = document.querySelector('meta[name="description"]');
      const desc = descEl?.getAttribute('content') || '';

      return {
        title,
        url: location.href,
        content: desc || title,
        links: [],
      };
    });
  } catch {
    return null;
  }
}
