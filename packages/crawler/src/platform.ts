// 平台标识符
export type SocialPlatform =
  | 'twitter'
  | 'weibo'
  | 'facebook'
  | 'instagram'
  | 'reddit'
  | 'youtube'
  | 'zhihu'
  | 'bilibili';

// URL 模式到平台的映射
const PLATFORM_RULES: Array<{
  platform: SocialPlatform;
  patterns: RegExp[];
  mobileTransform?: (url: URL) => string;
}> = [
  {
    platform: 'twitter',
    patterns: [/^twitter\.com$/, /^x\.com$/],
  },
  {
    platform: 'weibo',
    patterns: [/^weibo\.com$/, /^m\.weibo\.cn$/, /^weibo\.cn$/],
    mobileTransform: (url) => {
      // weibo.com -> m.weibo.cn
      if (url.hostname === 'weibo.com') {
        const match = url.pathname.match(/\/(\d+)\/(\w+)/);
        if (match) return `https://m.weibo.cn/detail/${match[2]}`;
        const statusMatch = url.pathname.match(/\/status\/(\w+)/);
        if (statusMatch) return `https://m.weibo.cn/detail/${statusMatch[1]}`;
      }
      return url.href;
    },
  },
  {
    platform: 'facebook',
    patterns: [/^facebook\.com$/, /^m\.facebook\.com$/],
  },
  {
    platform: 'instagram',
    patterns: [/^instagram\.com$/],
  },
  {
    platform: 'reddit',
    patterns: [/^reddit\.com$/, /^www\.reddit\.com$/, /^old\.reddit\.com$/],
    mobileTransform: (url) => {
      // www.reddit.com -> old.reddit.com（更适合爬取）
      if (url.hostname !== 'old.reddit.com') {
        return url.href.replace(/^(https?:\/\/)(www\.)?reddit\.com/, '$1old.reddit.com');
      }
      return url.href;
    },
  },
  {
    platform: 'youtube',
    patterns: [/^youtube\.com$/, /^youtu\.be$/],
  },
  {
    platform: 'zhihu',
    patterns: [/^zhihu\.com$/, /^www\.zhihu\.com$/],
  },
  {
    platform: 'bilibili',
    patterns: [/^bilibili\.com$/, /^www\.bilibili\.com$/],
  },
];

// 从 URL 检测社交媒体平台
export function detectPlatform(url: string): SocialPlatform | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    for (const rule of PLATFORM_RULES) {
      if (rule.patterns.some((p) => p.test(hostname))) {
        return rule.platform;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// 获取适合爬取的 URL 版本（移动版或简化版）
export function getScrapableUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    for (const rule of PLATFORM_RULES) {
      if (rule.patterns.some((p) => p.test(hostname))) {
        if (rule.mobileTransform) {
          return rule.mobileTransform(parsed);
        }
        break;
      }
    }
    return url;
  } catch {
    return url;
  }
}

// 检查 URL 是否为社交媒体页面
export function isSocialMediaUrl(url: string): boolean {
  return detectPlatform(url) !== null;
}
