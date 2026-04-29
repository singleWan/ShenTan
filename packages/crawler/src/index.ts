export { scrapePage, scrapePages, closeBrowser } from './scraper.js';
export type { ScrapedContent } from './scraper.js';
export { webSearch, searchAndSummarize, DuckDuckGoSearchEngine } from './search.js';
export { getBrowser, createPage } from './browser.js';
export type { SearchEngine, SearchResult, SearchOptions } from './search-engine.js';
export { SearXNGSearchEngine } from './searxng.js';
export {
  SearchEngineManager,
  getDefaultSearchManager,
  searchSocialMedia,
} from './search-manager.js';
export { detectPlatform, getScrapableUrl, isSocialMediaUrl } from './platform.js';
export type { SocialPlatform } from './platform.js';
export { extractByPlatform, hasExtractor } from './extractors/index.js';
