import type { Page } from 'playwright';
import type { ScrapedContent } from '../scraper.js';
import type { SocialPlatform } from '../platform.js';
import { extractWeibo } from './weibo.js';
import { extractZhihu } from './zhihu.js';
import { extractReddit } from './reddit.js';
import { extractTwitter } from './twitter.js';
import { extractYouTube } from './youtube.js';

// 有专用提取器的平台集合
const PLATFORMS_WITH_EXTRACTOR: Set<SocialPlatform> = new Set([
  'weibo',
  'zhihu',
  'reddit',
  'twitter',
  'youtube',
]);

// 提取器函数映射
const EXTRACTORS: Partial<Record<SocialPlatform, (page: Page) => Promise<ScrapedContent | null>>> =
  {
    weibo: extractWeibo,
    zhihu: extractZhihu,
    reddit: extractReddit,
    twitter: extractTwitter,
    youtube: extractYouTube,
  };

// 根据平台调用对应的提取器
export async function extractByPlatform(
  page: Page,
  platform: SocialPlatform,
): Promise<ScrapedContent | null> {
  const extractor = EXTRACTORS[platform];
  if (!extractor) return null;

  try {
    return await extractor(page);
  } catch {
    return null;
  }
}

// 检查平台是否有专用提取器
export function hasExtractor(platform: SocialPlatform): boolean {
  return PLATFORMS_WITH_EXTRACTOR.has(platform);
}
