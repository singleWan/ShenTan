import type { Page } from 'playwright';
import type { ScrapedContent } from '../scraper.js';

// 知乎内容提取器
export async function extractZhihu(page: Page): Promise<ScrapedContent | null> {
  const url = page.url();

  // 知乎问答页
  if (url.includes('/question/')) {
    return extractZhihuAnswer(page);
  }

  // 知乎专栏文章
  if (url.includes('/p/') || url.includes('zhuanlan.zhihu.com')) {
    return extractZhihuArticle(page);
  }

  // 知乎首页/搜索等
  return extractZhihuGeneral(page);
}

async function extractZhihuAnswer(page: Page): Promise<ScrapedContent | null> {
  try {
    return await page.evaluate(() => {
      // 问题标题
      const questionEl =
        document.querySelector('.QuestionHeader-title') ||
        document.querySelector('h1.QuestionHeaderTitle');
      const questionTitle = questionEl?.textContent?.trim() || '';

      // 获取所有回答
      const answerEls = document.querySelectorAll('.AnswerItem .RichContent-inner');
      const answers: string[] = [];

      answerEls.forEach((el, i) => {
        if (i >= 5) return; // 最多取 5 个回答
        const authorEl = el.closest('.AnswerItem')?.querySelector('.AuthorInfo-name');
        const author = authorEl?.textContent?.trim() || `匿名用户`;
        const content = (el as HTMLElement).innerText?.trim() || '';
        if (content) {
          answers.push(`【${author}的回答】\n${content.substring(0, 2000)}`);
        }
      });

      if (answers.length === 0 && !questionTitle) return null;

      const links: Array<{ text: string; href: string }> = [];
      document.querySelectorAll('.ContentItem a[href]').forEach((a) => {
        const anchor = a as HTMLAnchorElement;
        const text = anchor.innerText?.trim();
        const href = anchor.href;
        if (text && href && text.length < 100) {
          links.push({ text, href });
        }
      });

      return {
        title: questionTitle || document.title,
        url: location.href,
        content: answers.length > 0 ? answers.join('\n\n---\n\n') : questionTitle,
        links,
      };
    });
  } catch {
    return null;
  }
}

async function extractZhihuArticle(page: Page): Promise<ScrapedContent | null> {
  try {
    return await page.evaluate(() => {
      const titleEl =
        document.querySelector('.Post-Title') || document.querySelector('h1.PostTitle');
      const title = titleEl?.textContent?.trim() || document.title;

      const contentEl =
        document.querySelector('.Post-RichTextContainer') ||
        document.querySelector('.RichText') ||
        document.querySelector('.RichContent-inner');

      if (!contentEl) return null;

      const content = (contentEl as HTMLElement).innerText?.trim() || '';

      const authorEl = document.querySelector('.AuthorInfo-name');
      const author = authorEl?.textContent?.trim() || '';

      const links: Array<{ text: string; href: string }> = [];
      contentEl.querySelectorAll('a[href]').forEach((a) => {
        const anchor = a as HTMLAnchorElement;
        const text = anchor.innerText?.trim();
        const href = anchor.href;
        if (text && href && text.length < 100) {
          links.push({ text, href });
        }
      });

      return {
        title: author ? `${title} - ${author}` : title,
        url: location.href,
        content: content.substring(0, 30000),
        links,
      };
    });
  } catch {
    return null;
  }
}

async function extractZhihuGeneral(page: Page): Promise<ScrapedContent | null> {
  try {
    return await page.evaluate(() => {
      const title = document.title;
      const contentEl =
        document.querySelector('.RichContent-inner') ||
        document.querySelector('.RichText') ||
        document.querySelector('main');

      if (!contentEl) return null;

      return {
        title,
        url: location.href,
        content: (contentEl as HTMLElement).innerText?.trim() || title,
        links: [],
      };
    });
  } catch {
    return null;
  }
}
